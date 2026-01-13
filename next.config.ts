import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empty turbopack config to silence the warning about having webpack config
  // Next.js 16+ uses Turbopack by default
  turbopack: {},
  
  // Cache control headers to prevent aggressive browser caching of JS bundles
  // This helps ensure users get fresh code after deployments
  headers: async () => [
    {
      // Apply to all JS files
      source: '/:path*.js',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=0, must-revalidate',
        },
      ],
    },
    {
      // Apply to all pages
      source: '/:path*',
      headers: [
        {
          key: 'X-App-Version',
          value: '3.2.0',
        },
      ],
    },
  ],
  
  // Webpack configuration (fallback for non-Turbopack builds)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Ensure crypto is available (use browser's built-in)
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
