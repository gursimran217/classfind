import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["xlsx"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // OneDrive-synced project folders break webpack's disk cache (EPERM on rename).
    config.cache = false;
    return config;
  },
};

export default nextConfig;