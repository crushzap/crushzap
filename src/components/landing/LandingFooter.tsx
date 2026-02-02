import { Heart } from "lucide-react";
import { Link } from "react-router-dom";

export function LandingFooter() {
  return (
    <footer className="border-t border-border py-12">
      <div className="container mx-auto px-4">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
                <Heart className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-foreground">CrushZap</span>
            </div>
            <p className="mt-4 text-sm text-muted-foreground max-w-md">
              Conecte-se com segurança, rapidez e uma experiência moderna do começo ao fim.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">CNPJ: 23.401.774/0001-20</p>
          </div>

          <div className="md:col-span-3">
            <p className="text-sm font-semibold text-foreground">Produto</p>
            <nav className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
              <a href="#features" className="hover:text-foreground transition-colors">
                Recursos
              </a>
              <a href="#pricing" className="hover:text-foreground transition-colors">
                Planos
              </a>
              <a href="https://wa.me/5511968988140?text=Oi,%20Crush.%20Quer%20namorar%20comigo?" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                Acessar
              </a>
            </nav>
          </div>

          <div className="md:col-span-2">
            <p className="text-sm font-semibold text-foreground">Empresa</p>
            <nav className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
              <a href="#how-it-works" className="hover:text-foreground transition-colors">
                Como funciona
              </a>
              <a href="#cta" className="hover:text-foreground transition-colors">
                Começar agora
              </a>
            </nav>
          </div>

          <div className="md:col-span-2">
            <p className="text-sm font-semibold text-foreground">Legal</p>
            <nav className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">
                Termos de Uso
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Política de Privacidade
              </a>
            </nav>
          </div>
        </div>

        <div className="mt-10 flex flex-col md:flex-row items-center justify-between gap-3 border-t border-border pt-8">
          <p className="text-sm text-muted-foreground">© 2026 CrushZap. Todos os direitos reservados.</p>
          <p className="text-xs text-muted-foreground text-center md:text-right">
            As marcas e logotipos exibidos pertencem a seus respectivos proprietários.
          </p>
        </div>
      </div>
    </footer>
  );
}

