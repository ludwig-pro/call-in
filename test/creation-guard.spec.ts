import { env, SELF } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { readBoundedFormData } from "../src/validation";
import { creationGuard } from "../src/creation-guard";

afterEach(() => vi.unstubAllGlobals());

function request(headers: Record<string, string> = {}) {
  return new Request("https://call-in.example/api/events", {
    method: "POST", headers: { "CF-Connecting-IP": "192.0.2.100", ...headers },
  });
}

function guardedEnv() {
  return { ...env, CREATE_ATTEMPTS: { limit: async () => ({ success: true }) },
    TURNSTILE_SITE_KEY: "public-key", TURNSTILE_SECRET_KEY: "private-key" };
}

it("applies a per-client budget before processing an event body", async () => {
  const send = (ip: string) => SELF.fetch("https://call-in.example/api/events", {
    method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip }, body: "{}",
  });
  for (let i = 0; i < 4; i++) expect((await send("192.0.2.71")).status).toBe(400);
  const denied = await send("192.0.2.71");
  expect(denied.status).toBe(429);
  expect(denied.headers.get("Retry-After")).toBe("60");
  expect((await send("192.0.2.72")).status).toBe(400);
});

it("denies cross-origin creation, incomplete widget configuration and missing proof", async () => {
  const settings = guardedEnv();
  expect((await creationGuard(request({ Origin: "null" }), settings))?.status).toBe(403);
  expect((await creationGuard(request(), { ...settings, TURNSTILE_REQUIRED: "true", TURNSTILE_SITE_KEY: "", TURNSTILE_SECRET_KEY: "" }))?.status).toBe(503);
  expect((await creationGuard(request(), { ...settings, TURNSTILE_SECRET_KEY: "" }))?.status).toBe(503);
  expect((await creationGuard(request(), settings))?.status).toBe(403);
});

it("accepts only verification for this host and creation action, and fails closed on outage", async () => {
  const verify = vi.fn();
  vi.stubGlobal("fetch", verify);
  const input = request({ "X-Turnstile-Token": "test-proof" });
  const settings = guardedEnv();
  for (const result of [{ success: false }, { success: true, hostname: "other.example", action: "create_event" },
    { success: true, hostname: "call-in.example", action: "other" }]) {
    verify.mockResolvedValueOnce(Response.json(result));
    expect((await creationGuard(input, settings))?.status).toBe(403);
  }
  verify.mockResolvedValueOnce(Response.json({ success: true, hostname: "call-in.example", action: "create_event" }));
  expect(await creationGuard(input, settings)).toBeNull();
  verify.mockRejectedValueOnce(new Error("unavailable"));
  expect((await creationGuard(input, settings))?.status).toBe(503);
});

it("enforces the multipart byte limit while reading a body without Content-Length", async () => {
  const form = new FormData();
  form.set("title", "BordeauxJS");
  const upload = new Request("https://call-in.example/api/events", { method: "POST", body: form });
  const streamed = new Request(upload.url, { method: "POST", body: upload.body, headers: {
    "Content-Type": upload.headers.get("Content-Type")!,
  } });
  expect(streamed.headers.get("Content-Length")).toBeNull();
  await expect(readBoundedFormData(streamed, 8)).rejects.toThrow("request too large");
});
