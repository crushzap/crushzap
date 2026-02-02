## Objetivo
- Ao finalizar o onboarding (criação da Crush/persona + primeira saudação), gerar automaticamente uma **foto da persona por IA**, **salvar no “FB/Meta” (mídia do WhatsApp Cloud API)** e **enviar a imagem ao usuário**.
- A imagem precisa refletir fielmente as características definidas no onboarding (aparência, roupa, estilo, vibe, etc.) e ter um prompt de altíssima qualidade.

## Onde encaixar no fluxo atual
- Gatilho ideal: no final do onboarding, exatamente onde hoje é enviada a mensagem “Aguarde…” e, depois, a primeira saudação da Crush.
- Ponto exato: trecho de finalização em [onboarding.fluxo.mjs:L670-L686](file:///e:/APLICATIVOS/projects/aura/crushzap/server/whatsapp/fluxos/onboarding.fluxo.mjs#L670-L686).

## Escolha do gerador de imagem (melhor equilíbrio qualidade/custo/integração)
- **Opção A (mais simples de integrar agora): xAI Grok Image**
  - Já existe integração com xAI no backend (Grok texto) em [grok.mjs](file:///e:/APLICATIVOS/projects/aura/crushzap/server/integrations/grok.mjs).
  - xAI tem endpoint dedicado de imagem `POST /v1/images/generations` (compatível OpenAI SDK) e guia oficial de “Image Generations”.
  - Custo oficial do modelo `grok-2-image-1212`: **US$ 0,07 por imagem** na tabela da própria xAI. Fonte: https://x.ai/api
  - Prós: reaproveita `XAI_API_KEY`, menos dependências novas.
  - Contras: custo por imagem maior que alguns concorrentes e menor controle de parâmetros.
- **Opção B (potencialmente melhor custo/qualidade em massa): Gemini “Nano Banana”**
  - “Nano Banana” é a geração nativa de imagens do Gemini (`gemini-2.5-flash-image`) e existe também o “Nano Banana Pro” (`gemini-3-pro-image-preview`). Fonte: https://ai.google.dev/gemini-api/docs/image-generation
  - O pricing oficial do Gemini API declara **free tier** e **paid tier** (página atualizada em 2026-01-19). Fonte: https://ai.google.dev/gemini-api/docs/pricing
  - Prós: custo competitivo por imagem (dependendo do tier) e boa aderência a instruções.
  - Contras: exige adicionar credenciais/SDK e validar watermark/quotas (no free tier pode haver marca d’água visível conforme políticas do provedor).
- Decisão recomendada para implementação inicial:
  - Implementar uma **camada de abstração** (interface “gerador de imagem”) e começar com **xAI** (menor atrito). Depois, plugar **Gemini** como alternativa/upgrade.

## Arquitetura proposta (com fallback e controle de custo)
- Criar um serviço “gerarFotoDaPersona” que:
  1) Verifica se a persona já tem foto (evita custo duplicado).
  2) Monta um **prompt de imagem** a partir do `persona.prompt` já salvo.
  3) Chama o provider de imagem (xAI primeiro; Gemini opcional por feature-flag).
  4) Recebe **URL/base64** da imagem.
  5) Faz upload da imagem para a **Meta/WhatsApp Cloud API** (`/media`) e armazena o `media_id`.
  6) Envia mensagem `type: "image"` para o usuário usando `media_id`.
  7) Persiste metadados (provider, prompt usado, status, custos estimados, timestamps).

## Persistência no banco (Prisma)
- Adicionar campos para foto na persona (ou tabela separada), por exemplo:
  - `persona.photoUrl` (opcional, se quisermos cópia persistente fora da Meta)
  - `persona.photoMediaId` (id retornado pela Meta/WhatsApp)
  - `persona.photoProvider` (xai|gemini)
  - `persona.photoPrompt` (texto final usado)
  - `persona.photoStatus` (pending|generated|uploaded|sent|failed)
  - `persona.photoError` (string curta)
  - `persona.photoCreatedAt`
- Guardar histórico em tabela própria se você quiser regenerações/versões (recomendado quando começar a iterar prompt).

