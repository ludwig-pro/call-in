import { accessTokenKey, consumeAccessToken, eventContext, eventPage } from "../event-context.js";

const tokenKey = accessTokenKey("admin");
const loginPanel = document.querySelector("[data-login-panel]");
const loginForm = document.querySelector("[data-login-form]");
const loginMessage = document.querySelector("[data-login-message]");
const app = document.querySelector("[data-setup-app]");
const form = document.querySelector("[data-config-form]");
const saveMessage = document.querySelector("[data-save-message]");
const result = document.querySelector("[data-result]");
const pollsRoot = document.querySelector("[data-polls]");
let token = consumeAccessToken("admin");
let config = null;

document.querySelectorAll("[data-audience-link]").forEach((link) => {
  link.href = eventPage("/");
});
document.querySelector("[data-presenter-link]").href = eventPage("/present/");
const moderatorLink = document.querySelector("[data-moderator-link]");
moderatorLink.href = eventPage("/moderate/");
if (eventContext.hosted) moderatorLink.hidden = true;
if (eventContext.hosted && !token) {
  loginMessage.textContent = "Utilisez le lien privé de configuration obtenu lors de la création de l’événement.";
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  token = String(new FormData(loginForm).get("token") || "");
  loginMessage.textContent = "Vérification de l’accès…";
  await loadConfig();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveMessage.textContent = "Vérification et enregistrement…";
  result.hidden = true;
  try {
    const next = readConfigFromForm();
    const saved = await request(`${eventContext.apiBase}/admin/config`, {
      method: "POST",
      body: JSON.stringify(next),
    });
    config = saved.config;
    fillForm(config);
    saveMessage.textContent = "Enregistré";
    result.hidden = false;
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    saveMessage.textContent = humanError(error);
  }
});

document.querySelector("[data-add-poll]").addEventListener("click", () => {
  if (pollsRoot.children.length >= 8) {
    saveMessage.textContent = "Vous pouvez créer 8 sondages au maximum";
    return;
  }
  addPollEditor({
    id: `poll-${crypto.randomUUID().slice(0, 8)}`,
    prompt: "Sondage",
    question: "",
    options: ["", ""],
  });
});

pollsRoot.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-poll]");
  if (button) button.closest(".poll-editor")?.remove();
});

document.querySelector("[data-sign-out]").addEventListener("click", () => {
  sessionStorage.removeItem(tokenKey);
  location.reload();
});

async function loadConfig() {
  if (!token) return;
  try {
    const data = await request(`${eventContext.apiBase}/admin/config`);
    config = data.config;
    sessionStorage.setItem(tokenKey, token);
    loginPanel.hidden = true;
    app.hidden = false;
    loginMessage.textContent = "";
    fillForm(config);
  } catch (error) {
    token = "";
    sessionStorage.removeItem(tokenKey);
    loginMessage.textContent = humanError(error);
  }
}

function fillForm(next) {
  setValue("title", next.title);
  setValue("dashboardTitle", next.dashboardTitle);
  setValue("deckUrl", next.deckUrl);
  setValue("eyebrow", next.eyebrow);
  setValue("locale", next.locale);
  setValue("description", next.description);
  setValue("difficultyTitle", next.difficulty.title);
  setValue("questionTitle", next.question.title);
  setValue("questionPlaceholder", next.question.placeholder);
  setValue("maxPerDevice", next.question.maxPerDevice);
  document.querySelector("[data-event-id]").textContent = next.eventId;

  const difficultyRoot = document.querySelector("[data-difficulty-labels]");
  difficultyRoot.innerHTML = "";
  next.difficulty.labels.forEach((label, index) => {
    const wrapper = document.createElement("label");
    wrapper.textContent = String(index + 1);
    const input = document.createElement("input");
    input.name = `difficultyLabel${index + 1}`;
    input.maxLength = 60;
    input.required = true;
    input.value = label;
    wrapper.append(input);
    difficultyRoot.append(wrapper);
  });

  const reactionsRoot = document.querySelector("[data-reactions]");
  reactionsRoot.innerHTML = "";
  next.reactions.forEach((reaction) => {
    const editor = document.createElement("label");
    editor.className = "reaction-editor";
    editor.dataset.reactionId = reaction.id;
    editor.innerHTML = `<span class="sr-only"></span><input data-reaction-emoji maxlength="24" required /><input data-reaction-label maxlength="60" required />`;
    editor.querySelector("span").textContent = reaction.label;
    editor.querySelector("[data-reaction-emoji]").setAttribute("aria-label", `Emoji : ${reaction.label}`);
    editor.querySelector("[data-reaction-label]").setAttribute("aria-label", `Libellé : ${reaction.label}`);
    editor.querySelector("[data-reaction-emoji]").value = reaction.emoji;
    editor.querySelector("[data-reaction-label]").value = reaction.label;
    reactionsRoot.append(editor);
  });

  pollsRoot.innerHTML = "";
  next.polls.forEach(addPollEditor);

  const moderation = next.moderation || defaultModeration();
  form.elements.moderationEnabled.checked = Boolean(moderation.enabled);
  setValue("presentationDelaySeconds", moderation.presentationDelaySeconds);
  setValue("questionCooldownSeconds", moderation.questionCooldownSeconds);
  setValue("slowModeSeconds", moderation.slowModeSeconds);
  setValue("cocTitle", moderation.codeOfConduct.title);
  setValue("cocSummary", moderation.codeOfConduct.summary);
  setValue("cocRules", moderation.codeOfConduct.rules.join("\n"));

  const themeRoot = document.querySelector("[data-theme-colors]");
  themeRoot.innerHTML = "";
  for (const [key, label] of Object.entries({
    background: "Fond",
    panel: "Cartes",
    accent: "Accent",
    highlight: "Mise en évidence",
    positive: "Positif",
  })) {
    const wrapper = document.createElement("label");
    wrapper.textContent = label;
    const input = document.createElement("input");
    input.type = "color";
    input.name = `theme-${key}`;
    input.value = next.theme[key];
    wrapper.append(input);
    themeRoot.append(wrapper);
  }
}

