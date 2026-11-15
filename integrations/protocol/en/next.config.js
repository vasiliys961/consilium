/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    instrumentationHook: true,
    serverActions: {
      bodySizeLimit: '200mb',
    },
    serverComponentsExternalPackages: ['@xenova/transformers'],
  },
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      'onnxruntime-node$': false,
    };
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        sharp$: false,
      };
    }
    config.watchOptions = {
      ...config.watchOptions,
      ignored: /[\\/](?:node_modules|\.next|\.git)[\\/]/,
    };
    return config;
  },
};

module.exports = nextConfig;
