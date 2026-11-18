import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
// wrangler.jsonc 允許整行的 // 註解；只去掉這種行，不動字串裡的 URL。
const wranglerSource = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const wrangler = JSON.parse(wranglerSource.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n"));

test("keeps optional self-hosting deployable without adding setup steps to the hosted flow", () => {
  assert.match(readme, /https:\/\/github\.com\/mashbean\/call-in/);
  assert.match(readme, /https:\/\/call-in\.bordeauxjs\.com\/#create/);
  assert.match(readme, /\]\(\.\/SELFHOST\.md\)/);
  assert.equal(packageJson.scripts.deploy, "wrangler deploy");
  assert.equal(wrangler.assets.directory, "./public");
  assert.deepEqual(wrangler.assets.run_worker_first, [
    "/api/*",
    "/present/pdf-viewer",
    "/present/pdf-viewer.html",
    "/new",
    "/new/*",
    "/en/new",
    "/en/new/*",
  ]);
  // 正式網域只放在 env.production；預設環境不帶 routes，Deploy Button 的複製者才不會搶走 call-in.mashbean.net。
  assert.equal(wrangler.routes, undefined);
  assert.deepEqual(wrangler.env.production.routes, [{ pattern: "call-in.mashbean.net", custom_domain: true }]);
  assert.deepEqual(wrangler.durable_objects.bindings, [
    { name: "LIVE_SESSION", class_name: "LiveSession" },
  ]);
  assert.deepEqual(wrangler.migrations, [
    { tag: "v1", new_sqlite_classes: ["LiveSession"] },
  ]);
});
