'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { resultsApi } from '@/lib/api';
import type { DashboardSummary, RecentFailureItem, ModelHealthScore, TagGroupSummary, PerformanceBudgetResult, BudgetStatus } from '@/lib/types';

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [healthScores, setHealthScores] = useState<ModelHealthScore[]>([]);
  const [tagGroups, setTagGroups] = useState<TagGroupSummary[]>([]);
  const [budgetsByModelId, setBudgetsByModelId] = useState<Record<string, PerformanceBudgetResult>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredBudget, setHoveredBudget] = useState<PerformanceBudgetResult | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const onModelHover = useCallback(
    (budget: PerformanceBudgetResult | null, x: number, y: number) => {
      setHoveredBudget(budget);
      if (budget) setHoverPos({ x, y });
    },
    [],
  );

  const load = async () => {
    try {
      setError(null);
      const data = await resultsApi.summary();
      setSummary(data);
      resultsApi.healthScores().then(setHealthScores).catch(() => {});
      resultsApi.tagGroups().then(setTagGroups).catch(() => {});
      resultsApi.performanceBudgets()
        .then((bs) => {
          const map: Record<string, PerformanceBudgetResult> = {};
          for (const b of bs) map[b.modelId] = b;
          setBudgetsByModelId(map);
        })
        .catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!summary) return null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <span className="text-xs text-gray-400 dark:text-gray-500">Auto-refreshes every 60s</span>
      </div>

      {/* Fixed hover card — pointer-events-none so it never blocks the underlying link */}
      {hoveredBudget && (
        <BudgetHoverCard budget={hoveredBudget} pos={hoverPos} />
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" role="region" aria-label="Model statistics">
        <StatCard label="Total Models" value={summary.totalModels} color="gray" />
        <StatCard label="Active" value={summary.activeModels} color="green" />
        <StatCard label="Failing" value={summary.failingModels} color="amber" />
        <StatCard label="Disabled" value={summary.disabledModels} color="red" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* At-risk models */}
        {summary.atRiskModels.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              At Risk (≥ 10 consecutive failures)
            </h2>
            <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50">
              <table className="w-full text-sm" aria-label="At-risk models">
                <thead>
                  <tr className="border-b border-amber-200 text-left text-xs text-amber-700 dark:border-amber-800 dark:text-amber-400">
                    <th className="px-4 py-2 font-medium" scope="col">Model</th>
                    <th className="px-4 py-2 font-medium" scope="col">Tenant</th>
                    <th className="px-4 py-2 font-medium" scope="col">Failures</th>
                    <th className="px-4 py-2 font-medium" scope="col">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.atRiskModels.map((m) => (
                    <tr key={m.modelId} className="border-b border-amber-100 last:border-0 dark:border-amber-900">
                      <td className="px-4 py-2">
                        <a
                          href={`/models/${m.modelId}?tenantId=${encodeURIComponent(m.tenantId)}`}
                          className="font-medium text-gray-900 hover:text-brand-600 dark:text-gray-100"
                          onMouseEnter={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            onModelHover(budgetsByModelId[m.modelId] ?? null, r.left, r.bottom + 6);
                          }}
                          onMouseLeave={() => onModelHover(null, 0, 0)}
                        >
                          {m.modelName}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-xs text-amber-600 dark:text-amber-400">{m.tenantName}</td>
                      <td className="px-4 py-2 font-mono text-amber-700 dark:text-amber-400">
                        {m.consecutiveFailureCount} / 30
                      </td>
                      <td className="px-4 py-2 w-32">
                        <div className="h-1.5 rounded-full bg-amber-100 dark:bg-amber-900" role="progressbar" aria-valuenow={m.consecutiveFailureCount} aria-valuemin={0} aria-valuemax={30} aria-label={`${m.consecutiveFailureCount} of 30 failures`}>
                          <div
                            className="h-1.5 rounded-full bg-amber-500"
                            style={{ width: `${(m.consecutiveFailureCount / 30) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>

      {/* Tag group summary */}
      {tagGroups.length > 0 && (
        <TagGroupTable tagGroups={tagGroups} healthScores={healthScores} />
      )}

      {/* Health scores overview */}
      {healthScores.length > 0 && (
        <HealthScoresTable healthScores={healthScores} budgetsByModelId={budgetsByModelId} onModelHover={onModelHover} />
      )}

      {/* Recent failures — full width */}
      <RecentFailuresSection failures={summary.recentFailures} />

      {/* Quick links */}
      <nav className="flex gap-3" aria-label="Quick actions">
        <a
          href="/models/new"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
        >
          + Add model
        </a>
        <a
          href="/tenants"
          className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-brand-300 transition dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-brand-500"
        >
          Manage tenants
        </a>
      </nav>
    </div>
  );
}

type HealthSortKey = 'model' | 'tenant' | 'grade' | 'score' | 'uptime' | 'latency' | 'refresh' | 'activity' | 'status';

function statusPriority(h: ModelHealthScore): number {
  if (h.isAnomaly) return 0;
  if (h.daysUntilPause != null && h.daysUntilPause <= 14) return 1;
  return 2;
}

function statusLabel(h: ModelHealthScore): string {
  if (h.isAnomaly) return 'Anomaly';
  if (h.daysUntilPause != null && h.daysUntilPause <= 14) return `${h.daysUntilPause}d left`;
  return 'Healthy';
}

// ── Tag Group Table ──────────────────────────────────────────────────────────

function TagGroupTable({
  tagGroups,
  healthScores,
}: {
  tagGroups: TagGroupSummary[];
  healthScores: ModelHealthScore[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (tag: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  };

  const modelsByTag = useMemo(() => {
    const map: Record<string, ModelHealthScore[]> = {};
    for (const g of tagGroups) map[g.tag] = [];
    for (const h of healthScores) {
      const key = h.tag || '(Untagged)';
      if (map[key]) map[key].push(h);
    }
    return map;
  }, [tagGroups, healthScores]);

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Health by Tag
      </h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full text-sm" aria-label="Health scores grouped by tag">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
              <th className="px-4 py-2 font-medium" scope="col">Tag</th>
              <th className="px-4 py-2 font-medium text-center" scope="col">Models</th>
              <th className="px-4 py-2 font-medium text-center" scope="col">Active</th>
              <th className="px-4 py-2 font-medium text-center" scope="col">Failing</th>
              <th className="px-4 py-2 font-medium text-center" scope="col">Avg Grade</th>
              <th className="px-4 py-2 font-medium text-right" scope="col">Avg Score</th>
              <th className="px-4 py-2 font-medium text-right" scope="col">Avg Uptime</th>
            </tr>
          </thead>
          <tbody>
            {tagGroups.map((g) => {
              const isExpanded = expanded.has(g.tag);
              const gradeColor = g.avgGrade === 'A' ? 'text-green-600' : g.avgGrade === 'B' ? 'text-blue-600' : g.avgGrade === 'C' ? 'text-yellow-600' : g.avgGrade === 'D' ? 'text-orange-600' : 'text-red-600';
              const models = modelsByTag[g.tag] ?? [];

              return (
                <React.Fragment key={g.tag}>
                  <tr
                    className="border-b border-gray-100 cursor-pointer hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-750"
                    onClick={() => toggle(g.tag)}
                    aria-expanded={isExpanded}
                  >
                    <td className="px-4 py-2 font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        {g.tag}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">{g.totalModels}</td>
                    <td className="px-4 py-2 text-center text-green-600">{g.activeModels}</td>
                    <td className="px-4 py-2 text-center text-red-600">{g.failingModels}</td>
                    <td className={`px-4 py-2 text-center font-bold ${gradeColor}`}>{g.avgGrade}</td>
                    <td className="px-4 py-2 text-right font-mono">{g.avgHealthScore}</td>
                    <td className="px-4 py-2 text-right font-mono">{g.avgUptimePercent.toFixed(1)}%</td>
                  </tr>
                  {isExpanded && models.map((h) => {
                    const mg = h.grade === 'A' ? 'text-green-600' : h.grade === 'B' ? 'text-blue-600' : h.grade === 'C' ? 'text-yellow-600' : h.grade === 'D' ? 'text-orange-600' : 'text-red-600';
                    return (
                      <tr key={h.modelId} className="border-b border-gray-50 dark:border-gray-700">
                        <td className="pl-10 pr-4 py-1.5 text-xs">
                          <a href={`/models/${h.modelId}?tenantId=${encodeURIComponent(h.tenantId)}`} className="text-gray-700 hover:text-brand-600 dark:text-gray-300">
                            {h.modelName}
                          </a>
                          <span className="ml-2 text-gray-400">({h.tenantName})</span>
                        </td>
                        <td />
                        <td />
                        <td />
                        <td className={`px-4 py-1.5 text-center text-xs font-bold ${mg}`}>{h.grade}</td>
                        <td className="px-4 py-1.5 text-right text-xs font-mono">{h.score}</td>
                        <td className="px-4 py-1.5 text-right text-xs font-mono">{h.uptimePoints}/40</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HealthScoresTable({
  healthScores,
  budgetsByModelId,
  onModelHover,
}: {
  healthScores: ModelHealthScore[];
  budgetsByModelId: Record<string, PerformanceBudgetResult>;
  onModelHover: (b: PerformanceBudgetResult | null, x: number, y: number) => void;
}) {
  const [sortKey, setSortKey] = useState<HealthSortKey>('score');
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (key: HealthSortKey) => {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = useMemo(() => {
    const arr = [...healthScores];
    const dir = sortAsc ? 1 : -1;
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'model': cmp = a.modelName.localeCompare(b.modelName); break;
        case 'tenant': cmp = a.tenantName.localeCompare(b.tenantName); break;
        case 'grade': cmp = a.grade.localeCompare(b.grade); break;
        case 'score': cmp = a.score - b.score; break;
        case 'uptime': cmp = a.uptimePoints - b.uptimePoints; break;
        case 'latency': cmp = a.latencyPoints - b.latencyPoints; break;
        case 'refresh': cmp = a.refreshPoints - b.refreshPoints; break;
        case 'activity': cmp = a.activityPoints - b.activityPoints; break;
        case 'status': cmp = statusPriority(a) - statusPriority(b); break;
      }
      return cmp * dir;
    });
    return arr;
  }, [healthScores, sortKey, sortAsc]);

  const SortHeader = ({ col, label, align }: { col: HealthSortKey; label: string; align?: string }) => (
    <th
      scope="col"
      className={`px-4 py-2 font-medium cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 transition ${align ?? ''}`}
      onClick={() => handleSort(col)}
      aria-sort={sortKey === col ? (sortAsc ? 'ascending' : 'descending') : 'none'}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === col ? (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2}>
            {sortAsc ? <path d="M6 10V2M3 5l3-3 3 3" /> : <path d="M6 2v8M3 7l3 3 3-3" />}
          </svg>
        ) : (
          <svg className="w-3 h-3 opacity-30" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2}>
            <path d="M3 5l3-2 3 2M3 7l3 2 3-2" />
          </svg>
        )}
      </span>
    </th>
  );

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Model Health Scores
      </h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full text-sm" aria-label="Health scores">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
              <SortHeader col="model" label="Model" />
              <SortHeader col="tenant" label="Tenant" />
              <SortHeader col="grade" label="Grade" align="text-center" />
              <SortHeader col="score" label="Score" align="text-right" />
              <SortHeader col="uptime" label="Uptime" align="text-right" />
              <SortHeader col="latency" label="Latency" align="text-right" />
              <SortHeader col="refresh" label="Refresh" align="text-right" />
              <SortHeader col="activity" label="Activity" align="text-right" />
              <SortHeader col="status" label="Status" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => {
              const gradeColor = h.grade === 'A' ? 'text-green-600' : h.grade === 'B' ? 'text-blue-600' : h.grade === 'C' ? 'text-yellow-600' : h.grade === 'D' ? 'text-orange-600' : 'text-red-600';
              return (
                <tr key={h.modelId} className="border-b border-gray-50 last:border-0 dark:border-gray-700">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <a
                      href={`/models/${h.modelId}?tenantId=${encodeURIComponent(h.tenantId)}`}
                      className="font-medium text-gray-900 hover:text-brand-600 dark:text-gray-100"
                      onMouseEnter={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        onModelHover(budgetsByModelId[h.modelId] ?? null, r.left, r.bottom + 6);
                      }}
                      onMouseLeave={() => onModelHover(null, 0, 0)}
                    >
                      {h.modelName}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{h.tenantName}</td>
                  <td
                    className={`px-4 py-2 text-center text-lg font-bold cursor-pointer ${gradeColor}`}
                    onMouseEnter={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      onModelHover(budgetsByModelId[h.modelId] ?? null, r.left, r.bottom + 6);
                    }}
                    onMouseLeave={() => onModelHover(null, 0, 0)}
                  >{h.grade}</td>
                  <td className="px-4 py-2 text-right font-mono">{h.score}</td>
                  <td className="px-4 py-2 text-right text-xs text-gray-500">{h.uptimePoints}/40</td>
                  <td className="px-4 py-2 text-right text-xs text-gray-500">{h.latencyPoints}/20</td>
                  <td className="px-4 py-2 text-right text-xs text-gray-500">{h.refreshPoints}/20</td>
                  <td className="px-4 py-2 text-right text-xs text-gray-500">{h.activityPoints}/20</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {h.isAnomaly ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-400">Anomaly</span>
                    ) : h.daysUntilPause != null && h.daysUntilPause <= 14 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-400">
                        {h.daysUntilPause}d left
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-400">Healthy</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'gray' | 'green' | 'amber' | 'red';
}) {
  const colors = {
    gray: 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300',
    green: 'bg-green-50 border-green-200 text-green-700 dark:bg-green-950/50 dark:border-green-800 dark:text-green-400',
    amber: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-400',
    red: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/50 dark:border-red-800 dark:text-red-400',
  };

  return (
    <div className={`rounded-lg border p-4 ${colors[color]}`} role="status" aria-label={`${label}: ${value}`}>
      <div className="text-3xl font-bold">{value.toLocaleString()}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wide opacity-70">{label}</div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-8 w-40 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950" role="alert">
      <p className="text-sm text-red-700 dark:text-red-400">{message}</p>
      <button onClick={onRetry} className="mt-2 text-sm font-medium text-red-600 hover:underline dark:text-red-400">
        Retry
      </button>
    </div>
  );
}

const PAGE_SIZE = 10;

function RecentFailuresSection({ failures }: { failures: RecentFailureItem[] }) {
  const [page, setPage] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const totalPages = Math.max(1, Math.ceil(failures.length / PAGE_SIZE));
  const paginated = failures.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Recent Failures
        {failures.length > 0 && (
          <span className="ml-2 font-normal normal-case">({failures.length})</span>
        )}
      </h2>
      {failures.length === 0 ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/50 dark:text-green-400" role="status">
          No recent failures — all models healthy!
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-sm" aria-label="Recent failures">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th className="px-4 py-2 font-medium" scope="col">Model</th>
                <th className="px-4 py-2 font-medium" scope="col">Tenant</th>
                <th className="px-4 py-2 font-medium" scope="col">When</th>
                <th className="px-4 py-2 font-medium" scope="col">Latency</th>
                <th className="px-4 py-2 font-medium" scope="col">Error</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((f, i) => (
                <tr key={page * PAGE_SIZE + i} className="border-b border-gray-50 last:border-0 dark:border-gray-700">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <a
                      href={`/models/${f.modelId}?tenantId=${encodeURIComponent(f.tenantId)}`}
                      className="font-medium text-gray-900 hover:text-brand-600 dark:text-gray-100"
                    >
                      {f.modelName}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap dark:text-gray-400">{f.tenantName}</td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap dark:text-gray-400">
                    {formatAgo(new Date(f.failedAt))}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">
                    {f.latencyMs > 0 ? `${f.latencyMs}ms` : '—'}
                  </td>
                  <td className="px-4 py-2 text-red-600">
                    <div className="flex items-center gap-2">
                      <span className="line-clamp-1 text-xs" title={f.errorMessage ?? ''}>{f.errorMessage ?? 'Unknown error'}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(f.errorMessage ?? '');
                          setCopiedIdx(page * PAGE_SIZE + i);
                          setTimeout(() => setCopiedIdx(null), 2000);
                        }}
                        title="Copy error to clipboard"
                        aria-label="Copy error message"
                        className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        {copiedIdx === page * PAGE_SIZE + i ? (
                          <svg className="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-xs dark:border-gray-700">
              <span className="text-gray-500 dark:text-gray-400">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  aria-label="Previous page"
                  className="rounded border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  aria-label="Next page"
                  className="rounded border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function formatAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

// ── Performance Budget Hover Card ────────────────────────────────────────────

const BUDGET_STATUS_STYLES: Record<BudgetStatus, { badge: string; bar: string; label: string }> = {
  ok:                 { badge: 'bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-400', bar: 'bg-green-500',  label: 'OK' },
  warn:               { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-400', bar: 'bg-amber-500', label: 'WARN' },
  critical:           { badge: 'bg-red-100   text-red-700   dark:bg-red-900/60   dark:text-red-400',   bar: 'bg-red-500',   label: 'CRITICAL' },
  'insufficient-data':{ badge: 'bg-gray-100  text-gray-500  dark:bg-gray-700     dark:text-gray-400',  bar: 'bg-gray-300',  label: 'No data' },
};

function BudgetHoverCard({ budget, pos }: { budget: PerformanceBudgetResult; pos: { x: number; y: number } }) {
  const s = BUDGET_STATUS_STYLES[budget.status];

  // Keep card within right viewport edge
  const left = typeof window !== 'undefined' ? Math.min(pos.x, window.innerWidth - 296) : pos.x;

  return (
    <div
      className="fixed z-50 pointer-events-none w-72 rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      style={{ left, top: pos.y }}
    >
      {/* Status bar */}
      <div className={`h-1 rounded-t-xl ${s.bar}`} />

      <div className="px-4 py-3 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">
            Performance Budget
          </span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${s.badge}`}>
            {s.label}
          </span>
        </div>

        {budget.status === 'insufficient-data' ? (
          <p className="text-xs text-gray-400">Not enough execution history to compute a baseline yet.</p>
        ) : (
          <>
            {/* Latency metrics */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xs text-gray-400">Baseline P50</div>
                <div className="font-mono text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {budget.baselineP50Ms != null ? `${budget.baselineP50Ms}ms` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Current P50</div>
                <div className="font-mono text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {budget.currentP50Ms != null ? `${budget.currentP50Ms}ms` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Latest</div>
                <div className="font-mono text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {budget.latestLatencyMs != null ? `${budget.latestLatencyMs}ms` : '—'}
                </div>
              </div>
            </div>

            {/* Thresholds */}
            <div className="flex gap-3 text-xs">
              <span className="text-gray-400">
                Warn&nbsp;<span className="font-mono text-amber-600 dark:text-amber-400">{budget.warnThresholdMs != null ? `${budget.warnThresholdMs}ms` : '—'}</span>
              </span>
              <span className="text-gray-400">
                Critical&nbsp;<span className="font-mono text-red-600 dark:text-red-400">{budget.criticalThresholdMs != null ? `${budget.criticalThresholdMs}ms` : '—'}</span>
              </span>
              <span className="ml-auto text-gray-400">
                n={budget.sampleSize}
              </span>
            </div>

            {/* Sparkline */}
            {budget.recentLatencies.length >= 2 && (
              <BudgetSparkline latencies={budget.recentLatencies} warnMs={budget.warnThresholdMs} critMs={budget.criticalThresholdMs} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BudgetSparkline({ latencies, warnMs, critMs }: { latencies: number[]; warnMs: number | null; critMs: number | null }) {
  const W = 240, H = 36;
  const max = Math.max(...latencies, warnMs ?? 0, critMs ?? 0) * 1.05;
  const min = 0;
  const range = max - min || 1;
  const pts = latencies.map((v, i) => {
    const x = (i / (latencies.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const warnY = warnMs != null ? H - ((warnMs - min) / range) * H : null;
  const critY = critMs != null ? H - ((critMs - min) / range) * H : null;
  return (
    <svg width={W} height={H} className="w-full" aria-hidden="true">
      {warnY != null && <line x1={0} y1={warnY} x2={W} y2={warnY} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 2" opacity={0.7} />}
      {critY != null && <line x1={0} y1={critY} x2={W} y2={critY} stroke="#ef4444" strokeWidth={1} strokeDasharray="3 2" opacity={0.7} />}
      <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth={1.5} />
      {latencies.map((v, i) => {
        const x = (i / (latencies.length - 1)) * W;
        const y = H - ((v - min) / range) * H;
        const color = critMs != null && v >= critMs ? '#ef4444' : warnMs != null && v >= warnMs ? '#f59e0b' : '#6366f1';
        return <circle key={i} cx={x} cy={y} r={2} fill={color} />;
      })}
    </svg>
  );
}

function BudgetBadge({ status }: { status: BudgetStatus }) {
  const s = BUDGET_STATUS_STYLES[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.badge}`}>
      {s.label}
    </span>
  );
}

function Sparkline({ latencies }: { latencies: number[] }) {
  if (latencies.length < 2) return <span className="text-gray-300 text-xs">—</span>;
  const max = Math.max(...latencies);
  const min = Math.min(...latencies);
  const range = max - min || 1;
  const w = 64;
  const h = 24;
  const points = latencies
    .map((v, i) => {
      const x = (i / (latencies.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} className="inline-block" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-brand-500" />
    </svg>
  );
}
