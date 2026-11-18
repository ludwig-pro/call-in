// Load the challenge only when an organizer submits the creation form.
async function loadTurnstile() {
  if (window.turnstile) return window.turnstile;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const failed = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("verification unavailable"));
    };
    const timer = setTimeout(failed, 15000);
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.onerror = failed;
    script.onload = () => {
      clearTimeout(timer);
      if (window.turnstile) resolve(window.turnstile);
      else failed();
    };
    document.head.append(script);
  });
}

export async function creationHeaders(form, checking) {
  const settings = await fetch("/api/creation-settings", { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!settings.ok) throw new Error("verification unavailable");
  const { siteKey } = await settings.json();
  if (!siteKey) return {};
  checking();
  const api = await loadTurnstile();
  const container = document.createElement("div");
  form.querySelector("button[type=submit]").before(container);
  let widget;
  let timer;
  try {
    const token = await new Promise((resolve, reject) => {
      const failed = () => { reject(new Error("verification required")); return true; };
      timer = setTimeout(failed, 180000);
      widget = api.render(container, {
        sitekey: siteKey, action: "create_event", language: document.documentElement.lang,
        callback: resolve, "error-callback": failed, "expired-callback": failed, "timeout-callback": failed,
      });
    });
    return { "X-Turnstile-Token": token };
  } finally {
    clearTimeout(timer);
    if (widget != null) api.remove(widget);
    container.remove();
  }
}
