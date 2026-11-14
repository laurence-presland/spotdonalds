import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export type PromptManifest = {
  version: string;
  blocks: string[];
};

export type BuiltPrompt = {
  version: string;
  template: string;
  text: string;
  hash: string;
};

const PLACEHOLDER = /\{\{([a-z0-9_.]+)\}\}/gi;

export function buildPrompt(manifestName: string, inputs: Record<string, string> = {}): BuiltPrompt {
  const manifest = readManifest(manifestName);
  const parts = manifest.blocks.map((block) => readBlock(block));
  const template = parts.join("\n\n");
  const used = new Set<string>();
  const text = template.replace(PLACEHOLDER, (_match, key: string) => {
    if (!(key in inputs)) throw new Error(`Unfilled prompt placeholder: ${key}`);
    used.add(key);
    return inputs[key] ?? "";
  });
  const unused = Object.keys(inputs).filter((key) => !used.has(key));
  if (unused.length > 0) throw new Error(`Unused prompt input: ${unused.join(", ")}`);
  return {
    version: manifest.version,
    template,
    text,
    hash: createHash("sha256").update(template).digest("hex"),
  };
}

function readManifest(name: string): PromptManifest {
  const file = path.join(process.cwd(), "prompts", name.endsWith(".json") ? name : `${name}.json`);
  const manifest = JSON.parse(readFileSync(file, "utf8")) as PromptManifest;
  if (!manifest.version || !Array.isArray(manifest.blocks)) throw new Error(`Invalid prompt manifest: ${name}`);
  return manifest;
}

function readBlock(name: string): string {
  const file = path.join(process.cwd(), "prompts", "blocks", `${name}.txt`);
  try {
    return readFileSync(file, "utf8").trimEnd();
  } catch {
    throw new Error(`Unknown prompt block: ${name}`);
  }
}
