import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { SidebarConversas } from "@/components/conversas/SidebarConversas";
import { ChatConversa } from "@/components/conversas/ChatConversa";
import { PainelLead } from "@/components/conversas/PainelLead";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { enviarMensagemWhatsapp, listConversationMessages, listConversations } from "@/services/conversations";

export default function Conversas() {
  const [query, setQuery] = useState("");
  const [conversaSelecionadaId, setConversaSelecionadaId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["conversas", query],
    queryFn: () => listConversations(query),
  });

  const conversas = useMemo(() => data || [], [data]);
  const conversaSelecionada = useMemo(
    () => conversas.find((c) => c.id === conversaSelecionadaId) || null,
    [conversas, conversaSelecionadaId]
  );

  useEffect(() => {
    if (!conversaSelecionadaId && conversas.length > 0) {
      setConversaSelecionadaId(conversas[0].id);
    }
    if (conversaSelecionadaId && conversas.length > 0 && !conversas.some((c) => c.id === conversaSelecionadaId)) {
      setConversaSelecionadaId(conversas[0].id);
    }
  }, [conversaSelecionadaId, conversas]);

  const mensagensQuery = useQuery({
    queryKey: ["conversas", conversaSelecionadaId, "mensagens"],
    queryFn: () => listConversationMessages(conversaSelecionadaId as string, 200),
    enabled: Boolean(conversaSelecionadaId),
    refetchInterval: 5000,
  });

  async function handleEnviar(texto: string) {
    if (!conversaSelecionada) return;
    await enviarMensagemWhatsapp({ to: conversaSelecionada.userPhone, content: texto, type: "text" });
    await queryClient.invalidateQueries({ queryKey: ["conversas", conversaSelecionadaId, "mensagens"] });
    await queryClient.invalidateQueries({ queryKey: ["conversas", query] });
  }

  return (
    <DashboardLayout title="Conversas" subtitle="Histórico e moderação">
      <div className="h-[calc(100vh-64px-64px)] rounded-xl border border-border overflow-hidden bg-background flex">
        <SidebarConversas
          conversas={conversas}
          conversaSelecionadaId={conversaSelecionadaId}
          query={query}
          onQueryChange={setQuery}
          onSelect={setConversaSelecionadaId}
          isLoading={isLoading}
        />

        <ChatConversa
          conversa={conversaSelecionada}
          mensagens={mensagensQuery.data || []}
          isLoading={mensagensQuery.isLoading}
          erro={mensagensQuery.error}
          onEnviar={handleEnviar}
        />

        <PainelLead conversa={conversaSelecionada} />
      </div>
    </DashboardLayout>
  );
}
