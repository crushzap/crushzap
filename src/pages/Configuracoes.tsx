import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { WhatsappConfigInput } from "@/domain/models";
import { saveWhatsappConfig } from "@/services/admin";
import { useMutation } from "@tanstack/react-query";

type WhatsappFormValues = {
  phoneNumberId: string;
  wabaId: string;
  verifyToken: string;
};

export default function Configuracoes() {
  const { toast } = useToast();

  const whatsappForm = useForm<WhatsappFormValues>({
    resolver: zodResolver(WhatsappConfigInput),
    defaultValues: { phoneNumberId: "", wabaId: "", verifyToken: "" },
  });


  const whatsappMutation = useMutation({
    mutationFn: saveWhatsappConfig,
    onSuccess: () => {
      toast({ title: "Configuração do WhatsApp salva" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar configuração do WhatsApp" });
    },
  });


  return (
    <DashboardLayout title="Configurações" subtitle="Integrações e provedores">
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">WhatsApp API Oficial</h3>
          <form
            className="space-y-4"
            onSubmit={whatsappForm.handleSubmit((values) => whatsappMutation.mutate(values))}
          >
            <div className="space-y-2">
              <Label htmlFor="phoneNumberId">Phone Number ID</Label>
              <Input id="phoneNumberId" {...whatsappForm.register("phoneNumberId")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wabaId">WABA ID</Label>
              <Input id="wabaId" {...whatsappForm.register("wabaId")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="verifyToken">Verify Token</Label>
              <Input id="verifyToken" {...whatsappForm.register("verifyToken")} />
            </div>
            <div className="text-xs text-muted-foreground">Tokens e segredos devem ser definidos via ambiente</div>
            <Button type="submit" className="w-full">Salvar</Button>
          </form>
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Provedor IA</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Configuração via ambiente:</p>
            <p><span className="font-medium">GROK_API_KEY</span> e <span className="font-medium">GROK_LLM_MODEL</span> no arquivo .env</p>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
