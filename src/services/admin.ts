const API_BASE = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");

function handleUnauthorized(res: Response) {
  if (res.status === 401) {
    try { localStorage.removeItem("cz_admin_token"); } catch {}
    if (typeof window !== "undefined") window.location.href = "/entrar";
    throw new Error("Não autorizado");
  }
}

function authHeaders() {
  const token = localStorage.getItem("cz_admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type WhatsappConfigPayload = {
  phoneNumberId: string;
  wabaId: string;
  verifyToken: string;
};

export type WhatsappConfigItem = {
  id: string;
  phoneNumberId: string;
  displayNumber?: string;
  wabaId: string;
  webhookUrl?: string;
  verifyToken: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GrokConfigPayload = {
  model: string;
  enabled: boolean;
};

export async function saveWhatsappConfig(payload: WhatsappConfigPayload) {
  const res = await fetch(`${API_BASE}/admin/config/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  handleUnauthorized(res);
  if (!res.ok) {
    throw new Error("Falha ao salvar configuração do WhatsApp");
  }
  return res.json();
}

export async function saveGrokConfig(payload: GrokConfigPayload) {
  const res = await fetch(`${API_BASE}/admin/config/grok`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  handleUnauthorized(res);
  if (!res.ok) {
    throw new Error("Falha ao salvar configuração do Grok");
  }
  return res.json();
}

export async function adminLogin(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  if (!res.ok) {
    try {
      const err = JSON.parse(text);
      throw new Error(err?.error || "Falha no login");
    } catch {
      throw new Error("Falha no login");
    }
  }
  const data = JSON.parse(text) as { token: string };
  localStorage.setItem("cz_admin_token", data.token);
  return true;
}

export async function listWhatsappConfigs() {
  const res = await fetch(`${API_BASE}/admin/whatsapp/configs`, {
    headers: { ...authHeaders() },
  });
  handleUnauthorized(res);
  if (!res.ok) {
    const txt = await res.text();
    try { const err = JSON.parse(txt); throw new Error(err?.error || "Falha ao listar configurações"); } catch { throw new Error("Falha ao listar configurações"); }
  }
  return res.json() as Promise<WhatsappConfigItem[]>;
}

export async function createWhatsappConfig(payload: { phoneNumberId: string; displayNumber?: string; wabaId: string; }) {
  const res = await fetch(`${API_BASE}/admin/whatsapp/configs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const txt = await res.text();
  handleUnauthorized(res);
  if (!res.ok) {
    try { const err = JSON.parse(txt); throw new Error(err?.error || "Falha ao criar configuração"); } catch { throw new Error("Falha ao criar configuração"); }
  }
  return JSON.parse(txt) as WhatsappConfigItem;
}

export async function updateWhatsappConfig(id: string, payload: { displayNumber?: string; wabaId?: string; active?: boolean }) {
  const res = await fetch(`${API_BASE}/admin/whatsapp/configs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const txt = await res.text();
  handleUnauthorized(res);
  if (!res.ok) {
    try { const err = JSON.parse(txt); throw new Error(err?.error || "Falha ao atualizar configuração"); } catch { throw new Error("Falha ao atualizar configuração"); }
  }
  return JSON.parse(txt) as WhatsappConfigItem;
}

export async function deleteWhatsappConfig(id: string) {
  const res = await fetch(`${API_BASE}/admin/whatsapp/configs/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  const txt = await res.text();
  handleUnauthorized(res);
  if (!res.ok) {
    try { const err = JSON.parse(txt); throw new Error(err?.error || "Falha ao excluir configuração"); } catch { throw new Error("Falha ao excluir configuração"); }
  }
  return JSON.parse(txt) as { ok: boolean };
}
