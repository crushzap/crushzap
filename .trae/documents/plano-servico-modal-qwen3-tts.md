# Plano de Implementação (Modal Qwen3‑TTS VoiceDesign + Mix Samples) (sem quebrar nada)

Este documento descreve um plano **por etapas** para criar um **terceiro serviço de áudio no Modal** usando o modelo **Qwen/Qwen3‑TTS‑12Hz‑1.7B‑VoiceDesign**, com **mix de samples + voice design**, resposta única (com concatenação quando houver chunks) e **fallback prioritário para XTTS**.

Objetivo: **substituir Bark como principal para voz feminina** com maior controle, mantendo compatibilidade com o pipeline atual.

## Legenda de status das etapas
- 🔴 = não iniciado
- 🟡 = em andamento
- ✅ = concluído

Regra de atualização: **cada etapa começa com 🔴**. Quando eu iniciar uma etapa, mudo para 🟡. Quando finalizar e validar, mudo para ✅.

---

## Regras rígidas (não negociáveis)
1. **Não alterar comportamento** fora do fluxo de TTS.
2. **Não mudar contratos** de resposta HTTP já existentes.
3. **Não mudar persistência** nem executar reset de banco.
4. **Nunca executar comandos `npx prisma`**.
5. **Refatoração incremental**: criar o novo serviço sem quebrar Bark/XTTS.
6. **Sem comentários novos no código**, a menos que você peça.
7. **Compatível com Windows/PowerShell** (sem `&&`).
8. **Erros de Redis e auth do client podem ser ignorados** conforme regras do projeto.

---

## Premissas confirmadas
- Modelo: **Qwen/Qwen3‑TTS‑12Hz‑1.7B‑VoiceDesign**.
- Modo de voz: **mix samples + voice design**.
- Resposta: **áudio completo** (único), podendo gerar em chunks e **concatenar no final**.
- Fallback prioritário: **XTTS**.
- GPU recomendada no anexo: **8–16GB VRAM** (preferência por **L4 ou A10**; T4 como fallback de custo).

---

## Estrutura alvo (resultado final esperado)

### Infra (Modal)
- `infra/modal-audio-qwen3/app.py`
  - Endpoint `POST /generate`
  - Endpoint `POST /generate_batch`
  - Suporte a **voice_prompt** (VoiceDesign)
  - Suporte a **speaker_wav_base64** (mix samples)
  - Saída `audio/ogg` (fallback `audio/wav`)

### Server (Integração)
- `server/integracoes/ia/audio-qwen3-modal.mjs` (novo)
  - Client HTTP para o Modal Qwen3
  - Suporte a batch e concatenação final
- Orquestrador de TTS existente
  - Adicionar engine `qwen3`
  - Prioridade: `qwen3 → xtts → bark` (ou `qwen3 → xtts` se Bark ficar opcional)

---

## Etapas (por ordem de execução)

### ✅ Etapa 0 — Linha de base e inventário
**Objetivo**: garantir baseline e listar pontos de integração atuais.
- Confirmar endpoints e contratos atuais do Bark e XTTS.
- Mapear onde escolher engine e onde enviar samples.

**Validação**
- `npx tsc --noEmit`

---

### ✅ Etapa 1 — Criar serviço Modal Qwen3‑TTS (infra)
**Objetivo**: subir o novo serviço sem tocar nos fluxos atuais.
- Criar `infra/modal-audio-qwen3/app.py`.
- Definir image, cache e download do modelo.
- Implementar `generate` e `generate_batch`.
- Implementar **mix de samples**:
  - Aceitar `speaker_wav_base64` como lista
  - Normalizar e concatenar em um único WAV
- Implementar **voice_prompt** obrigatório para VoiceDesign.
- Gerar áudio em chunks quando necessário e concatenar o resultado final.
- Retornar `audio_base64` + `content_type`.

**Validação**
- `npx tsc --noEmit`
- Deploy no Modal concluído:  
  - `https://navibotlab--crushzap-audio-qwen3-generate.modal.run`  
  - `https://navibotlab--crushzap-audio-qwen3-generate-batch.modal.run`

---

### ✅ Etapa 2 — Integração no server (novo client Qwen3)
**Objetivo**: criar cliente e payload compatível com o serviço novo.
- Criar `server/integracoes/ia/audio-qwen3-modal.mjs`.
- Enviar `voice_prompt`, `texts[]`, `speaker_wav_base64`.
- Receber `audio_base64` e converter para Buffer.
- Garantir compatibilidade com upload e envio WhatsApp.

**Validação**
- `npx tsc --noEmit`
- `node --check` nos arquivos `.mjs` tocados

---

### ✅ Etapa 3 — Orquestração e fallback
**Objetivo**: usar Qwen3 como engine principal e XTTS como fallback.
- Adicionar engine `qwen3` no orquestrador de TTS.
- Prioridade definida: **Qwen3 → XTTS**.
- Manter Bark opcional (somente se necessário).
- Garantir que a seleção respeite `hasSample` + `voice_prompt`.

**Validação**
- `npx tsc --noEmit`
- `node --check` nos arquivos `.mjs` tocados

---

### ✅ Etapa 4 — Ajuste de env vars e parâmetros
**Objetivo**: configurar chaves e parâmetros de forma consistente.
- Adicionar env vars:
  - `MODAL_QWEN3_API_URL`
  - `QWEN3_VOICE_PROMPT_DEFAULT`
  - `QWEN3_MODEL_ID` (opcional)
  - `QWEN3_GPU_TYPE` (L4/A10)
- Documentar valores sugeridos no `.env` (sem alterar produção automaticamente).

**Validação**
- `npx tsc --noEmit`

---

### ✅ Etapa 5 — Observabilidade mínima
**Objetivo**: garantir rastreio do uso de samples e prompt.
- Logs de `sample_count`, `hasSample`, `voice_prompt` (sem dados sensíveis).
- Logs de tempo de geração e tamanho do áudio.

**Validação**
- `npx tsc --noEmit`

---

### ✅ Etapa 6 — Ajuste de dependências runtime
**Objetivo**: remover erro de execução do Torch ao gerar áudio.
- Atualizar Torch para versão compatível com dependências do Qwen3.
- Re-deploy do serviço no Modal.
- Validar geração de áudio com `voice_prompt`.

**Validação**
- Teste direto no endpoint `/generate` com resposta `audio/ogg`.

---

## Critérios de validação (obrigatórios em toda etapa)
Ao concluir uma etapa (marcar ✅), deve ser verdadeiro que:
- `npx tsc --noEmit` passa (0 erros).
- `node --check` passa para os arquivos `.mjs` tocados.

---

## Riscos e mitigação
- **Latência**: usar cache no Volume Modal e GPU L4/A10.
- **Inconsistência de voz**: exigir `voice_prompt` sempre, com fallback para prompt default.
- **Samples ruins**: normalização e concatenação com trimming para reduzir ruído.
