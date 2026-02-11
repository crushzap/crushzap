const API_BASE = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");

function handleUnauthorized(res: Response) {
  if (res.status === 401) {
    try {
      localStorage.removeItem("cz_admin_token");
    } catch (error) {
      return;
    }
    if (typeof window !== "undefined") window.location.href = "/entrar";
    throw new Error("Não autorizado");
  }
}

function authHeaders() {
  const token = localStorage.getItem("cz_admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type ConversationSummary = {
  id: string;
  userPhone: string;
  userName?: string | null;
  personaName: string;
  messagesCount: number;
  createdAt: string;
  lastMessageAt: string;
};

export async function listConversations(query?: string) {
  const url = `${API_BASE}/admin/conversas${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  const res = await fetch(url, { headers: { ...authHeaders() } });
  handleUnauthorized(res);
  if (!res.ok) {
    throw new Error("Falha ao listar conversas");
  }
  return res.json() as Promise<ConversationSummary[]>;
}

export type ConversationMessage = {
  id: string;
  direction: "in" | "out";
  type: "text" | "audio" | "image";
  content: string;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  createdAt: string;
};

export async function listConversationMessages(conversationId: string, take = 200) {
  const url = `${API_BASE}/admin/conversas/${encodeURIComponent(conversationId)}/mensagens?take=${encodeURIComponent(String(take))}`;
  const res = await fetch(url, { headers: { ...authHeaders() } });
  handleUnauthorized(res);
  if (!res.ok) {
    throw new Error("Falha ao listar mensagens");
  }
  return res.json() as Promise<ConversationMessage[]>;
}

export async function enviarMensagemWhatsapp(payload: { to: string; content: string; type?: "text" | "audio" }) {
  const res = await fetch(`${API_BASE}/whatsapp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  handleUnauthorized(res);
  if (!res.ok) {
    throw new Error("Falha ao enviar mensagem");
  }
  return res.json() as Promise<{ id: string }>;
}
