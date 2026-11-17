(() => {
  const key = "call-in-theme";
  const root = document.documentElement;
  const system = matchMedia("(prefers-color-scheme: dark)");
  let preference;
  try {
    preference = localStorage.getItem(key);
  } catch {
    // Storage can be unavailable inside embedded dashboards.
  }

  function render() {
    const dark = preference === "dark" || (preference !== "light" && system.matches);
    root.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0e0e0e" : "#f6f5f0");
    for (const button of document.querySelectorAll("[data-theme-toggle]")) {
      button.textContent = dark ? "☀" : "☾";
      button.setAttribute("aria-label", dark ? button.dataset.lightLabel : button.dataset.darkLabel);
    }
  }

  render();
  document.addEventListener("DOMContentLoaded", render);
  system.addEventListener("change", render);
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = event.newValue;
    render();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-theme-toggle]")) return;
    preference = root.dataset.theme === "dark" ? "light" : "dark";
    render();
    try {
      localStorage.setItem(key, preference);
    } catch {}
  });
})();
