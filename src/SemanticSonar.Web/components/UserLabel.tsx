'use client';

import { useEffect, useState } from 'react';
import { getClientPrincipal } from '@/lib/auth';

export function UserLabel() {
  const [userDetails, setUserDetails] = useState<string | null>(null);

  useEffect(() => {
    getClientPrincipal().then((p) => setUserDetails(p?.displayName ?? p?.userDetails ?? null));
  }, []);

  if (!userDetails) return null;

  return (
    <span
      title={userDetails}
      className="max-w-[160px] truncate rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
    >
      {userDetails}
    </span>
  );
}
