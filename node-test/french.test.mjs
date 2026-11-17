import assert from "node:assert/strict";
import test from "node:test";
import { frenchDefaults } from "../public/fr.js";

test("French display translates old defaults without changing custom event content", () => {
  const original = {
    locale: "en",
    title: "My custom event",
    description: "My custom description",
    dashboardTitle: "My custom event · Live call-in",
    difficulty: { title: "How easy is this to follow?", labels: ["Too easy", "Easy", "Just right", "Hard", "Lost"] },
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
  assert.equal(translated.question.placeholder, "My custom prompt");
  assert.equal(translated.question.lenses[0].description, "A custom description");
  assert.equal(translated.question.title, "Posez vos questions");
  assert.equal(translated.difficulty.labels[4], "Je décroche");
  assert.deepEqual(translated.moderation.codeOfConduct.rules, ["A custom rule"]);
  assert.equal(original.locale, "en");
  assert.equal(original.question.title, "Ask anytime");
});
