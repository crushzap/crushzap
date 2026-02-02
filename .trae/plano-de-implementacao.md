# Plano de Implementação (CrushZap – SaaS WhatsApp)

## Visão Geral
- Usuário faz todo o fluxo pelo WhatsApp (lead → configura persona → conversa → assina PIX).
- Dashboard administrativo: assinaturas, histórico/moderação, configurar WhatsApp API, gerenciar planos.

## Escolha de Gateway (PIX)
- Recomendação: Mercado Pago.
  - Prós: API madura no Brasil, PIX com QR e copia/cola, webhooks robustos, boa documentação e exemplos.
  - Contras: taxa e políticas de risco padrão do mercado.
- AppMax: forte em checkout e vendas, porém a API para PIX e webhooks costuma ser menos padronizada para integrações custom.
- Decisão: iniciar com Mercado Pago; manter abstração para futuro suporte a AppMax. ✅

## Variáveis de Ambiente
- Definidas em `.env` (preenchimento posterior):
  - `CRUSHZAP_APP_NAME=CrushZap` ✅
  - `VITE_API_BASE_URL=/api` ✅
  - `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_URL`
  - `TRIAL_LIMIT_PER_ACCOUNT=10` ✅
  - `SUBSCRIPTION_CYCLE_DAYS=30` ✅
  - `MESSAGE_RETENTION_DAYS=60` ✅
- Segredos (no backend):
  - `WHATSAPP_ACCESS_TOKEN` ✅
  - `MERCADO_PAGO_ACCESS_TOKEN`  ✅
  - `GROK_API_KEY` ✅

## Banco de Dados
- Postgres recomendado: estável, relacional, bom suporte a índices, transações e JSON quando útil.
- Multi-tenant: cada usuário é um número de WhatsApp; uma persona por usuário.

### Tabelas Principais (sugestão)
- users
  - id (PK), phone (unique), email, name, role (user|admin|superadmin), status (lead|active|blocked)
  - trial_used_count, trial_limit, created_at, updated_at
  - Índices: unique(phone), idx_users_status
- personas
  - id (PK), user_id (FK users.id), name, personality, avatar, response_mode (text|audio|both)
  - voice_pitch, voice_speed, prompt, created_at, updated_at
  - Índices: idx_personas_user_id
- conversations
  - id (PK), user_id (FK), persona_id (FK), created_at
  - Índices: idx_conversations_user_id, idx_conversations_persona_id
- messages
  - id (PK), conversation_id (FK), user_id (FK), persona_id (FK)
  - direction (in|out), type (text|audio), content, status, created_at
  - Índices: idx_messages_conversation_id, idx_messages_user_id, idx_messages_created_at
- plans
  - id (PK), name, price, currency, messages_per_cycle, personas_allowed, audio_enabled, active
- subscriptions
  - id (PK), user_id (FK), plan_id (FK), status (active|past_due|canceled|expired|trial)
  - current_period_start, current_period_end
  - Índices: idx_subscriptions_user_id, idx_subscriptions_status
- whatsapp_configs
  - id (PK), phone_number_id, waba_id, verify_token, created_at, updated_at
- grok_configs
  - id (PK), model, enabled, created_at, updated_at

### Regras e Transações
- Criar persona e vincular ao usuário em transação.
- Atualizar contador de trial e checar limite a cada mensagem do usuário. ✅
- Ao atingir 10 respostas (trial), enviar mensagem de upgrade com planos. ✅
- Assinatura recorrente: ciclo de 30 dias; renovar via webhook de pagamento. ✅
- Excedente do plano: oferecer acesso avulso (mensagens adicionais) com PIX imediato. ✅
- Retenção de histórico: manter 60 dias e expurgar mensagens mais antigas (tarefa agendada). ✅

## Gestão de Segredos
- Segredos em ambiente (.env/secret manager), nunca no DB:
  - GROK_API_KEY, MERCADO_PAGO_ACCESS_TOKEN, WHATSAPP_ACCESS_TOKEN
- No DB ficam metas-configs não sensíveis (ex.: modelo, flags, phone_number_id, waba_id, verify_token).

## Superadmin
- Seed no backend lendo variáveis de ambiente:
  - SUPERADMIN_NAME, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD ✅
- Senha armazenada com hash (bcryptjs) ✅
- Seed executado com sucesso ✅

