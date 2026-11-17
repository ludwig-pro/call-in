import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

console.log(`Prepared self-hosted assets for https://${ownHost}`);
