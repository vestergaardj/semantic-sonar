'use client';

import { useEffect, useState, useRef } from 'react';
import { tagsApi } from '@/lib/api';
import type { TagDefinition } from '@/lib/types';

interface Props {
  /** Currently selected tag name, or empty string / undefined for none */
  value: string | undefined;
  onChange: (tag: string | undefined) => void;
}

/**
 * Single-value tag selector. Loads available tags from the central tag
 * definitions and lets the user pick exactly one (or clear the selection).
 */
export function TagSelector({ value, onChange }: Props) {
  const [tags, setTags] = useState<TagDefinition[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tagsApi.list().then(setTags).catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = tags.filter(
    (t) => t.name.toLowerCase().includes(search.toLowerCase()) && t.name !== value,
  );

  return (
    <div ref={ref}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tag</label>
      <div className="mt-1 relative">
        {value ? (
          <div className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900 dark:text-brand-300">
              {value}
            </span>
            <button
              type="button"
              onClick={() => onChange(undefined)}
              aria-label="Remove tag"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              &times;
            </button>
          </div>
        ) : (
          <div>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder={tags.length === 0 ? 'No tags defined yet' : 'Select a tag\u2026'}
              disabled={tags.length === 0}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
            />
            {open && filtered.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-700">
                {filtered.slice(0, 20).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { onChange(t.name); setSearch(''); setOpen(false); }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
        One tag per model. <a href="/tags" className="underline hover:text-brand-500">Manage tags</a>
      </p>
    </div>
  );
}

// Keep backward-compatible export for any remaining references
/** @deprecated Use TagSelector instead */
export const TagInput = TagSelector;
