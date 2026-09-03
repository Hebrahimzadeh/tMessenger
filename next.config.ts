import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Multi-stage Docker image (Task 04) copies only .next/standalone +
  // .next/static + public into the runtime stage, tracing the actual
  // dependency graph (including the @taavon/contracts workspace package)
  // instead of shipping the full node_modules tree.
  output: 'standalone',
};

export default nextConfig;
