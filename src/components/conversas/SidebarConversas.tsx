import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/services/conversations";
import { Search } from "lucide-react";

function initialsFromNameOrPhone(nameOrPhone: string) {
  const cleaned = (nameOrPhone || "").trim();
  if (!cleaned) return "?";
  if (cleaned.startsWith("+")) return cleaned.replace(/\D/g, "").slice(-2) || "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "?";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return `${first}${second}`.toUpperCase();
}

function formatHora(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function SidebarConversas(props: {
  conversas: ConversationSummary[];
  conversaSelecionadaId: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (id: string) => void;
  isLoading?: boolean;
}) {
  const { conversas, conversaSelecionadaId, query, onQueryChange, onSelect, isLoading } = props;

  return (
    <div className="h-full w-[320px] shrink-0 border-r border-border bg-background">
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar conversa..."
            className="pl-9"
          />
        </div>
      </div>

      <ScrollArea className="h-[calc(100%-72px)]">
        <div className="px-2 pb-3">
          {isLoading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Carregando...</div>
          )}

          {!isLoading && conversas.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Sem conversas</div>
          )}

          {conversas.map((c) => {
            const nome = (c.userName || "").trim() || c.userPhone;
            const isActive = c.id === conversaSelecionadaId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  "w-full rounded-lg px-3 py-3 text-left transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/60"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                    {initialsFromNameOrPhone(nome)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-medium">{nome}</div>
                      <div className="shrink-0 text-xs text-muted-foreground">
                        {formatHora(c.lastMessageAt)}
                      </div>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {c.personaName}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

