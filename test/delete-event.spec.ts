import { env, evictDurableObject, runInDurableObject, SELF } from "cloudflare:test";
import { expect, it } from "vitest";

const origin = "https://example.com";
const json = { "Content-Type": "application/json" };
const pdf = "%PDF-1.7\nTest de suppression";

async function createEvent(title: string, upload = false) {
  const form = new FormData();
  form.set("title", title);
  form.set("locale", "fr");
  if (upload) form.set("deckFile", new File([pdf], "slides.pdf", { type: "application/pdf" }));
  const response = await SELF.fetch(origin + "/api/events", { method: "POST", body: form });
  expect(response.status).toBe(201);
  return response.json<{ eventId: string; setupUrl: string; moderatorUrl: string }>();
}

function access(link: string) {
  return new URLSearchParams(new URL(link).hash.slice(1)).get("access");
}

it("lets only the event administrator remove its PDF, questions, votes and access", async () => {
  const event = await createEvent("Événement à supprimer", true);
  const other = await createEvent("Autre événement");
  const base = `${origin}/api/events/${event.eventId}`;
  const admin = { Authorization: `Bearer ${access(event.setupUrl)}` };
  const stub = env.LIVE_SESSION.getByName(`hosted:${event.eventId}`);
  const deletion = (headers?: HeadersInit) => SELF.fetch(base + "/admin/event", { method: "DELETE", headers });

  expect(await (await SELF.fetch(base + "/deck.pdf")).text()).toBe(pdf);
  const asked = await SELF.fetch(base + "/question", {
    method: "POST", headers: json,
    body: JSON.stringify({ text: "Cette question sera effacée ?", nickname: "Camille", voterId: crypto.randomUUID() }),
  });
  const { submission } = await asked.json<{ submission: { id: string } }>();
  await stub.moderateQuestion(submission.id, "restore", "other");
  await stub.upvote(submission.id, crypto.randomUUID(), true);

  for (const headers of [undefined,
    { Authorization: `Bearer ${access(event.moderatorUrl)}` },
    { Authorization: `Bearer ${access(other.setupUrl)}` },
    { Cookie: `call_in_moderator=${access(event.moderatorUrl)}` },
  ]) {
    expect((await deletion(headers)).status).toBe(404);
  }
  expect((await SELF.fetch(base + "/admin/event", { method: "GET", headers: admin })).status).toBe(405);
  expect((await SELF.fetch(origin + "/api/admin/event", { method: "DELETE", headers: admin })).status).toBe(404);
  expect((await SELF.fetch(origin + "/api/demo/fr/admin/event", { method: "DELETE", headers: admin })).status).toBe(404);

  const live = await SELF.fetch(base + "/live", { headers: { Upgrade: "websocket" } });
  const socket = live.webSocket;
  if (!socket) throw new Error("websocket unavailable");
  socket.accept();
  const close = new Promise<number>((resolve) => socket.addEventListener("close", (event) => resolve(event.code), { once: true }));
  const removed = await deletion(admin);
  expect(removed.status).toBe(204);
  expect(await close).toBe(4004);
  expect(removed.headers.get("cache-control")).toBe("no-store");
  expect((await deletion(admin)).status).toBe(404);

  for (const suffix of ["/config", "/state", "/deck.pdf", "/qr.svg", "/admin/config", "/moderator/state"]) {
    expect((await SELF.fetch(base + suffix, { headers: admin })).status).toBe(404);
  }
  for (const suffix of ["/", "/dashboard/", "/present/", "/setup/", "/moderate/"]) {
    expect((await SELF.fetch(`${origin}/e/${event.eventId}${suffix}`)).status).toBe(404);
  }
  expect((await SELF.fetch(`${origin}/api/events/${other.eventId}/config`)).status).toBe(200);

  await evictDurableObject(stub);
  await runInDurableObject(stub, async (instance, state) => {
    await expect(instance.ask("Une requête déjà en transit", "Camille", null, crypto.randomUUID())).rejects.toThrow("event not found");
    expect(await state.storage.getAlarm()).toBeNull();
    for (const table of ["hosted_event", "event_config", "hosted_deck", "hosted_deck_chunks", "questions", "question_votes", "participants", "moderation_actions"]) {
      expect(state.storage.sql.exec(`SELECT COUNT(*) AS count FROM ${table}`).one().count).toBe(0);
    }
  });
});
