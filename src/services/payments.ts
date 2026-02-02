const API_BASE = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");

export type PixCheckoutRequest = {
  type: "assinatura" | "avulso";
  planId?: string;
  amount?: number;
  action?: string;
  credits?: number;
  userPhone?: string;
  phoneNumberId?: string;
  payerEmail?: string;
  payerName?: string;
};

export type PixCheckoutResponse = {
  checkoutId: string;
  qrCode?: string;
  qrCodeBase64?: string;
  copiaECola: string;
  expiresAt: string;
};

export async function createPixCheckout(payload: PixCheckoutRequest) {
  const res = await fetch(`${API_BASE}/pagamentos/pix/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error("Falha ao iniciar checkout PIX");
  }
  return res.json() as Promise<PixCheckoutResponse>;
}
