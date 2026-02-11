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

export type ClientItem = {
  id: string;
  name: string;
  phone: string;
  type: "cliente" | "lead";
  minutesRemaining: number;
  avatar?: string;
};

export async function listClients(search?: string, type?: "todos" | "lead" | "cliente") {
  const params = new URLSearchParams();
  if (search) params.append("search", search);
  if (type && type !== "todos") params.append("type", type);

  const res = await fetch(`${API_BASE}/admin/clients?${params.toString()}`, { headers: { ...authHeaders() } });
  handleUnauthorized(res);
  if (!res.ok) throw new Error("Falha ao listar clientes");
  return res.json() as Promise<ClientItem[]>;
}
