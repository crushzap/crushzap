import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { 
  Heart, 
  Sparkles, 
  Moon, 
  Sun, 
  Smile, 
  Zap,
  ArrowRight,
  ArrowLeft,
  Check,
  Volume2,
  MessageSquare,
  Upload,
  User
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PersonaConfig {
  personality: string;
  name: string;
  avatar: string | null;
  responseMode: "text" | "audio" | "both";
  voiceSettings: {
    pitch: number;
    speed: number;
  };
}

interface PersonaWizardProps {
  onComplete: (config: PersonaConfig) => void;
  onCancel: () => void;
  initialConfig?: Partial<PersonaConfig>;
}

const personalities = [
  { id: "carinhosa", name: "Carinhosa", icon: Heart, color: "text-pink-500", description: "Amorosa, atenciosa e sempre presente" },
  { id: "sarcastica", name: "Sarcástica", icon: Zap, color: "text-amber-500", description: "Espirituosa, inteligente e com humor afiado" },
  { id: "timida", name: "Tímida", icon: Moon, color: "text-indigo-400", description: "Doce, reservada e misteriosa" },
  { id: "extrovertida", name: "Extrovertida", icon: Sun, color: "text-orange-500", description: "Animada, divertida e cheia de energia" },
  { id: "romantica", name: "Romântica", icon: Sparkles, color: "text-rose-400", description: "Poética, sonhadora e apaixonada" },
  { id: "brincalhona", name: "Brincalhona", icon: Smile, color: "text-emerald-500", description: "Divertida, leve e sempre alegre" },
];

const avatarOptions = [
  "https://api.dicebear.com/7.x/lorelei/svg?seed=Luna&backgroundColor=ffdfbf",
  "https://api.dicebear.com/7.x/lorelei/svg?seed=Sofia&backgroundColor=ffd5dc",
  "https://api.dicebear.com/7.x/lorelei/svg?seed=Mia&backgroundColor=d1d4f9",
  "https://api.dicebear.com/7.x/lorelei/svg?seed=Ana&backgroundColor=c0aede",
  "https://api.dicebear.com/7.x/lorelei/svg?seed=Clara&backgroundColor=b6e3f4",
  "https://api.dicebear.com/7.x/lorelei/svg?seed=Julia&backgroundColor=ffeaa7",
];

export function PersonaWizard({ onComplete, onCancel, initialConfig }: PersonaWizardProps) {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<PersonaConfig>({
    personality: initialConfig?.personality || "",
    name: initialConfig?.name || "",
    avatar: initialConfig?.avatar || null,
    responseMode: initialConfig?.responseMode || "both",
    voiceSettings: initialConfig?.voiceSettings || { pitch: 50, speed: 50 },
  });

  const canProceed = () => {
    switch (step) {
      case 1: return config.personality !== "";
      case 2: return config.name.trim() !== "" && config.avatar !== null;
      case 3: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else onComplete(config);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-card rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Progress Bar */}
        <div className="bg-muted/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Passo {step} de 3</span>
            <span className="text-sm font-medium text-primary">
              {step === 1 && "Personalidade"}
              {step === 2 && "Identidade"}
              {step === 3 && "Configurações"}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-primary"
              initial={{ width: 0 }}
              animate={{ width: `${(step / 3) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[400px]">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="text-2xl font-bold mb-2">Escolha a personalidade</h2>
                <p className="text-muted-foreground mb-6">
                  Defina como sua Crush vai interagir com você
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {personalities.map((p) => {
                    const Icon = p.icon;
                    const isSelected = config.personality === p.id;
                    return (
                      <motion.button
                        key={p.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setConfig({ ...config, personality: p.id })}
                        className={cn(
                          "p-4 rounded-xl border-2 text-left transition-all",
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <Icon className={cn("w-6 h-6 mb-2", p.color)} />
                        <h3 className="font-semibold">{p.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {p.description}
                        </p>
                        {isSelected && (
                          <Badge className="mt-2 bg-primary">Selecionada</Badge>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="text-2xl font-bold mb-2">Defina a identidade</h2>
                <p className="text-muted-foreground mb-6">
                  Escolha o nome e avatar da sua Crush
                </p>

                <div className="space-y-6">
                  <div>
                    <Label htmlFor="name" className="text-base">Nome</Label>
                    <Input
                      id="name"
                      value={config.name}
                      onChange={(e) => setConfig({ ...config, name: e.target.value })}
                      placeholder="Ex: Luna, Sofia, Ana..."
                      className="mt-2 h-12 text-lg"
                    />
                  </div>

                  <div>
                    <Label className="text-base">Avatar</Label>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-3">
                      {avatarOptions.map((avatar, index) => (
                        <motion.button
                          key={index}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setConfig({ ...config, avatar })}
                          className={cn(
                            "relative rounded-full overflow-hidden border-4 transition-all",
                            config.avatar === avatar
                              ? "border-primary shadow-lg shadow-primary/30"
                              : "border-transparent hover:border-primary/30"
                          )}
                        >
                          <img
                            src={avatar}
                            alt={`Avatar ${index + 1}`}
                            className="w-full aspect-square object-cover"
                          />
                          {config.avatar === avatar && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                              <Check className="w-6 h-6 text-primary" />
                            </div>
                          )}
                        </motion.button>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" className="mt-3 gap-2">
                      <Upload className="w-4 h-4" />
                      Enviar foto personalizada
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="text-2xl font-bold mb-2">Modo de resposta</h2>
                <p className="text-muted-foreground mb-6">
                  Configure como deseja receber as mensagens
                </p>

                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: "text", label: "Apenas Texto", icon: MessageSquare },
                      { id: "audio", label: "Apenas Áudio", icon: Volume2 },
                      { id: "both", label: "Texto e Áudio", icon: Sparkles },
                    ].map((mode) => {
                      const Icon = mode.icon;
                      const isSelected = config.responseMode === mode.id;
                      return (
                        <motion.button
                          key={mode.id}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setConfig({ ...config, responseMode: mode.id as any })}
                          className={cn(
                            "p-4 rounded-xl border-2 text-center transition-all",
                            isSelected
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          <Icon className={cn("w-6 h-6 mx-auto mb-2", isSelected ? "text-primary" : "text-muted-foreground")} />
                          <span className="text-sm font-medium">{mode.label}</span>
                        </motion.button>
                      );
                    })}
                  </div>

                  {(config.responseMode === "audio" || config.responseMode === "both") && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="space-y-4 p-4 bg-muted/50 rounded-xl"
                    >
                      <h3 className="font-semibold flex items-center gap-2">
                        <Volume2 className="w-4 h-4" />
                        Configurações de Voz
                      </h3>

                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between mb-2">
                            <Label>Tom de voz</Label>
                            <span className="text-sm text-muted-foreground">
                              {config.voiceSettings.pitch < 40 ? "Grave" : config.voiceSettings.pitch > 60 ? "Agudo" : "Normal"}
                            </span>
                          </div>
                          <Slider
                            value={[config.voiceSettings.pitch]}
                            onValueChange={(v) => setConfig({
                              ...config,
                              voiceSettings: { ...config.voiceSettings, pitch: v[0] }
                            })}
                            max={100}
                            step={1}
                          />
                        </div>

                        <div>
                          <div className="flex justify-between mb-2">
                            <Label>Velocidade</Label>
                            <span className="text-sm text-muted-foreground">
                              {config.voiceSettings.speed < 40 ? "Lenta" : config.voiceSettings.speed > 60 ? "Rápida" : "Normal"}
                            </span>
                          </div>
                          <Slider
                            value={[config.voiceSettings.speed]}
                            onValueChange={(v) => setConfig({
                              ...config,
                              voiceSettings: { ...config.voiceSettings, speed: v[0] }
                            })}
                            max={100}
                            step={1}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Preview */}
                  <div className="p-4 bg-muted/30 rounded-xl">
                    <h3 className="font-semibold mb-3">Resumo da Configuração</h3>
                    <div className="flex items-center gap-4">
                      {config.avatar && (
                        <img src={config.avatar} alt="Avatar" className="w-16 h-16 rounded-full border-2 border-primary" />
                      )}
                      <div>
                        <p className="font-medium text-lg">{config.name || "Sem nome"}</p>
                        <p className="text-sm text-muted-foreground">
                          Personalidade: {personalities.find(p => p.id === config.personality)?.name || "Não selecionada"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Modo: {config.responseMode === "text" ? "Texto" : config.responseMode === "audio" ? "Áudio" : "Texto e Áudio"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="bg-muted/30 p-4 flex justify-between">
          <Button variant="ghost" onClick={handleBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {step === 1 ? "Cancelar" : "Voltar"}
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="gap-2 bg-gradient-primary hover:opacity-90"
          >
            {step === 3 ? "Concluir" : "Próximo"}
            {step === 3 ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
