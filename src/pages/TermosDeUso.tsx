import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNavbar } from "@/components/landing/LandingNavbar";

export default function TermosDeUso() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main className="container mx-auto px-4 py-24 md:py-28">
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <header className="space-y-3">
            <h1 className="text-4xl font-bold text-foreground">Termos de Uso</h1>
            <p className="text-sm text-muted-foreground">Última atualização: 09/02/2026</p>
            <p className="text-muted-foreground">
              Estes Termos de Uso regulam o acesso e a utilização da plataforma CrushZap. Ao acessar ou usar o serviço,
              você concorda integralmente com estes termos.
            </p>
          </header>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Aceite e atualizações</h2>
            <p className="text-muted-foreground">
              Ao utilizar o CrushZap, você declara que leu, compreendeu e aceitou estes termos. Podemos atualizar este
              documento periodicamente, e o uso contínuo do serviço significa concordância com as mudanças.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. Elegibilidade e maioridade</h2>
            <p className="text-muted-foreground">
              O CrushZap é destinado exclusivamente a pessoas maiores de 18 anos. Ao usar a plataforma, você declara e
              garante ser maior de idade e plenamente capaz para contratar.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Consentimento +18 e conteúdo adulto</h2>
            <p className="text-muted-foreground">
              Ao utilizar o CrushZap, você declara que é maior de 18 anos e que consente com a possibilidade de
              interações com teor adulto. Você reconhece que é o único responsável pelo conteúdo que solicita,
              compartilha ou consome, inclusive quanto à adequação legal e moral.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Conta e veracidade das informações</h2>
            <p className="text-muted-foreground">
              Você é responsável por manter seus dados corretos e atualizados, bem como por toda atividade realizada a
              partir do seu acesso. Qualquer uso indevido, compartilhamento de credenciais ou acesso não autorizado deve
              ser comunicado imediatamente.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Uso permitido e condutas proibidas</h2>
            <p className="text-muted-foreground">Você concorda em usar o serviço de forma lícita e respeitosa. É proibido:</p>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li>Produzir, solicitar ou divulgar conteúdo que envolva menores de idade.</li>
              <li>Promover atividades ilegais, violência, exploração, assédio, discriminação ou ódio.</li>
              <li>Utilizar a plataforma para spam, fraudes ou engenharia social.</li>
              <li>Interferir na segurança, disponibilidade ou integridade do serviço.</li>
              <li>Usar dados de terceiros sem autorização ou violar direitos de propriedade intelectual.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Conteúdo e responsabilidade do usuário</h2>
            <p className="text-muted-foreground">
              O conteúdo produzido nas interações é de responsabilidade exclusiva do usuário que o solicita, fornece ou
              compartilha. Você assume total responsabilidade pelo uso do serviço e pelas consequências legais de suas
              escolhas.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Planos, pagamentos e cancelamento</h2>
            <p className="text-muted-foreground">
              A plataforma pode oferecer recursos gratuitos e pagos. Valores, limites e condições dos planos são
              informados no momento da contratação. O cancelamento segue as condições apresentadas durante a compra e
              pode impactar o acesso a funcionalidades.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Propriedade intelectual</h2>
            <p className="text-muted-foreground">
              Marcas, logos, interface e demais elementos do CrushZap são protegidos por lei e não podem ser copiados,
              modificados ou distribuídos sem autorização expressa.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">9. Isenções e limitação de responsabilidade</h2>
            <p className="text-muted-foreground">
              O serviço é disponibilizado conforme disponibilidade técnica. Não garantimos ausência de falhas ou
              interrupções. Na máxima extensão permitida pela lei, o CrushZap não se responsabiliza por danos diretos ou
              indiretos decorrentes do uso ou impossibilidade de uso da plataforma.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">10. Indenização</h2>
            <p className="text-muted-foreground">
              Você concorda em indenizar o CrushZap por perdas, danos, custos e despesas decorrentes de violações destes
              termos, uso indevido do serviço ou violação de direitos de terceiros.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">11. Suspensão e encerramento</h2>
            <p className="text-muted-foreground">
              Podemos suspender ou encerrar o acesso em caso de violação destes termos, suspeita de fraude, exigência
              legal ou risco à segurança do serviço, sem prejuízo das medidas cabíveis.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">12. Lei aplicável e foro</h2>
            <p className="text-muted-foreground">
              Estes termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro do domicílio do
              usuário para dirimir eventuais controvérsias, salvo disposição legal em contrário.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">13. Contato</h2>
            <p className="text-muted-foreground">
              Para dúvidas, solicitações ou comunicações legais, utilize o canal oficial do CrushZap disponível no
              WhatsApp.
            </p>
            <a
              className="text-primary underline hover:text-primary/90"
              href="https://wa.me/5511968988140?text=Oi,%20Crush.%20Preciso%20de%20ajuda%20com%20os%20termos."
              target="_blank"
              rel="noopener noreferrer"
            >
              Falar no WhatsApp
            </a>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
