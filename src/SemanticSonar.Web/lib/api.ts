import type {
  AuditEntry,
  CanaryResult,
  CreateModelInput,
  CreateTenantInput,
  DashboardSummary,
  DatasetRefreshEntry,
  DependencyMapEntry,
  ModelHealthScore,
  ModelLatencyTrend,
  ModelUptimeStats,
  PowerBiDataset,
  PowerBiWorkspace,
  SemanticModelConfig,
  SuggestDaxResponse,
  TenantConfig,
  UpdateModelInput,
  WebhookConfig,
} from './types';

// In production (SWA) all /api/* calls are routed to the linked Function App.
// In local development set NEXT_PUBLIC_API_URL=http://localhost:7071/api
const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

// ── Tenants ──────────────────────────────────────────────────────────────────

export const tenantsApi = {
  list: () => request<TenantConfig[]>('/tenants'),

  get: (id: string) => request<TenantConfig>(`/tenants/${id}`),

  create: (input: CreateTenantInput) =>
    request<TenantConfig>('/tenants', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (id: string, input: Partial<TenantConfig>) =>
    request<TenantConfig>(`/tenants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  delete: (id: string) =>
    request<{ deletedModels: number }>(`/tenants/${id}`, { method: 'DELETE' }),

  setSecret: (id: string, clientSecret: string) =>
    request<{ status: string }>(`/tenants/${id}/secret`, {
      method: 'PUT',
      body: JSON.stringify({ clientSecret }),
    }),

  secretStatus: (id: string) =>
    request<{ exists: boolean }>(`/tenants/${id}/secret/status`),
};

// ── Semantic Models ──────────────────────────────────────────────────────────

export const modelsApi = {
  list: (tenantId?: string) => {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return request<SemanticModelConfig[]>(`/models${qs}`);
  },

  get: (id: string, tenantId: string) =>
    request<SemanticModelConfig>(
      `/models/${id}?tenantId=${encodeURIComponent(tenantId)}`,
    ),

  create: (input: CreateModelInput) =>
    request<SemanticModelConfig>('/models', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  bulkCreate: (inputs: CreateModelInput[]) =>
    request<SemanticModelConfig[]>('/models/bulk', {
      method: 'POST',
      body: JSON.stringify(inputs),
    }),

  update: (id: string, tenantId: string, input: UpdateModelInput) =>
    request<SemanticModelConfig>(
      `/models/${id}?tenantId=${encodeURIComponent(tenantId)}`,
      { method: 'PUT', body: JSON.stringify(input) },
    ),

  delete: (id: string, tenantId: string) =>
    request<void>(
      `/models/${id}?tenantId=${encodeURIComponent(tenantId)}`,
      { method: 'DELETE' },
    ),

  runNow: (id: string, tenantId: string) =>
    request<void>(
      `/models/${id}/run?tenantId=${encodeURIComponent(tenantId)}`,
      { method: 'POST' },
    ),

  enable: (id: string, tenantId: string) =>
    request<SemanticModelConfig>(
      `/models/${id}/enable?tenantId=${encodeURIComponent(tenantId)}`,
      { method: 'POST' },
    ),

  disable: (id: string, tenantId: string) =>
    request<SemanticModelConfig>(
      `/models/${id}/disable?tenantId=${encodeURIComponent(tenantId)}`,
      { method: 'POST' },
    ),

  listTags: () => request<string[]>('/tags'),
};

// ── Browse ───────────────────────────────────────────────────────────────────

export const browseApi = {
  workspaces: (tenantId: string) =>
    request<PowerBiWorkspace[]>(`/tenants/${encodeURIComponent(tenantId)}/workspaces`),

  datasets: (tenantId: string, workspaceId: string) =>
    request<PowerBiDataset[]>(
      `/tenants/${encodeURIComponent(tenantId)}/workspaces/${encodeURIComponent(workspaceId)}/datasets`,
    ),

  suggestDax: (tenantId: string, workspaceId: string, datasetId: string) =>
    request<SuggestDaxResponse>(
      `/tenants/${encodeURIComponent(tenantId)}/workspaces/${encodeURIComponent(workspaceId)}/datasets/${encodeURIComponent(datasetId)}/suggest-dax`,
    ),

  refreshHistory: (tenantId: string, workspaceId: string, datasetId: string, top = 10) =>
    request<DatasetRefreshEntry[]>(
      `/tenants/${encodeURIComponent(tenantId)}/workspaces/${encodeURIComponent(workspaceId)}/datasets/${encodeURIComponent(datasetId)}/refreshes?top=${top}`,
    ),
};

// ── Results ──────────────────────────────────────────────────────────────────

export const resultsApi = {
  forModel: (modelId: string, limit = 50) =>
    request<CanaryResult[]>(
      `/results?modelId=${encodeURIComponent(modelId)}&limit=${limit}`,
    ),

  summary: () => request<DashboardSummary>('/summary'),

  uptime: () => request<ModelUptimeStats[]>('/uptime'),

  latencyTrends: () => request<ModelLatencyTrend[]>('/latency-trends'),

  healthScores: () => request<ModelHealthScore[]>('/health-scores'),

  dependencyMap: () => request<DependencyMapEntry[]>('/dependency-map'),
};

// ── Audit ────────────────────────────────────────────────────────────────────

export const auditApi = {
  list: (tenantId?: string, entityId?: string, limit = 50) => {
    const params = new URLSearchParams();
    if (tenantId) params.set('tenantId', tenantId);
    if (entityId) params.set('entityId', entityId);
    params.set('limit', String(limit));
    return request<AuditEntry[]>(`/audit?${params}`);
  },
};

// ── Webhooks ─────────────────────────────────────────────────────────────────

export const webhooksApi = {
  list: (tenantId?: string) => {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return request<WebhookConfig[]>(`/webhooks${qs}`);
  },

  get: (id: string) => request<WebhookConfig>(`/webhooks/${id}`),

  create: (input: Partial<WebhookConfig>) =>
    request<WebhookConfig>('/webhooks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (id: string, input: Partial<WebhookConfig>) =>
    request<WebhookConfig>(`/webhooks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  delete: (id: string) =>
    request<void>(`/webhooks/${id}`, { method: 'DELETE' }),

  test: (id: string) =>
    request<{ status: string }>(`/webhooks/${id}/test`, { method: 'POST' }),
};
