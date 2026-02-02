import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ConversationMessage, ConversationSummary } from "@/services/conversations";
import { AudioMessagePlayer } from "@/components/conversas/AudioMessagePlayer";
import { SendHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function formatHora(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDia(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function ChatConversa(props: {
  conversa: ConversationSummary | null;
  mensagens: ConversationMessage[];
  isLoading?: boolean;
  erro?: unknown;
  onEnviar: (texto: string) => Promise<void>;
}) {
  const { conversa, mensagens, isLoading, erro, onEnviar } = props;
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const mensagensComSeparador = useMemo(() => {
    const out: Array<{ key: string; kind: "dia" | "msg"; value: string | ConversationMessage }> = [];
    let lastDay: string | null = null;
    for (const m of mensagens) {
      const day = formatDia(m.createdAt);
      if (day && day !== lastDay) {
        out.push({ key: `day:${day}`, kind: "dia", value: day });
        lastDay = day;
      }
      out.push({ key: m.id, kind: "msg", value: m });
    }
    return out;
  }, [mensagens]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
  }, [mensagens.length, conversa?.id]);

  async function handleEnviar() {
    const trimmed = texto.trim();
    if (!trimmed || !conversa) return;
    setEnviando(true);
    try {
      await onEnviar(trimmed);
      setTexto("");
    } finally {
      setEnviando(false);
    }
  }

  if (!conversa) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Selecione uma conversa para visualizar</div>
      </div>
    );
  }

  const nome = (conversa.userName || "").trim() || conversa.userPhone;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-16 items-center justify-between border-b border-border px-5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{nome}</div>
          <div className="truncate text-xs text-muted-foreground">{conversa.userPhone}</div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-5 py-5">
          {erro && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Falha ao carregar mensagens
            </div>
          )}

          {isLoading && <div className="text-sm text-muted-foreground">Carregando mensagens...</div>}

          {!isLoading && mensagens.length === 0 && (
            <div className="text-sm text-muted-foreground">Sem mensagens</div>
          )}

          <div className="space-y-2">
            {mensagensComSeparador.map((item) => {
              if (item.kind === "dia") {
                return (
                  <div key={item.key} className="flex justify-center py-3">
                    <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                      {item.value as string}
                    </div>
                  </div>
                );
              }

              const m = item.value as ConversationMessage;
              const isOut = m.direction === "out";
              return (
                <div key={item.key} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm",
                      isOut
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    )}
                  >
                    {m.type === "image" ? (
                      <div className="cursor-pointer" onClick={() => setZoomImage(m.content)}>
                        <img 
                          src={m.content} 
                          alt="Foto enviada" 
                          className="mb-1 w-48 rounded-lg object-cover transition-opacity hover:opacity-90" 
                        />
                      </div>
                    ) : m.type === "audio" ? (
                      m.content && /^https?:\/\//i.test(m.content) ? (
                        <AudioMessagePlayer url={m.content} className={cn(isOut ? "text-primary-foreground" : "")} />
                      ) : (
                        <div className="whitespace-pre-wrap break-words">
                          <span className="italic opacity-70 text-xs">[Áudio indisponível]</span>
                        </div>
                      )
                    ) : (
                      <div className="whitespace-pre-wrap break-words">
                        {m.content && m.content.trim() ? (
                          m.content
                        ) : (
                          <span className="italic opacity-70 text-xs">[Conteúdo não suportado]</span>
                        )}
                      </div>
                    )}
                    <div className={cn("mt-1 text-[11px]", isOut ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {formatHora(m.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border bg-background p-4">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Mensagem"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleEnviar();
              }
            }}
          />
          <Button onClick={() => void handleEnviar()} disabled={enviando || !texto.trim()}>
            <SendHorizontal className="h-4 w-4" />
            Enviar
          </Button>
        </div>
      </div>

      <Dialog open={!!zoomImage} onOpenChange={(open) => !open && setZoomImage(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] w-auto h-auto p-0 border-none bg-transparent shadow-none">
          <DialogTitle className="sr-only">Visualização de Imagem</DialogTitle>
          {zoomImage && (
            <div className="relative flex items-center justify-center w-full h-full">
               <img 
                 src={zoomImage} 
                 alt="Zoom" 
                 className="max-w-[90vw] max-h-[85vh] object-contain rounded-md" 
               />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
