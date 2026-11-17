import { eventApi } from "./event-context.js";

const form = document.querySelector("#question-form");
const nickname = document.querySelector("#nickname");
const question = document.querySelector("#question");
const message = document.querySelector("[data-message]");
const button = form.querySelector("button[type=submit]");
let voterId;
let submitted = false;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity() || !voterId) return;
  button.disabled = true;
  message.classList.remove("error");
  message.textContent = "Envoi en cours…";
  try {
    const result = await post("/question", { text: question.value, nickname: nickname.value, voterId });
    submitted = true;
    nickname.value = result.submission.nickname;
    nickname.readOnly = true;
    question.value = "";
    message.textContent = "Votre question a bien été envoyée aux organisateurs.";
  } catch (error) {
    message.classList.add("error");
    message.textContent = humanError(error);
  } finally {
    button.disabled = false;
  }
});

try {
  const response = await fetch(eventApi("/config"));
  if (!response.ok) throw new Error("config unavailable");
  const config = await response.json();
  document.title = `${config.title} · Poser une question`;
  document.querySelector("[data-event-title]").textContent = config.title;
  const voterKey = `${config.eventId}:live-deck-voter`;
  voterId = localStorage.getItem(voterKey) || crypto.randomUUID();
  localStorage.setItem(voterKey, voterId);
  button.disabled = false;
  post("/me", { voterId }).then((state) => {
    if (!submitted && state.participant) {
      nickname.value = state.participant.alias;
      nickname.readOnly = true;
    }
  }).catch(() => {});
} catch {
  button.disabled = true;
  message.classList.add("error");
  message.textContent = "Impossible de charger l’événement. Actualisez la page pour réessayer.";
}

async function post(path, data) {
  const response = await fetch(eventApi(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "request failed");
  return result;
}

function humanError(error) {
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
