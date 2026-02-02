# Plano de Implementação — Foto da Persona no Onboarding (IA + Supabase + WhatsApp)

Este documento descreve um plano **por etapas** para implementar a geração automática de **foto fotorealista (meio corpo 2:3)** da persona (Crush) ao final do onboarding, **salvar no Supabase Storage**, **persistir referência no Postgres** e **enviar no WhatsApp antes da saudação**.

O objetivo é adicionar esse recurso **sem quebrar nada**, com controle de custo e fallback de provedor.

## Legenda de status das etapas
- 🔴 = não iniciado
- 🟡 = em andamento
- ✅ = concluído

Regra de atualização: **cada etapa começa com 🔴**. Quando eu iniciar uma etapa, mudo para 🟡. Quando finalizar e validar, mudo para ✅.

---

## Regras rígidas (não negociáveis)
1. **Não alterar comportamento**: o onboarding e o envio de mensagens atuais devem continuar funcionando como hoje quando a foto estiver desabilitada.
2. **Não mudar rotas existentes** sem uma etapa específica e aprovada para isso.
3. **Não mudar contrato de resposta** (status HTTP, shape de JSON, mensagens enviadas no WhatsApp) sem aprovação explícita.
4. **Sem reset de banco** e sem ações destrutivas no Postgres.
5. **Nunca executar comandos `npx prisma`** (inclui migrate/reset).
6. **Refatoração incremental**: adicionar o mínimo necessário por etapa, com validação ao final.
7. **Sem comentários novos no código**, a menos que solicitado.
8. **Compatível com Windows/PowerShell** (sem `&&`).
9. **Ignorar problemas de Redis e erros de auth do client** conforme regras do projeto.

---

## Decisões já confirmadas (base do plano)
1. **Armazenamento**: Supabase Storage (bucket) + salvar URL no Postgres.
2. **Uso**: exibir no painel (lista de personas), reenviar no WhatsApp depois, e servir de base para consistência de futuras imagens.
3. **Ordem**: enviar **primeiro a foto**, aguardar ~**3 segundos**, e enviar a **saudação** em seguida.
4. **Imagem**: fotorealista, humana, genérica, **meio corpo**, **2:3**.
5. **Prompt**: pode ser em inglês.
6. **Sem regeneração** (por enquanto).

---

## Pontos de decisão finais (precisam ficar explícitos no código/config)
1. **Bucket do Supabase**:
   - padrão do plano: **público** (URL permanente para exibir no painel e para envio por link no WhatsApp).
2. **Envio no WhatsApp**:
   - padrão do plano: enviar **imagem via link público** (`image.link`).
   - fallback planejado: upload `/media` e envio com `media_id` se o link falhar (opcional, etapa separada).
3. **Provedor de imagem**:
   - padrão do plano: **Gemini “Nano Banana”** (`gemini-2.5-flash-image`).
   - fallback: **xAI `grok-2-image-1212`** quando houver erro/quota.
4. **Watermark/SynthID**:
   - Gemini documenta marca d’água/SynthID em imagens geradas; deve ser validado no resultado real e aceito como requisito de produto.

---

## Critérios de validação (obrigatórios em toda etapa)
Ao concluir uma etapa (marcar ✅), deve ser verdadeiro que:
- `npx tsc --noEmit` passa (0 erros).
- `node --check` passa nos módulos do server alterados/novos.
- O webhook WhatsApp segue respondendo normalmente (sem travar o request).
- O onboarding continua finalizando como hoje quando a feature estiver desabilitada.

---

## Estrutura alvo (resultado final esperado)
- **Integrações**
  - Provedor de imagem: Gemini (primário) + xAI (fallback).
  - Supabase Storage: upload e geração de URL.
  - WhatsApp: envio de imagem por link (e opcionalmente por media_id).
- **Domínio**
  - Serviço “gerar e enviar foto da persona” com controle de custo e fallback.
- **Persistência**
  - Novos campos/tabela para armazenar URL + metadados da foto (prompt, provider, status).
- **Onboarding**
  - Hook no final do fluxo: foto → espera 3s → saudação.

---

## Etapas (por ordem de execução)

### ✅ Etapa 0 — Linha de base e travas de segurança
**Objetivo**: garantir baseline antes de mexer.
- Confirmar o ponto exato do onboarding onde hoje é enviada a saudação.
- Inventariar como a persona/prompt é persistida no banco hoje.
- Confirmar dependências e variáveis de ambiente disponíveis (sem adicionar segredo no código).

**Validação**
- `npx tsc --noEmit`
- `node --check server/index.mjs`

---

### ✅ Etapa 1 — Persistência no Postgres para foto (usando `Persona.avatar`)
**Objetivo**: salvar e reutilizar a foto (URL pública do Supabase) **sem migração** de schema agora.
- Reaproveitar o campo existente `Persona.avatar` para armazenar a **URL pública** da foto (2:3).
- Ajustar o painel/DTO para exibir `persona.avatar` como “foto” quando for URL.
- Padronizar que, quando `avatar` começar com `http`, ele é tratado como imagem; quando não, pode ser usado como placeholder legado.

