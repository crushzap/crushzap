import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function LandingPricingSection() {
  const plans = [
    {
      name: "Grátis",
      price: "0,00",
      period: "/teste",
      description: "Experimente sem compromisso",
      isPopular: false,
      features: [
        "10 mensagens de texto",
        "Respostas rápidas",
        "Personalidade customizável",
        "Acesso básico"
      ],
    },
    {
      name: "Plano Mensal",
      price: "29,90",
      period: "/mês",
      description: "A melhor experiência sem limites com economia de 42%",
      isPopular: true,
      features: [
        "500 mensagens de texto",
        "15 Fotos explícitas (Nudes)",
        "Áudios picantes",
        "1 Crush",
        "Roleplay avançado"
      ],
    },
    {
      name: "Plano Semanal",
      price: "12,90",
      period: "/semana",
      description: "Para quem quer curtir o momento",
      isPopular: false,
      features: [
        "100 mensagens de texto",
        "3 Fotos explícitas (Nudes)",
        "Áudios picantes",
        "1 Crush",
        "Roleplay avançado"
      ],
    },
  ];

  return (
    <section id="pricing" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <motion.h2 variants={itemVariants} className="text-4xl font-bold text-foreground mb-4">
            Escolha seu plano
          </motion.h2>
          <motion.p variants={itemVariants} className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Comece grátis com 10 mensagens. Depois, escolha o plano ideal para você.
          </motion.p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto"
        >
          {plans.map((plan, index) => (
            <motion.div key={index} variants={itemVariants}>
              <Card
                className={`relative h-full shadow-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1 ${
                  plan.isPopular ? "ring-2 ring-primary" : "border-0"
                }`}
              >
                {plan.isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="gradient-primary shadow-glow">Mais Popular</Badge>
                  </div>
                )}
                <CardContent className="flex flex-col h-full p-6 pt-8">
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-semibold text-foreground mb-1">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-sm text-muted-foreground">R$</span>
                      <span className="text-5xl font-bold text-foreground">{plan.price.split(",")[0]}</span>
                      <span className="text-lg text-muted-foreground">,{plan.price.split(",")[1]}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>

                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <div className="rounded-full bg-success/10 p-1">
                          <Check className="h-3 w-3 text-success" />
                        </div>
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <a href="https://wa.me/5511968988140?text=Oi,%20Crush.%20Quer%20namorar%20comigo?" target="_blank" rel="noopener noreferrer" className="mt-auto w-full">
                    <Button
                      className={`w-full ${plan.isPopular ? "gradient-primary shadow-glow" : ""}`}
                      variant={plan.isPopular ? "default" : "outline"}
                    >
                      Começar Grátis
                    </Button>
                  </a>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
