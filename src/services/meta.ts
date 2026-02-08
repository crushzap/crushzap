const API_BASE = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");

export type MetaConfig = {
  enabled: boolean;
  pixelId: string | null;
};

export async function getMetaConfig(): Promise<MetaConfig> {
  const res = await fetch(`${API_BASE}/meta/config`);
  if (!res.ok) {
    return { enabled: false, pixelId: null };
  }
  const data = (await res.json()) as Partial<MetaConfig>;
  return {
    enabled: Boolean(data?.enabled),
    pixelId: (data?.pixelId || null) as string | null,
  };
}