## Integração WhatsApp: upload e envio de imagem
- Hoje o cliente WhatsApp só envia texto/botões/lista: [cliente.mjs](file:///e:/APLICATIVOS/projects/aura/crushzap/server/integracoes/whatsapp/cliente.mjs).
- Implementar:
  - `uploadWhatsAppMedia(phoneNumberId, buffer, mimeType)` → `POST https://graph.facebook.com/v19.0/{phoneNumberId}/media` (salvar no “FB/Meta”).
  - `sendWhatsAppImage(phoneNumberId, to, mediaId, caption?)` → `POST .../{phoneNumberId}/messages` com `{ type:"image", image:{ id: mediaId, caption } }`.
- Ajustar persistência para suportar `type:'image'` (hoje só text/audio) em [persistencia.mjs](file:///e:/APLICATIVOS/projects/aura/crushzap/server/dominio/mensagens/persistencia.mjs) e no schema (se necessário).

## Prompt “perfeito” para materializar a persona
- Fonte da verdade: `persona.prompt` gerado no onboarding via [buildPersonaPrompt](file:///e:/APLICATIVOS/projects/aura/crushzap/server/agents/prompt.mjs#L10-L42), que já inclui seções de aparência/roupa/estilo.
- Estratégia de prompt:
  - Transformar o `persona.prompt` (texto longo) em um **prompt de imagem compacto e altamente descritivo**, preservando:
    - Aparência (idade aparente, pele, cabelo, olhos, corpo, traços)
    - Estilo de roupa e acessórios
    - Clima/atitude (fofa, confiante, carinhosa, etc.)
    - Cenário neutro (para “foto de perfil”) e iluminação realista
  - Incluir restrições:
    - “apenas 1 pessoa”, “sem texto”, “sem logotipos”, “sem marca d’água visível”, “sem distorções”, “sem mãos extras”, “sem nudez/explicit”.
  - Saída alvo:
    - Retrato fotorealista em enquadramento de ombros para cima, foco no rosto, fundo suave.
- Melhorias de qualidade:
  - Gerar 2–4 variações e escolher a melhor automaticamente (heurística simples por tamanho/ausência de erros) ou manual via painel admin.
  - Guardar `revised_prompt` quando o provider devolver.

## Execução assíncrona e resiliência
- Não bloquear a resposta do webhook do WhatsApp:
  - Disparar um job assíncrono (inicialmente `setTimeout` como já existe; depois evoluir para fila/worker).
- Retentativas e fallback:
  - Se geração falhar: enviar apenas a saudação textual e marcar foto como `failed`.
  - Se upload para Meta falhar: opcionalmente enviar por link público (se tivermos storage próprio) ou adiar.

## Controle de custo (modelos e limites)
- Definir feature flags no `.env`:
  - `PERSONA_FOTO_ENABLED=true/false`
  - `PERSONA_FOTO_PROVIDER=xai|gemini`
  - `PERSONA_FOTO_MAX_RETRIES`
  - `PERSONA_FOTO_VARIACOES=1|2|4`
- Estimativa de custo por 1.000 onboardings:
  - xAI: 1000 × US$0,07 = **US$70** (fonte xAI: https://x.ai/api)
  - Gemini (depende do tier/modelo): validar com a tabela oficial de pricing (fonte: https://ai.google.dev/gemini-api/docs/pricing) e com o modelo escolhido (“Nano Banana”): https://ai.google.dev/gemini-api/docs/image-generation

## Testes e validação
- Testes unitários:
  - `buildPersonaImagePrompt()` com várias personas (curta, longa, sem campos) → saída estável.
- Testes de integração (mock HTTP):
  - geração de imagem (xAI/Gemini)
  - upload `/media`
  - envio `type:image`
- Teste end-to-end:
  - simular conclusão do onboarding e verificar: DB atualiza status → WhatsApp recebe saudação + imagem.

## Entregáveis (o que vai existir ao final)
- Serviço de geração e envio de foto ligado ao final do onboarding.
- Novas funções de WhatsApp para upload/envio de imagem.
- Persistência da foto e metadados no Prisma.
- Prompt builder robusto (pt-BR) que materializa a persona com alta fidelidade.

Se você aprovar este plano, eu sigo para a implementação já com a opção padrão em xAI (por reaproveitar credenciais e reduzir atrito), deixando preparado para plugar Nano Banana/Gemini depois.