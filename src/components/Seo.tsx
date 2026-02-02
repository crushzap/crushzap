import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";

type SeoConfig = {
  title: string;
  description: string;
  robots: string;
  canonicalPath: string;
};

function upsertMetaByName(name: string, content: string) {
  if (typeof document === "undefined") return;
  const head = document.head;
  if (!head) return;

  let el = head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertMetaByProperty(property: string, content: string) {
  if (typeof document === "undefined") return;
  const head = document.head;
  if (!head) return;

  let el = head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  if (typeof document === "undefined") return;
  const head = document.head;
  if (!head) return;

  let el = head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function normalizePath(pathname: string) {
  if (!pathname) return "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function computeSeo(pathname: string): SeoConfig {
  const path = normalizePath(pathname);

  const defaults: SeoConfig = {
    title: "CrushZap | Atendimento e Vendas no WhatsApp",
    description:
      "Plataforma de atendimento no WhatsApp com automação, organização de conversas, personas e assinaturas. Aumente conversão e produtividade com o CrushZap.",
    robots: "index,follow,max-image-preview:large",
    canonicalPath: "/",
  };

  if (path === "/") return defaults;

  if (path === "/entrar") {
    return {
      title: "Entrar | CrushZap",
      description: "Acesse sua conta do CrushZap para gerenciar WhatsApp, personas e assinaturas.",
      robots: "noindex,nofollow",
      canonicalPath: "/entrar",
    };
  }

  const protectedPrefixes = [
    "/dashboard",
    "/personas",
    "/planos",
    "/clientes",
    "/configuracao-persona",
    "/configuracoes",
    "/conversas",
    "/assinaturas",
    "/whatsapp",
  ];

  const matchedProtected = protectedPrefixes.find((p) => path === p || path.startsWith(`${p}/`));
  if (matchedProtected) {
    const label =
      matchedProtected === "/dashboard"
        ? "Dashboard"
        : matchedProtected === "/personas"
          ? "Personas"
          : matchedProtected === "/planos"
            ? "Planos"
            : matchedProtected === "/clientes"
              ? "Clientes"
              : matchedProtected === "/configuracao-persona"
                ? "Configuração de Persona"
                : matchedProtected === "/configuracoes"
                  ? "Configurações"
                  : matchedProtected === "/conversas"
                    ? "Conversas"
                    : matchedProtected === "/assinaturas"
                      ? "Assinaturas"
                      : matchedProtected === "/whatsapp"
                        ? "WhatsApp"
                        : "Área administrativa";

    return {
      title: `${label} | CrushZap`,
      description: "Área administrativa do CrushZap.",
      robots: "noindex,nofollow",
      canonicalPath: matchedProtected,
    };
  }

  return {
    title: "Página não encontrada | CrushZap",
    description: "A página que você procura não foi encontrada.",
    robots: "noindex,nofollow",
    canonicalPath: path,
  };
}

export function Seo() {
  const location = useLocation();
  const seo = useMemo(() => computeSeo(location.pathname), [location.pathname]);

  useEffect(() => {
    const siteUrl = typeof window !== "undefined" ? window.location.origin : "https://crushzap.com.br";
    const canonicalUrl = new URL(seo.canonicalPath, siteUrl).toString();
    const pageUrl = new URL(normalizePath(location.pathname), siteUrl).toString();
    const imageUrl = new URL("/crushzap-logo-v2.png", siteUrl).toString();

    document.title = seo.title;
    upsertMetaByName("description", seo.description);
    upsertMetaByName("robots", seo.robots);
    upsertLink("canonical", canonicalUrl);

    upsertMetaByProperty("og:site_name", "CrushZap");
    upsertMetaByProperty("og:locale", "pt_BR");
    upsertMetaByProperty("og:type", "website");
    upsertMetaByProperty("og:url", pageUrl);
    upsertMetaByProperty("og:title", seo.title);
    upsertMetaByProperty("og:description", seo.description);
    upsertMetaByProperty("og:image", imageUrl);
    upsertMetaByProperty("og:image:alt", "CrushZap");

    upsertMetaByName("twitter:card", "summary_large_image");
    upsertMetaByName("twitter:title", seo.title);
    upsertMetaByName("twitter:description", seo.description);
    upsertMetaByName("twitter:image", imageUrl);
    upsertMetaByName("twitter:image:alt", "CrushZap");
  }, [location.pathname, seo]);

  return null;
}

