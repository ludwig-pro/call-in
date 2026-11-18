import assert from "node:assert/strict";
import test from "node:test";
import { frenchDefaults } from "../public/fr.js";

test("French display translates old defaults without changing custom event content", () => {
  const original = {
    locale: "en",
    title: "My custom event",
    description: "My custom description",
    dashboardTitle: "My custom event · Live call-in",
    question: {
      title: "Ask anytime", placeholder: "My custom prompt",
      lenses: [{ id: "clarify", label: "Clarify", description: "A custom description" }],
    },
    reactions: [{ id: "applause", label: "Well said" }],
    moderation: { codeOfConduct: { title: "Keep the conversation useful", summary: "A custom rule summary", rules: ["A custom rule"] } },
  };
  const translated = frenchDefaults(original);
  assert.equal(translated.locale, "fr");
  assert.equal(translated.title, "My custom event");
  assert.equal(translated.description, "My custom description");
  assert.equal(translated.dashboardTitle, "My custom event · Questions en direct");
  assert.equal(translated.question.placeholder, "My custom prompt");
  assert.equal(translated.question.lenses[0].description, "A custom description");
  assert.equal(translated.question.title, "Posez vos questions");
  assert.deepEqual(translated.moderation.codeOfConduct.rules, ["A custom rule"]);
  assert.equal(original.locale, "en");
  assert.equal(original.question.title, "Ask anytime");
  const oldFrench = { ...original, dashboardTitle: "My custom event · Réactions en direct" };
  assert.equal(frenchDefaults(oldFrench).dashboardTitle, "My custom event · Questions en direct");
  const customTitle = { ...original, dashboardTitle: "My custom dashboard" };
  assert.equal(frenchDefaults(customTitle).dashboardTitle, "My custom dashboard");
});
