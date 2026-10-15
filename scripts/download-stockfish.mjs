import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "vendor", "stockfish");
const release = "https://github.com/nmrugg/stockfish.js/releases/download/v19.0.0";
const files = [
  ["stockfish-19-lite-single.js", `${release}/stockfish-19-lite-single.js`],
  ["stockfish-19-lite-single.wasm", `${release}/stockfish-19-lite-single.wasm`],
  ["Copying.txt", "https://raw.githubusercontent.com/nmrugg/stockfish.js/master/Copying.txt"]
];

await mkdir(target, { recursive: true });
for (const [name, url] of files) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${name} (${response.status} ${response.statusText})`);
  await writeFile(path.join(target, name), new Uint8Array(await response.arrayBuffer()));
  console.log(`Downloaded ${name}`);
}
