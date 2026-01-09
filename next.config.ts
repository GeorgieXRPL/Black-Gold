import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  
  // Webpack configuration
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
