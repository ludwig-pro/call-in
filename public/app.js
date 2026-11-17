import { eventApi, eventContext } from "./event-context.js";

const form = document.querySelector("#question-form");
const nickname = document.querySelector("#nickname");
const question = document.querySelector("#question");
const submitButton = form.querySelector("button[type=submit]");
const message = document.querySelector("[data-message]");
const formView = document.querySelector("[data-form-view]");
const listView = document.querySelector("[data-list-view]");
const questionsRoot = document.querySelector("[data-questions]");
const listError = document.querySelector("[data-list-error]");
const retryButton = document.querySelector("[data-retry]");
const connection = document.querySelector("[data-connection]");

const state = {
  view: location.hash === "#questions" ? "list" : "form",
  voterId: null,
  voterKey: "",
  snapshot: null,
  personal: null,
  personalError: false,
  snapshotError: false,
  configReady: false,
  notice: "",
  noticeIsError: false,
  connected: false,
  socket: null,
  reconnectTimer: null,
  snapshotVersion: 0,
  personalRequest: 0,
  operations: { submit: false, votes: new Set(), personalSync: false },
};

for (const [field, error] of [
  [nickname, "Indiquez votre pseudo."],
  [question, "Votre question doit contenir au moins quatre caractères."],
]) {
  field.addEventListener("invalid", () => field.setCustomValidity(error));
  field.addEventListener("input", () => field.setCustomValidity(""));
}

for (const [selector, view] of [["[data-show-list]", "list"], ["[data-show-form]", "form"]]) {
  document.querySelector(selector).addEventListener("click", (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(view);
  });
}
window.addEventListener("popstate", () => showView(location.hash === "#questions" ? "list" : "form", true));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity() || !state.voterId || state.operations.submit) return;
  state.operations.submit = true;
  setNotice("Envoi en cours…");
  render();
  try {
    const result = await post("/question", { text: question.value, nickname: nickname.value, voterId: state.voterId });
    nickname.value = result.submission.nickname;
    nickname.readOnly = true;
    question.value = "";
    const personalRefresh = refreshPersonal();
    setNotice(result.submission.visibility === "public"
      ? "Votre question a bien été envoyée."
      : "Votre question a bien été envoyée. Elle apparaîtra dans la liste une fois publiée.");
    navigate("list", { clearNotice: false });
    await Promise.allSettled([personalRefresh, refreshSnapshot()]);
    notifyOtherTabs();
  } catch (error) {
    setNotice(questionError(error), true);
    await Promise.allSettled([refreshPersonal(), refreshSnapshot()]);
  } finally {
    state.operations.submit = false;
    render();
  }
});

questionsRoot.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-question-id]");
  if (!button || button.getAttribute("aria-disabled") === "true") return;
  void toggleVote(button.dataset.questionId);
});
retryButton.addEventListener("click", () => {
  void Promise.allSettled([refreshPersonal(), refreshSnapshot()]);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !state.voterId) return;
  void Promise.allSettled([refreshPersonal(), refreshSnapshot()]);
  if (!state.socket && !state.reconnectTimer) connect();
});
window.addEventListener("storage", (event) => {
  if (state.voterKey && event.key === `${state.voterKey}:updated`) {
    void Promise.allSettled([refreshPersonal(), refreshSnapshot()]);
  }
});

render();
try {
  const response = await fetch(eventApi("/config"), { cache: "no-store" });
  if (!response.ok) throw new Error("config unavailable");
  const config = await response.json();
  document.title = `${config.title} · Questions du public`;
  document.querySelector("[data-event-title]").textContent = config.title;
  state.voterKey = `${config.eventId}:live-deck-voter`;
  const initializeVoter = () => {
    const voterId = localStorage.getItem(state.voterKey) || crypto.randomUUID();
    localStorage.setItem(state.voterKey, voterId);
    return voterId;
  };
  state.voterId = navigator.locks
    ? await navigator.locks.request(`${state.voterKey}:identity`, initializeVoter)
    : initializeVoter();
  state.configReady = true;
  render();
  connect();
  void Promise.allSettled([refreshPersonal(), refreshSnapshot()]);
} catch {
  setNotice("Impossible de charger l’événement. Actualisez la page pour réessayer.", true);
  render();
}

