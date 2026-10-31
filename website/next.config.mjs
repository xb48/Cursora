// Static export: `npm run build` writes a plain website to out/ (no server needed).
// BASE_PATH is the sub-path the site is served from, e.g. "/Cursora" on GitHub Pages.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const basePath = process.env.BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  reactStrictMode: true,
  // The site is its own project inside the app's repository.
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
