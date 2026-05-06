'use client';

import { useEffect, useState } from 'react';
import { resultsApi } from '@/lib/api';
import type { DependencyMapEntry, DatasourceInfo } from '@/lib/types';

interface DatasourceGroup {
  key: string;
  type: string;
  connection: string;
  models: { modelId: string; modelName: string; tenantName: string; isActive: boolean }[];
}

function parseDatasourceKey(ds: DatasourceInfo): { key: string; display: string } {
  let display = ds.connectionDetails;
  try {
    const parsed = JSON.parse(ds.connectionDetails);
    const parts = Object.entries(parsed).map(([k, v]) => `${k}: ${v}`);
    display = parts.join(', ');
  } catch { /* use raw */ }
  const key = `${ds.datasourceType}||${display}`;
  return { key, display };
}

export default function DependenciesPage() {
  const [entries, setEntries] = useState<DependencyMapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resultsApi.dependencyMap()
      .then(setEntries)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  // Group by datasource
  const groups: DatasourceGroup[] = [];
  const groupMap = new Map<string, DatasourceGroup>();

  for (const entry of entries) {
    for (const ds of entry.datasources) {
      const { key, display } = parseDatasourceKey(ds);
      let group = groupMap.get(key);
      if (!group) {
        group = { key, type: ds.datasourceType, connection: display, models: [] };
        groupMap.set(key, group);
        groups.push(group);
      }
      if (!group.models.some((m) => m.modelId === entry.modelId)) {
        group.models.push({
          modelId: entry.modelId,
          modelName: entry.modelName,
          tenantName: entry.tenantName,
          isActive: entry.isActive,
        });
      }
    }
  }

  // Sort by number of models descending (highest blast radius first)
  groups.sort((a, b) => b.models.length - a.models.length);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Dependency Map</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Datasource connections shared across models. Higher model count = higher blast radius if that datasource fails.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
          <p className="text-gray-500 dark:text-gray-400">
            No datasource data available yet. Datasources are cached automatically during canary runs.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div
              key={g.key}
              className={`rounded-lg border bg-white p-4 dark:bg-gray-800 ${
                g.models.length >= 3
                  ? 'border-amber-300 dark:border-amber-700'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                      {g.type}
                    </span>
                    {g.models.length >= 3 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-400">
                        High blast radius
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 break-all">{g.connection}</p>
                </div>
                <span className="shrink-0 text-lg font-bold text-gray-400 dark:text-gray-500">
                  {g.models.length}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {g.models.map((m) => (
                  <a
                    key={m.modelId}
                    href={`/models/${m.modelId}`}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition hover:shadow-sm ${
                      m.isActive
                        ? 'border-gray-200 text-gray-700 hover:border-brand-300 dark:border-gray-600 dark:text-gray-300'
                        : 'border-gray-200 text-gray-400 dark:border-gray-700 dark:text-gray-500'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${m.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                    {m.modelName}
                    <span className="text-gray-400 dark:text-gray-500">({m.tenantName})</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
