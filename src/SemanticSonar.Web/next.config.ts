import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
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
