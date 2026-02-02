# Plano de Refatoração do `server/index.mjs` (sem quebrar nada)

Este documento descreve um plano **por etapas** para refatorar o arquivo `server/index.mjs`, que hoje concentra múltiplas responsabilidades (rotas, integrações, fluxos de WhatsApp, onboarding, billing, upgrade, admin e Mercado Pago).

## Legenda de status das etapas
- 🔴 = não iniciado
- 🟡 = em andamento
- ✅ = concluído

Regra de atualização: **cada etapa começa com 🔴**. Quando eu iniciar uma etapa, mudo para 🟡. Quando finalizar e validar, mudo para ✅.

---

## Regras rígidas (não negociáveis)
1. **Não alterar comportamento**: o sistema deve continuar funcionando exatamente como hoje.
2. **Não mudar rotas existentes** sem uma etapa específica e aprovada para isso.
3. **Não mudar contrato de resposta** (status HTTP, shape de JSON, mensagens enviadas no WhatsApp) sem aprovação explícita.
4. **Não mudar regras de negócio** de:
   - onboarding
   - billing (renovação/upgrade/avulso)
   - upgrade
   - comandos
   - controle de trial/assinatura/limites
5. **Não mudar persistência** (tabelas/colunas/semântica) e **não executar reset de banco**.
6. **Nunca executar comandos `npx prisma`** nem qualquer ação que resete o banco.
7. **Refatoração incremental**: mover código primeiro, melhorar depois. Cada etapa deve ser “pequena” e validável.
8. **Sem comentários novos no código**, a menos que você peça.
9. **Compatível com Windows/PowerShell** (sem `&&`).
10. **Erros de Redis e erros de auth do client podem ser ignorados** conforme regras do projeto.

---

## Critérios de validação (obrigatórios em toda etapa)
Ao concluir uma etapa (marcar ✅), deve ser verdadeiro que:
- `npx tsc --noEmit` passa (0 erros).
- `node --check server/index.mjs` (e dos novos módulos tocados) passa.
- Rotas principais continuam respondendo:
  - webhook WhatsApp (GET verify e POST receive)
  - admin (login + rotas principais)
  - pagamentos (checkout pix + webhook Mercado Pago)

---

## Estrutura alvo (resultado final esperado)
Separar o monólito em:
- **Infra/Bootstrap**: criação do app, prisma, middlewares, jobs.
- **Integrações**: WhatsApp (cliente e parser), Grok, Mercado Pago.
- **Rotas**: `admin`, `whatsapp`, `pagamentos`.
- **Fluxos WhatsApp (componentes)**: um módulo por fluxo (comandos, onboarding, billing, upgrade, conversa/agente).
- **Persistência de mensagens**: helpers para garantir que mensagens de “comandos” não poluam `message`.

---

## Etapas (por ordem de execução)

### ✅ Etapa 0 — Linha de base e travas de segurança
**Objetivo**: garantir um “baseline” antes de mexer.
- Rodar validações base (TypeScript e check Node).
- Mapear rapidamente rotas existentes e seus caminhos (somente inventário).
- Confirmar que o comportamento atual do webhook WhatsApp e dos fluxos está operacional.

**Saída esperada**
- Documento de inventário mínimo (neste arquivo) atualizado com lista de rotas.
- Nenhuma mudança funcional.

**Validação**
- `npx tsc --noEmit`
- `node --check server/index.mjs`

---

### ✅ Etapa 1 — Extrair Integração WhatsApp (cliente e parser)
**Objetivo**: tirar do `index.mjs` funções puras e de integração, sem alterar lógica.
- Criar `server/integracoes/whatsapp/cliente.mjs` com:
  - `sendWhatsAppText`
  - `sendWhatsAppButtons`
  - `sendWhatsAppList`
- Criar `server/integracoes/whatsapp/parser.mjs` com:
  - `extractWhatsAppMessages`
- Atualizar imports no `index.mjs`.

**Regras rígidas da etapa**
- As funções devem manter assinatura e comportamento atuais.
- Não alterar mensagens/textos e não alterar limites (slice) atuais.

**Validação**
- `npx tsc --noEmit`
- `node --check server/index.mjs`

---

### ✅ Etapa 2 — Extrair Auth Admin e middleware
**Objetivo**: remover do `index.mjs` o bloco de auth admin sem mudar nada.
- Criar `server/infra/auth-admin.mjs` com:
  - `signAdminToken`
  - `verifyAdminToken`
  - `requireAdminAuth`
- Ajustar `index.mjs` para importar.

**Regras rígidas da etapa**
- Token emitido e validado deve permanecer exatamente igual.
- Header `Authorization: Bearer <token>` deve continuar funcionando igual.

**Validação**
- `npx tsc --noEmit`
- `node --check server/index.mjs`

---

### ✅ Etapa 3 — Migrar rotas Admin para Router dedicado
**Objetivo**: mover rotas `/api/admin/*` para um módulo de rotas.
- Criar `server/rotas/admin.rotas.mjs` (Express Router).
- Mover rotas admin mantendo paths e payloads.
- Registrar router no `index.mjs` (sem mudar prefixos).

**Regras rígidas da etapa**
- Mesmas URLs e mesmos JSONs.
- Mesmas validações e mensagens de erro.

**Validação**
- `npx tsc --noEmit`
- `node --check server/index.mjs`

---

