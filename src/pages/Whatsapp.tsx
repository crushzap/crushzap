import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createWhatsappConfig, listWhatsappConfigs, WhatsappConfigItem, updateWhatsappConfig, deleteWhatsappConfig } from "@/services/admin";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Copy, Phone } from "lucide-react";
import { useState } from "react";

type CreateValues = { phoneNumberId: string; displayNumber?: string; wabaId: string };

export default function Whatsapp() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WhatsappConfigItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<WhatsappConfigItem | null>(null);

  const form = useForm<CreateValues>({
    defaultValues: { phoneNumberId: "", displayNumber: "", wabaId: "" },
  });

  const query = useQuery({
    queryKey: ["whatsapp-configs"],
    queryFn: listWhatsappConfigs,
  });

  const mutation = useMutation({
    mutationFn: (payload: CreateValues) => editing ? updateWhatsappConfig(editing.id, payload) : createWhatsappConfig(payload),
    onSuccess: () => {
      toast({ title: editing ? "Configuração salva" : "Configuração criada" });
      setOpen(false);
      form.reset();
      setEditing(null);
      query.refetch();
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string"
          ? String((err as { message?: unknown }).message)
          : "Falha ao criar";
      toast({ title: message });
    },
  });

  const handleCopy = async (text?: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      toast({ title: "Não foi possível copiar" });
    }
  };

  return (
    <DashboardLayout title="Configurações do WhatsApp" subtitle="Números e webhooks">
      <div className="flex justify-between items-center mb-4">
        <div />
        <Button onClick={() => { setEditing(null); setOpen(true); }}>Adicionar Configuração</Button>
      </div>

      <div className="grid gap-4">
        {query.data?.map((cfg: WhatsappConfigItem) => (
          <Card key={cfg.id} className="p-4 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <Phone className="w-4 h-4" />
                  <span>{cfg.displayNumber || cfg.phoneNumberId}</span>
                </div>
                <div className="text-sm text-muted-foreground">ID: {cfg.phoneNumberId}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setEditing(cfg); setOpen(true); form.reset({ phoneNumberId: cfg.phoneNumberId, displayNumber: cfg.displayNumber || "", wabaId: cfg.wabaId }); }}>Editar</Button>
                <Button variant="destructive" onClick={() => { setDeleting(cfg); setDeleteOpen(true); }}>Excluir</Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm">Webhook: {cfg.webhookUrl || "Indisponível"}
                {cfg.webhookUrl && (
                  <Button variant="ghost" size="icon" className="ml-2" onClick={() => handleCopy(cfg.webhookUrl)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="text-sm">Token de Verificação: {cfg.verifyToken}
                <Button variant="ghost" size="icon" className="ml-2" onClick={() => handleCopy(cfg.verifyToken)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Configuração" : "Nova Configuração"}</DialogTitle>
          </DialogHeader>

          <form className="space-y-4" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
            <div className="space-y-2">
              <Label htmlFor="phoneNumberId">ID do Número</Label>
              <Input id="phoneNumberId" disabled={Boolean(editing)} {...form.register("phoneNumberId")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayNumber">Número de Exibição</Label>
              <Input id="displayNumber" {...form.register("displayNumber")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wabaId">Waba ID</Label>
              <Input id="wabaId" {...form.register("wabaId")} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setOpen(false); setEditing(null); }}>Cancelar</Button>
              <Button type="submit" disabled={mutation.isPending}>{editing ? "Salvar" : "Criar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={(v) => { setDeleteOpen(v); if (!v) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Configuração</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `Você está prestes a excluir o número ${deleting.displayNumber || deleting.phoneNumberId}. Esta ação não pode ser desfeita.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!deleting) return;
              try {
                await deleteWhatsappConfig(deleting.id);
                toast({ title: "Configuração excluída" });
                query.refetch();
              } catch (e: unknown) {
                const message =
                  e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string"
                    ? String((e as { message?: unknown }).message)
                    : "Falha ao excluir";
                toast({ title: message });
              }
              setDeleteOpen(false);
              setDeleting(null);
            }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
