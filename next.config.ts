import type { NextConfig } from "next";
import { createMDX } from 'fumadocs-mdx/next';

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '**.google.com' },
      { protocol: 'https', hostname: 'drive-thirdparty.googleusercontent.com' },
    ],
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
