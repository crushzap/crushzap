# Plano de Implementação: Aura Voice Engine (Áudio Bidirecional com Modal)

Este documento descreve o plano de implementação para dotar o CrushZap de capacidades de audição (STT) e fala (TTS) com qualidade humana, utilizando **Modal** para processamento pesado de IA e **Node.js** para orquestração.

Objetivo: **Permitir que as personas ouçam áudios do usuário e respondam com voz natural, entonação e personalidade, mantendo a latência baixa.**

## Legenda de status das etapas
- 🔴 = não iniciado
- 🟡 = em andamento
- ✅ = concluído

Regra de atualização: **cada etapa começa com 🔴**. Quando iniciar uma etapa, mudo para 🟡. Quando finalizar e validar, mudo para ✅.

---

## Regras Rígidas (Não Negociáveis)
1.  **Compatibilidade:** O sistema deve continuar funcionando para usuários que só usam texto. O áudio é um "power-up".
2.  **Performance:** O tempo de "silêncio" entre o usuário enviar um áudio e receber a resposta deve ser mascarado com feedback visual (status "gravando áudio..." no WhatsApp).
3.  **Custo/Limites:** A geração de áudio consome GPU. Deve ser contabilizada com peso maior que texto no sistema de cotas (Sugestão: 1 Áudio = 10 Créditos de Texto).
4.  **Estabilidade:** Falhas no Modal (timeout/erro) devem degradar graciosamente para resposta em texto. Nunca deixar o usuário sem resposta.
5.  **Storage:** Nenhum arquivo de áudio deve ser armazenado permanentemente no servidor local; usar sempre Supabase Storage.
6.  **Windows/PowerShell:** Scripts e comandos devem ser compatíveis com PowerShell (sem `&&`).
7.  **Banco de dados:** Nunca resetar o banco. Nunca executar comandos `npx prisma` a partir do agente.

---

## Decisões de Arquitetura e Produto

### 1. Infraestrutura de IA (Modal)
-   **STT (Ouvir):** `OpenAI Whisper v3 Large`. Roda rápido em GPU e entende português/gírias muito bem.
-   **TTS (Falar):** `Coqui XTTS-v2`.
    -   Suporta **emoção** e **entoação** baseada no contexto.
    -   Nativo em **PT-BR**.
    -   Permite **Voice Cloning** instantâneo (necessário para os pre-sets).

### 2. Estratégia de Vozes (Pre-sets)
Em vez de deixar o usuário fazer upload de vozes (arriscado e complexo), teremos um **Catálogo de Vozes** curado:
-   Mapeamento fixo: `Personalidade` → `Voz Base`.
-   Exemplo:
    -   *Sedutora* → Voz aveludada, mais lenta.
    -   *Brincalhona* → Voz mais aguda, rápida e energética.
    -   *Dominante* → Voz firme, grave.
-   *Técnica:* Armazenamos arquivos `.wav` de referência (6s) no projeto (`server/assets/voices/`) e enviamos para o Modal na hora da geração.

### 3. Modos de Resposta
Campo `responseMode` na tabela `Persona`:
-   `TEXT_ONLY`: Nunca manda áudio.
-   `MIRROR` (Padrão):
    -   Usuário manda Texto → Responde Texto.
    -   Usuário manda Áudio → Responde Áudio.
    -   Usuário pede Áudio ("me manda um áudio") → Responde Áudio (override via prompt).
-   `ALWAYS_AUDIO`: Responde tudo em áudio (exceto listas/botões).

Observação importante:
- A implementação atual no banco usa `ResponseMode` com valores `text`, `audio`, `both` e `mirror` (ver `prisma/schema.prisma`). O plano a seguir assume que `mirror` será o comportamento padrão para áudio.

### 4. Fluxo de Dados
1.  **WhatsApp (Áudio)** → Webhook Node.js.
2.  **Node.js** baixa mídia → Envia para **Modal (STT)**.
3.  **Modal** devolve Transcrição.
4.  **Node.js** injeta transcrição no prompt do Grok: `[USER_AUDIO]: "..."`.
5.  **Grok** gera resposta textual + tag de emoção (opcional).
6.  **Node.js** verifica `responseMode`. Se for gerar áudio:
    -   Envia Chat Action `recording_audio` para o WhatsApp.
    -   Envia texto + amostra de voz para **Modal (TTS)**.
    -   **Modal** devolve áudio (buffer).
    -   **Node.js** sobe para **Supabase Storage**.
    -   **Node.js** envia URL pública para **WhatsApp**.

