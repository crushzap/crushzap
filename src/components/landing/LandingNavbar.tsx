import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { Link } from "react-router-dom";

export function LandingNavbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/crushzap-logo.png" alt="CrushZap Logo" className="h-10 w-auto object-contain" />
        </Link>
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Recursos
          </a>
          <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Preços
          </a>
          <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Como Funciona
          </a>
        </div>
        <div className="flex items-center gap-3">
          <a href="https://wa.me/5511968988140?text=Oi,%20Crush.%20Quer%20namorar%20comigo?" target="_blank" rel="noopener noreferrer">
            <Button className="gradient-primary shadow-glow">Começar Grátis</Button>
          </a>
        </div>
      </div>
    </nav>
  );
}

