import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const page = await readFile(new URL("../public/fr/index.html", import.meta.url), "utf8");
const creator = await readFile(new URL("../public/new/new.js", import.meta.url), "utf8");

test("the organizer can create another event from the receipt or masthead", async () => {
  const dom = new JSDOM(page, { url: "https://example.test/#create", runScripts: "outside-only" });
  const { window } = dom;
  try {
    window.HTMLElement.prototype.scrollIntoView = () => {};
    const titles = [];
    window.fetch = async (_, { body }) => {
      const title = body.get("title");
      titles.push(title);
      const base = `https://example.test/e/${titles.length}/`;
      return {
        ok: true,
        json: async () => ({
          title, deckMode: "none", eventId: String(titles.length), expiresAt: Date.now() + 86400000,
          audienceUrl: base, presenterUrl: base + "present/", setupUrl: base + "setup/", moderatorUrl: base + "moderate/",
        }),
      };
    };
    window.eval(creator);
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
  } finally {
    window.close();
  }
});