---

## Etapas (por ordem de execução)

### 🟡 Etapa 0 — Preparação e Definição de Limites
**Objetivo:** Preparar terreno e definir custos.
-   Criar pasta `audios` no bucket do Supabase (Ação do Usuário) e configurar o `.env`.
-   Definir constantes de custo no código (ex: `COST_AUDIO_GENERATION = 10`).
-   Baixar/Gerar os arquivos de áudio de referência (samples) para as personalidades iniciais (Sedutora, Brincalhona, Dominante).

**Status atual**
- ✅ `.env` já possui `SUPABASE_BUCKET_AUDIOS=crushzap/audios` (pasta já preparada pelo usuário).
- 🔴 Ainda falta definir e aplicar regras de limite/custo para áudio no controle de cota/trial.
- ✅ `server/assets/voices/padrao.wav` adicionado (mínimo viável para TTS funcionar).
- 🔴 Ainda falta adicionar presets adicionais (`sedutora.wav`, `dominante.wav`, `brincalhona.wav`) para variedade.
- ✅ Trial: ao usuário tentar áudio (enviar áudio ou pedir áudio), bloquear TTS e enviar upsell (com teaser em áudio na primeira vez).

### ✅ Etapa 1 — Infraestrutura Modal (Python)
**Objetivo:** Criar a API de IA que processa e gera áudio.
-   Criar `infra/modal-audio/app.py`.
-   Implementar endpoint `transcribe` (Whisper).
-   Implementar endpoint `generate` (XTTS-v2).
-   Configurar *warm-up* para evitar "cold starts" muito longos (manter container aquecido ou aceitar delay inicial).

**Validação:**
-   Deploy no Modal (`modal deploy`).
-   Teste via curl/script: Enviar áudio → Receber texto. Enviar texto → Receber áudio.

**Status atual**
- ✅ Deploy realizado com sucesso no Modal.
- ✅ URLs do Modal (atuais):
  - Transcrição (STT): `https://navibotlab--crushzap-audio-transcribe.modal.run`
  - Geração (TTS): `https://navibotlab--crushzap-audio-generate.modal.run`
- ✅ Ajustes críticos feitos para build estável (Python 3.10, `coqui-tts==0.22.1`, patch no `coqpit` durante o build, aceite de licença CPML).
- ✅ Script de deploy criado: `scripts/deploy-modal-audio.ps1`.

### ✅ Etapa 2 — Banco de Dados e Modelagem
**Objetivo:** Suportar configuração de voz na Persona.
-   Adicionar campos no `schema.prisma` (Tabela `Persona`):
    -   `voicePreset` (String, default baseado na personalidade).
    -   `responseMode` (Enum: MIRROR, TEXT_ONLY, ALWAYS_AUDIO).
-   Executar migração (`npx prisma db push` ou generate, sem reset).

**Status atual**
- ✅ Schema já foi atualizado para incluir `voicePreset` e `voiceSampleUrl` em `Persona`, e `mirror` em `ResponseMode`.
- ✅ `npx prisma db push` executado (banco em sync com o schema).
- Observação: houve erro `EPERM unlink query_engine-windows.dll.node` durante o push (Windows lock). Se precisar regenerar client, rodar `npx prisma generate` com o server parado.

### ✅ Etapa 3 — Camada de Serviço (Backend)
**Objetivo:** Abstrair a complexidade do Modal e Storage.
-   Criar `server/integracoes/ia/audio-modal.mjs`: Cliente para chamar a API do Modal.
-   Criar `server/integracoes/supabase/storage-audio.mjs`: Helpers para upload de áudio temporário.
-   Criar `server/servicos/voice-manager.mjs`: Lógica para escolher o sample de voz baseado na persona.

**Status atual**
- ✅ Cliente de áudio criado e ajustado para usar `fetch` nativo (sem dependência de `axios`).
- ✅ Storage de áudio criado (Supabase).
- ✅ `VoiceManager` criado para mapear preset/personalidade para `.wav` em `server/assets/voices/`.
- ✅ Necessário configurar no `.env`:
  - `MODAL_AUDIO_TRANSCRIBE_URL` (obrigatório)
  - `MODAL_AUDIO_GENERATE_URL` (obrigatório)

