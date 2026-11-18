import { eventApi, eventContext, eventPage } from "../event-context.js";
import { createLocale, localizeConfig } from "../i18n.js";

document.documentElement.classList.toggle("embedded-dashboard", window.self !== window.top);

const apiBase = eventContext.apiBase;
const config = localizeConfig(await fetch(eventApi("/config")).then((response) => response.json()));
const locale = createLocale(config);
const t = locale.text;
locale.apply();
applyConfig(config);
document.querySelectorAll("[data-qr-image]").forEach((image) => {
  image.src = eventApi("/qr.svg");
});
document.querySelectorAll("[data-audience-url]").forEach((link) => {
  link.href = eventPage("/");
});
document.querySelector("[data-dashboard-expand]").href = eventPage("/dashboard/");
const questionsRoot = document.querySelector("#dashboard-questions");
const statusEl = document.querySelector("[data-status]");
const reactionStage = document.querySelector("[data-reaction-stage]");
const lensLabels = Object.fromEntries(config.question.lenses.map((lens) => [lens.id, lens.label]));

function render(state) {
  const mode = state.session?.mode || "open";
  const modeEl = document.querySelector("[data-session-mode]");
  modeEl.textContent = locale.fr
    ? ({ open: "OUVERT", slow: "RALENTI", approval: "SUR APPROBATION", paused: "EN PAUSE", closed: "FERMÉ" })[mode] || mode
    : locale.zhHant
    ? ({ open: "開放", slow: "慢速", approval: "需審核", paused: "暫停", closed: "關閉" })[
        mode
      ] || mode
    : mode.toUpperCase();
  modeEl.dataset.mode = mode;
  document.querySelector("[data-question-count]").textContent = t(
    `${state.questions.length} questions`,
    `${state.questions.length} 個問題`,
    `${state.questions.length} question${state.questions.length > 1 ? "s" : ""}`,
  );
  const rankedQuestions = [...state.questions].sort(
    (first, second) =>
      second.upvotes - first.upvotes || Number(second.createdAt) - Number(first.createdAt),
  );
  const newestId = state.questions.reduce(
    (newest, question) =>
      !newest || Number(question.createdAt) > Number(newest.createdAt) ? question : newest,
    null,
  )?.id;
  questionsRoot.innerHTML = rankedQuestions.length
    ? rankedQuestions
        .map(
          (question, index) => `
            <article>
              <div class="dashboard-question-head"><b>${question.id === newestId ? t("NEW", "最新") : String(index + 1).padStart(2, "0")}</b><span><time>${formatTime(question.createdAt)}</time> · ${t("Me too", "我也想問")} ${question.upvotes}</span></div>
              ${question.lens !== null ? `<div class="question-tags"><span class="question-lens">${escapeHtml(lensLabels[question.lens] || question.lens)}</span></div>` : ""}
              <p>${escapeHtml(question.text)}</p>
              <small>${escapeHtml(question.nickname)}</small>
            </article>`,
        )
        .join("")
    : `<div class="empty">${t("Waiting for the first question", "等待第一個問題")}</div>`;
}

