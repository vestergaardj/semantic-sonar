using Azure.Identity;
using Azure.Security.KeyVault.Secrets;
using Azure.Storage.Queues;
using SemanticSonar.Functions.Services;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

builder.Services.AddApplicationInsightsTelemetryWorkerService();
// Note: ConfigureFunctionsApplicationInsights() filters logs for App Insights
// but is not required — telemetry flows via APPLICATIONINSIGHTS_CONNECTION_STRING.

// ── Azure Identity ──────────────────────────────────────────────────────────
// Uses Managed Identity in production; falls back to DefaultAzureCredential
// (which picks up developer credentials) in local development.
var credential = new DefaultAzureCredential();

// ── Key Vault ───────────────────────────────────────────────────────────────
var keyVaultUri = new Uri(
    Environment.GetEnvironmentVariable("KEY_VAULT_URI")
    ?? throw new InvalidOperationException("KEY_VAULT_URI is not configured."));

builder.Services.AddSingleton(new SecretClient(keyVaultUri, credential));

// ── Cosmos DB ───────────────────────────────────────────────────────────────
// Singleton CosmosClient as recommended; Direct mode for production throughput.
// In production, connects via Managed Identity (COSMOS_ACCOUNT_ENDPOINT).
// In local dev, falls back to COSMOS_CONNECTION_STRING.
CosmosClient cosmosClient;
var cosmosEndpoint = Environment.GetEnvironmentVariable("COSMOS_ACCOUNT_ENDPOINT");
var cosmosOptions = new CosmosClientOptions
{
    ConnectionMode = ConnectionMode.Direct,
    SerializerOptions = new CosmosSerializationOptions
    {
        PropertyNamingPolicy = CosmosPropertyNamingPolicy.CamelCase
    },
    // Retry on 429 (Rate Limited) automatically
    MaxRetryAttemptsOnRateLimitedRequests = 9,
    MaxRetryWaitTimeOnRateLimitedRequests = TimeSpan.FromSeconds(30)
};

if (!string.IsNullOrEmpty(cosmosEndpoint))
{
    cosmosClient = new CosmosClient(cosmosEndpoint, credential, cosmosOptions);
}
else
{
    var cosmosConnectionString =
        Environment.GetEnvironmentVariable("COSMOS_CONNECTION_STRING")
        ?? throw new InvalidOperationException("Either COSMOS_ACCOUNT_ENDPOINT or COSMOS_CONNECTION_STRING must be configured.");
    cosmosClient = new CosmosClient(cosmosConnectionString, cosmosOptions);
}

builder.Services.AddSingleton(cosmosClient);

// ── Storage Queue ───────────────────────────────────────────────────────────────
// In production use identity-based auth (STORAGE_ACCOUNT_NAME env var set by Bicep);
// in local dev fall back to a full connection string.
var queueClientOptions = new QueueClientOptions { MessageEncoding = QueueMessageEncoding.Base64 };
QueueServiceClient queueServiceClient;
var storageAccountName = Environment.GetEnvironmentVariable("STORAGE_ACCOUNT_NAME");
if (!string.IsNullOrEmpty(storageAccountName))
{
    var queueUri = new Uri($"https://{storageAccountName}.queue.core.windows.net");
    queueServiceClient = new QueueServiceClient(queueUri, credential, queueClientOptions);
}
else
{
    var storageConnection =
        Environment.GetEnvironmentVariable("AzureWebJobsStorage")
        ?? throw new InvalidOperationException("Either STORAGE_ACCOUNT_NAME or AzureWebJobsStorage must be configured.");
    queueServiceClient = new QueueServiceClient(storageConnection, queueClientOptions);
}

builder.Services.AddSingleton(queueServiceClient);

// ── Application services ────────────────────────────────────────────────────
builder.Services.AddSingleton<CosmosDbService>();
builder.Services.AddSingleton<KeyVaultService>();
builder.Services.AddSingleton<QueueService>();
builder.Services.AddSingleton<PowerBiQueryService>();
builder.Services.AddSingleton<WebhookService>();

// HttpClient for Power BI API — registers IHttpClientFactory in DI
builder.Services.AddHttpClient("powerbi");
builder.Services.AddHttpClient("webhooks");

var app = builder.Build();

// Ensure Cosmos DB database and containers exist on startup
using (var scope = app.Services.CreateScope())
{
    var cosmosDb = scope.ServiceProvider.GetRequiredService<CosmosDbService>();
    await cosmosDb.EnsureContainersExistAsync();
}

app.Run();
