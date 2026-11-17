import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { french } from "./public/fr.js";

const root = dirname(fileURLToPath(import.meta.url));
const assets = join(root, ".selfhost-assets");
const upstreamHost = "call-in.mashbean.net";
const ownHost = "call-in.bordeauxjs.com";

await rm(assets, { recursive: true, force: true });
await cp(join(root, "public"), assets, { recursive: true });

for (const file of ["index.html", "en/index.html", "robots.txt", "sitemap.xml", "llms.txt"]) {
  const path = join(assets, file);
  let content = await readFile(path, "utf8");
  if (!content.includes(upstreamHost)) throw new Error(`Review self-host replacements for ${file}`);
  content = content.replaceAll(upstreamHost, ownHost);

  if (file === "en/index.html") {
    const before = `Events created through ${ownHost} record anonymous audience responses to operate and improve the project.`;
    if (!content.includes(before)) throw new Error("Review the English privacy text");
    content = content.replace(before, "Anonymous audience responses are recorded for the event.");
  }
  if (file === "index.html") {
    const before = `透過 ${ownHost} 建立的活動會記錄匿名群眾回應，用於維運並改善專案；`;
    if (!content.includes(before)) throw new Error("Review the Chinese privacy text");
    content = content.replace(before, "活動會記錄匿名群眾回應；");
  }
  if (file.endsWith("index.html")) {
    const policy = /\s*<aside class="use-policy" id="acceptable-use">[\s\S]*?<\/aside>/;
    if (!policy.test(content)) throw new Error(`Review the hosted-service policy in ${file}`);
    content = content.replace(policy, "");
  }
  await writeFile(path, content);
}

// Keep old links working while making the French interface the default here.
await cp(join(assets, "fr/index.html"), join(assets, "index.html"));
await cp(join(assets, "fr/index.html"), join(assets, "en/index.html"));
await writeFile(join(assets, "site-config.js"), 'export const forceLocale = "fr";\n');
await writeFile(join(assets, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://${ownHost}/</loc></url><url><loc>https://${ownHost}/fr/</loc></url></urlset>\n`);
await writeFile(join(assets, "llms.txt"), `# Call-in BordeauxJS\n\nService de questions et de réactions en direct : https://${ownHost}/\nCode source : https://github.com/ludwig-pro/call-in\nLes événements et leurs données expirent après sept jours.\n`);

// Translate the initial HTML too, so another language does not flash before JS loads.
for (const file of ["audience/index.html", "dashboard/index.html", "moderate/index.html"]) {
  const path = join(assets, file);
  let html = await readFile(path, "utf8");
  html = html.replace(/<html lang="[^"]+">/, '<html lang="fr">');
  html = html.replace(/(<[^>]*\sdata-zh="[^"]*"[^>]*>)([^<]*)(<\/[^>]+>)/g, (match, start, text, end) => {
    const translated = french[text.trim().replaceAll("&amp;", "&")];
    return translated ? `${start}${translated.replaceAll("&", "&amp;")}${end}` : match;
  });
  html = html.replace(/(<[^>]*\sdata-zh-tail="[^"]*"[^>]*><span><\/span>)([^<]+)/g, (match, start, text) =>
    french[text.trim()] ? `${start}${french[text.trim()]}` : match,
  );
  html = html.replace(/<[^>]*\sdata-zh-(aria|title|placeholder)="[^"]*"[^>]*>/g, (tag, kind) => {
    const attribute = kind === "aria" ? (tag.startsWith("<img") ? "alt" : "aria-label") : kind === "title" ? "title" : "placeholder";
    return tag.replace(new RegExp(`\\b${attribute}="([^"]*)"`), (match, value) =>
      french[value] ? `${attribute}="${french[value].replaceAll('"', "&quot;")}"` : match,
    );
  });
  html = html.replaceAll(">Live audience<", ">Événement<")
    .replaceAll(">Share the difficulty, ask a question, or send a live reaction.<", ">Partagez vos questions et vos réactions.<")
    .replaceAll(">How difficult does this feel right now?<", ">Comment trouvez-vous le rythme ?<")
    .replaceAll(">Ask anytime<", ">Posez vos questions<")
    .replaceAll(">OPEN<", ">OUVERT<")
    .replaceAll(">OK<", ">Adapté<")
    .replaceAll("<title>Call-in 簡單叩應</title>", "<title>Call-in</title>")
    .replaceAll("<title>Call-in Dashboard</title>", "<title>Tableau de bord Call-in</title>")
    .replaceAll("<title>Call-in moderation</title>", "<title>Modération Call-in</title>");
  await writeFile(path, html);
}

for (const [file, translations] of [
  ["present/index.html", {
    "Call-in 講者頁": "Call-in · Présentation", "Call-in 產品主頁": "Accueil Call-in",
    "正在載入簡報…": "Chargement de la présentation…", "講者工具": "Outils de présentation",
    "另開簡報": "Ouvrir la présentation", "觀眾頁": "Public", "管理": "Modération",
    "全螢幕": "Plein écran", "收起工具列": "Masquer la barre d’outils", "顯示講者工具列": "Afficher la barre d’outils",
    "工具列": "Outils", "隱藏互動": "Masquer les réactions", "現場互動 dashboard": "Tableau de bord des réactions",
    "現場互動": "Réactions en direct", "簡報區若保持空白，原網站可能禁止內嵌；請使用上方「另開簡報」。": "Si la présentation reste vide, son site interdit peut-être l’intégration. Utilisez « Ouvrir la présentation » ci-dessus.",
    "簡報": "Présentation", "講者頁": "Présentation",
  }],
  ["present/pdf-viewer.html", {
    "Call-in PDF 簡報": "Présentation PDF Call-in", "PDF 翻頁工具": "Navigation dans le PDF", "PDF 簡報": "Diapositives PDF",
    "正在準備簡報…": "Préparation des diapositives…", "上一頁": "Diapositive précédente", "下一頁": "Diapositive suivante", "或空白鍵": "ou Espace",
  }],
]) {
  const path = join(assets, file);
  let html = (await readFile(path, "utf8")).replace(/<html lang="[^"]+">/, '<html lang="fr">');
  for (const source of Object.keys(translations).sort((a, b) => b.length - a.length)) html = html.replaceAll(source, translations[source]);
  await writeFile(path, html);
}

console.log(`Prepared self-hosted assets for https://${ownHost}`);