function formatTime(value) {
  const date = new Date(Number(value));
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date)
    : t("just now", "剛剛");
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}${apiBase}/live`);
  socket.addEventListener("open", () => setStatus(true));
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "snapshot") render(message.data);
    if (message.type === "reaction") showReaction(message.data);
  });
  socket.addEventListener("close", () => {
    setStatus(false);
    setTimeout(connect, 1500);
  });
}

function showReaction(reaction) {
  const emoji = config.reactions.find((item) => item.id === reaction?.kind)?.emoji;
  if (!emoji) return;
  const burst = document.createElement("div");
  burst.className = `reaction-popup reaction-${reaction.kind}`;
  burst.textContent = emoji;
  burst.style.setProperty("--reaction-x", `${12 + Math.random() * 72}%`);
  burst.style.setProperty("--reaction-drift", `${-30 + Math.random() * 60}px`);
  burst.style.setProperty("--reaction-rotate", `${-16 + Math.random() * 32}deg`);
  reactionStage.append(burst);
  setTimeout(() => burst.remove(), 2600);
}

function setStatus(online) {
  statusEl.classList.toggle("online", online);
  statusEl.lastChild.textContent = online
    ? t("Live", "即時連線")
    : t("Reconnecting", "重新連線中");
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char],
  );
}

window.addEventListener("keydown", (event) => {
  if (
    event.target instanceof HTMLElement &&
    event.target.closest("button, a, input, select, textarea")
  ) {
    return;
  }
  if (["ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
    event.preventDefault();
    window.parent.postMessage({ type: "live-deck-key", key: event.key }, "*");
  }
});

fetch(`${apiBase}/state`)
  .then((response) => response.json())
  .then(render)
  .catch(() => {});
connect();

function applyConfig(nextConfig) {
  document.title = `${nextConfig.dashboardTitle} · Call-in`;
  const values = {
    eyebrow: nextConfig.eyebrow,
    dashboardTitle: nextConfig.dashboardTitle,
    "question.title": nextConfig.question.title,
  };
  document.querySelectorAll("[data-config]").forEach((element) => {
    const value = values[element.dataset.config];
    if (typeof value === "string") {
      element.textContent = value;
      if (element.dataset.config === "eyebrow") {
        element.hidden = ["call-in", nextConfig.dashboardTitle.toLowerCase()].includes(value.trim().toLowerCase());
      }
    }
  });
  // These are the historical defaults; the editable event config cannot identify them reliably.
  const historicalTheme = {
    background: "#081225",
    panel: "#101d3d",
    accent: "#35dcff",
    highlight: "#ff4f9a",
    positive: "#b9f24a",
  };
  const properties = {
    background: ["--wall-background", "--wall-foreground"],
    panel: ["--wall-panel", "--wall-panel-foreground"],
    accent: ["--wall-accent", "--wall-accent-foreground"],
    highlight: ["--wall-highlight", "--wall-highlight-foreground"],
    positive: ["--wall-positive"],
  };
  for (const [key, [background, foreground]] of Object.entries(properties)) {
    const color = nextConfig.theme[key];
    if (color.toLowerCase() === historicalTheme[key]) continue;
    document.documentElement.style.setProperty(background, color);
    if (foreground) document.documentElement.style.setProperty(foreground, readableText(color));
  }
}

function readableText(color) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
}

const qrModal = document.querySelector("[data-qr-modal]");
const qrOpenButton = document.querySelector("[data-qr-open]");
if (qrModal && qrOpenButton) {
  const qrCloseButton = qrModal.querySelector("[data-qr-close]");
  const modalBackground = [...document.body.children].filter(
    (element) => element !== qrModal && element.tagName !== "SCRIPT",
  );
  let previousFocus = null;

  function closeQrModal() {
    if (qrModal.hidden) return;
    qrModal.hidden = true;
    qrOpenButton.setAttribute("aria-expanded", "false");
    modalBackground.forEach((element) => {
      element.inert = false;
    });
    previousFocus?.focus();
  }

  const audienceUrl = `${location.origin}${eventPage("/")}`;
  const qrUrl = qrModal.querySelector("[data-qr-url]");
  qrUrl.textContent = audienceUrl.replace(/^https?:\/\//, "");
  qrUrl.href = eventPage("/");
  qrOpenButton.addEventListener("click", () => {
    previousFocus = document.activeElement;
    modalBackground.forEach((element) => {
      element.inert = true;
    });
    qrModal.hidden = false;
    qrOpenButton.setAttribute("aria-expanded", "true");
    qrCloseButton?.focus();
  });
  qrCloseButton?.addEventListener("click", closeQrModal);
  qrModal.addEventListener("click", (event) => {
    if (event.target === qrModal) closeQrModal();
  });
  document.addEventListener("keydown", (event) => {
    if (qrModal.hidden) return;
    if (event.key === "Escape") {
      closeQrModal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...qrModal.querySelectorAll("a[href], button:not([disabled])")];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
}
