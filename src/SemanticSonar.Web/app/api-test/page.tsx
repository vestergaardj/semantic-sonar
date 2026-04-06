'use client';

import { useState } from 'react';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

interface EndpointResult {
  status: number | null;
  body: unknown;
  error: string | null;
  loading: boolean;
}

function defaultResult(): EndpointResult {
  return { status: null, body: null, error: null, loading: false };
}

async function callGet(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

// ─── Individual endpoint cards ────────────────────────────────────────────────

function EndpointCard({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      <div className="px-5 py-4 space-y-3">{children}</div>
    </div>
  );
}

function ResponseViewer({ result }: { result: EndpointResult }) {
  if (result.loading) {
    return <p className="text-sm text-gray-400 italic">Loading…</p>;
  }
  if (result.error) {
    return (
      <pre className="rounded bg-red-50 p-3 text-xs text-red-700 overflow-auto max-h-64 dark:bg-red-900/30 dark:text-red-300">
        {result.error}
      </pre>
    );
  }
  if (result.status === null) return null;

  const isOk = result.status >= 200 && result.status < 300;
  return (
    <div>
      <span
        className={`inline-block mb-1 rounded px-2 py-0.5 text-xs font-mono font-semibold ${
          isOk ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
        }`}
      >
        HTTP {result.status}
      </span>
      <pre className="rounded bg-gray-50 border border-gray-200 p-3 text-xs text-gray-800 overflow-auto max-h-80 whitespace-pre-wrap break-words dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
        {JSON.stringify(result.body, null, 2)}
      </pre>
    </div>
  );
}

function RunButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="rounded bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition"
    >
      {loading ? 'Running…' : 'Run'}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApiTestPage() {
  // --- GET /tenants ---
  const [listTenantsResult, setListTenantsResult] = useState(defaultResult());

  // --- GET /tenants/{id} ---
  const [getTenantId, setGetTenantId] = useState('');
  const [getTenantResult, setGetTenantResult] = useState(defaultResult());

  // --- GET /models ---
  const [listModelsTenantId, setListModelsTenantId] = useState('');
  const [listModelsResult, setListModelsResult] = useState(defaultResult());

  // --- GET /models/{id} ---
  const [getModelId, setGetModelId] = useState('');
  const [getModelTenantId, setGetModelTenantId] = useState('');
  const [getModelResult, setGetModelResult] = useState(defaultResult());

  // --- GET /results ---
  const [resultsModelId, setResultsModelId] = useState('');
  const [resultsLimit, setResultsLimit] = useState('50');
  const [resultsResult, setResultsResult] = useState(defaultResult());

  // --- GET /summary ---
  const [summaryResult, setSummaryResult] = useState(defaultResult());

  async function run(
    path: string,
    setter: React.Dispatch<React.SetStateAction<EndpointResult>>,
  ) {
    setter(r => ({ ...r, loading: true, error: null, status: null, body: null }));
    try {
      const { status, body } = await callGet(path);
      setter({ status, body, error: null, loading: false });
    } catch (e) {
      setter({ status: null, body: null, error: String(e), loading: false });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">API Test</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Execute GET endpoints against <code className="font-mono text-xs bg-gray-100 rounded px-1 py-0.5 dark:bg-gray-800 dark:text-gray-300">{BASE}</code>
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">

        {/* GET /tenants */}
        <EndpointCard
          title="GET /tenants"
          description="List all tenants."
        >
          <RunButton
            loading={listTenantsResult.loading}
            onClick={() => run('/tenants', setListTenantsResult)}
          />
          <ResponseViewer result={listTenantsResult} />
        </EndpointCard>

        {/* GET /tenants/{id} */}
        <EndpointCard
          title="GET /tenants/{id}"
          description="Retrieve a single tenant by ID."
        >
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Tenant ID"
              value={getTenantId}
              onChange={e => setGetTenantId(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <RunButton
              loading={getTenantResult.loading}
              onClick={() => {
                if (!getTenantId.trim()) return;
                run(`/tenants/${encodeURIComponent(getTenantId.trim())}`, setGetTenantResult);
              }}
            />
          </div>
          <ResponseViewer result={getTenantResult} />
        </EndpointCard>

        {/* GET /models */}
        <EndpointCard
          title="GET /models"
          description="List all models, optionally filtered by tenantId."
        >
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="tenantId (optional)"
              value={listModelsTenantId}
              onChange={e => setListModelsTenantId(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <RunButton
              loading={listModelsResult.loading}
              onClick={() => {
                const qs = listModelsTenantId.trim()
                  ? `?tenantId=${encodeURIComponent(listModelsTenantId.trim())}`
                  : '';
                run(`/models${qs}`, setListModelsResult);
              }}
            />
          </div>
          <ResponseViewer result={listModelsResult} />
        </EndpointCard>

        {/* GET /models/{id} */}
        <EndpointCard
          title="GET /models/{id}"
          description="Retrieve a single model by ID. tenantId is required."
        >
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Model ID"
              value={getModelId}
              onChange={e => setGetModelId(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <input
              type="text"
              placeholder="tenantId (required)"
              value={getModelTenantId}
              onChange={e => setGetModelTenantId(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <RunButton
              loading={getModelResult.loading}
              onClick={() => {
                if (!getModelId.trim() || !getModelTenantId.trim()) return;
                run(
                  `/models/${encodeURIComponent(getModelId.trim())}?tenantId=${encodeURIComponent(getModelTenantId.trim())}`,
                  setGetModelResult,
                );
              }}
            />
          </div>
          <ResponseViewer result={getModelResult} />
        </EndpointCard>

        {/* GET /results */}
        <EndpointCard
          title="GET /results"
          description="Retrieve canary results for a model. modelId is required; limit defaults to 50 (max 200)."
        >
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="modelId (required)"
              value={resultsModelId}
              onChange={e => setResultsModelId(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <input
              type="number"
              placeholder="limit (1–200)"
              value={resultsLimit}
              min={1}
              max={200}
              onChange={e => setResultsLimit(e.target.value)}
              className="w-28 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <RunButton
              loading={resultsResult.loading}
              onClick={() => {
                if (!resultsModelId.trim()) return;
                const limit = parseInt(resultsLimit, 10) || 50;
                run(
                  `/results?modelId=${encodeURIComponent(resultsModelId.trim())}&limit=${limit}`,
                  setResultsResult,
                );
              }}
            />
          </div>
          <ResponseViewer result={resultsResult} />
        </EndpointCard>

        {/* GET /summary */}
        <EndpointCard
          title="GET /summary"
          description="Retrieve the dashboard summary (totals, recent failures, at-risk models)."
        >
          <RunButton
            loading={summaryResult.loading}
            onClick={() => run('/summary', setSummaryResult)}
          />
          <ResponseViewer result={summaryResult} />
        </EndpointCard>

      </div>
    </div>
  );
}
