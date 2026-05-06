'use client';

import { useEffect, useState } from 'react';
import { resultsApi } from '@/lib/api';
import type { ModelUptimeStats, UptimeWindow, ModelLatencyTrend, DailyLatencyPoint } from '@/lib/types';

// ─── Availability helpers ───────────────────────────────────────────────────

function pct(w: UptimeWindow): string {
  if (w.uptimePercent === null) return '—';
  return `${w.uptimePercent.toFixed(2)}%`;
}

function barColor(w: UptimeWindow): string {
  if (w.uptimePercent === null) return 'bg-gray-200 dark:bg-gray-700';
  if (w.uptimePercent >= 99.5) return 'bg-green-500';
  if (w.uptimePercent >= 95) return 'bg-yellow-500';
  if (w.uptimePercent >= 90) return 'bg-orange-500';
  return 'bg-red-500';
}

function textColor(w: UptimeWindow): string {
  if (w.uptimePercent === null) return 'text-gray-400 dark:text-gray-500';
  if (w.uptimePercent >= 99.5) return 'text-green-600 dark:text-green-400';
  if (w.uptimePercent >= 95) return 'text-yellow-600 dark:text-yellow-400';
  if (w.uptimePercent >= 90) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

function UptimeBar({ window: w }: { window: UptimeWindow }) {
  const width = w.uptimePercent !== null ? Math.max(w.uptimePercent, 2) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        {w.uptimePercent !== null && (
          <div
            className={`h-full rounded-full transition-all ${barColor(w)}`}
            style={{ width: `${width}%` }}
          />
        )}
      </div>
      <span className={`text-sm font-medium tabular-nums ${textColor(w)}`}>{pct(w)}</span>
      <span className="text-xs text-gray-400 dark:text-gray-500">
        {w.totalChecks > 0 ? `${w.successes}/${w.totalChecks}` : ''}
      </span>
    </div>
  );
}

function overallAvg(stats: ModelUptimeStats[], getter: (s: ModelUptimeStats) => UptimeWindow): string {
  const withData = stats.map(getter).filter((w) => w.uptimePercent !== null);
  if (withData.length === 0) return '—';
  const totalChecks = withData.reduce((s, w) => s + w.totalChecks, 0);
  const totalSuccess = withData.reduce((s, w) => s + w.successes, 0);
  if (totalChecks === 0) return '—';
  return `${(100 * totalSuccess / totalChecks).toFixed(2)}%`;
}

// ─── Latency helpers ────────────────────────────────────────────────────────

