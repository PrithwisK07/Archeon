/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@zero-dollar/ir-core", "@zero-dollar/compiler"],
  
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;