import type { NextConfig } from 'next';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Next.js doesn't pick up a stray
  // package.json/lockfile in a parent directory (which breaks module resolution).
  turbopack: {
    root: path.resolve(__dirname),
  },
  outputFileTracingRoot: path.resolve(__dirname),
  // 'export' is needed for the SWA static build; disable it in dev so that
  // API routes and rewrites work during local development.
  ...(isDev ? {} : { output: 'export' }),
  images: { unoptimized: true },
  // In dev, proxy /api/* to the local Azure Functions host so the frontend
  // can call the backend without CORS issues or needing SWA CLI.
  ...(isDev && {
    async rewrites() {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:7071/api/:path*',
        },
      ];
    },
  }),
};

export default nextConfig;
