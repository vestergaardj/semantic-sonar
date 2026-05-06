'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type Item = { href: string; label: string };
type Group = { label: string; items: Item[] };

const RADAR: Item = { href: '/radar', label: 'Radar' };
const DASHBOARD: Item = { href: '/dashboard', label: 'Dashboard' };

const GROUPS: Group[] = [
  {
    label: 'Configure',
    items: [
      { href: '/tenants', label: 'Tenants' },
      { href: '/models', label: 'Models' },
      { href: '/tags', label: 'Tags' },
      { href: '/maintenance', label: 'Maintenance' },
      { href: '/webhooks', label: 'Webhooks' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/uptime', label: 'Uptime' },
      { href: '/dependencies', label: 'Dependencies' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/audit', label: 'Audit' },
      { href: '/api-test', label: 'API Test' },
    ],
  },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupHasActive(pathname: string | null, group: Group): boolean {
  return group.items.some((i) => isActive(pathname, i.href));
}

export function Nav() {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLDivElement | null>(null);

  // Close any open menus when route changes
  useEffect(() => {
    setOpenGroup(null);
    setMobileOpen(false);
  }, [pathname]);

  // Click-outside to close desktop dropdowns
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!navRef.current) return;
      if (!navRef.current.contains(e.target as Node)) setOpenGroup(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpenGroup(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const linkBase = 'transition rounded-md px-2 py-1';
  const linkInactive = 'text-gray-600 hover:text-brand-600 dark:text-gray-300';
  const linkActive = 'text-brand-600 dark:text-brand-400 font-semibold';

  return (
    <div ref={navRef} className="flex flex-1 items-center gap-6">
      {/* Desktop nav */}
      <div className="hidden items-center gap-2 text-sm font-medium md:flex" role="menubar">
        <a
          href={RADAR.href}
          className={`${linkBase} ${isActive(pathname, RADAR.href) ? linkActive : linkInactive}`}
          role="menuitem"
        >
          {RADAR.label}
        </a>
        <a
          href={DASHBOARD.href}
          className={`${linkBase} ${isActive(pathname, DASHBOARD.href) ? linkActive : linkInactive}`}
          role="menuitem"
        >
          {DASHBOARD.label}
        </a>

        {GROUPS.map((g) => {
          const isOpen = openGroup === g.label;
          const hasActive = groupHasActive(pathname, g);
          return (
            <div key={g.label} className="relative">
              <button
                type="button"
                onClick={() => setOpenGroup(isOpen ? null : g.label)}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                className={`${linkBase} inline-flex items-center gap-1 ${
                  hasActive ? linkActive : linkInactive
                }`}
              >
                {g.label}
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                >
                  <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {isOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-20 mt-1 min-w-[10rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
                >
                  {g.items.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      className={`block px-3 py-1.5 text-sm transition ${
                        isActive(pathname, item.href)
                          ? 'bg-brand-50 text-brand-600 font-semibold dark:bg-gray-700 dark:text-brand-400'
                          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        className="ml-auto inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 md:hidden dark:text-gray-300 dark:hover:bg-gray-800"
        aria-label="Toggle navigation menu"
        aria-expanded={mobileOpen}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          {mobileOpen ? (
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          ) : (
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="absolute left-0 right-0 top-full z-20 border-t border-gray-200 bg-white shadow-lg md:hidden dark:border-gray-700 dark:bg-gray-900">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <a
              href={RADAR.href}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                isActive(pathname, RADAR.href)
                  ? 'bg-brand-50 text-brand-600 dark:bg-gray-800 dark:text-brand-400'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
              }`}
            >
              {RADAR.label}
            </a>
            <a
              href={DASHBOARD.href}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                isActive(pathname, DASHBOARD.href)
                  ? 'bg-brand-50 text-brand-600 dark:bg-gray-800 dark:text-brand-400'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
              }`}
            >
              {DASHBOARD.label}
            </a>
            {GROUPS.map((g) => (
              <div key={g.label} className="mt-3">
                <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {g.label}
                </div>
                {g.items.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`block rounded-md px-3 py-2 text-sm ${
                      isActive(pathname, item.href)
                        ? 'bg-brand-50 text-brand-600 font-semibold dark:bg-gray-800 dark:text-brand-400'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
                    }`}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
