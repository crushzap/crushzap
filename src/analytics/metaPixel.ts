declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: (...args: any[]) => void;
    __cz_meta_pixel_initialized__?: boolean;
  }
}

function ensureFbqStub() {
  if (typeof window === "undefined") return;
  if (window.fbq) return;

  const fbq: any = function (...args: any[]) {
    fbq.callMethod ? fbq.callMethod.apply(fbq, args) : fbq.queue.push(args);
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];

  window.fbq = fbq;
  window._fbq = fbq;
}

function ensurePixelScriptLoaded() {
  if (typeof document === "undefined") return;
  if (document.getElementById("cz-meta-pixel")) return;

  const script = document.createElement("script");
  script.id = "cz-meta-pixel";
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
}

export function initMetaPixel(pixelId: string) {
  const id = (pixelId || "").toString().trim();
  if (!id) return false;
  if (typeof window === "undefined") return false;
  if (window.__cz_meta_pixel_initialized__) return true;

  window.__cz_meta_pixel_initialized__ = true;
  ensureFbqStub();
  ensurePixelScriptLoaded();
  window.fbq?.("init", id);
  window.fbq?.("track", "PageView");
  return true;
}

export function trackMetaPageView() {
  if (typeof window === "undefined") return;
  window.fbq?.("track", "PageView");
}

export function trackMetaEvent(eventName: string, data?: Record<string, any>) {
  if (typeof window === "undefined") return;
  const name = (eventName || "").toString().trim();
  if (!name) return;
  if (data && typeof data === "object") {
    window.fbq?.("track", name, data);
    return;
  }
  window.fbq?.("track", name);
}

export {};
