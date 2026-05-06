'use client';

import { useEffect, useState } from 'react';
import { tagsApi } from '@/lib/api';
import type { TagDefinition } from '@/lib/types';

export default function TagsPage() {
  const [tags, setTags] = useState<TagDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New tag form
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // Inline rename
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  // Usage cache
  const [usageMap, setUsageMap] = useState<Record<string, number>>({});

  const load = async () => {
    try {
      setError(null);
      const list = await tagsApi.list();
      setTags(list);
      // Load usage counts in parallel
      const usages = await Promise.all(list.map((t) => tagsApi.usage(t.id).catch(() => ({ tagId: t.id, tagName: t.name, usageCount: 0 }))));
      const map: Record<string, number> = {};
      for (const u of usages) map[u.tagId] = u.usageCount;
      setUsageMap(map);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await tagsApi.create(newName.trim());
      setNewName('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (tag: TagDefinition) => {
    setEditingId(tag.id);
    setEditName(tag.name);
  };

  const handleRename = async () => {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await tagsApi.update(editingId, editName.trim());
      setEditingId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tag: TagDefinition) => {
    const usage = usageMap[tag.id] ?? 0;
    const message = usage > 0
      ? `Delete "${tag.name}"? It is used by ${usage} model(s). The tag will be removed from those models.`
      : `Delete "${tag.name}"?`;
    if (!confirm(message)) return;
    setError(null);
    try {
      await tagsApi.delete(tag.id, true);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleSeed = async () => {
    setError(null);
    try {
      const result = await tagsApi.seed();
      if (result.seeded > 0) {
        await load();
      }
      alert(`Seeded ${result.seeded} tag(s) from existing models.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Tags</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage tags centrally. Models can be assigned one tag from this list.
          </p>
        </div>
        <button
          onClick={handleSeed}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
          title="Import existing tags from models as tag definitions"
        >
          Seed from models
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New tag name…"
          maxLength={50}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition"
        >
          {creating ? 'Adding…' : 'Add tag'}
        </button>
      </form>

      {/* Tags table */}
      {loading ? (
        <div className="animate-pulse space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 rounded bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      ) : tags.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
          <p className="text-gray-500 dark:text-gray-400">No tags defined yet. Create one above or seed from existing models.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-sm" aria-label="Tag definitions">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th className="px-4 py-2 font-medium" scope="col">Name</th>
                <th className="px-4 py-2 font-medium text-center" scope="col">Models</th>
                <th className="px-4 py-2 font-medium" scope="col">Created</th>
                <th className="px-4 py-2 font-medium text-right" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => (
                <tr key={tag.id} className="border-b border-gray-50 last:border-0 dark:border-gray-700">
                  <td className="px-4 py-2">
                    {editingId === tag.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingId(null); }}
                          autoFocus
                          maxLength={50}
                          className="w-48 rounded-md border border-brand-500 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100"
                        />
                        <button
                          onClick={handleRename}
                          disabled={saving || !editName.trim()}
                          className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span className="font-medium text-gray-900 dark:text-gray-100">{tag.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center text-gray-500 dark:text-gray-400">
                    {usageMap[tag.id] ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500">
                    {new Date(tag.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => startEdit(tag)}
                        className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleDelete(tag)}
                        className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