function navigate(view, { clearNotice = true } = {}) {
  if (state.view !== view) {
    history.pushState(null, "", `${location.pathname}${location.search}${view === "list" ? "#questions" : "#poser"}`);
  }
  if (clearNotice) setNotice("");
  showView(view, true);
}

function showView(view, focus) {
  state.view = view;
  render();
  if (focus) (view === "list" ? document.querySelector("#list-title") : document.querySelector("#form-title")).focus();
}

function setNotice(text, isError = false) {
  state.notice = text;
  state.noticeIsError = isError;
}

function render() {
  formView.hidden = state.view !== "form";
  listView.hidden = state.view !== "list";
  submitButton.disabled = !state.configReady || state.operations.submit;
  message.textContent = state.notice;
  message.classList.toggle("error", state.noticeIsError);
  connection.textContent = state.connected ? "Questions mises à jour en direct" : "Connexion au direct en cours…";
  listError.hidden = !state.personalError && !state.snapshotError;
  listError.textContent = state.snapshotError
    ? "Impossible de charger les questions. Réessayez dans un instant."
    : "Impossible de vérifier vos soutiens. Réessayez dans un instant.";
  retryButton.hidden = listError.hidden;
  renderQuestions();
}

function renderQuestions() {
  const focusedId = document.activeElement?.dataset?.questionId;
  const cards = [];
  for (const item of state.snapshot?.questions || []) {
    const own = state.personal?.questions.some((entry) => entry.id === item.id) || false;
    const supported = state.personal?.upvotedQuestionIds.includes(item.id) || false;
    const busy = state.operations.votes.has(item.id);
    const unavailable = !state.personal || state.operations.personalSync || busy || own;
    const article = document.createElement("article");
    article.className = "question-card";
    const text = document.createElement("p");
    text.textContent = item.text;
    const meta = document.createElement("div");
    meta.className = "question-meta";
    const author = document.createElement("small");
    author.textContent = item.nickname;
    const vote = document.createElement("button");
    vote.type = "button";
    vote.className = "vote";
    vote.dataset.questionId = item.id;
    vote.setAttribute("aria-pressed", String(supported));
    vote.setAttribute("aria-disabled", String(unavailable));
    const count = `${item.upvotes} soutien${item.upvotes === 1 ? "" : "s"}`;
    vote.textContent = own ? `Votre question · ${item.upvotes}` : `${supported ? "Soutenu" : "Soutenir"} · ${item.upvotes}`;
    vote.setAttribute("aria-label", own
      ? `Votre question : vous ne pouvez pas la soutenir. ${count}.`
      : `${supported ? "Retirer votre soutien à" : "Soutenir"} la question de ${item.nickname} : ${item.text}. ${count}.`);
    meta.append(author, vote);
    article.append(text, meta);
    cards.push(article);
  }
  if (!cards.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = state.snapshot ? "Aucune question publiée pour le moment." : "Chargement des questions…";
    cards.push(empty);
  }
  questionsRoot.replaceChildren(...cards);
  if (focusedId && state.view === "list") {
    [...questionsRoot.querySelectorAll("button[data-question-id]")]
      .find((button) => button.dataset.questionId === focusedId)?.focus({ preventScroll: true });
  }
}

async function refreshPersonal() {
  if (!state.voterId) return;
  const request = ++state.personalRequest;
  state.operations.personalSync = true;
  render();
  try {
    const personal = await post("/me", { voterId: state.voterId });
    if (!Array.isArray(personal.questions) || !Array.isArray(personal.upvotedQuestionIds)) throw new Error("invalid participant state");
    if (request === state.personalRequest) {
      state.personal = personal;
      state.personalError = false;
      if (personal.participant) {
        nickname.value = personal.participant.alias;
        nickname.readOnly = true;
      } else {
        nickname.readOnly = false;
      }
    }
    return personal;
  } catch (error) {
    if (request === state.personalRequest) {
      state.personal = null;
      state.personalError = true;
    }
    throw error;
  } finally {
    if (request === state.personalRequest) state.operations.personalSync = false;
    render();
  }
}

