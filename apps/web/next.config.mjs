/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship untranspiled TypeScript (no build step) — see
  // ARCHITECTURE.md §10 folder structure. Next must transpile them itself,
  // and its webpack resolver needs to follow the ESM `./x.js` specifiers in
  // their source back to the `.ts` files that actually exist.
  transpilePackages: ["@livo/schemas", "@livo/db", "@livo/budget-engine"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
