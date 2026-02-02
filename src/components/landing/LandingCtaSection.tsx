import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export function LandingCtaSection() {
  return (
    <section id="cta" className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 gradient-primary opacity-10" />
      <div className="container relative mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">Pronto para conhecer sua Crush?</h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Junte-se a milhares de pessoas que já encontraram companhia e diversão com nossa plataforma.
          </p>
          <a href="https://wa.me/5511968988140?text=Oi,%20Crush.%20Quer%20namorar%20comigo?" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="gradient-primary shadow-glow text-lg px-10 h-14 gap-2">
              Começar Agora – É Grátis
              <ArrowRight className="h-5 w-5" />
            </Button>
          </a>
        </motion.div>
      </div>
    </section>
  );
}