function Sparkline({ points }: { points: DailyLatencyPoint[] }) {
  const values = points.map((p) => p.p95).filter((v): v is number => v !== null);
  if (values.length < 2) return <span className="text-xs text-gray-400">—</span>;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 120;
  const h = 28;
  const pad = 2;

  const pts = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - 2 * pad);
    const y = p.p95 !== null
      ? pad + (1 - (p.p95 - min) / range) * (h - 2 * pad)
      : null;
    return { x, y };
  });

  // Is the trend going up (last vs first)?
  const first = values[0];
  const last = values[values.length - 1];
  const stroke = last > first * 1.3 ? '#ef4444' : last < first * 0.8 ? '#22c55e' : '#6b7280';

  const pathD = pts
    .filter((p) => p.y !== null)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y!.toFixed(1)}`)
    .join(' ');

  return (
    <svg width={w} height={h} className="inline-block" aria-label="14-day p95 latency sparkline">
      <path d={pathD} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function fmtMs(v: number | null): string {
  if (v === null) return '—';
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
  return `${v}ms`;
}

function changeLabel(pct: number | null): { text: string; cls: string } {
  if (pct === null) return { text: '—', cls: 'text-gray-400' };
  const sign = pct > 0 ? '+' : '';
  if (pct >= 50) return { text: `${sign}${pct.toFixed(0)}%`, cls: 'text-red-600 dark:text-red-400 font-semibold' };
  if (pct >= 20) return { text: `${sign}${pct.toFixed(0)}%`, cls: 'text-amber-600 dark:text-amber-400' };
  if (pct <= -20) return { text: `${sign}${pct.toFixed(0)}%`, cls: 'text-green-600 dark:text-green-400' };
  return { text: `${sign}${pct.toFixed(0)}%`, cls: 'text-gray-600 dark:text-gray-400' };
}

// ─── Page ───────────────────────────────────────────────────────────────────

type Tab = 'availability' | 'latency';

export default function UptimePage() {
  const [tab, setTab] = useState<Tab>('availability');
  const [stats, setStats] = useState<ModelUptimeStats[]>([]);
  const [trends, setTrends] = useState<ModelLatencyTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'degraded'>('all');

  useEffect(() => {
    resultsApi.uptime()
      .then(setStats)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'latency' && trends.length === 0) {
      resultsApi.latencyTrends()
        .then(setTrends)
        .catch((e) => setError((e as Error).message));
    }
  }, [tab, trends.length]);

  const filtered = stats.filter((s) => {
    if (filter === 'active') return s.isActive;
    if (filter === 'degraded') return (s.last30d.uptimePercent ?? 100) < 99.5;
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="h-64 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
        {error}
      </div>
    );
  }

  const alertCount = trends.filter((t) => t.alert).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Uptime &amp; SLA</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {tab === 'availability'
              ? 'Availability percentages per model over rolling windows.'
              : 'Latency trends comparing recent 7 days vs prior 7 days.'}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-800">
          <button
            onClick={() => setTab('availability')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              tab === 'availability'
                ? 'bg-brand-600 text-white'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            Availability
          </button>
          <button
            onClick={() => setTab('latency')}
            className={`relative rounded-md px-3 py-1.5 text-xs font-medium transition ${
              tab === 'latency'
                ? 'bg-brand-600 text-white'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            Latency
            {alertCount > 0 && tab !== 'latency' && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {alertCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Availability Tab ─────────────────────────────────────────────── */}
      {tab === 'availability' && (
        <>
          {/* Filter */}
          <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-800 w-fit">
            {(['all', 'active', 'degraded'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  filter === f
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >
                {f === 'all' ? 'All' : f === 'active' ? 'Active only' : 'Degraded (<99.5%)'}
              </button>
            ))}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {([
              { label: '24h average', getter: (s: ModelUptimeStats) => s.last24h },
              { label: '7d average', getter: (s: ModelUptimeStats) => s.last7d },
              { label: '30d average', getter: (s: ModelUptimeStats) => s.last30d },
            ] as const).map(({ label, getter }) => {
              const avg = overallAvg(filtered, getter);
              const isGood = avg !== '—' && parseFloat(avg) >= 99.5;
              return (
                <div key={label} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
                  <p className={`mt-1 text-2xl font-bold tabular-nums ${isGood ? 'text-green-600 dark:text-green-400' : avg === '—' ? 'text-gray-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {avg}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No models match the current filter.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="min-w-full text-sm" aria-label="Model uptime statistics">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-700 dark:text-gray-300" scope="col">Model</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-700 dark:text-gray-300" scope="col">Tenant</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-700 dark:text-gray-300" scope="col">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-700 dark:text-gray-300" scope="col">24h</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-700 dark:text-gray-300" scope="col">7 days</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-700 dark:text-gray-300" scope="col">30 days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
                  {filtered.map((s) => (
                    <tr key={s.modelId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-2.5">
                        <a
                          href={`/models/${s.modelId}?tenantId=${encodeURIComponent(s.tenantId)}`}
                          className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                        >
                          {s.modelName}
                        </a>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{s.tenantName}</td>
                      <td className="px-4 py-2.5">
                        {s.isActive ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">Active</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">Disabled</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5"><UptimeBar window={s.last24h} /></td>
                      <td className="px-4 py-2.5"><UptimeBar window={s.last7d} /></td>
                      <td className="px-4 py-2.5"><UptimeBar window={s.last30d} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Latency Tab ──────────────────────────────────────────────────── */}
      {tab === 'latency' && (
        <>
          {/* Alert summary */}
          {alertCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">{alertCount}</span>
              <span className="text-sm text-red-700 dark:text-red-300">
                {alertCount === 1 ? '1 model' : `${alertCount} models`} with significant p95 latency regression
              </span>
            </div>
          )}

          {trends.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No latency data available yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="min-w-full text-sm" aria-label="Model latency trends">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-700 dark:text-gray-300" scope="col">Model</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-700 dark:text-gray-300" scope="col">Tenant</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-700 dark:text-gray-300" scope="col">p95 (7d)</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-700 dark:text-gray-300" scope="col">p95 (prior)</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-700 dark:text-gray-300" scope="col">Change</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-700 dark:text-gray-300" scope="col">14-day trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
                  {trends.map((t) => {
                    const { text, cls } = changeLabel(t.p95ChangePercent);
                    return (
                      <tr key={t.modelId} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${t.alert ? 'bg-red-50/50 dark:bg-red-950/30' : ''}`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {t.alert && (
                              <span className="flex h-2 w-2 rounded-full bg-red-500" title="Latency regression alert" />
                            )}
                            <a
                              href={`/models/${t.modelId}?tenantId=${encodeURIComponent(t.tenantId)}`}
                              className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                            >
                              {t.modelName}
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{t.tenantName}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 dark:text-gray-100">{fmtMs(t.p95Recent)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-500 dark:text-gray-400">{fmtMs(t.p95Prior)}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${cls}`}>{text}</td>
                        <td className="px-4 py-2.5"><Sparkline points={t.dailyP95} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
