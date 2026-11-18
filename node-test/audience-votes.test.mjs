import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const waitFor = async (condition) => {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Timed out waiting for the participant interface");
};

test("participant navigation, confirmed votes, failures and pending questions", async () => {
  const html = await readFile(new URL("../public/audience/index.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "https://example.test/e/0123456789abcdef0123456789abcdef/", pretendToBeVisual: true });
  const wideLayout = new dom.window.EventTarget();
  wideLayout.matches = false;
  dom.window.matchMedia = () => wideLayout;
  const previous = new Map();
  for (const key of ["window", "document", "location", "history", "localStorage", "navigator", "fetch", "WebSocket"]) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  const install = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  for (const key of ["window", "document", "location", "history", "localStorage", "navigator"]) install(key, dom.window[key]);

  const publicQuestion = { id: "question-1", text: "<img src=x onerror=alert(1)>", nickname: "<b>Lou</b>", upvotes: 0 };
  const server = { votes: new Set(), own: [], calls: 0, failVote: false, pendingVote: null, failMe: false };
  const snapshot = () => ({ questions: [{ ...publicQuestion, upvotes: server.votes.has(publicQuestion.id) ? 1 : 0 }] });
  const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => structuredClone(body) });
  let socket;
  class FakeSocket {
    handlers = {};
    constructor() { socket = this; }
    addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
    emit(type, value = {}) { for (const handler of this.handlers[type] || []) handler(value); }
    close() { this.emit("close"); }
  }
  install("WebSocket", FakeSocket);
  install("fetch", async (url, options = {}) => {
    const path = new URL(url, location.origin).pathname.split("/").pop();
    if (path === "config") return response({ title: "BordeauxJS", eventId: "meetup" });
    if (path === "state") return response(snapshot());
    if (path === "me") {
      if (server.failMe) return response({ error: "offline" }, 503);
      return response({ participant: server.own.length ? { alias: "Camille" } : null, questions: server.own, upvotedQuestionIds: [...server.votes] });
    }
    if (path === "upvote") {
      server.calls += 1;
      if (server.pendingVote) await server.pendingVote;
      if (server.failVote) return response({ error: "offline" }, 503);
      const body = JSON.parse(options.body);
      if (body.supported) server.votes.add(body.questionId);
      else server.votes.delete(body.questionId);
      socket.emit("message", { data: JSON.stringify({ type: "snapshot", data: snapshot() }) });
      return response(snapshot());
    }
    if (path === "question") {
      const submitted = { id: "pending-1", nickname: "Camille", visibility: "pending" };
      server.own.push(submitted);
      return response({ submission: submitted, snapshot: snapshot() });
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  try {
    await import(`../public/app.js?audience-test=${Date.now()}`);
    socket.emit("open");
    const doc = dom.window.document;
    const formView = doc.querySelector("[data-form-view]");
    const listView = doc.querySelector("[data-list-view]");
    const findVote = () => doc.querySelector("button[data-question-id]");
    await waitFor(() => findVote()?.getAttribute("aria-disabled") === "false");
    assert.equal(formView.hidden, false);
    assert.equal(listView.hidden, true);
    doc.querySelector("[data-show-list]").click();
    assert.equal(listView.hidden, false);
    assert.equal(formView.hidden, true);
    assert.equal(location.hash, "#questions");
    assert.equal(doc.querySelector("[data-show-list]").getAttribute("aria-current"), "true");
    doc.querySelector("#question").value = "Mon brouillon";
    wideLayout.matches = true;
    wideLayout.dispatchEvent(new dom.window.Event("change"));
    assert.equal(listView.hidden, false);
    assert.equal(formView.hidden, false);
    assert.equal(doc.querySelector("#question").value, "Mon brouillon");
    wideLayout.matches = false;
    wideLayout.dispatchEvent(new dom.window.Event("change"));
    assert.equal(listView.hidden, false);
    assert.equal(formView.hidden, true);
    assert.equal(doc.querySelector(".question-card p").textContent, publicQuestion.text);
    assert.equal(doc.querySelector(".question-card img"), null);
    assert.equal(doc.querySelector(".question-meta small").textContent, publicQuestion.nickname);

    let release;
    server.pendingVote = new Promise((resolve) => { release = resolve; });
    findVote().click();
    await waitFor(() => server.calls === 1);
    findVote().click();
    assert.equal(server.calls, 1);
    assert.equal(findVote().getAttribute("aria-pressed"), "false");
    release();
    server.pendingVote = null;
    await waitFor(() => findVote().getAttribute("aria-pressed") === "true" && findVote().getAttribute("aria-disabled") === "false");
    assert.match(findVote().textContent, /Soutenu · 1/);

    findVote().click();
    await waitFor(() => server.calls === 2 && findVote().getAttribute("aria-pressed") === "false" && findVote().getAttribute("aria-disabled") === "false");
    server.failVote = true;
    findVote().click();
    await waitFor(() => doc.querySelector("[data-message]").textContent.includes("n’a pas pu être confirmé"));
    await waitFor(() => findVote().getAttribute("aria-disabled") === "false");
    assert.equal(findVote().getAttribute("aria-pressed"), "false");

    // A vote in another tab is reconciled from /me, not guessed from the public count.
    server.votes.add(publicQuestion.id);
    dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: "meetup:live-deck-voter:updated" }));
    await waitFor(() => findVote().getAttribute("aria-pressed") === "true" && findVote().getAttribute("aria-disabled") === "false");
    assert.match(findVote().textContent, /Soutenu · 1/);

    server.failMe = true;
    dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: "meetup:live-deck-voter:updated" }));
    await waitFor(() => !doc.querySelector("[data-retry]").hidden);
    assert.equal(findVote().getAttribute("aria-disabled"), "true");
    server.failMe = false;
    doc.querySelector("[data-retry]").click();
    await waitFor(() => doc.querySelector("[data-retry]").hidden && findVote().getAttribute("aria-disabled") === "false");

    server.own.push({ id: publicQuestion.id });
    dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: "meetup:live-deck-voter:updated" }));
    await waitFor(() => findVote().textContent.startsWith("Votre question"));
    assert.equal(findVote().getAttribute("aria-disabled"), "true");
    findVote().click();
    assert.equal(server.calls, 3);
    server.own.pop();

    // Returning to the foreground and reconnecting both re-read the authoritative state.
    server.votes.delete(publicQuestion.id);
    doc.dispatchEvent(new dom.window.Event("visibilitychange"));
    await waitFor(() => findVote().getAttribute("aria-pressed") === "false" && findVote().getAttribute("aria-disabled") === "false");
    server.votes.add(publicQuestion.id);
    const previousSocket = socket;
    socket.close();
    await waitFor(() => socket !== previousSocket);
    socket.emit("open");
    await waitFor(() => findVote().getAttribute("aria-pressed") === "true" && findVote().getAttribute("aria-disabled") === "false");

    doc.querySelector("[data-show-form]").click();
    doc.querySelector("#nickname").value = "Camille";
    doc.querySelector("#question").value = "Ma question en attente";
    doc.querySelector("#question-form").requestSubmit();
    await waitFor(() => !listView.hidden && doc.querySelector("[data-message]").textContent.includes("une fois publiée"));
    assert.equal(doc.querySelector("[data-questions]").textContent.includes("Ma question en attente"), false);
    dom.window.history.back();
    await waitFor(() => !formView.hidden);
    dom.window.history.forward();
    await waitFor(() => !listView.hidden);
  } finally {
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
