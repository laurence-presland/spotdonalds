import path from "node:path";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const projectRoot = path.join(__dirname);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["postgres"],
  // Vercel sets NEXT_PRIVATE_OUTPUT_TRACE_ROOT to the repo root. Next then
  // uses that as the Turbopack root, while the workflow loader path is still
  // expressed as ./node_modules/@workflow/next/dist/loader.js from this app.
  turbopack: {
    root: projectRoot,
  },
};

// Package export, not a filesystem path. Turbopack turns withWorkflow's
// absolute loader path into ./node_modules/@workflow/next/dist/loader.js and
// resolves that from the worker's cwd. On Vercel that cwd is not this app, so
// the relative path misses. `@workflow/next/loader` walks node_modules from
// the file being compiled.
const workflowLoader = "@workflow/next/loader";

function pointWorkflowLoaderAtPackage(config: NextConfig): NextConfig {
  const rules = config.turbopack?.rules;
  if (!rules) return config;

  for (const rule of Object.values(rules)) {
    if (!rule || typeof rule !== "object" || !("loaders" in rule) || !rule.loaders) {
      continue;
    }
    rule.loaders = rule.loaders.map((entry) => {
      if (typeof entry === "string") {
        return isWorkflowLoader(entry) ? workflowLoader : entry;
      }
      if (
        entry &&
        typeof entry.loader === "string" &&
        isWorkflowLoader(entry.loader)
      ) {
        return { ...entry, loader: workflowLoader };
      }
      return entry;
    });
  }
  return config;
}

function isWorkflowLoader(loader: string): boolean {
  return loader.split(path.sep).join("/").includes("@workflow/next/");
}

export default async function buildConfig(
  phase: string,
  ctx: { defaultConfig: NextConfig },
) {
  const built = await withWorkflow(nextConfig)(phase, ctx);
  return pointWorkflowLoaderAtPackage(built);
}
