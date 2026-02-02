import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Plus, Edit2, Trash2, Sparkles, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listPersonas, PersonaAdminItem } from "@/services/personas";

function isUrl(v?: string | null) {
  const s = (v || "").toString();
  return s.startsWith("http://") || s.startsWith("https://");
}

function modeLabel(mode: PersonaAdminItem["responseMode"]) {
  if (mode === "audio") return "audio";
  if (mode === "both") return "ambos";
  return "texto";
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

export default function Personas() {
  const query = useQuery({
    queryKey: ["personas"],
    queryFn: listPersonas,
  });

  return (
    <DashboardLayout
      title="Personas"
      subtitle="Gerencie suas crushes"
      actions={
        <Button className="gap-2 gradient-primary shadow-glow hover:opacity-90 transition-opacity">
          <Plus className="h-4 w-4" />
          Nova Persona
        </Button>
      }
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
      >
        {(query.data || []).map((persona) => {
          const hasImg = isUrl(persona.avatar);
          const label = modeLabel(persona.responseMode);
          return (
            <motion.div key={persona.id} variants={cardVariants}>
              <Card className="group relative overflow-hidden shadow-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 rounded-full overflow-hidden bg-secondary flex items-center justify-center">
                        {hasImg ? (
                          <img src={persona.avatar as string} alt={persona.name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-3xl">{persona.avatar || "💜"}</span>
                        )}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">
                          {persona.name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>{persona.personality || "Personalidade"}</span>
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                    >
                      {label}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>{persona.userName || persona.userPhone || "Usuário"}</span>
                  </div>

                  <div className="flex items-center gap-4 mb-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Modo:</span>
                      <Badge variant="outline" className="capitalize">
                        {label}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-2"
                    >
                      <Edit2 className="h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <div className="absolute inset-0 gradient-hero" />
                </div>
              </Card>
            </motion.div>
          );
        })}

        <motion.div variants={cardVariants}>
          <Card className="group cursor-pointer border-2 border-dashed border-border hover:border-primary transition-all duration-300 hover:-translate-y-1">
            <CardContent className="flex flex-col items-center justify-center p-6 h-full min-h-[280px]">
              <div className="rounded-full bg-secondary p-4 mb-4 group-hover:bg-primary/10 transition-colors">
                <Plus className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                Criar Nova Persona
              </h3>
              <p className="text-sm text-muted-foreground text-center">
                Configure uma nova personalidade para sua Crush
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
}
