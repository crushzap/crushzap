import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNavbar } from "@/components/landing/LandingNavbar";

export default function PoliticaDePrivacidade() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main className="container mx-auto px-4 py-24 md:py-28">
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <header className="space-y-3">
            <h1 className="text-4xl font-bold text-foreground">Política de Privacidade</h1>
            <p className="text-sm text-muted-foreground">Última atualização: 09/02/2026</p>
            <p className="text-muted-foreground">
              Esta Política explica como coletamos, usamos e protegemos dados pessoais relacionados ao uso do CrushZap.
            </p>
          </header>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Dados coletados</h2>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li>Dados de cadastro e identificação necessários para o acesso ao serviço.</li>
              <li>Dados de uso e interação com a plataforma e com as funcionalidades oferecidas.</li>
              <li>Dados de comunicação enviados por você durante o atendimento.</li>
              <li>Dados de pagamento e assinatura quando aplicável, processados por parceiros.</li>
              <li>Dados técnicos como endereço IP, navegador e dispositivo.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. Finalidades do tratamento</h2>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li>Fornecer e manter o serviço contratado.</li>
              <li>Garantir segurança, prevenir fraudes e cumprir obrigações legais.</li>
              <li>Personalizar experiências e melhorar funcionalidades.</li>
              <li>Enviar comunicações operacionais e de suporte.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Bases legais</h2>
            <p className="text-muted-foreground">
              O tratamento de dados é realizado com base em execução de contrato, cumprimento de obrigação legal,
              legítimo interesse e, quando aplicável, consentimento.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Compartilhamento de dados</h2>
            <p className="text-muted-foreground">
              Podemos compartilhar dados com provedores de tecnologia, parceiros de pagamento e autoridades legais
              quando necessário. O compartilhamento ocorre apenas para as finalidades previstas e com salvaguardas
              adequadas.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Armazenamento e retenção</h2>
            <p className="text-muted-foreground">
              Os dados são armazenados pelo tempo necessário para cumprir as finalidades informadas, obrigações legais
              ou regulatórias, e para resguardar direitos do CrushZap.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Segurança</h2>
            <p className="text-muted-foreground">
              Adotamos medidas técnicas e organizacionais para proteger seus dados contra acesso não autorizado, perda
              ou uso indevido.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Cookies e tecnologias similares</h2>
            <p className="text-muted-foreground">
              Utilizamos cookies e tecnologias similares para melhorar sua experiência, medir desempenho e oferecer
              funcionalidades essenciais. Você pode ajustar as permissões no seu navegador.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Direitos do titular</h2>
            <p className="text-muted-foreground">
              Você pode solicitar confirmação de tratamento, acesso, correção, portabilidade, anonimização, exclusão e
              informações sobre compartilhamento, conforme a legislação aplicável.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">9. Transferência internacional</h2>
            <p className="text-muted-foreground">
              Caso seja necessário transferir dados para fora do Brasil, adotaremos medidas contratuais e técnicas para
              garantir a proteção adequada.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">10. Menores de idade</h2>
            <p className="text-muted-foreground">
              O CrushZap é exclusivo para maiores de 18 anos. Não coletamos intencionalmente dados de menores.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">11. Contato</h2>
            <p className="text-muted-foreground">
              Para exercer seus direitos ou esclarecer dúvidas sobre privacidade, utilize o canal oficial do CrushZap
              no WhatsApp.
            </p>
            <a
              className="text-primary underline hover:text-primary/90"
              href="https://wa.me/5511968988140?text=Oi,%20Crush.%20Tenho%20d%C3%BAvidas%20sobre%20privacidade."
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