async function refreshSnapshot() {
  const version = state.snapshotVersion;
  try {
    const response = await fetch(eventApi("/state"), { cache: "no-store" });
    if (!response.ok) throw new Error("snapshot unavailable");
    const snapshot = await response.json();
    if (!Array.isArray(snapshot.questions)) throw new Error("invalid snapshot");
    if (version === state.snapshotVersion) applySnapshot(snapshot);
    state.snapshotError = false;
  } catch (error) {
    if (version === state.snapshotVersion) state.snapshotError = true;
    throw error;
  } finally {
    render();
  }
}

function applySnapshot(snapshot) {
  state.snapshot = snapshot;
  state.snapshotVersion += 1;
  state.snapshotError = false;
  render();
}

function connect() {
  if (state.socket || !state.voterId) return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}${eventContext.apiBase}/live`);
  state.socket = socket;
  socket.addEventListener("open", () => {
    state.connected = true;
    render();
    void Promise.allSettled([refreshSnapshot(), refreshPersonal()]);
  });
  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "snapshot" && Array.isArray(payload.data?.questions)) {
        const previousIds = new Set(state.snapshot?.questions.map((item) => item.id) || []);
        const restoredVotes = state.snapshot && payload.data.questions.some(
          (item) => !previousIds.has(item.id) && item.upvotes > 0,
        );
        applySnapshot(payload.data);
        if (restoredVotes) void refreshPersonal().catch(() => {});
      }
    } catch {
      // The server also accepts ping/pong; ignore messages that are not snapshots.
    }
  });
  socket.addEventListener("close", () => {
    if (state.socket !== socket) return;
    state.socket = null;
    state.connected = false;
    render();
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      connect();
    }, 1500);
  });
  socket.addEventListener("error", () => socket.close());
}

async function toggleVote(questionId) {
  if (!state.personal || state.operations.personalSync || state.operations.votes.has(questionId)) return;
  const desired = !state.personal.upvotedQuestionIds.includes(questionId);
  state.operations.votes.add(questionId);
  setNotice("");
  render();
  const execute = async () => {
    const personal = await refreshPersonal();
    if (personal.questions.some((entry) => entry.id === questionId)) throw new Error("cannot upvote your own question");
    if (personal.upvotedQuestionIds.includes(questionId) !== desired) {
      await post("/upvote", { questionId, voterId: state.voterId, supported: desired });
    }
    await refreshPersonal();
  };
  try {
    if (navigator.locks) await navigator.locks.request(`${state.voterKey}:vote:${questionId}`, execute);
    else await execute();
  } catch (error) {
    setNotice(voteError(error), true);
  } finally {
    await Promise.allSettled([refreshPersonal(), refreshSnapshot()]);
    notifyOtherTabs();
    state.operations.votes.delete(questionId);
    render();
  }
}

function notifyOtherTabs() {
  try {
    localStorage.setItem(`${state.voterKey}:updated`, crypto.randomUUID());
  } catch {
    // The live connection and foreground refresh also reconcile the state.
  }
}

async function post(path, data) {
  const response = await fetch(eventApi(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "request failed");
  return result;
}

function questionError(error) {
  const text = String(error?.message || error);
  if (text.includes("question limit")) return "Vous avez atteint le nombre maximal de questions pour cet événement.";
  if (text.includes("cooldown") || text.includes("rate limit")) return "Patientez un peu avant d’envoyer une autre question.";
  if (text.includes("paused")) return "Les questions sont temporairement en pause.";
  if (text.includes("closed")) return "Cet événement est terminé.";
  if (text.includes("access is limited")) return "Vous ne pouvez pas envoyer de question pour cet événement.";
  if (text.includes("alias")) return "Indiquez votre pseudo.";
  if (text.includes("question too short")) return "Votre question doit contenir au moins quatre caractères.";
  return "L’envoi a échoué. Réessayez dans un instant.";
}

function voteError(error) {
  const text = String(error?.message || error);
  if (text.includes("own question")) return "Vous ne pouvez pas soutenir votre propre question.";
  if (text.includes("question not found")) return "Cette question n’est plus disponible.";
  return "Votre soutien n’a pas pu être confirmé. Vérifiez la liste avant de réessayer.";
}