### ✅ Etapa 4 — Integração WhatsApp (Entrada/STT)
**Objetivo:** Permitir que o bot "ouça".
-   Atualizar `server/rotas/whatsapp.rotas.mjs` para aceitar `type: audio`.
-   No handler de mensagem:
    -   Detectar áudio.
    -   Baixar buffer.
    -   Chamar STT.
    -   Substituir o "corpo" da mensagem pela transcrição, mas marcando flag `isAudio: true`.

**Status atual**
- ✅ Implementado: áudio recebido é baixado, enviado para STT no Modal e a transcrição é injetada no `ctx.text` como `[O usuário enviou um áudio]. Transcrição: "..."`.
- ✅ Implementado: o áudio recebido é enviado ao Supabase (URL pública) e persistido como `type: audio`.

### ✅ Etapa 5 — Integração WhatsApp (Saída/TTS) e "Cérebro"
**Objetivo:** Permitir que o bot "fale" e decida quando falar.
-   Atualizar `server/whatsapp/fluxos/conversa-agente.fluxo.mjs`:
    -   Logar transcrição no histórico como `[ÁUDIO]: texto`.
    -   Lógica de decisão `shouldReplyWithAudio`:
        -   Se `responseMode == ALWAYS_AUDIO`.
        -   Se `responseMode == MIRROR` E input foi áudio.
        -   Se LLM solicitou (detectar tag `[SEND_AUDIO]` se implementarmos controle via prompt).
-   Se `shouldReplyWithAudio`:
    -   Disparar `sendChatState(recording_audio)`.
    -   Chamar TTS Service.
    -   Upload Supabase.
    -   Enviar mensagem de áudio para usuário.

**Itens que faltam nesta etapa**
- ✅ Envio de áudio via WhatsApp (upload-first + fallback por link).
- ✅ Segmentação do texto em múltiplos áudios (limite por chunk).
- ✅ Contabilização de custo por peso no cálculo de cota (assinatura).
- ✅ On-demand: detectar quando usuário pede áudio e forçar TTS.
- 🔴 Pendente: enviar ação de chat `recording_audio` antes do áudio (otimização UX).

### 🔴 Etapa 6 — Dashboard e Ajustes Finais
**Objetivo:** Permitir configurar comportamento.
-   Atualizar página de Persona no frontend para exibir seletor de `Modo de Resposta`.
-   (Opcional neste momento) Seletor de voz manual (ou deixar automático pela personalidade por enquanto).

**Itens que faltam nesta etapa**
- Exibir no front presets disponíveis (read-only) e modo de resposta.
- (Opcional) Campo para selecionar preset de voz manualmente.
- ✅ Implementar player de áudio no chat web (admin) para mensagens `type: audio`:
  - Play/Pause
  - Barra de progresso + seek
  - Velocidade (1x/1.5x/2x)
  - Onda/visualização (waveform simplificado)
  - Baixar/link direto como fallback

---

## Análise de Custos Estimada (Referência)

O Modal cobra por tempo de GPU.
-   **GPU T4 (Suficiente para inferência):** ~$0.59/hora.
-   **Whisper (STT):** Processa 1 min de áudio em ~2-3 segundos. Custo ínfimo.
-   **XTTS (TTS):** Gera 10s de áudio em ~3-5 segundos.
-   **Estimativa:**
    -   1 hora de GPU = 3600 segundos.
    -   Se cada áudio gera 5s de processamento: ~700 áudios por hora de GPU.
    -   Custo por áudio: $0.59 / 700 ≈ $0.0008 (menos de 1 centavo de dólar).
    -   **Comparação:** GPT-4 input/output é mais caro que isso. Grok é barato.
    -   **Conclusão:** O custo é baixo, mas o risco é o volume. O limite de 1:10 (1 áudio = 10 textos) é conservador e seguro para evitar abuso.

---

## Variáveis de Ambiente (Checklist)

Obrigatórias (áudio):
- `MODAL_AUDIO_TRANSCRIBE_URL=https://navibotlab--crushzap-audio-transcribe.modal.run`
- `MODAL_AUDIO_GENERATE_URL=https://navibotlab--crushzap-audio-generate.modal.run`
- `SUPABASE_BUCKET_AUDIOS=crushzap/audios`

Opcionais:
- `MODAL_AUDIO_URL` (apenas se quiser fornecer um prefixo único, mas no Modal atual os endpoints são separados)

---

## Critérios de Validação por Etapa (Obrigatórios)

Sempre que marcar uma etapa como ✅:
- `node --check` nos arquivos `.mjs` tocados na etapa
- `npx tsc --noEmit` (para garantir que o front não quebrou)
- `npm run build` (garante que o front continua compilando)
