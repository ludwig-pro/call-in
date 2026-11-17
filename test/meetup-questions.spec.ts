import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const headers = { "Content-Type": "application/json" };

async function createEvent() {
  const response = await SELF.fetch("https://example.com/api/events", {
    method: "POST", headers,
    body: JSON.stringify({ title: "Meetup", deckUrl: "https://example.com/slides", locale: "fr" }),
  });
  expect(response.status).toBe(201);
  const event = await response.json<{ eventId: string; moderatorUrl: string }>();
  const stub = env.LIVE_SESSION.getByName(`hosted:${event.eventId}`);
  const config = await stub.eventConfig();
  if (!config.moderation) throw new Error("moderation missing");
  config.moderation.presentationDelaySeconds = 0;
  config.moderation.questionCooldownSeconds = 0;
  await stub.updateEventConfig(config);
  return {
    stub,
    api: `https://example.com/api/events/${event.eventId}`,
    token: new URLSearchParams(new URL(event.moderatorUrl).hash.slice(1)).get("access"),
  };
}

async function question(api: string, body: Record<string, unknown>) {
  return SELF.fetch(`${api}/question`, { method: "POST", headers, body: JSON.stringify(body) });
}

describe("meetup questions", () => {
  it("rejects a selected empty PDF rather than creating an event without a deck", async () => {
    const form = new FormData();
    form.set("title", "PDF vide");
    form.set("deckFile", new File([], "slides.pdf", { type: "application/pdf" }));
    const response = await SELF.fetch("https://example.com/api/events", { method: "POST", body: form });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "File is not a valid PDF" });
  });

  it("creates an event with only a title and keeps its private setup and moderator links", async () => {
    const createdResponse = await SELF.fetch("https://example.com/api/events", {
      method: "POST", headers, body: JSON.stringify({ title: "Soirée BordeauxJS", locale: "fr" }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json<{ eventId: string; deckMode: string; audienceUrl: string; presenterUrl: string; setupUrl: string; moderatorUrl: string }>();
    expect(created.deckMode).toBe("none");
    expect((await SELF.fetch(created.audienceUrl)).status).toBe(200);
    expect((await SELF.fetch(created.presenterUrl)).status).toBe(200);
    const api = `https://example.com/api/events/${created.eventId}`;
    const setupToken = new URLSearchParams(new URL(created.setupUrl).hash.slice(1)).get("access");
    const moderatorToken = new URLSearchParams(new URL(created.moderatorUrl).hash.slice(1)).get("access");
    const access = { Authorization: `Bearer ${setupToken}` };
    const setup = await SELF.fetch(`${api}/admin/config`, { headers: access });
    const { config } = await setup.json<{ config: { deckUrl: string } }>();
    expect(config.deckUrl).toBe("");
    expect((await SELF.fetch(`${api}/admin/config`, { method: "POST", headers: { ...headers, ...access }, body: JSON.stringify(config) })).status).toBe(200);
    expect((await SELF.fetch(`${api}/moderator/state`, { headers: { Authorization: `Bearer ${moderatorToken}` } })).status).toBe(200);
    expect((await SELF.fetch(`${api}/deck.pdf`)).status).toBe(404);
  });

  it("accepts a direct question, preserves explicit difficulty votes and stores no fabricated consent or context", async () => {
    const { stub, api } = await createEvent();
    const voterId = crypto.randomUUID();
    await stub.setDifficulty(4, voterId);
    const result = await question(api, { text: "Une première question ?", nickname: "Camille", voterId });
    expect(result.status).toBe(200);
    const first = await result.json<{ submission: { id: string; nickname: string; lens: null; difficulty: null } }>();
    expect(first.submission).toMatchObject({ nickname: "Camille", lens: null, difficulty: null });
    const saved = await runInDurableObject(stub, (_instance, state) => ({
      participant: state.storage.sql.exec("SELECT alias, public_label, coc_version, coc_accepted_at FROM participants WHERE voter_id = ?", voterId).one(),
      votes: state.storage.sql.exec("SELECT voter_id, score FROM difficulty_votes").toArray(),
    }));
    expect(saved.participant).toEqual({ alias: "Camille", public_label: "Camille", coc_version: null, coc_accepted_at: null });
    expect(saved.votes).toEqual([{ voter_id: voterId, score: 4 }]);

    const legacy = await question(api, { text: "Une question avec contexte", nickname: "Autre pseudo", lens: "bridge", difficulty: 2, voterId });
    expect(legacy.status).toBe(200);
    expect((await legacy.json<{ submission: unknown }>()).submission).toMatchObject({ nickname: "Camille", lens: "bridge", difficulty: 2 });
    expect((await stub.snapshot()).difficulty).toMatchObject({ total: 1, counts: [0, 0, 0, 1, 0] });
    for (const context of [{ lens: "bridge" }, { difficulty: 2 }, { lens: null, difficulty: 2 }]) {
      expect((await question(api, { text: "Question partielle", nickname: "Camille", voterId, ...context })).status).toBe(400);
    }
    const empty = await question(api, { text: "Question sans pseudo", nickname: "", voterId: crypto.randomUUID() });
    expect(empty.status).toBe(400);
    const short = await question(api, { text: "Question avec pseudo court", nickname: "L", voterId: crypto.randomUUID() });
    expect(short.status).toBe(200);
    expect((await short.json<{ submission: { nickname: string } }>()).submission.nickname).toBe("L");
    const legacyWithoutVote = await question(api, { text: "Autre question historique", nickname: "S", lens: "keeper", difficulty: 5, voterId: crypto.randomUUID() });
    expect(legacyWithoutVote.status).toBe(200);
    expect((await stub.snapshot()).difficulty).toMatchObject({ total: 1, counts: [0, 0, 0, 1, 0] });
  });

  it("enforces pauses and existing mute or review restrictions even if the submitted nickname changes", async () => {
    const { stub, api } = await createEvent();
    const voterId = crypto.randomUUID();
    expect((await question(api, { text: "Première question", nickname: "Lou", voterId })).status).toBe(200);
    await stub.moderateParticipant(voterId, "mute", "other");
    expect((await question(api, { text: "Autre question", nickname: "Nouveau pseudo", voterId })).status).toBe(429);
    await stub.moderateParticipant(voterId, "review", "other");
    const review = await question(api, { text: "Question à vérifier", nickname: "Nouveau pseudo", voterId });
    expect(review.status).toBe(200);
    expect((await review.json<{ submission: unknown }>()).submission).toMatchObject({ visibility: "pending", nickname: "Lou" });
    await stub.setSessionMode("paused");
    expect((await question(api, { text: "Question pendant la pause", nickname: "Lou", voterId })).status).toBe(400);
    await stub.setSessionMode("approval");
    const pending = await question(api, { text: "Question en attente", nickname: "Alix", voterId: crypto.randomUUID() });
    expect(pending.status).toBe(200);
    expect((await pending.json<{ submission: { visibility: string } }>()).submission.visibility).toBe("pending");
  });

  it("returns only the current device's public upvotes before it has a participant profile", async () => {
    const { stub, api } = await createEvent();
    const author = crypto.randomUUID();
    const fan = crypto.randomUUID();
    const stranger = crypto.randomUUID();
    const send = (path: string, body: object) => SELF.fetch(`${api}${path}`, {
      method: "POST", headers, body: JSON.stringify(body),
    });
    const getMe = async (voterId: string) => (await send("/me", { voterId }))
      .json<{ participant: unknown; questions: unknown[]; upvotedQuestionIds: string[] }>();
    const created = await question(api, { text: "Question publique", nickname: "Lou", voterId: author });
    const { submission } = await created.json<{ submission: { id: string } }>();

    expect(await getMe(fan)).toEqual({ participant: null, questions: [], upvotedQuestionIds: [] });
    expect((await send("/upvote", { questionId: submission.id, voterId: author })).status).toBe(400);
    expect((await send("/upvote", { questionId: submission.id, voterId: fan })).status).toBe(200);
    expect((await getMe(fan))).toEqual({ participant: null, questions: [], upvotedQuestionIds: [submission.id] });
    expect((await getMe(stranger)).upvotedQuestionIds).toEqual([]);

    // Two tabs may ask for the same state at once, even without browser locks.
    const simultaneous = await Promise.all([1, 2].map(() => send("/upvote", {
      questionId: submission.id, voterId: stranger, supported: true,
    })));
    expect(simultaneous.every((response) => response.status === 200)).toBe(true);
    expect((await getMe(stranger)).upvotedQuestionIds).toEqual([submission.id]);
    expect((await stub.snapshot()).questions[0]?.upvotes).toBe(2);
    await Promise.all([1, 2].map(() => send("/upvote", {
      questionId: submission.id, voterId: stranger, supported: false,
    })));
    expect((await getMe(stranger)).upvotedQuestionIds).toEqual([]);
    expect((await stub.snapshot()).questions[0]?.upvotes).toBe(1);
    expect((await send("/upvote", { questionId: submission.id, voterId: fan, supported: "yes" })).status).toBe(400);

    await stub.moderateQuestion(submission.id, "hide", "other");
    expect((await getMe(fan)).upvotedQuestionIds).toEqual([]);
    expect((await stub.snapshot()).questions).toEqual([]);
    expect((await send("/upvote", { questionId: submission.id, voterId: fan })).status).toBe(400);
    await stub.moderateQuestion(submission.id, "restore", "other");
    expect((await getMe(fan)).upvotedQuestionIds).toEqual([submission.id]);
    expect((await send("/upvote", { questionId: submission.id, voterId: fan })).status).toBe(200);
    expect((await getMe(fan)).upvotedQuestionIds).toEqual([]);

    await stub.setSessionMode("approval");
    const pendingResponse = await question(api, { text: "Question privée", nickname: "Alix", voterId: stranger });
    const pending = await pendingResponse.json<{ submission: { id: string; visibility: string } }>();
    expect(pending.submission.visibility).toBe("pending");
    expect((await send("/upvote", { questionId: pending.submission.id, voterId: fan })).status).toBe(400);
    expect(JSON.stringify(await stub.snapshot())).not.toContain("Question privée");
  });

  it("notifies listeners of pending activity without exposing the pending question on the public socket", async () => {
    const { stub, api, token } = await createEvent();
    await stub.setSessionMode("approval");
    const upgraded = await SELF.fetch(`${api}/live`, { headers: { Upgrade: "websocket" } });
    const socket = upgraded.webSocket;
    expect(socket).toBeTruthy();
    if (!socket) throw new Error("websocket unavailable");
    socket.accept();
    const initial = nextMessage(socket);
    await initial;
    const voterId = crypto.randomUUID();
    const next = nextMessage(socket);
    const response = await question(api, { text: "Texte en attente secret", nickname: "Morgan", voterId });
    expect(response.status).toBe(200);
    const message = await next;
    expect(message.type).toBe("snapshot");
    expect(JSON.stringify(message)).not.toContain("Texte en attente secret");
    const nextRaw = new Promise<string>((resolve) => socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true }));
    socket.send(JSON.stringify({ type: "identify", voterId }));
    socket.send("ping");
    expect(await nextRaw).toBe("pong");
    const unauthorized = await SELF.fetch(`${api}/moderator/state`);
    expect(unauthorized.status).toBe(404);
    const moderator = await SELF.fetch(`${api}/moderator/state`, { headers: { Authorization: `Bearer ${token}` } });
    const state = await moderator.json<{ questions: Array<{ text: string; nickname: string; visibility: string }> }>();
    expect(state.questions).toContainEqual(expect.objectContaining({ text: "Texte en attente secret", nickname: "Morgan", visibility: "pending" }));
    socket.close();
  });
});

function nextMessage(socket: WebSocket): Promise<{ type: string }> {
  return new Promise((resolve) => socket.addEventListener("message", (event) => resolve(JSON.parse(String(event.data))), { once: true }));
}
