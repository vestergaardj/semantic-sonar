'use client';

import { useEffect, useState } from 'react';
import { modelsApi } from '@/lib/api';

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagInput({ tags, onChange }: Props) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  useEffect(() => {
    modelsApi.listTags().then(setAllTags).catch(() => {});
  }, []);

  const filtered = input.trim()
    ? allTags.filter(t => t.includes(input.trim().toLowerCase()) && !tags.includes(t))
    : [];

  const addTag = (tag: string) => {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || normalized.length > 30) return;
    if (tags.length >= 10) return;
    if (!tags.includes(normalized)) {
      onChange([...tags, normalized]);
    }
    setInput('');
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter(t => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tags</label>
      <div className="mt-1 flex flex-wrap items-center gap-1 rounded-md border border-gray-300 px-2 py-1.5 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 dark:border-gray-600 dark:bg-gray-700">
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900 dark:text-brand-300"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove tag ${tag}`}
              className="text-brand-400 hover:text-brand-600 dark:text-brand-500 dark:hover:text-brand-300"
            >
              &times;
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length >= 10 ? 'Max 10 tags' : 'Add tag…'}
          disabled={tags.length >= 10}
          className="flex-1 min-w-[80px] border-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder-gray-400 dark:text-gray-100 dark:placeholder-gray-500"
        />
      </div>
      {filtered.length > 0 && (
        <div className="mt-1 rounded-md border border-gray-200 bg-white shadow-sm dark:border-gray-600 dark:bg-gray-700">
          {filtered.slice(0, 8).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => addTag(t)}
              className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
        Press Enter or comma to add. Max 10 tags, 30 chars each.
      </p>
    </div>
  );
}
