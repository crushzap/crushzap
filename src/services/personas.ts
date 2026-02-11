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

export type PersonaAdminItem = {
  id: string;
  userId: string;
  userPhone?: string;
  userName?: string | null;
  name: string;
  personality: string;
  avatar: string | null;
  responseMode: "text" | "audio" | "both";
  createdAt: string;
  updatedAt: string;
};

export async function listPersonas() {
  const res = await fetch(`${API_BASE}/admin/personas`, { headers: { ...authHeaders() } });
  handleUnauthorized(res);
  if (!res.ok) throw new Error("Falha ao listar personas");
  return res.json() as Promise<PersonaAdminItem[]>;
}
