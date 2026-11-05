import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of ["manifest.json", "popup.html", "popup.css", "review.html", "review.css", "background.js"]) {
  await cp(path.join(root, file), path.join(dist, file));
}

try {
  await cp(path.join(root, "icons"), path.join(dist, "icons"), { recursive: true });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

for (const [entry, output] of [
  ["src/popup.js", "popup.js"],
  ["src/review.js", "review.js"],
  ["content.js", "content.js"]
]) {
  await build({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    format: "iife",
    target: "chrome120",
    outfile: path.join(dist, output)
  });
}

const engineDir = path.join(root, "vendor", "stockfish");
try {
  await cp(engineDir, path.join(dist, "vendor", "stockfish"), { recursive: true });
  // The Stockfish worker resolves its WebAssembly payload as stockfish.wasm
  // when loaded directly by a Chrome extension worker.
  await cp(
    path.join(engineDir, "stockfish-19-lite-single.wasm"),
    path.join(dist, "vendor", "stockfish", "stockfish.wasm")
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  console.warn("Stockfish is not installed yet. Run `npm run setup:engine` to enable engine reviews.");
}

const noticePath = path.join(root, "THIRD_PARTY_NOTICES.md");
try {
  await cp(noticePath, path.join(dist, "THIRD_PARTY_NOTICES.md"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const manifest = JSON.parse(await readFile(path.join(dist, "manifest.json"), "utf8"));
if (!manifest.content_scripts?.length) throw new Error("The Chess.com observer is missing from the extension manifest.");
console.log(`Built extension at ${dist}`);
