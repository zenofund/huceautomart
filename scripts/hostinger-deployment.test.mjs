import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, lstat, mkdtemp, readFile, readlink, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("Hostinger production package works without the source workspace", { timeout: 300000 }, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "huce-hostinger-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(root, "dist");
  const links = [];
  // Rebase Windows junctions as well as relative Linux symlinks into the copy.
  await cp(source, directory, {
    recursive: true,
    filter: async (file, destination) => {
      if (!(await lstat(file)).isSymbolicLink()) return true;
      const target = path.resolve(path.dirname(file), await readlink(file));
      const relative = path.relative(source, target);
      assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative), `External dependency link: ${file}`);
      links.push([path.join(directory, relative), destination]);
      return false;
    },
  });
  for (const [target, destination] of links) {
    await symlink(process.platform === "win32" ? target : path.relative(path.dirname(destination), target), destination, "junction");
  }
  const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  assert.equal(manifest.main, "dist/index.mjs");
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
    JWT_SECRET: "deployment-test-only-not-a-production-secret",
    ALLOWED_ORIGIN: "https://huceautomart.com",
  };

  function launch(overrides) {
    const childEnv = { ...env, ...overrides };
    for (const [key, value] of Object.entries(childEnv)) {
      if (value === undefined) delete childEnv[key];
    }
    const child = spawn(process.execPath, [manifest.main], { cwd: directory, env: childEnv });
    let output = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    const exited = once(child, "exit");
    const timer = setTimeout(() => child.kill(), 20000);
    child.on("exit", () => clearTimeout(timer));
    const ready = new Promise((resolve, reject) => {
      child.stdout.on("data", () => { if (output.includes("Server listening")) resolve(); });
      child.on("error", reject);
      child.on("exit", () => reject(new Error(`Server exited before listening: ${output}`)));
    });
    ready.catch(() => {});
    return { child, exited, ready, output: () => output };
  }

  await t.test("serves health, CORS and API 404 on the supplied port", async () => {
    const port = await freePort();
    const server = launch({ PORT: String(port) });
    try {
      await server.ready;
      const health = await fetch(`http://127.0.0.1:${port}/api/healthz`, {
        headers: { Origin: env.ALLOWED_ORIGIN },
      });
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: "ok" });
      assert.equal(health.headers.get("access-control-allow-origin"), env.ALLOWED_ORIGIN);
      assert.equal(health.headers.get("access-control-allow-credentials"), "true");
      assert.equal((await fetch(`http://127.0.0.1:${port}/api/not-a-route`)).status, 404);
      const protectedRoute = await fetch(`http://127.0.0.1:${port}/api/auth/me`);
      assert.equal(protectedRoute.status, 401);
    } finally {
      server.child.kill();
      await server.exited;
    }
  });

  await t.test("starts on port 3000 when PORT is absent", async () => {
    const server = launch({});
    try {
      await server.ready;
      assert.match(server.output(), /"port":3000/);
    } finally {
      server.child.kill();
      await server.exited;
    }
  });

  for (const port of ["invalid", "0", "1.5", "65536"]) {
    await t.test(`rejects invalid PORT ${port}`, async () => {
      const server = launch({ PORT: port });
      const [code] = await server.exited;
      assert.equal(code, 1);
      assert.match(server.output(), /Invalid PORT value/);
    });
  }

  await t.test("reports missing database configuration", async () => {
    const server = launch({ PORT: "3000", DATABASE_URL: undefined });
    const [code] = await server.exited;
    assert.equal(code, 1);
    assert.match(server.output(), /DATABASE_URL must be set/);
  });
});
