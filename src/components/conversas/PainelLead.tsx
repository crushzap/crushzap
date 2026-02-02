import type { ConversationSummary } from "@/services/conversations";

function formatDataHora(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

export function PainelLead(props: { conversa: ConversationSummary | null }) {
  const { conversa } = props;

  return (
    <div className="h-full w-[320px] shrink-0 border-l border-border bg-background">
      <div className="flex h-16 items-center border-b border-border px-5">
        <div className="text-sm font-semibold">Informações do lead</div>
      </div>

      <div className="space-y-5 p-5">
        {!conversa && (
          <div className="text-sm text-muted-foreground">Selecione uma conversa</div>
        )}

        {conversa && (
          <>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Nome</div>
              <div className="text-sm font-medium">
                {(conversa.userName || "").trim() || "Sem nome"}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">WhatsApp</div>
              <div className="text-sm font-medium">{conversa.userPhone}</div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Persona</div>
              <div className="text-sm font-medium">{conversa.personaName}</div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Mensagens</div>
              <div className="text-sm font-medium">{conversa.messagesCount}</div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Criado em</div>
              <div className="text-sm font-medium">{formatDataHora(conversa.createdAt)}</div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Última mensagem</div>
              <div className="text-sm font-medium">{formatDataHora(conversa.lastMessageAt)}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