**Observação**
- Metadados adicionais (provider, prompt final, status) ficam como etapa futura opcional, caso a gente decida criar uma tabela específica quando for permitido rodar migração/geração do Prisma.

**Regras rígidas da etapa**
- Não executar comandos `npx prisma`.
- Sem alterações no onboarding ainda (apenas estrutura e leitura).

**Validação**
- `npx tsc --noEmit`
- `node --check` nos módulos tocados

---

### ✅ Etapa 2 — Integração Supabase Storage (upload + URL pública)
**Objetivo**: criar um cliente de Supabase no backend para subir a imagem e obter URL pública.
- Criar módulo de integração do Supabase (service role key no backend).
- Definir convenção de path:
  - `personas/{personaId}/foto-perfil-2x3.jpg` (ou `.png`)
- Implementar upload idempotente:
  - se já existe `imageUrl` no banco, não reupload (evita custo e duplicação).

**Regras rígidas da etapa**
- Não expor chaves em logs.
- Não abrir upload genérico; apenas o fluxo interno do server.

**Validação**
- `npx tsc --noEmit`
- `node --check` nos módulos tocados

---

### ✅ Etapa 3 — Integração de geração de imagem (Gemini primário + fallback xAI)
**Objetivo**: gerar a foto 2:3 a partir da persona.
- Implementar provider Gemini “Nano Banana” conforme documentação oficial:
  - modelo: `gemini-2.5-flash-image`
  - resposta: obter bytes/base64 da imagem
- Implementar fallback xAI (`grok-2-image-1212`) se Gemini falhar por quota/erro.
- Controlar custo:
  - **1 imagem por onboarding** (sem variações)
  - timeouts e 1 retry no máximo

**Regras rígidas da etapa**
- Prompt em inglês.
- Persona genérica: não usar referência a pessoas reais.

**Validação**
- `npx tsc --noEmit`
- `node --check` nos módulos tocados

---

### ✅ Etapa 4 — Prompt builder “foto perfeita” (2:3 meio corpo)
**Objetivo**: transformar `persona.prompt` e dados coletados em um prompt de imagem forte e consistente.
- Construir um prompt padronizado:
  - fotorealista, humano, meia altura, fundo neutro, luz suave de estúdio
  - descrição detalhada de aparência/roupa/vibe
  - restrições “no text/logo/watermark visible, no extra fingers…”
- Registrar `imagePrompt` final no Postgres junto com `imageProvider`.

**Validação**
- `npx tsc --noEmit`
- Testes unitários do prompt builder (quando existir infra de testes) ou teste de execução local do builder.

---

### ✅ Etapa 5 — Envio no WhatsApp: imagem primeiro, depois saudação
**Objetivo**: enviar a foto via WhatsApp e só depois enviar a saudação.
- Implementar envio de imagem por **link público** (`image.link`) usando a URL do Supabase.
- Orquestrar espera de ~3s após envio bem-sucedido da imagem.
- Se falhar a geração/envio da foto:
  - salvar `imageStatus=failed` + `imageError`
  - seguir com a saudação (não travar onboarding)

**Regras rígidas da etapa**
- O webhook não pode ficar bloqueado por tempo excessivo; o trabalho pesado deve ser assíncrono.

**Validação**
- `npx tsc --noEmit`
- Teste manual: completar onboarding e observar ordem (imagem → 3s → saudação).

---

### ✅ Etapa 6 — Feature flags e limites operacionais
**Objetivo**: permitir ligar/desligar e escolher provider sem mudança de código.
- Flags planejadas:
  - `PERSONA_FOTO_ENABLED`
  - `PERSONA_FOTO_PROVIDER=gemini|xai`
  - `PERSONA_FOTO_FALLBACK_PROVIDER=xai`
  - `PERSONA_FOTO_TIMEOUT_MS`
  - `GEMINI_API_KEY` (ou `GOOGLE_API_KEY`)
  - `GEMINI_IMAGE_MODEL` (padrão: `gemini-2.5-flash-image`)
  - `XAI_API_KEY` (ou `GROK_API_KEY`)
  - `XAI_IMAGE_MODEL` (padrão: `grok-2-image-1212`)
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_BUCKET_FOTOS_PERSONAS`

**Validação**
- `npx tsc --noEmit`
- Teste manual: feature off mantém comportamento atual.

---

### ✅ Etapa 7 — Exibição no painel (lista de personas) e reuso
**Objetivo**: exibir a foto na lista de personas e garantir reuso (sem regenerar).
- Ajustar endpoint/DTO do painel para retornar `persona.avatar` (URL pública da foto).
- UI: renderizar a imagem (com fallback visual quando não existir).
- Garantir que fluxos que “reenviam depois” possam reutilizar a URL salva em `persona.avatar`.

**Validação**
- `npx tsc --noEmit`
- Teste manual: abrir painel e ver a foto na lista.

---

## Inventário mínimo de rotas afetadas (não mudar paths sem etapa)
- Onboarding WhatsApp: pipeline atual do webhook WhatsApp.
- Admin/painel: rotas que listam personas e retornam dados da persona.
