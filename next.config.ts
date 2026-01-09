import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empty turbopack config to silence the warning about having webpack config
  // Next.js 16+ uses Turbopack by default
  turbopack: {},
  
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
