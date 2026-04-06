using System.Text.Json;
using Azure.Storage.Queues;
using SemanticSonar.Functions.Models;
using Microsoft.Extensions.Logging;

namespace SemanticSonar.Functions.Services;

/// <summary>Enqueues canary jobs to the Azure Storage Queue.</summary>
public class QueueService
{
    private const string QueueName = "canary-jobs";

    private readonly QueueServiceClient _queueServiceClient;
    private readonly ILogger<QueueService> _logger;
    private QueueClient? _queueClient;

    public QueueService(QueueServiceClient queueServiceClient, ILogger<QueueService> logger)
    {
        _queueServiceClient = queueServiceClient;
        _logger = logger;
    }

    public async Task EnqueueJobAsync(CanaryJob job, CancellationToken ct = default)
    {
        var client = await GetQueueClientAsync(ct);
        var message = BinaryData.FromObjectAsJson(job);
        await client.SendMessageAsync(message, cancellationToken: ct);
        _logger.LogDebug("Enqueued canary job for model {ModelId}.", job.ModelId);
    }

    private async Task<QueueClient> GetQueueClientAsync(CancellationToken ct)
    {
        if (_queueClient is not null)
            return _queueClient;

        _queueClient = _queueServiceClient.GetQueueClient(QueueName);
        await _queueClient.CreateIfNotExistsAsync(cancellationToken: ct);
        return _queueClient;
    }
}
