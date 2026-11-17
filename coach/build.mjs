// Empaqueta la función para Neon Functions (un único index.mjs dentro de un zip).
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  minify: true,
  outfile: "dist/index.mjs",
  banner: {
    js: "import{createRequire as ___cr}from'module';import{fileURLToPath as ___f}from'url';import{dirname as ___d}from'path';const require=___cr(import.meta.url);const __filename=___f(import.meta.url);const __dirname=___d(__filename);",
  },
});
execFileSync("zip", ["-j", "-q", "dist/function.zip", "dist/index.mjs"]);
console.log("dist/function.zip listo");
