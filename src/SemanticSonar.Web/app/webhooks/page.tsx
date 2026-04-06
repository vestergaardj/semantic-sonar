'use client';

import { useEffect, useState } from 'react';
import { webhooksApi, tenantsApi } from '@/lib/api';
import type { WebhookConfig, TenantConfig } from '@/lib/types';
import { WEBHOOK_EVENTS } from '@/lib/types';

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [tenants, setTenants] = useState<TenantConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WebhookConfig | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  // Form
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formSecret, setFormSecret] = useState('');
  const [formTenantId, setFormTenantId] = useState('');
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [formActive, setFormActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const [wh, t] = await Promise.all([webhooksApi.list(), tenantsApi.list()]);
      setWebhooks(wh);
      setTenants(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.displayName]));

  const resetForm = () => {
    setFormName('');
    setFormUrl('');
    setFormSecret('');
    setFormTenantId('');
    setFormEvents([]);
    setFormActive(true);
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (wh: WebhookConfig) => {
    setEditing(wh);
    setFormName(wh.displayName);
    setFormUrl(wh.url);
    setFormSecret(wh.secret);
    setFormTenantId(wh.tenantId);
    setFormEvents([...wh.events]);
    setFormActive(wh.isActive);
    setShowForm(true);
  };

  const toggleEvent = (ev: string) => {
    setFormEvents(prev =>
      prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) { setError('Name is required.'); return; }
    if (!formUrl.trim()) { setError('URL is required.'); return; }
    if (formEvents.length === 0) { setError('Select at least one event.'); return; }

    setSubmitting(true);
    setError(null);
    try {
      if (editing) {
        const updated = await webhooksApi.update(editing.id, {
          displayName: formName,
          url: formUrl,
          secret: formSecret,
          tenantId: formTenantId,
          events: formEvents,
          isActive: formActive,
        });
        setWebhooks(prev => prev.map(w => w.id === updated.id ? updated : w));
      } else {
        const created = await webhooksApi.create({
          displayName: formName,
          url: formUrl,
          secret: formSecret,
          tenantId: formTenantId,
          events: formEvents,
        });
        setWebhooks(prev => [...prev, created]);
      }
      setShowForm(false);
      resetForm();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (wh: WebhookConfig) => {
    if (!confirm(`Delete webhook "${wh.displayName}"?`)) return;
    await webhooksApi.delete(wh.id);
    setWebhooks(prev => prev.filter(w => w.id !== wh.id));
  };

  const handleTest = async (wh: WebhookConfig) => {
    setTesting(wh.id);
    try {
      await webhooksApi.test(wh.id);
      alert('Test webhook sent!');
      load();
    } catch (e) {
      alert(`Test failed: ${(e as Error).message}`);
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Webhooks
          {!loading && <span className="ml-2 text-base font-normal text-gray-400">({webhooks.length})</span>}
        </h1>
        <button
          onClick={openCreate}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
        >
          + Add webhook
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Edit webhook' : 'New webhook'}</h2>

          <div>
            <label htmlFor="wh-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name <span className="text-red-500">*</span></label>
            <input id="wh-name" value={formName} onChange={e => setFormName(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" placeholder="e.g. Teams Alerts" />
          </div>

          <div>
            <label htmlFor="wh-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300">URL (HTTPS) <span className="text-red-500">*</span></label>
            <input id="wh-url" value={formUrl} onChange={e => setFormUrl(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" placeholder="https://example.com/webhook" />
          </div>

          <div>
            <label htmlFor="wh-secret" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Signing secret</label>
            <input id="wh-secret" value={formSecret} onChange={e => setFormSecret(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" placeholder="Optional HMAC-SHA256 secret" />
            <p className="mt-1 text-xs text-gray-400">If set, every delivery includes an X-Signature header.</p>
          </div>

          <div>
            <label htmlFor="wh-tenant" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Scope</label>
            <select id="wh-tenant" value={formTenantId} onChange={e => setFormTenantId(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              <option value="">All tenants (global)</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Events <span className="text-red-500">*</span></label>
            <div className="space-y-2">
              {WEBHOOK_EVENTS.map(ev => (
                <label key={ev.value} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formEvents.includes(ev.value)}
                    onChange={() => toggleEvent(ev.value)}
                    className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-500 dark:bg-gray-600"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{ev.label}</span>
                    <p className="text-xs text-gray-400">{ev.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {editing && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={formActive} onChange={e => setFormActive(e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-500 dark:bg-gray-600" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
            </label>
          )}

          <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button type="submit" disabled={submitting} className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition">
              {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create webhook'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-gray-200 dark:bg-gray-700" />)}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
          <p className="text-gray-500 dark:text-gray-400">No webhooks configured.</p>
          <button onClick={openCreate} className="mt-2 text-sm text-brand-600 hover:underline">Add your first webhook →</button>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map(wh => (
            <div key={wh.id} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{wh.displayName}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      wh.isActive
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {wh.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm font-mono text-gray-500 dark:text-gray-400 truncate">{wh.url}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {wh.events.map(ev => (
                      <span key={ev} className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900 dark:text-brand-300">{ev}</span>
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    {wh.tenantId ? `Tenant: ${tenantMap[wh.tenantId] ?? wh.tenantId}` : 'Global (all tenants)'}
                    {wh.lastTriggeredAt && ` · Last fired: ${new Date(wh.lastTriggeredAt).toLocaleString()}`}
                    {wh.lastStatus != null && ` · Status: ${wh.lastStatus}`}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleTest(wh)} disabled={testing === wh.id} className="rounded border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950">
                    {testing === wh.id ? 'Sending…' : 'Test'}
                  </button>
                  <button onClick={() => openEdit(wh)} className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(wh)} className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
