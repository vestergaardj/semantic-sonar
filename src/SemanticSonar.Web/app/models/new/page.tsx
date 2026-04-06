'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { modelsApi, tenantsApi, browseApi } from '@/lib/api';
import type { TenantConfig, CreateModelInput, MaintenanceWindow } from '@/lib/types';
import { SchedulePicker } from '@/components/SchedulePicker';
import { MaintenanceEditor } from '@/components/MaintenanceEditor';
import { TagInput } from '@/components/TagInput';

const DAX_EXAMPLE = `EVALUATE
ROW("Value", CALCULATE(COUNTROWS(FILTER(ALL('Date'), 'Date'[Date] = TODAY()))))`;

export default function NewModelPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantConfig[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [daxHint, setDaxHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<CreateModelInput>({
    tenantId: '',
    workspaceId: '',
    datasetId: '',
    displayName: '',
    daxQuery: DAX_EXAMPLE,
    queryMode: 'dax',
    intervalMinutes: 60,
    maintenanceWindows: [],
    tags: [],
  });

  // Pre-fill from query params (coming from Browse page)
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tenantId = params.get('tenantId');
    const workspaceId = params.get('workspaceId');
    const datasetId = params.get('datasetId');
    const displayName = params.get('displayName');
    if (tenantId || workspaceId || datasetId) {
      setForm((f) => ({
        ...f,
        ...(tenantId ? { tenantId } : {}),
        ...(workspaceId ? { workspaceId } : {}),
        ...(datasetId ? { datasetId } : {}),
        ...(displayName ? { displayName: displayName } : {}),
      }));
      setPrefilled(true);
    }
  }, []);

  useEffect(() => {
    tenantsApi.list().then(setTenants).catch(() => {});
  }, []);

  const set = (patch: Partial<CreateModelInput>) => setForm((f) => ({ ...f, ...patch }));

  const handleAutoDAX = async () => {
    if (!form.tenantId) { setError('Select a tenant first.'); return; }
    if (!form.workspaceId.trim()) { setError('Enter a Workspace ID first.'); return; }
    if (!form.datasetId.trim()) { setError('Enter a Dataset ID first.'); return; }

    setDiscovering(true);
    setError(null);
    setDaxHint(null);
    try {
      const suggestion = await browseApi.suggestDax(form.tenantId, form.workspaceId.trim(), form.datasetId.trim());
      set({ daxQuery: suggestion.dax });
      if (suggestion.isFallback) {
        setDaxHint(suggestion.description);
      } else {
        setDaxHint(suggestion.description);
      }
    } catch (e) {
      setError(`Could not auto-generate DAX: ${(e as Error).message}`);
    } finally {
      setDiscovering(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tenantId) { setError('Please select a tenant.'); return; }
    if (!form.workspaceId.trim()) { setError('Workspace ID is required.'); return; }
    if (!form.datasetId.trim()) { setError('Dataset ID is required.'); return; }
    if (!form.displayName.trim()) { setError('Display name is required.'); return; }
    if (form.queryMode !== 'rest' && !form.daxQuery.trim()) { setError('DAX query is required.'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const model = await modelsApi.create(form);
      window.location.href = `/models/${model.id}?tenantId=${encodeURIComponent(model.tenantId)}`;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <nav className="mb-1 text-sm text-gray-400 dark:text-gray-500" aria-label="Breadcrumb">
          <a href="/models" className="hover:underline">Models</a>
          {' / '}
          <span className="text-gray-600 dark:text-gray-300">Add model</span>
        </nav>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Add semantic model</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure a Power BI semantic model to be queried on a regular schedule.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-5 dark:border-gray-700 dark:bg-gray-800">
        {/* Display name */}
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Display name <span className="text-red-500">*</span>
          </label>
          <input
            id="displayName"
            autoFocus
            value={form.displayName}
            onChange={(e) => set({ displayName: e.target.value })}
            placeholder="e.g. Sales Model – Contoso"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
          />
        </div>

        {/* Tenant */}
        <div>
          <label htmlFor="tenantId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Tenant <span className="text-red-500">*</span>
          </label>
          <select
            id="tenantId"
            value={form.tenantId}
            onChange={(e) => set({ tenantId: e.target.value })}
            disabled={prefilled && !!form.tenantId}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">Select a tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName}
              </option>
            ))}
          </select>
          {tenants.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              No tenants configured.{' '}
              <a href="/tenants" className="underline">Add a tenant first.</a>
            </p>
          )}
        </div>

        {/* Workspace ID */}
        <div>
          <label htmlFor="workspaceId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Workspace ID <span className="text-red-500">*</span>
          </label>
          <input
            id="workspaceId"
            value={form.workspaceId}
            onChange={(e) => set({ workspaceId: e.target.value })}
            readOnly={prefilled && !!form.workspaceId}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className={`mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 ${prefilled && form.workspaceId ? 'opacity-60 cursor-not-allowed' : ''}`}
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Found in the Power BI workspace URL after <code>/groups/</code>
          </p>
        </div>

        {/* Dataset ID */}
        <div>
          <label htmlFor="datasetId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Dataset (semantic model) ID <span className="text-red-500">*</span>
          </label>
          <input
            id="datasetId"
            value={form.datasetId}
            onChange={(e) => set({ datasetId: e.target.value })}
            readOnly={prefilled && !!form.datasetId}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className={`mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 ${prefilled && form.datasetId ? 'opacity-60 cursor-not-allowed' : ''}`}
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Found in the Power BI dataset settings URL after <code>/datasets/</code>
          </p>
        </div>

        {/* Query mode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Query mode <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => set({ queryMode: 'dax' })}
              className={`flex-1 rounded-md border px-4 py-2.5 text-sm font-medium transition ${
                form.queryMode === 'dax'
                  ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500 dark:border-brand-400 dark:bg-brand-950 dark:text-brand-300'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              <span className="block font-semibold">DAX query</span>
              <span className="block text-xs font-normal mt-0.5 opacity-75">Executes a DAX query against the model</span>
            </button>
            <button
              type="button"
              onClick={() => set({ queryMode: 'rest' })}
              className={`flex-1 rounded-md border px-4 py-2.5 text-sm font-medium transition ${
                form.queryMode === 'rest'
                  ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500 dark:border-brand-400 dark:bg-brand-950 dark:text-brand-300'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              <span className="block font-semibold">REST ping</span>
              <span className="block text-xs font-normal mt-0.5 opacity-75">For live-connected AAS / SSAS models</span>
            </button>
          </div>
          {form.queryMode === 'rest' && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              REST mode checks dataset reachability via the Power BI REST API — no DAX execution needed.
              Use this for models backed by Azure Analysis Services or on-premises SSAS via gateway.
            </p>
          )}
        </div>

        {/* DAX query — only shown in DAX mode */}
        {form.queryMode === 'dax' && (
        <div>
          <div className="flex items-center gap-2">
            <label htmlFor="daxQuery" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              DAX query <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={handleAutoDAX}
              disabled={discovering}
              aria-label="Auto-generate DAX from model measures"
              title="Auto-generate DAX from model measures"
              className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition dark:border-amber-600 dark:bg-amber-950 dark:text-amber-400 dark:hover:bg-amber-900"
            >
              {discovering ? (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.898l-2.051-.684a1 1 0 01-.633-.632L6.95 5.684zM13.949 13.684a1 1 0 00-1.898 0l-.184.551a1 1 0 01-.632.633l-.551.183a1 1 0 000 1.898l.551.183a1 1 0 01.633.633l.183.551a1 1 0 001.898 0l.184-.551a1 1 0 01.632-.633l.551-.183a1 1 0 000-1.898l-.551-.184a1 1 0 01-.633-.632l-.183-.551z" />
                </svg>
              )}
              {discovering ? 'Discovering…' : 'Auto-generate'}
            </button>
          </div>
          <textarea
            id="daxQuery"
            rows={5}
            value={form.daxQuery}
            onChange={(e) => set({ daxQuery: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          {daxHint && (
            <div className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
              {daxHint}
            </div>
          )}
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Use a lightweight query that exercises the model engine. The result is stored but not required to be meaningful.
          </p>
        </div>
        )}

        {/* Schedule */}
        <div>
          <label id="schedule-label" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Schedule interval <span className="text-red-500">*</span>
          </label>
          <div className="mt-2" aria-labelledby="schedule-label">
            <SchedulePicker value={form.intervalMinutes} onChange={(v) => set({ intervalMinutes: v })} />
          </div>
        </div>

        {/* Tags */}
        <TagInput tags={form.tags ?? []} onChange={(tags) => set({ tags })} />

        {/* Maintenance windows */}
        <MaintenanceEditor
          windows={form.maintenanceWindows ?? []}
          onChange={(w) => set({ maintenanceWindows: w })}
        />

        {/* Actions */}
        <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition"
          >
            {submitting ? 'Adding…' : 'Add model'}
          </button>
          <a
            href="/models"
            className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
