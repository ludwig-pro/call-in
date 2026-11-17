const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host {
      --panel-width: min(25vw, 520px);
      position: fixed;
      inset: 0 0 0 auto;
      z-index: 2147483000;
      width: var(--panel-width);
      pointer-events: none;
      font-family: var(--font, system-ui, sans-serif);
    }
    aside {
      position: absolute;
      inset: 0;
      overflow: hidden;
      border-left: 3px solid #111;
      background: #f6f5f0;
      transform: translateX(0);
      transition: transform .26s cubic-bezier(.2,.8,.2,1), opacity .2s ease;
      pointer-events: auto;
    }
    iframe { display: block; width: 100%; height: 100%; border: 0; background: #f6f5f0; }
    button {
      position: fixed;
      right: 12px;
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 2;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 40px;
      border: 2px solid #111;
      border-radius: 0;
      padding: 9px 13px;
      background: #f7df1e;
      color: #111;
      font-family: inherit;
      font-size: .85rem;
      font-weight: 800;
      cursor: pointer;
      pointer-events: auto;
      touch-action: manipulation;
    }
    button:focus-visible { outline: 3px solid #111; outline-offset: 2px; }
    :host([collapsed]) aside { transform: translateX(102%); opacity: 0; pointer-events: none; }
    .scrim { display: none; }
    @media (max-width: 900px) {
      :host { width: min(94vw, 500px); }
      :host(:not([collapsed])) .scrim {
        position: fixed;
        inset: 0;
        display: block;
        z-index: -1;
        background: #1119;
        pointer-events: auto;
      }
    }
    @media (prefers-reduced-motion: reduce) { aside { transition: none; } }
  </style>
  <button type="button" aria-expanded="true" aria-label="Hide live audience dashboard"><span>Hide dashboard</span></button>
  <div class="scrim" aria-hidden="true"></div>
  <aside aria-label="Live audience dashboard">
    <iframe title="Live audience dashboard" loading="eager" allow="clipboard-write"></iframe>
  </aside>
`;

const labels = {
  en: { panel: "Live audience dashboard", show: "Live audience", hide: "Hide dashboard" },
  fr: { panel: "Questions du public", show: "Afficher les questions", hide: "Masquer les questions" },
  zh: { panel: "現場互動儀表板", show: "現場互動", hide: "收起互動" },
};

class CallInPanel extends HTMLElement {
  #button;
  #frame;
  #scrim;
  #target;
  #savedTargetRight;
  #savedBodyPadding;
  #labels = labels.en;

  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    this.#button = this.shadowRoot.querySelector("button");
    this.#frame = this.shadowRoot.querySelector("iframe");
    this.#scrim = this.shadowRoot.querySelector(".scrim");
  }

  connectedCallback() {
    const serviceUrl = normalizeUrl(this.getAttribute("service-url") || location.origin);
    const dashboardUrl = this.getAttribute("dashboard-url") || `${serviceUrl}/dashboard/`;
    const locale = (this.getAttribute("locale") || document.documentElement.lang).toLowerCase().split("-")[0];
    this.#labels = labels[locale] || labels.en;
    this.shadowRoot.querySelector("aside").setAttribute("aria-label", this.#labels.panel);
    this.#frame.title = this.#labels.panel;
    this.style.setProperty("--panel-width", this.getAttribute("desktop-width") || "min(25vw, 520px)");
    this.#frame.src = dashboardUrl;
    this.#button.addEventListener("click", this.#toggle);
    this.#scrim.addEventListener("click", this.#collapse);
    window.addEventListener("message", this.#forwardKey);
    window.addEventListener("resize", this.#applyLayout);
    if (matchMedia("(max-width: 900px)").matches) this.setAttribute("collapsed", "");
    this.#applyLayout();
  }

  disconnectedCallback() {
    this.#button.removeEventListener("click", this.#toggle);
    this.#scrim.removeEventListener("click", this.#collapse);
    window.removeEventListener("message", this.#forwardKey);
    window.removeEventListener("resize", this.#applyLayout);
    this.#restoreLayout();
  }

  #toggle = () => {
    if (this.hasAttribute("collapsed")) this.removeAttribute("collapsed");
    else this.setAttribute("collapsed", "");
    this.#applyLayout();
  };

  #collapse = () => {
    this.setAttribute("collapsed", "");
    this.#applyLayout();
  };

  #applyLayout = () => {
    const compact = matchMedia("(max-width: 900px)").matches;
    const collapsed = this.hasAttribute("collapsed");
    this.#button.setAttribute("aria-expanded", String(!collapsed));
    const label = collapsed ? this.#labels.show : this.#labels.hide;
    this.#button.setAttribute("aria-label", label);
    this.#button.querySelector("span").textContent = label;
    if (this.getAttribute("mode") !== "split" || compact || collapsed) {
      this.#restoreLayout();
      return;
    }
    const width = this.getAttribute("desktop-width") || "min(25vw, 520px)";
    const selector = this.getAttribute("target-selector");
    this.#target = selector ? document.querySelector(selector) : null;
    if (this.#target instanceof HTMLElement) {
      if (this.#savedTargetRight === undefined) this.#savedTargetRight = this.#target.style.right;
      this.#target.style.right = width;
    } else {
      if (this.#savedBodyPadding === undefined) this.#savedBodyPadding = document.body.style.paddingRight;
      document.body.style.paddingRight = width;
    }
  };

  #restoreLayout() {
    if (this.#target instanceof HTMLElement && this.#savedTargetRight !== undefined) {
      this.#target.style.right = this.#savedTargetRight;
    }
    if (this.#savedBodyPadding !== undefined) document.body.style.paddingRight = this.#savedBodyPadding;
    this.#target = undefined;
    this.#savedTargetRight = undefined;
    this.#savedBodyPadding = undefined;
  }

  #forwardKey = (event) => {
    if (event.source !== this.#frame.contentWindow || event.data?.type !== "live-deck-key") return;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: event.data.key, bubbles: true }));
  };
}

function normalizeUrl(value) {
  return value.replace(/\/+$/, "");
}

if (!customElements.get("call-in-panel")) customElements.define("call-in-panel", CallInPanel);
class LegacyLiveDeckPanel extends CallInPanel {}
if (!customElements.get("live-deck-panel")) customElements.define("live-deck-panel", LegacyLiveDeckPanel);