### ✅ Etapa 4 — Migrar rotas de Pagamentos para Router dedicado
**Objetivo**: mover `POST /api/pagamentos/pix/checkout` e `POST /api/webhook/pagamentos`.
- Criar `server/rotas/pagamentos.rotas.mjs`.
- Registrar no `index.mjs`.

**Regras rígidas da etapa**
- Webhook Mercado Pago deve continuar notificando WhatsApp exatamente como hoje.
- Não alterar lógica do `processMercadoPagoWebhook`.

**Validação**
- `npx tsc --noEmit`
- `node --check server/index.mjs`

---

### ✅ Etapa 5 — Criar “Contexto” do Webhook WhatsApp e utilitários comuns
**Objetivo**: reduzir acoplamento e duplicação dentro do handler do WhatsApp, sem mudar a ordem de decisões.
- Criar `server/whatsapp/contexto.mjs` que monta um `ctx` contendo:
  - `prisma`, `sendId`, `phone`, `text`, `typed`, `reply`, `user`, `persona`, `conv`
  - `onboarding`, `upgradeFlow`, `billingFlow` (referência aos maps atuais)
- Criar `server/dominio/mensagens/persistencia.mjs`:
  - helpers para salvar entrada/saída em `message` vs `onboardingMessage`
  - regra fixa: “comandos” sempre em `onboardingMessage`

**Regras rígidas da etapa**
- Não mudar a ordem do roteamento dos fluxos.
- Não mudar onde cada mensagem é salva, exceto para centralizar a lógica sem alterar resultado.

**Validação**
- `npx tsc --noEmit`
- `node --check server/index.mjs`

---

### ✅ Etapa 6 — Componentizar cada fluxo WhatsApp em módulo separado
**Objetivo**: criar um “componente” por fluxo e montar pipeline ordenada.
Criar módulos:
- `server/whatsapp/fluxos/comandos.fluxo.mjs`
- `server/whatsapp/fluxos/billing.fluxo.mjs`
- `server/whatsapp/fluxos/upgrade.fluxo.mjs`
- `server/whatsapp/fluxos/onboarding.fluxo.mjs`
- `server/whatsapp/fluxos/conversa-agente.fluxo.mjs`

Padrão de cada fluxo:
- `canHandle(ctx)` → boolean
- `handle(ctx)` → executa, persiste e envia WhatsApp

Pipeline final no webhook:
1) comandos
2) billing
3) upgrade
4) onboarding
5) conversa/agente

**Regras rígidas da etapa**
- Ordem acima não pode mudar sem aprovação.
- Fluxos devem reproduzir 1:1 a lógica atual.
- Qualquer “case” de `reply`/`typed` existente deve continuar roteando igual.

**Validação**
- `npx tsc --noEmit`
- `node --check server/index.mjs`

---

### ✅ Etapa 7 — Redução final do `server/index.mjs` para “bootstrap”
**Objetivo**: deixar `index.mjs` responsável só por iniciar o servidor e registrar rotas.
- Manter no `index.mjs` apenas:
  - `dotenv.config()`, criação do `app`, `prisma`, middlewares globais
  - registro de routers
  - start do servidor e jobs

**Regras rígidas da etapa**
- Nenhuma rota pode sumir.
- Nenhum fluxo pode mudar de comportamento.

**Validação**
- `npx tsc --noEmit`
- `node --check server/index.mjs`

---

### ✅ Etapa 7.1 — Limpeza física do `server/index.mjs` (remover rotas duplicadas)
**Objetivo**: remover do `index.mjs` apenas o código legado/duplicado que já foi substituído por routers, reduzindo o tamanho do arquivo sem alterar comportamento.

**Regras rígidas da etapa**
- Não remover rotas do sistema: apenas remover implementações duplicadas que já existem nos routers.
- Não alterar contratos de resposta.

**Progresso**
- ✅ Removido do `index.mjs`: `POST /api/whatsapp/send` (já existe no router WhatsApp).
- ✅ Removido do `index.mjs`: `GET /api/conversas/:id/context` (já existe no router de conversas).
- ✅ Removido do `index.mjs`: legado `GET/POST /api/webhook/whatsapp` e helpers locais associados.
- ✅ Removido do `index.mjs`: `GET/POST /api/whatsapp/webhook/:phoneNumberId` duplicado (rota ativa mantida no router dedicado). Bloco legado desativado e isolado.

**Validação**
- `npx tsc --noEmit`
- `node --check server/index.mjs`

---

### 🔴 Etapa 8 (opcional, futura e separada) — Persistir estados de fluxo em banco
**Objetivo**: substituir `Map()` em memória por estado persistido (evita perder onboarding em restart).
- Só executar após o projeto estar estável e com aprovação explícita.

**Regras rígidas da etapa**
- Não criar migrações/destructivos sem aprovação.
- Não executar reset de banco.

**Validação**
- `npx tsc --noEmit`

---

## Inventário mínimo de rotas (atualizar na Etapa 0)
**WhatsApp**
- `/api/whatsapp/webhook/:phoneNumberId` (GET verify)
- `/api/whatsapp/webhook/:phoneNumberId` (POST receive)
- `/api/webhook/whatsapp` (GET/POST) — legado (não remover sem etapa específica)

**Admin**
- `/api/auth/login`
- `/api/admin/*` (config WhatsApp, config Grok, planos, conversas, mensagens, assinaturas)

**Pagamentos**
- `/api/pagamentos/pix/checkout`
- `/api/webhook/pagamentos`
