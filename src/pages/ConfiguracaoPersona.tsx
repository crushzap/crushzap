import { useState } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { PersonaWizard } from "@/components/persona/PersonaWizard";
import { WhatsAppFlowPreview } from "@/components/persona/WhatsAppFlowPreview";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { 
  MessageSquare, 
  Settings, 
  Smartphone, 
  Play,
  ArrowRight,
  Info
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ConfiguracaoPersona() {
  const [showWizard, setShowWizard] = useState(false);
  const { toast } = useToast();

  const handleWizardComplete = (config: any) => {
    console.log("Persona configurada:", config);
    toast({
      title: "Persona configurada! 🎉",
      description: `${config.name} está pronta para conversar no WhatsApp.`,
    });
    setShowWizard(false);
  };

  return (
    <DashboardLayout title="Configuração de Persona" subtitle="Gerencie o fluxo de onboarding do WhatsApp">
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left - Info & Actions */}
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Smartphone className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold mb-2">Fluxo WhatsApp</h2>
                  <p className="text-muted-foreground text-sm mb-4">
                    O wizard de configuração de persona é executado diretamente no WhatsApp. 
                    O usuário final interage com o bot para configurar sua Crush.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-primary/50">
                      <MessageSquare className="w-3 h-3 mr-1" />
                      Interativo
                    </Badge>
                    <Badge variant="outline" className="border-accent/50">
                      <Settings className="w-3 h-3 mr-1" />
                      Configurável
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" />
                Como funciona
              </h3>
              <div className="space-y-4">
                {[
                  { step: 1, title: "Usuário inicia conversa", desc: "Ao enviar primeira mensagem, o fluxo de onboarding começa" },
                  { step: 2, title: "Escolha de personalidade", desc: "Bot apresenta opções via botões interativos do WhatsApp" },
                  { step: 3, title: "Nome e preferências", desc: "Usuário define nome e modo de resposta (texto/áudio)" },
                  { step: 4, title: "Persona ativada", desc: "Configuração salva e persona começa a interagir" },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">{item.step}</span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <Button 
              onClick={() => setShowWizard(true)}
              className="flex-1 gap-2 bg-gradient-primary hover:opacity-90"
            >
              <Settings className="w-4 h-4" />
              Testar Wizard (Admin)
            </Button>
            <Button variant="outline" className="flex-1 gap-2">
              <Play className="w-4 h-4" />
              Configurar Fluxo n8n
              <ArrowRight className="w-4 h-4" />
            </Button>
          </motion.div>
        </div>

        {/* Right - WhatsApp Preview */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col items-center"
        >
          <h3 className="text-sm font-medium text-muted-foreground mb-4">
            Preview do Fluxo no WhatsApp
          </h3>
          <WhatsAppFlowPreview />
        </motion.div>
      </div>

      {/* Wizard Modal */}
      {showWizard && (
        <PersonaWizard
          onComplete={handleWizardComplete}
          onCancel={() => setShowWizard(false)}
        />
      )}
    </DashboardLayout>
  );
}
