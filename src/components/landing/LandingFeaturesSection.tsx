import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Heart, MessageCircle, Mic, Shield, Camera, Drama } from "lucide-react";

const features = [
  {
    icon: Heart,
    title: "Personalidade Única",
    description: "Configure o tom, estilo e personalidade da sua Crush exatamente como você deseja.",
  },
  {
    icon: MessageCircle,
    title: "Via WhatsApp",
    description: "Converse naturalmente pelo WhatsApp, sem apps extras. Sua Crush sempre disponível.",
  },
  {
    icon: Mic,
    title: "Áudio & Texto",
    description: "Receba respostas em texto ou áudio com voz natural. Escolha o modo que preferir.",
  },
  {
    icon: Shield,
    title: "Privacidade Total",
    description: "Suas conversas são criptografadas e privadas. Ninguém além de você terá acesso.",
  },
  {
    icon: Camera,
    title: "Imagens",
    description: "Receba fotos nudes explícitos da sua Crush sempre que quiser.",
  },
  {
    icon: Drama,
    title: "Roleplays",
    description: "Tenha roleplays da forma que desejar: adultos, serios, romanticos e etc.",
  },
];

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

export function LandingFeaturesSection() {
  return (
    <section id="features" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <motion.h2 variants={itemVariants} className="text-4xl font-bold text-foreground mb-4">
            Tudo que você precisa
          </motion.h2>
          <motion.p variants={itemVariants} className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Uma experiência completa de companhia virtual, com recursos pensados para você
          </motion.p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((feature, index) => (
            <motion.div key={index} variants={itemVariants}>
              <Card className="h-full shadow-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-0">
                <CardContent className="p-6">
                  <div className="rounded-xl gradient-primary w-12 h-12 flex items-center justify-center mb-4 shadow-glow">
                    <feature.icon className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

