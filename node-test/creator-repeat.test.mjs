import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const page = await readFile(new URL("../public/fr/index.html", import.meta.url), "utf8");

test("the organizer can create events repeatedly and confirm deletion from the receipt", async () => {
  const dom = new JSDOM(page, { url: "https://example.test/#create", runScripts: "outside-only" });
  const { window } = dom;
  const globals = { document: window.document, location: window.location, history: window.history, navigator: window.navigator, FormData: window.FormData };
  const previous = new Map([...Object.keys(globals), "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  try {
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function () { this.open = false; };
    window.HTMLElement.prototype.scrollIntoView = () => {};
    const titles = [];
    const deletions = [];
    let available = true;
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (url, { body, method, headers }) => {
      if (url === "/api/creation-settings") return Response.json({ siteKey: null });
      if (method === "DELETE") {
        deletions.push([url, headers.Authorization]);
        return { status: available ? 404 : 204 };
      }
      if (url.endsWith("/config")) return { status: 200 };
      const title = body.get("title");
      titles.push(title);
      const base = `https://example.test/e/${titles.length}/`;
      return {
        ok: true,
        json: async () => ({
          title, deckMode: "none", eventId: String(titles.length), expiresAt: Date.now() + 86400000,
          audienceUrl: base, presenterUrl: base + "present/", setupUrl: base + "setup/#access=admin-key", moderatorUrl: base + "moderate/",
        }),
      };
    } });
    await import("../public/new/new.js");
    const document = window.document;
    const form = document.querySelector("[data-create-form]");
    const receipt = document.querySelector("[data-receipt]");
    for (const [index, nextLink] of ["[data-create-another]", ".header-create"].entries()) {
      form.elements.title.value = `Rencontre ${index + 1}`;
      form.requestSubmit();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(receipt.hidden, false);
      document.querySelector(nextLink).click();
      assert.equal(receipt.hidden, true);
      assert.equal(form.elements.title.value, "");
      assert.equal(form.querySelector("[type=submit]").disabled, false);
    }
    assert.deepEqual(titles, ["Rencontre 1", "Rencontre 2"]);

    form.elements.title.value = "Rencontre 3";
    form.requestSubmit();
    await new Promise((resolve) => setImmediate(resolve));
    const dialog = document.querySelector("dialog");
    const trigger = document.querySelector("[data-open-delete]");
    trigger.click();
    assert.equal(dialog.open, true);
    assert.match(dialog.textContent, /Rencontre 3/);
    dialog.querySelector("[data-cancel-delete]").click();
    assert.equal(dialog.open, false);
    assert.deepEqual(deletions, []);
    trigger.click();
    dialog.querySelector("form").requestSubmit();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(dialog.open, true);
    assert.match(dialog.querySelector("[data-delete-message]").textContent, /lien privé/);

    available = false;
    dialog.querySelector("form").requestSubmit();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(dialog.open, false);
    assert.equal(receipt.hidden, true);
    assert.equal(document.querySelector("[data-deleted-event]").hidden, false);
    assert.equal(document.querySelector("[data-setup-link]").hasAttribute("href"), false);
    assert.deepEqual(deletions, Array(2).fill(["/api/events/3/admin/event", "Bearer admin-key"]));
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    window.close();
  }
});
