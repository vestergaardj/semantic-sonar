// ─── Domain types matching the C# models ──────────────────────────────────────

export interface TenantConfig {
  id: string;
  displayName: string;
  entraId: string;
  clientId: string;
  isActive: boolean;
  addedAt: string;
}

export interface SemanticModelConfig {
  id: string;
  tenantId: string;
  workspaceId: string;
  datasetId: string;
  displayName: string;
  daxQuery: string;
  queryMode: 'dax' | 'rest';
  intervalMinutes: number;
  nextRunTime: string;
  isActive: boolean;
  consecutiveFailureCount: number;
  createdAt: string;
  lastRunAt?: string;
  lastRunSuccess?: boolean;
  lastRefreshStatus?: string;
  lastRefreshTime?: string;
  maintenanceWindows?: MaintenanceWindow[];
  cachedDatasources?: DatasourceInfo[];
  datasourcesCachedAt?: string;
  tags?: string[];
}

export interface CanaryResult {
  id: string;
  modelId: string;
  tenantId: string;
  executedAt: string;
  success: boolean;
  latencyMs: number;
  rowCount?: number;
  firstRowJson?: string;
  errorMessage?: string;
  duringMaintenance?: boolean;
}

export interface DashboardSummary {
  totalModels: number;
  activeModels: number;
  disabledModels: number;
  failingModels: number;
  recentFailures: RecentFailureItem[];
  atRiskModels: AtRiskModelItem[];
}

export interface RecentFailureItem {
  modelId: string;
  modelName: string;
  tenantId: string;
  tenantName: string;
  failedAt: string;
  errorMessage?: string;
  latencyMs: number;
}

export interface AtRiskModelItem {
  modelId: string;
  modelName: string;
  tenantId: string;
  tenantName: string;
  consecutiveFailureCount: number;
}

// ─── Form inputs ──────────────────────────────────────────────────────────────

export interface CreateTenantInput {
  displayName: string;
  entraId: string;
  clientId: string;
}

export interface CreateModelInput {
  tenantId: string;
  workspaceId: string;
  datasetId: string;
  displayName: string;
  daxQuery: string;
  queryMode: 'dax' | 'rest';
  intervalMinutes: number;
  maintenanceWindows?: MaintenanceWindow[];
  tags?: string[];
}

export interface UpdateModelInput {
  displayName?: string;
  daxQuery?: string;
  queryMode?: 'dax' | 'rest';
  intervalMinutes?: number;
  maintenanceWindows?: MaintenanceWindow[];
  tags?: string[];
}

// ─── Browse types ─────────────────────────────────────────────────────────────

export interface PowerBiWorkspace {
  id: string;
  name: string;
}

export interface PowerBiDataset {
  id: string;
  name: string;
  configuredBy: string;
}

export interface SuggestDaxResponse {
  dax: string;
  description: string;
  isFallback: boolean;
}

export interface DatasetRefreshEntry {
  requestId: string;
  status: string;
  startTime?: string;
  endTime?: string;
  refreshType?: string;
  serviceExceptionJson?: string;
}

// ─── Uptime / SLA ─────────────────────────────────────────────────────────────

export interface UptimeWindow {
  totalChecks: number;
  successes: number;
  uptimePercent: number | null;
}

export interface ModelUptimeStats {
  modelId: string;
  modelName: string;
  tenantId: string;
  tenantName: string;
  isActive: boolean;
  last24h: UptimeWindow;
  last7d: UptimeWindow;
  last30d: UptimeWindow;
}

// ─── Latency Trends ───────────────────────────────────────────────────────────

export interface DailyLatencyPoint {
  date: string;
  p95: number | null;
}

export interface ModelLatencyTrend {
  modelId: string;
  modelName: string;
  tenantId: string;
  tenantName: string;
  p50Recent: number | null;
  p95Recent: number | null;
  p50Prior: number | null;
  p95Prior: number | null;
  p95ChangePercent: number | null;
  alert: boolean;
  recentCheckCount: number;
  dailyP95: DailyLatencyPoint[];
}

