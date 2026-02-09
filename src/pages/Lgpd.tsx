import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNavbar } from "@/components/landing/LandingNavbar";

export default function Lgpd() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main className="container mx-auto px-4 py-24 md:py-28">
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <header className="space-y-3">
            <h1 className="text-4xl font-bold text-foreground">LGPD</h1>
            <p className="text-sm text-muted-foreground">Última atualização: 09/02/2026</p>
            <p className="text-muted-foreground">
              Este documento resume como o CrushZap trata dados pessoais conforme a Lei Geral de Proteção de Dados
              (Lei nº 13.709/2018).
            </p>
          </header>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Controlador e canal de atendimento</h2>
            <p className="text-muted-foreground">
              O CrushZap atua como controlador dos dados pessoais tratados na plataforma. Para dúvidas ou solicitações
              relacionadas à LGPD, utilize o canal oficial no WhatsApp.
            </p>
            <a
              className="text-primary underline hover:text-primary/90"
              href="https://wa.me/5511968988140?text=Oi,%20Crush.%20Preciso%20de%20suporte%20LGPD."
              target="_blank"
              rel="noopener noreferrer"
            >
              Falar no WhatsApp
            </a>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. Bases legais</h2>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li>Execução de contrato para prestação do serviço.</li>
              <li>Cumprimento de obrigação legal ou regulatória.</li>
              <li>Legítimo interesse para segurança, prevenção de fraudes e melhorias.</li>
              <li>Consentimento quando exigido por lei.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Direitos do titular</h2>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li>Confirmar a existência de tratamento.</li>
              <li>Acessar, corrigir e atualizar dados.</li>
              <li>Solicitar portabilidade, anonimização, bloqueio ou eliminação.</li>
              <li>Requerer informações sobre compartilhamento.</li>
              <li>Revogar consentimento quando aplicável.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Retenção e descarte</h2>
            <p className="text-muted-foreground">
              Mantemos dados pelo tempo necessário para cumprir as finalidades do tratamento, obrigações legais e
              proteção de direitos do CrushZap. Após o prazo, os dados são excluídos ou anonimizados.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Compartilhamento</h2>
            <p className="text-muted-foreground">
              O compartilhamento ocorre com parceiros essenciais para operação do serviço, como provedores de
              infraestrutura e meios de pagamento, sempre com medidas de proteção adequadas.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Segurança e boas práticas</h2>
            <p className="text-muted-foreground">
              Aplicamos controles técnicos e organizacionais para proteger dados pessoais, incluindo monitoramento,
              controles de acesso e gestão de incidentes.
            </p>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
