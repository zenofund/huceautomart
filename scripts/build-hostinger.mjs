import { spawnSync } from "node:child_process";
import { access, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const expectedPnpm = manifest.packageManager.split("@")[1];

function pnpm(args) {
  // npm_execpath avoids resolving a different globally installed pnpm.
  const cli = process.env.npm_execpath;
  const useNode = cli && /pnpm\.(c?js|mjs)$/.test(cli);
  const result = spawnSync(useNode ? process.execPath : "pnpm", useNode ? [cli, ...args] : args, {
    cwd: root,
    stdio: "inherit",
    shell: !useNode && process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (Number(process.versions.node.split(".")[0]) !== 22) {
  throw new Error("Build the Hostinger API with Node.js 22.x.");
}

process.stdout.write(`Building API deployment with ${manifest.packageManager} (Node ${process.versions.node}).\n`);
pnpm(["--version"]);
const build = spawnSync(process.execPath, ["artifacts/api-server/build.mjs"], {
  cwd: root,
  stdio: "inherit",
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

// The API bundle externalizes packages such as Google Cloud Storage and nodemailer.
// Include production node_modules instead of deploying the bundle alone.
await rm(path.join(root, "dist"), { recursive: true, force: true });
pnpm(["--filter", "@workspace/api-server", "deploy", "--prod", "dist"]);
await access(path.join(root, "dist/dist/index.mjs"));
await access(path.join(root, "dist/node_modules/@google-cloud/storage/package.json"));
await access(path.join(root, "dist/node_modules/nodemailer/package.json"));
process.stdout.write(`Hostinger output: dist; entry inside output: dist/index.mjs. Use pnpm ${expectedPnpm} for installation.\n`);