// ─── Schedule presets ─────────────────────────────────────────────────────────

export const SCHEDULE_PRESETS: { label: string; minutes: number }[] = [
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '4 hours', minutes: 240 },
  { label: '6 hours', minutes: 360 },
  { label: '12 hours', minutes: 720 },
  { label: '1 day', minutes: 1440 },
  { label: '2 days', minutes: 2880 },
  { label: '1 week', minutes: 10080 },
  { label: '2 weeks', minutes: 20160 },
  { label: '1 month', minutes: 43200 },
];

// ─── New feature types ────────────────────────────────────────────────────────

export interface MaintenanceWindow {
  startTimeUtc: string;
  endTimeUtc: string;
  daysOfWeek: number[];
  suppressAlerts: boolean;
  skipCanary: boolean;
}

export interface AuditEntry {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  action: string;
  details?: string;
  timestamp: string;
  userId?: string;
}

export interface ModelHealthScore {
  modelId: string;
  modelName: string;
  tenantId: string;
  tenantName: string;
  tag: string;
  score: number;
  grade: string;
  uptimePoints: number;
  latencyPoints: number;
  refreshPoints: number;
  activityPoints: number;
  daysUntilPause?: number;
  isAnomaly: boolean;
  anomalyReason?: string;
}

export interface DatasourceInfo {
  datasourceType: string;
  connectionDetails: string;
  datasourceId?: string;
  gatewayId?: string;
}

export interface DependencyMapEntry {
  modelId: string;
  modelName: string;
  tenantId: string;
  tenantName: string;
  isActive: boolean;
  datasources: DatasourceInfo[];
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export interface WebhookConfig {
  id: string;
  tenantId: string;
  displayName: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
  lastStatus?: number;
}

export const WEBHOOK_EVENTS = [
  { value: 'model.failed', label: 'Model Failed', desc: 'First failure after healthy state' },
  { value: 'model.recovered', label: 'Model Recovered', desc: 'First success after failure(s)' },
  { value: 'model.autoDisabled', label: 'Model Auto-Disabled', desc: 'Disabled after 30 consecutive failures' },
  { value: 'latency.budget.warn', label: 'Latency Budget Warn', desc: 'Latest latency ≥ warn multiplier × rolling baseline P50' },
  { value: 'latency.budget.critical', label: 'Latency Budget Critical', desc: 'Latest latency ≥ critical multiplier × rolling baseline P50' },
] as const;

// ─── Tags ─────────────────────────────────────────────────────────────────────

export interface TagDefinition {
  id: string;
  name: string;
  createdAt: string;
}

export interface TagGroupSummary {
  tag: string;
  totalModels: number;
  activeModels: number;
  failingModels: number;
  avgHealthScore: number;
  avgGrade: string;
  avgUptimePercent: number;
}

// ─── Performance Budgets ──────────────────────────────────────────────────────

export type BudgetStatus = 'ok' | 'warn' | 'critical' | 'insufficient-data';

export interface PerformanceBudgetResult {
  modelId: string;
  modelName: string;
  tenantId: string;
  tenantName: string;
  /** "ok" | "warn" | "critical" | "insufficient-data" */
  status: BudgetStatus;
  /** P50 latency of the baseline (older) half of the sample window, in ms */
  baselineP50Ms: number | null;
  /** P50 latency of the recent (newer) half of the sample window, in ms */
  currentP50Ms: number | null;
  /** Most recent single execution latency, in ms */
  latestLatencyMs: number | null;
  /** Threshold at which WARN fires (baseline × warnMultiplier), in ms */
  warnThresholdMs: number | null;
  /** Threshold at which CRITICAL fires (baseline × criticalMultiplier), in ms */
  criticalThresholdMs: number | null;
  sampleSize: number;
  warnMultiplier: number;
  criticalMultiplier: number;
  /** Last N latencies in chronological order (oldest→newest) for sparkline */
  recentLatencies: number[];
}
