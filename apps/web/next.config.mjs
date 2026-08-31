/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@stellarflow/types",
    "@stellarflow/config",
    "@stellarflow/sdk",
    "@stellarflow/test-utils",
  ],
};

export default nextConfig;
