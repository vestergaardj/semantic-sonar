import { Suspense } from 'react';
import BrowseClient from './BrowseClient';

export function generateStaticParams() {
  return [{ id: '_shell_' }];
}

export default function BrowsePage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-10 w-48 rounded bg-gray-200 dark:bg-gray-700" />}>
      <BrowseClient />
    </Suspense>
  );
}
