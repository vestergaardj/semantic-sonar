import type { Metadata } from 'next';
import './globals.css';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserLabel } from '@/components/UserLabel';
import { SignOutLink } from '@/components/SignOutLink';
import { AuthGuard } from '@/components/AuthGuard';

export const metadata: Metadata = {
  title: 'Semantic Sonar',
  description: 'Canary monitoring for Power BI / Fabric semantic models',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
        <nav className="border-b border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900" aria-label="Main navigation">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-6">
              <a href="/" className="flex items-center gap-2 font-bold text-brand-600 text-lg" aria-label="Semantic Sonar home">
                <img src="/icon.png" alt="" width={28} height={28} className="rounded" aria-hidden="true" />
                Semantic Sonar
              </a>
              <div className="hidden items-center gap-4 text-sm font-medium text-gray-600 dark:text-gray-300 sm:flex" role="menubar">
                <a href="/" className="hover:text-brand-600 transition" role="menuitem">Dashboard</a>
                <a href="/tenants" className="hover:text-brand-600 transition" role="menuitem">Tenants</a>
                <a href="/models" className="hover:text-brand-600 transition" role="menuitem">Models</a>
                <a href="/tags" className="hover:text-brand-600 transition" role="menuitem">Tags</a>
                <a href="/maintenance" className="hover:text-brand-600 transition" role="menuitem">Maintenance</a>
                <a href="/uptime" className="hover:text-brand-600 transition" role="menuitem">Uptime</a>
                <a href="/dependencies" className="hover:text-brand-600 transition" role="menuitem">Dependencies</a>
                <a href="/radar" className="hover:text-brand-600 transition" role="menuitem">Radar</a>
                <a href="/audit" className="hover:text-brand-600 transition" role="menuitem">Audit</a>
                <a href="/webhooks" className="hover:text-brand-600 transition" role="menuitem">Webhooks</a>
                <a href="/api-test" className="hover:text-brand-600 transition" role="menuitem">API Test</a>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <UserLabel />
              <ThemeToggle />
              <SignOutLink />
            </div>
          </div>
        </nav>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8" role="main">
          <AuthGuard>
            {children}
          </AuthGuard>
        </main>
      </body>
    </html>
  );
}