## Endpoints (backend, sugestão)
- POST /webhook/whatsapp (entrada de mensagens/eventos) ✅
- POST /whatsapp/send (envio outbound) ✅
- POST /admin/config/whatsapp ✅
- POST /admin/config/grok ✅
- GET /admin/conversas?query=... (lista/paginação) ✅
- GET /admin/assinaturas, POST /admin/planos ✅
- POST /pagamentos/pix/checkout (criar QR/copia-e-cola) ✅
- POST /webhook/pagamentos (atualizar assinatura/acesso avulso) ✅

### Autenticação Admin
- POST /auth/login (retorna token para Admin/Superadmin) ✅
- Proteção dos endpoints /api/admin via Authorization: Bearer <token> ✅

## Fluxo WhatsApp (Configuração da Crush)
1) Primeira mensagem (gatilhos: “Olá”, “Oi”, “Oi Crush”, “Quer namorar comigo”, “Quer ser minha Crush” etc.) → cria lead (users.status=lead, trial_limit=10).
2) Mensagem de boas-vindas (CrushZap): “Oi, seja bem-vindo… CrushZap te faz companhia 24h. Vamos criar sua Crush agora?” com botões:
   - [VAMOS SIM]
   - [AGORA NÃO]
   - [COMO FUNCIONA]
3) Fluxos básicos:
   - [VAMOS SIM]: iniciar configuração (personalidade, nome, modo, voz opcional), confirmar resumo e salvar persona.
   - [AGORA NÃO]: agradecer, manter lead, enviar lembrete amigável após X horas.
   - [COMO FUNCIONA]: explicar passos e benefícios; oferecer [Criar Agora].
4) Nome: texto livre (1–24 chars). 5) Modo: botões (Texto, Áudio, Ambos). 6) Voz opcional: pitch/speed (0–100) ou pular. 7) Confirmar e salvar persona (transação).
8) Conversa: cada mensagem do usuário incrementa trial_used_count; responder com Grok.
9) Ao atingir 10 respostas: enviar upgrade com planos (botões) + criação de PIX (QR e copia-e-cola).
10) Webhook de pagamento: atualizar assinatura ativa e limites. ✅
11) Se exceder limites do plano: oferecer acesso avulso com PIX instantâneo. ✅

- Preview do fluxo no frontend: [WhatsAppFlowPreview.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/components/persona/WhatsAppFlowPreview.tsx) ✅

## UI/Admin já preparada
- Página Configurações (WhatsApp + Grok): [Configuracoes.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/pages/Configuracoes.tsx) ✅
- Serviços para salvar: [admin.ts](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/services/admin.ts) ✅
- Modelos de domínio/validações: [models.ts](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/domain/models.ts) ✅
- Rota registrada: /configuracoes em [App.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/App.tsx) ✅

- Página Conversas: [Conversas.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/pages/Conversas.tsx) ✅
- Página Assinaturas: [Assinaturas.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/pages/Assinaturas.tsx) ✅
- Landing atualizada com branding CrushZap: [Landing.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/pages/Landing.tsx) ✅

### Memória do Agente
- Contexto: últimas 50 mensagens + último resumo (endpoint GET /api/conversas/:id/context). ✅
- Resumo automático: a cada 50 mensagens, gerar “RESUMO:” com melhores momentos e pontos importantes (máx. 2k chars). ✅

## Próximos Passos
- UI de login/admin no frontend (form e sessão local). ✅
- Acesso avulso: contabilizar créditos adicionais sem alterar schema (definir estratégia/feature flag).
- Respostas com IA usando Grok (aplicar modelo configurado na conversa).
- Melhorar transação na criação de persona/conversa.

### Frontend – Progresso PIX
- Serviço de checkout PIX: [payments.ts](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/services/payments.ts) ✅
- Modal de checkout PIX reutilizável: [PixCheckoutModal.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/components/payments/PixCheckoutModal.tsx) ✅
- Integração de assinatura via PIX na página de Planos: [Planos.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/pages/Planos.tsx) ✅
- CTA de acesso avulso com PIX no Dashboard: [Dashboard.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/pages/Dashboard.tsx) ✅

### Banco de Dados – Prisma
- Dependências instaladas: prisma e @prisma/client ✅
- Schema Prisma criado com tabelas e relações: [schema.prisma](file:///e:/APLICATIVOS/projects/aura/aura-companhia/prisma/schema.prisma) ✅
- Scripts adicionados: `prisma:generate`, `db:push` em [package.json](file:///e:/APLICATIVOS/projects/aura/aura-companhia/package.json) ✅
- Prisma Client gerado ✅
- db push executado com sucesso ✅
- Campo de senha com hash adicionado ao User (`passwordHash`) ✅
- Script de seed do superadmin pronto: `npm run db:seed:superadmin` ✅
