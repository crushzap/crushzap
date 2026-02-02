import fs from "node:fs/promises";
import path from "node:path";

function normalizeSiteUrl(raw) {
  const siteUrl = (raw || "").trim() || "https://crushzap.com.br";
  return siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildSitemapXml({ siteUrl, routes }) {
  const lastmod = todayIsoDate();

  const urlset = routes
    .map((route) => {
      const url = `${siteUrl}${route}`;
      return [
        "  <url>",
        `    <loc>${url}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        "    <changefreq>weekly</changefreq>",
        route === "/" ? "    <priority>1.0</priority>" : "    <priority>0.5</priority>",
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urlset,
    "</urlset>",
    "",
  ].join("\n");
}

function buildRobotsTxt({ siteUrl }) {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /entrar",
    "Disallow: /dashboard",
    "Disallow: /personas",
    "Disallow: /planos",
    "Disallow: /clientes",
    "Disallow: /configuracao-persona",
    "Disallow: /configuracoes",
    "Disallow: /conversas",
    "Disallow: /assinaturas",
    "Disallow: /whatsapp",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
}

async function writeFileIfChanged(filePath, nextContent) {
  let prevContent = null;
  try {
    prevContent = await fs.readFile(filePath, "utf8");
  } catch {
    prevContent = null;
  }

  if (prevContent === nextContent) return;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, nextContent, "utf8");
}

const siteUrl = normalizeSiteUrl(process.env.SITE_URL || process.env.VITE_SITE_URL);
const routes = ["/"];

const sitemapXml = buildSitemapXml({ siteUrl, routes });
const robotsTxt = buildRobotsTxt({ siteUrl });

const publicDir = path.resolve(process.cwd(), "public");
await writeFileIfChanged(path.join(publicDir, "sitemap.xml"), sitemapXml);
await writeFileIfChanged(path.join(publicDir, "robots.txt"), robotsTxt);

