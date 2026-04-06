'use client';

import { useEffect, useState } from 'react';
import { auditApi, tenantsApi } from '@/lib/api';
import type { AuditEntry, TenantConfig } from '@/lib/types';

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [tenants, setTenants] = useState<TenantConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterTenant, setFilterTenant] = useState('');
  const [filterEntity, setFilterEntity] = useState('');

  const load = async () => {
    try {
      setError(null);
      const [e, t] = await Promise.all([
        auditApi.list(filterTenant || undefined, filterEntity || undefined, 100),
        tenants.length ? Promise.resolve(tenants) : tenantsApi.list(),
      ]);
      setEntries(e);
      if (!tenants.length) setTenants(t as TenantConfig[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterTenant, filterEntity]);

  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t.displayName]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Audit Log</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterTenant}
          onChange={(e) => { setFilterTenant(e.target.value); setLoading(true); }}
          aria-label="Filter by tenant"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All tenants</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.displayName}</option>
          ))}
        </select>
        <input
          value={filterEntity}
          onChange={(e) => setFilterEntity(e.target.value)}
          onBlur={load}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Filter by entity ID…"
          aria-label="Filter by entity ID"
          className="w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400"
        />
        <button
          onClick={() => { setLoading(true); load(); }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 rounded bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
          <p className="text-gray-500 dark:text-gray-400">No audit entries found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-sm" aria-label="Audit log">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th className="px-4 py-2 font-medium" scope="col">When</th>
                <th className="px-4 py-2 font-medium" scope="col">Action</th>
                <th className="px-4 py-2 font-medium" scope="col">Entity</th>
                <th className="px-4 py-2 font-medium" scope="col">Tenant</th>
                <th className="px-4 py-2 font-medium" scope="col">Details</th>
                <th className="px-4 py-2 font-medium" scope="col">User</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-gray-50 last:border-0 dark:border-gray-700">
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap dark:text-gray-400">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <ActionBadge action={entry.action} />
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{entry.entityType}</span>
                    <span className="ml-1 font-mono text-xs text-gray-400">{entry.entityId.slice(0, 8)}…</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                    {tenantMap[entry.tenantId] ?? entry.tenantId.slice(0, 12)}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 max-w-xs truncate" title={entry.details ?? ''}>
                    {entry.details ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400">{entry.userId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    Created: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400',
    Updated: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-400',
    Deleted: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-400',
    Enabled: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-400',
    Disabled: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-400',
    SecretUpdated: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-400',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[action] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
      {action}
    </span>
  );
}
