import { chromium } from "playwright";
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const asset = name => path.join(root, "public/assests", name);
const logo = (await readFile(asset("favicon-512.png"))).toString("base64");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; } body { margin: 0; width: 1200px; height: 630px; background: #111214; color: #fff; font-family: Helvetica, sans-serif; padding: 68px 76px; }
    header { display: flex; align-items: center; gap: 20px; font-size: 34px; font-weight: 700; } img { width: 64px; height: 64px; border-radius: 12px; }
    h1 { font-size: 68px; line-height: 1.08; letter-spacing: 0; margin: 52px 0 24px; max-width: 960px; }
    p { font-size: 28px; line-height: 1.5; color: #cdd2d7; margin: 0; max-width: 940px; }
    footer { margin-top: 40px; border-top: 2px solid #34383d; padding-top: 24px; font-size: 22px; color: #b8e4d0; }
  </style></head><body><header><img alt="" src="data:image/png;base64,${logo}">RegLayer</header><h1>Web accessibility testing<br>for your team.</h1><p>Automated WCAG scans, actionable findings,<br>and reports to support accessibility work.</p><footer>Scan. Review. Track fixes.</footer></body></html>`);
  await page.locator("img").evaluate(image => image.decode());
  await page.screenshot({ path: asset("reglayer-og.png") });
} finally {
  await browser.close();
}

await sharp(asset("favicon-512.png")).resize(192, 192).png().toFile(asset("favicon-192.png"));
const sizes = [32, 48, 256];
const images = await Promise.all(sizes.map(size => sharp(asset("favicon-512.png")).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((image, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index] % 256;
  header[entry + 1] = sizes[index] % 256;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile(path.join(root, "src/app/favicon.ico"), Buffer.concat([header, ...images]));
console.log("Generated branded 1200x630 social image, 192px app icon, and multi-size ICO.");