function addPollEditor(poll) {
  const editor = document.createElement("fieldset");
  editor.className = "poll-editor";
  editor.dataset.pollId = poll.id;
  editor.innerHTML = `
    <legend class="sr-only">Sondage</legend>
    <label>Titre court<input data-poll-prompt maxlength="80" required /></label>
    <label>Question<input data-poll-question maxlength="240" required /></label>
    <label>Choix, un par ligne<textarea data-poll-options rows="3" required></textarea></label>
    <button class="remove-poll" type="button" data-remove-poll aria-label="Supprimer ce sondage">×</button>`;
  editor.querySelector("[data-poll-prompt]").value = poll.prompt;
  editor.querySelector("[data-poll-question]").value = poll.question;
  editor.querySelector("[data-poll-options]").value = poll.options.join("\n");
  pollsRoot.append(editor);
}

function readConfigFromForm() {
  const next = structuredClone(config);
  next.title = value("title");
  next.dashboardTitle = value("dashboardTitle");
  next.deckUrl = value("deckUrl");
  next.eyebrow = value("eyebrow");
  next.locale = value("locale");
  next.description = value("description");
  next.difficulty.title = value("difficultyTitle");
  next.difficulty.labels = [1, 2, 3, 4, 5].map((index) => value(`difficultyLabel${index}`));
  next.question.title = value("questionTitle");
  next.question.placeholder = value("questionPlaceholder");
  next.question.maxPerDevice = numberValue("maxPerDevice");
  next.reactions = [...document.querySelectorAll("[data-reaction-id]")].map((editor) => ({
    id: editor.dataset.reactionId,
    emoji: editor.querySelector("[data-reaction-emoji]").value.trim(),
    label: editor.querySelector("[data-reaction-label]").value.trim(),
  }));
  next.polls = [...document.querySelectorAll(".poll-editor")].map((editor) => {
    const options = editor.querySelector("[data-poll-options]").value.split("\n").map((item) => item.trim()).filter(Boolean);
    if (options.length < 2 || options.length > 6) throw new Error("Chaque sondage doit comporter de 2 à 6 choix");
    return {
      id: editor.dataset.pollId,
      prompt: editor.querySelector("[data-poll-prompt]").value.trim(),
      question: editor.querySelector("[data-poll-question]").value.trim(),
      options,
    };
  });
  next.theme = Object.fromEntries(
    ["background", "panel", "accent", "highlight", "positive"].map((key) => [key, value(`theme-${key}`)]),
  );

  const moderation = next.moderation || defaultModeration();
  moderation.enabled = form.elements.moderationEnabled.checked;
  moderation.presentationDelaySeconds = numberValue("presentationDelaySeconds");
  moderation.questionCooldownSeconds = numberValue("questionCooldownSeconds");
  moderation.slowModeSeconds = numberValue("slowModeSeconds");
  moderation.codeOfConduct.title = value("cocTitle");
  moderation.codeOfConduct.summary = value("cocSummary");
  moderation.codeOfConduct.rules = value("cocRules").split("\n").map((item) => item.trim()).filter(Boolean);
  next.moderation = moderation;
  return next;
}

function defaultModeration() {
  return {
    enabled: false,
    presentationDelaySeconds: 8,
    questionCooldownSeconds: 20,
    questionsPerTenMinutes: 5,
    slowModeSeconds: 90,
    flags: { enabled: true, maxPerDevice: 8, autoHoldMin: 3, autoHoldMax: 5, autoHoldParticipantRatio: 0.03 },
    codeOfConduct: {
      version: new Date().toISOString().slice(0, 10),
      title: "Gardons une discussion constructive",
      summary: "Discutez des idées, des méthodes et des conclusions pour faire avancer l’échange.",
      rules: ["Pas d’attaques personnelles, de harcèlement, de menaces ni de divulgation d’informations privées.", "Pas de spam ni de perturbation volontaire."],
    },
  };
}

function setValue(name, next) {
  form.elements[name].value = String(next ?? "");
}

function value(name) {
  return String(form.elements[name].value || "").trim();
}

function numberValue(name) {
  return Number(form.elements[name].value);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 404 ? "Code d’administration absent ou incorrect" : data.error || "Les paramètres n’ont pas été enregistrés");
  return data;
}

function humanError(error) {
  const message = String(error?.message || error);
  if (message.includes("request too large")) return "Configuration trop longue : réduisez le nombre de sondages ou la longueur des textes";
  if (message.includes("token")) return message;
  return message || "Échec de l’opération. Réessayez.";
}

if (token) void loadConfig();
