import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it("serves the participant preview in the first HTML response", async () => {
  const title = 'Q&A "Bordeaux" <2026>';
  const created = await SELF.fetch("https://example.com/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.95" },
    body: JSON.stringify({ title, locale: "fr" }),
  });
  expect(created.status).toBe(201);
  const { audienceUrl } = await created.json<{ audienceUrl: string }>();
  const page = await SELF.fetch(audienceUrl + "?source=partage");
  expect(page.status).toBe(200);
  const html = await page.text();
  expect(html).toContain(`property="og:url" content="${audienceUrl}"`);
  expect(html).toContain('property="og:image" content="https://call-in.bordeauxjs.com/brand/call-in-bordeauxjs-partage.png"');
  expect(html).toMatch(/property="og:title" content="Q&amp;A &quot;Bordeaux&quot; [^"]* · Call-in BordeauxJS"/);
  expect(html).toMatch(/name="twitter:title" content="Q&amp;A &quot;Bordeaux&quot;/);
  expect(html).not.toContain("?source=partage");
});

it("publishes a French landing card and a downloadable 1200 × 630 PNG", async () => {
  const url = "https://call-in.bordeauxjs.com";
  const page = await SELF.fetch(url + "/fr/");
  const html = await page.text();
  expect(html).toContain('property="og:title" content="Call-in BordeauxJS · La parole est au public"');
  expect(html).toContain('name="twitter:card" content="summary_large_image"');
  const image = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  expect(image).toBe(url + "/brand/call-in-bordeauxjs-partage.png");
  const response = await SELF.fetch(image!);
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/png");
  const png = new DataView(await response.arrayBuffer());
  expect(png.getUint32(0)).toBe(0x89504e47);
  expect([png.getUint32(16), png.getUint32(20)]).toEqual([1200, 630]);
});
