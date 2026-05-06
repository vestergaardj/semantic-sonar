'use client';

import React, { useEffect, useState } from 'react';
import { tenantsApi, modelsApi } from '@/lib/api';
import type { TenantConfig } from '@/lib/types';

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ displayName: '', entraId: '', clientId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Secret management state
  const [secretTenantId, setSecretTenantId] = useState<string | null>(null);
  const [secretValue, setSecretValue] = useState('');
  const [savingSecret, setSavingSecret] = useState(false);
  const [secretStatuses, setSecretStatuses] = useState<Record<string, boolean>>({});
  const [secretSuccess, setSecretSuccess] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await tenantsApi.list();
      setTenants(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Load secret status for each tenant
  useEffect(() => {
    tenants.forEach((t) => {
      if (secretStatuses[t.id] === undefined) {
        tenantsApi.secretStatus(t.id)
          .then((r) => setSecretStatuses((prev) => ({ ...prev, [t.id]: r.exists })))
          .catch(() => {}); // ignore — we just won't show the badge
      }
    });
  }, [tenants]);

  const handleSaveSecret = async (tenantId: string) => {
    if (!secretValue.trim()) return;
    setSavingSecret(true);
    setError(null);
    setSecretSuccess(null);
    try {
      await tenantsApi.setSecret(tenantId, secretValue.trim());
      setSecretStatuses((prev) => ({ ...prev, [tenantId]: true }));
      setSecretValue('');
      setSecretTenantId(null);
      setSecretSuccess(tenantId);
      setTimeout(() => setSecretSuccess(null), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingSecret(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await tenantsApi.create(formData);
      setTenants((prev) => [...prev, created]);
      setShowForm(false);
      setFormData({ displayName: '', entraId: '', clientId: '' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    let modelCount = 0;
    try {
      const models = await modelsApi.list(id);
      modelCount = models.length;
    } catch { /* ignore — we'll still ask for confirmation */ }

    const message = modelCount > 0
      ? `Remove tenant "${name}"?\n\nThis will permanently delete ${modelCount} associated model${modelCount === 1 ? '' : 's'} and stop all monitoring for this tenant.`
      : `Remove tenant "${name}"?\n\nThis tenant has no monitored models.`;

    if (!confirm(message)) return;
    try {
      await tenantsApi.delete(id);
      setTenants((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Tenants</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
        >
          {showForm ? 'Cancel' : '+ Add tenant'}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Add tenant form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-brand-200 bg-brand-50 p-4 space-y-3 dark:border-brand-700 dark:bg-gray-800"
        >
          <h2 className="font-medium text-gray-900 dark:text-gray-100">New tenant</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Display name
              </label>
              <input
                required
                value={formData.displayName}
                onChange={(e) => setFormData((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="Contoso Ltd"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Entra Tenant ID (GUID)
              </label>
              <input
                required
                pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                value={formData.entraId}
                onChange={(e) => setFormData((f) => ({ ...f, entraId: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                App Registration Client ID (GUID)
              </label>
              <input
                required
                pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                value={formData.clientId}
                onChange={(e) => setFormData((f) => ({ ...f, clientId: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:border-gray-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {/* Tenant list */}
      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      ) : tenants.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
          <p className="text-gray-500 dark:text-gray-400">No tenants configured yet.</p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Add a tenant to start monitoring its semantic models.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-sm" aria-label="Tenants">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th className="px-4 py-3 font-medium" scope="col">Name</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell" scope="col">Tenant ID</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell" scope="col">Client ID</th>
                <th className="px-4 py-3 font-medium" scope="col">Secret</th>
                <th className="px-4 py-3 font-medium" scope="col">Status</th>
                <th className="px-4 py-3 font-medium" scope="col">Added</th>
                <th className="px-4 py-3" scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <React.Fragment key={t.id}>
                <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{t.displayName}</td>
                  <td className="px-4 py-3 font-mono text-gray-500 hidden sm:table-cell dark:text-gray-400">
                    {t.entraId}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500 hidden lg:table-cell dark:text-gray-400">
                    {t.clientId}
                  </td>
                  <td className="px-4 py-3">
                    {secretSuccess === t.id ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
                        &#x2713; Saved
                      </span>
                    ) : secretStatuses[t.id] === true ? (
                      <button
                        onClick={() => { setSecretTenantId(secretTenantId === t.id ? null : t.id); setSecretValue(''); }}
                        className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-400 dark:hover:bg-green-900/60"
                        title="Secret configured — click to update"
                      >
                        &#x1F512; Update
                      </button>
                    ) : secretStatuses[t.id] === false ? (
                      <button
                        onClick={() => { setSecretTenantId(secretTenantId === t.id ? null : t.id); setSecretValue(''); }}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:hover:bg-amber-900/60"
                        title="No secret — click to set"
                      >
                        &#x26A0; Set secret
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">…</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.isActive
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {t.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {new Date(t.addedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/browse/${encodeURIComponent(t.id)}`}
                      className="mr-3 text-brand-600 hover:underline text-xs"
                    >
                      Browse
                    </a>
                    <a
                      href={`/models?tenantId=${encodeURIComponent(t.id)}`}
                      className="mr-3 text-brand-600 hover:underline text-xs"
                    >
                      Models
                    </a>
                    <button
                      onClick={() => handleDelete(t.id, t.displayName)}
                      className="text-red-500 hover:text-red-700 text-xs"
                      aria-label={`Remove ${t.displayName}`}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
                {/* Expandable secret form row */}
                {secretTenantId === t.id && (
                  <tr className="bg-gray-50 dark:bg-gray-900/50">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="flex items-end gap-3 max-w-xl">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Client secret for <span className="font-semibold">{t.displayName}</span>
                          </label>
                          <input
                            type="password"
                            autoComplete="off"
                            required
                            value={secretValue}
                            onChange={(e) => setSecretValue(e.target.value)}
                            placeholder="Paste the app registration client secret"
                            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                          />
                        </div>
                        <button
                          onClick={() => handleSaveSecret(t.id)}
                          disabled={savingSecret || !secretValue.trim()}
                          className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition"
                        >
                          {savingSecret ? 'Saving…' : secretStatuses[t.id] ? 'Update secret' : 'Save secret'}
                        </button>
                        <button
                          onClick={() => { setSecretTenantId(null); setSecretValue(''); }}
                          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:border-gray-500"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
