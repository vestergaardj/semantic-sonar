'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { CanaryResult } from '@/lib/types';

interface Props {
  results: CanaryResult[];
}

export function LatencyChart({ results }: Props) {
  if (results.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
        No data yet
      </div>
    );
  }

  const data = [...results]
    .sort((a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime())
    .map((r) => ({
      time: new Date(r.executedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      latency: r.success ? r.latencyMs : null,
      failed: r.success ? null : r.latencyMs || 0,
      success: r.success,
    }));

  const avgLatency =
    results.filter((r) => r.success).reduce((s, r) => s + r.latencyMs, 0) /
      Math.max(results.filter((r) => r.success).length, 1);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>Query latency (last {results.length} runs)</span>
        <span>avg {Math.round(avgLatency)} ms</span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" stroke="currentColor" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10 }}
            tickLine={false}
            interval="preserveStartEnd"
            className="text-gray-500 dark:text-gray-400"
          />
          <YAxis
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            unit="ms"
            width={48}
            className="text-gray-500 dark:text-gray-400"
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
            formatter={(value: number) => [`${value} ms`, 'Latency']}
          />
          <ReferenceLine y={avgLatency} stroke="#6366f1" strokeDasharray="4 4" />
          {/* Successful runs */}
          <Line
            type="monotone"
            dataKey="latency"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            name="OK"
          />
          {/* Failed runs — shown as red dots at y=0 */}
          <Line
            type="monotone"
            dataKey="failed"
            stroke="#ef4444"
            strokeWidth={0}
            dot={{ r: 4, fill: '#ef4444' }}
            connectNulls={false}
            name="Failed"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
