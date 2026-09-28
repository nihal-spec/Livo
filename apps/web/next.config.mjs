import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  // Monorepo: the generated Prisma client (with its query-engine binary)
  // lives in the repo root's node_modules/.pnpm/..., not apps/web's own
  // node_modules. Without an explicit root, Next's file tracer can infer
  // the wrong workspace boundary on Vercel and silently drop files from
  // outside it. And even with the right root, Prisma loads its engine
  // binary via a runtime path lookup, not a static import — Next's tracer
  // only follows static imports, so the binary has to be listed
  // explicitly or it never makes it into the deployed function bundle
  // (the exact "could not locate the Query Engine" failure on Vercel).
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../.."),
    outputFileTracingIncludes: {
      "/**/*": ["../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/*.so.node"],
    },
  },
};

export default nextConfig;
