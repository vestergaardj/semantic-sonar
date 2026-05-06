'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { getClientPrincipal, getLoginUrl } from '@/lib/auth';

export function AuthGuard({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'redirect'>('loading');

  useEffect(() => {
    getClientPrincipal().then((p) => {
      if (p) {
        setStatus('ok');
      } else {
        window.location.href = getLoginUrl(window.location.pathname);
        setStatus('redirect');
      }
    });
  }, []);

  if (status === 'loading' || status === 'redirect') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-gray-400">
        Authenticating…
      </div>
    );
  }

  return <>{children}</>;
}
