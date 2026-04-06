'use client';

import { useEffect, useState } from 'react';
import { modelsApi, tenantsApi, resultsApi } from '@/lib/api';
import type { SemanticModelConfig, TenantConfig, ModelHealthScore } from '@/lib/types';
import { ModelCard } from '@/components/ModelCard';

export default function ModelsPage() {
  const [models, setModels] = useState<SemanticModelConfig[]>([]);
  const [tenants, setTenants] = useState<TenantConfig[]>([]);
  const [healthScores, setHealthScores] = useState<Record<string, ModelHealthScore>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTenant, setFilterTenant] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'disabled' | 'failing'>('all');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<'az' | 'za' | 'health-asc' | 'health-desc'>('health-asc');

  const load = async () => {
    try {
      const [m, t] = await Promise.all([
        modelsApi.list(filterTenant || undefined),
        tenantsApi.list(),
      ]);
      setModels(m);
      setTenants(t);
      modelsApi.listTags().then(setAllTags).catch(() => {});
      resultsApi.healthScores().then((scores) => {
        const map: Record<string, ModelHealthScore> = {};
        for (const s of scores) map[s.modelId] = s;
        setHealthScores(map);
      }).catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterTenant]);

  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t.displayName]));

  const filtered = models.filter((m) => {
    if (search && !m.displayName.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus === 'active' && !m.isActive) return false;
    if (filterStatus === 'disabled' && m.isActive) return false;
    if (filterStatus === 'failing' && (m.consecutiveFailureCount === 0 || !m.isActive)) return false;
    if (filterTags.length > 0 && !filterTags.every(t => m.tags?.includes(t))) return false;
    return true;
  }).sort((a, b) => {
    switch (sortMode) {
      case 'az':
        return a.displayName.localeCompare(b.displayName);
      case 'za':
        return b.displayName.localeCompare(a.displayName);
      case 'health-asc': {
        const sa = healthScores[a.id]?.score ?? 101;
        const sb = healthScores[b.id]?.score ?? 101;
        return sa - sb;
      }
      case 'health-desc': {
        const sa = healthScores[a.id]?.score ?? -1;
        const sb = healthScores[b.id]?.score ?? -1;
        return sb - sa;
      }
    }
  });

  const handleRunNow = async (model: SemanticModelConfig) => {
    await modelsApi.runNow(model.id, model.tenantId);
    alert(`Run triggered for "${model.displayName}"`);
  };

  const handleEnable = async (model: SemanticModelConfig) => {
    const updated = await modelsApi.enable(model.id, model.tenantId);
    setModels((prev) => prev.map((m) => (m.id === model.id ? updated : m)));
  };

  const handleDisable = async (model: SemanticModelConfig) => {
    const updated = await modelsApi.disable(model.id, model.tenantId);
    setModels((prev) => prev.map((m) => (m.id === model.id ? updated : m)));
  };

  const handleDelete = async (model: SemanticModelConfig) => {
    if (!confirm(`Remove "${model.displayName}"? This cannot be undone.`)) return;
    await modelsApi.delete(model.id, model.tenantId);
    setModels((prev) => prev.filter((m) => m.id !== model.id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Semantic Models
          {!loading && (
            <span className="ml-2 text-base font-normal text-gray-400 dark:text-gray-500">
              ({filtered.length.toLocaleString()})
            </span>
          )}
        </h1>
        <div className="flex gap-2">
          <a
            href="/models/import"
            className="rounded-md border border-brand-600 px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 transition dark:text-brand-400 dark:border-brand-400 dark:hover:bg-brand-950"
          >
            Import from workspace
          </a>
          <a
            href="/models/new"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
          >
            + Add model
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search models…"          aria-label="Search models"          className="w-48 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400"
        />

        <select
          value={filterTenant}
          onChange={(e) => setFilterTenant(e.target.value)}
          aria-label="Filter by tenant"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All tenants</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName}
            </option>
          ))}
        </select>

        <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm dark:border-gray-600" role="group" aria-label="Filter by status">
          {(['all', 'active', 'failing', 'disabled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 capitalize transition ${
                filterStatus === s
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="relative">
            <select
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v && !filterTags.includes(v)) setFilterTags([...filterTags, v]);
              }}
              aria-label="Filter by tag"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">+ Tag filter</option>
              {allTags.filter(t => !filterTags.includes(t)).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {filterTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {filterTags.map(t => (
                  <button
                    key={t}
                    onClick={() => setFilterTags(filterTags.filter(x => x !== t))}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-200 dark:bg-brand-900 dark:text-brand-300 dark:hover:bg-brand-800"
                  >
                    {t}
                    <span aria-hidden>&times;</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sort buttons */}
        <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm dark:border-gray-600" role="group" aria-label="Sort order">
          {([
            { key: 'az', label: 'A→Z', title: 'Sort alphabetically A–Z', icon: (
              <span className="flex items-center gap-0.5">
                <span className="font-semibold text-xs">A</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2}><path d="M6 2v8M3 7l3 3 3-3"/></svg>
                <span className="font-semibold text-xs">Z</span>
              </span>
            )},
            { key: 'za', label: 'Z→A', title: 'Sort alphabetically Z–A', icon: (
              <span className="flex items-center gap-0.5">
                <span className="font-semibold text-xs">Z</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2}><path d="M6 2v8M3 7l3 3 3-3"/></svg>
                <span className="font-semibold text-xs">A</span>
              </span>
            )},
            { key: 'health-asc', label: 'Health ↑', title: 'Least healthy first', icon: (
              <span className="flex items-center gap-0.5">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"/></svg>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2}><path d="M6 10V2M3 5l3-3 3 3"/></svg>
              </span>
            )},
            { key: 'health-desc', label: 'Health ↓', title: 'Most healthy first', icon: (
              <span className="flex items-center gap-0.5">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"/></svg>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2}><path d="M6 2v8M3 7l3 3 3-3"/></svg>
              </span>
            )},
          ] as const).map(({ key, title, icon }) => (
            <button
              key={key}
              onClick={() => setSortMode(key as typeof sortMode)}
              title={title}
              className={`px-2.5 py-1.5 transition ${
                sortMode === key
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 rounded-lg bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
          <p className="text-gray-500 dark:text-gray-400">No models found.</p>
          <a href="/models/new" className="mt-2 inline-block text-sm text-brand-600 hover:underline">
            Add your first model →
          </a>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              tenantName={tenantMap[model.tenantId]}
              healthScore={healthScores[model.id]}
              onRunNow={() => handleRunNow(model)}
              onEnable={() => handleEnable(model)}
              onDisable={() => handleDisable(model)}
              onDelete={() => handleDelete(model)}
              onClick={() => {
                window.location.href = `/models/${model.id}?tenantId=${encodeURIComponent(model.tenantId)}`;
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
