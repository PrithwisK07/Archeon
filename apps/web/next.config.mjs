/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // If Webpack is bundling for the browser (client-side)
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        os: false,
        path: false,
        crypto: false,
        module: false,
        perf_hooks: false,
        'source-map-support': false,
      };
    }
    
    // Suppress critical dependency warnings specifically from ts-morph
    config.ignoreWarnings = [
      { module: /node_modules\/@ts-morph/ }
    ];

    return config;
  },
};

export default nextConfig;