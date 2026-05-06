'use client';

import { useEffect, useState } from 'react';
import { getLoginUrl } from '@/lib/auth';

// 'loading' | 'sign-in' (no session) | string (logout URL)
type LogoutState = 'loading' | 'sign-in' | string;

export function SignOutLink() {
  const [state, setState] = useState<LogoutState>('loading');

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/.auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.clientPrincipal) {
            const tenantId = process.env.NEXT_PUBLIC_MSAL_TENANT_ID;
            if (tenantId) {
              const selectAccount = `${window.location.origin}/.auth/login/aad?prompt=select_account`;
              const aadLogout =
                `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout` +
                `?post_logout_redirect_uri=${encodeURIComponent(selectAccount)}`;
              setState(`/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(aadLogout)}`);
            } else {
              setState('/.auth/logout?post_logout_redirect_uri=/');
            }
            return;
          }
        }
      } catch {
        // /.auth/me not reachable — user must use SWA CLI.
      }
      setState('sign-in');
    }
    init();
  }, []);

  if (state === 'loading') return null;

  if (state === 'sign-in') {
    return (
      <a
        href={getLoginUrl()}
        className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        aria-label="Sign in"
      >
        Sign in
      </a>
    );
  }

  return (
    <a
      href={state}
      className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      aria-label="Sign out"
    >
      Sign out
    </a>
  );
}
