import { copyFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmSrc = join(__dirname, "..", "wasm", "sql-wasm.wasm");

// Walk up to find the consuming project root (has package.json but isn't supahub)
let dir = resolve(__dirname, "..", "..");
while (dir !== "/") {
  const pkg = join(dir, "package.json");
  if (existsSync(pkg)) {
    // Try static/ (SvelteKit) then public/ (Vite/React)
    for (const staticDir of ["static", "public"]) {
      const target = join(dir, staticDir);
      if (existsSync(target)) {
        const dest = join(target, "sql-wasm.wasm");
        if (!existsSync(dest)) {
          copyFileSync(wasmSrc, dest);
          console.log(`supahub: copied sql-wasm.wasm to ${staticDir}/`);
        }
        process.exit(0);
      }
    }
    break;
  }
  dir = dirname(dir);
}
