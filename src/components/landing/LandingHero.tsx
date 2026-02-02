import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, Heart, Play, Sparkles, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { WhatsAppFlowPreview } from "@/components/persona/WhatsAppFlowPreview";

export function LandingHero() {
  return (
    <section className="relative pt-32 pb-20 overflow-hidden">
      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary/5 blur-3xl" />

      <div className="container relative mx-auto px-4">
        <div className="grid gap-12 lg:grid-cols-2 items-center">
          {/* Esquerda: Texto */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge className="mb-6 gradient-accent text-accent-foreground">
              <Sparkles className="h-3 w-3 mr-1" />
              10 mensagens grátis para começar
            </Badge>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-6">
              Sua Crush virtual <span className="text-gradient">perfeita</span>
            </h1>

            <p className="text-xl text-muted-foreground mb-8 max-w-2xl">
              Personalize sua Crush do jeito que você quiser, receba áudios, fotos (explícitas) e textos sempre que desejar! Escolha a personalidade e deixe ela safada, sem pudores, carinhosa, meiga, gentil é só escolher a sua Crush Perfeita.
            </p>

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
              <a href="https://wa.me/5511968988140?text=Oi,%20Crush.%20Quer%20namorar%20comigo?" target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="gradient-primary shadow-glow text-lg px-8 h-14 gap-2">
                  Criar minha Crush
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </a>
            </div>

            <div className="mt-12 flex items-center gap-8">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent border-2 border-background"
                    />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">+2.500 usuários ativos</span>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-warning text-warning" />
                ))}
                <span className="text-sm text-muted-foreground ml-1">4.9/5</span>
              </div>
            </div>
          </motion.div>

          {/* Direita: Fluxo Simulado do WhatsApp */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex justify-center lg:justify-end"
          >
            <WhatsAppFlowPreview personaName="Luna" className="w-full max-w-sm" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
