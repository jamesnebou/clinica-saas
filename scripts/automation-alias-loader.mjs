import { pathToFileURL } from "node:url";
import path from "node:path";

const root = process.cwd();
const stub = pathToFileURL(path.join(root, "scripts", "server-only-stub.mjs")).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: stub, shortCircuit: true };
  const normalized = specifier.startsWith("@/")
    ? pathToFileURL(path.join(root, "src", specifier.slice(2))).href
    : specifier;

  try {
    return await nextResolve(normalized, context);
  } catch (error) {
    const canAppendExtension = error?.code === "ERR_MODULE_NOT_FOUND"
      && !path.extname(normalized)
      && (normalized.startsWith("file:") || normalized.startsWith("./") || normalized.startsWith("../"));
    if (!canAppendExtension) throw error;
    return nextResolve(`${normalized}.js`, context);
  }
}
