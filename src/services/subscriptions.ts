const API_BASE = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");

function authHeaders() {
  const token = localStorage.getItem("cz_admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type SubscriptionItem = {
  id: string;
  userPhone: string;
  planName: string;
  status: string;
  currentPeriodEnd: string;
};

export async function listSubscriptions() {
  const res = await fetch(`${API_BASE}/admin/assinaturas`, { headers: { ...authHeaders() } });
  if (!res.ok) {
    throw new Error("Falha ao listar assinaturas");
  }
  return res.json() as Promise<SubscriptionItem[]>;
}
