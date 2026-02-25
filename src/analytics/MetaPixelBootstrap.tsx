import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getMetaConfig } from "@/services/meta";
import { initMetaPixel, trackMetaPageView } from "@/analytics/metaPixel";

export function MetaPixelBootstrap() {
  const location = useLocation();
  const initializedRef = useRef(false);
  const lastPathRef = useRef<string | null>(null);
  const initialPathRef = useRef<string | null>(null);

  if (initialPathRef.current === null) {
    initialPathRef.current = `${location.pathname}${location.search}${location.hash}`;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (import.meta.env.DEV) return;
        const cfg = await getMetaConfig();
        if (cancelled) return;
        if (!cfg.enabled || !cfg.pixelId) return;
        initializedRef.current = initMetaPixel(cfg.pixelId);
        lastPathRef.current = initialPathRef.current;
      } catch (error) {
        if (cancelled) return;
        initializedRef.current = false;
        lastPathRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initializedRef.current) return;
    const current = `${location.pathname}${location.search}${location.hash}`;
    if (lastPathRef.current === current) return;
    lastPathRef.current = current;
    trackMetaPageView();
  }, [location.pathname, location.search, location.hash]);

  return null;
}
