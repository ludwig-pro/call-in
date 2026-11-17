import { french, frenchDefaults } from "./fr.js";
import { forceLocale } from "./site-config.js";

export function localizeConfig(config) {
  const language = String(forceLocale || config?.locale || "").toLowerCase();
  return language.startsWith("fr") ? frenchDefaults(config) : config;
}

export function createLocale(config) {
  const language = String(forceLocale || config?.locale || "").toLowerCase();
  const fr = language.startsWith("fr");
  const zhHant = language.startsWith("zh");
  return {
    fr,
    zhHant,
    text(english, traditionalChinese, frenchText) {
      return fr ? (frenchText ?? french[english] ?? english) : zhHant ? traditionalChinese : english;
    },
    apply(root = document) {
      if (fr) {
        document.documentElement.lang = "fr";
        root.querySelectorAll("[data-zh]").forEach((element) => {
          const translation = french[element.textContent.trim()];
          if (translation) element.textContent = translation;
        });
        root.querySelectorAll("[data-zh-tail]").forEach((element) => {
          const translation = french[element.lastChild.textContent.trim()];
          if (translation) element.lastChild.textContent = translation;
        });
        for (const [selector, attribute] of [
          ["[data-zh-aria]", "aria-label"],
          ["[data-zh-title]", "title"],
          ["[data-zh-placeholder]", "placeholder"],
        ]) {
          root.querySelectorAll(selector).forEach((element) => {
            const source = element.getAttribute(attribute) || (element instanceof HTMLImageElement ? element.alt : "");
            const translation = french[source];
            if (translation) {
              element.setAttribute(attribute, translation);
              if (element instanceof HTMLImageElement && attribute === "aria-label") element.alt = translation;
            }
          });
        }
        return;
      }
      if (!zhHant) return;
      document.documentElement.lang = "zh-Hant-TW";
      root.querySelectorAll("[data-zh]").forEach((element) => {
        element.textContent = element.dataset.zh;
      });
      root.querySelectorAll("[data-zh-tail]").forEach((element) => {
        element.lastChild.textContent = element.dataset.zhTail;
      });
      for (const [selector, attribute, dataKey] of [
        ["[data-zh-aria]", "aria-label", "zhAria"],
        ["[data-zh-title]", "title", "zhTitle"],
        ["[data-zh-placeholder]", "placeholder", "zhPlaceholder"],
      ]) {
        root.querySelectorAll(selector).forEach((element) => {
          element.setAttribute(attribute, element.dataset[dataKey]);
          if (dataKey === "zhAria" && element instanceof HTMLImageElement) {
            element.alt = element.dataset[dataKey];
          }
        });
      }
    },
  };
}
