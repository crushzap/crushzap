# Plano de Implementação (TTS Bark em paralelo ao XTTS) (sem remover XTTS)

Este documento descreve um plano **por etapas** para adicionar um segundo motor de TTS (**Bark**) ao lado do motor atual (**XTTS**), com foco em:
- **voz mais natural / menos robótica**
- **consistência de voz** (não precisa ser clone fiel)
- **baixa fricção de rollout** (feature flag + fallback)

Premissa do produto (conforme alinhado): como existem múltiplas personas/usuários, **não precisamos de “clone perfeito”**; queremos **vozes sintéticas consistentes** que soem naturais.

---

## Parecer técnico (resumo)

**Bark pode se sobressair em naturalidade/expressividade** para respostas curtas (chat), especialmente em prosódia (pausas, variação de tom), quando comparado ao XTTS “padrão”. Porém:
- Bark **não é, por padrão, voice cloning** a partir de `speaker_wav` como o XTTS.
- Bark costuma funcionar melhor com **vozes/presets internos** (histórico/“voice preset”) e respostas **curtas**.
- Para textos longos, a estabilidade pode cair (drift de voz/artefatos). Isso é controlável mantendo respostas curtas e usando concatenação.

Por isso, a estratégia recomendada é:
- **manter XTTS** como engine atual e fallback
- **adicionar Bark** como engine opcional (feature flag) com **vozes predefinidas** (consistência)
- usar Bark onde a prioridade é “soar humano”, e não “parecer com um sample”

---

## Legenda de status das etapas
- 🔴 = não iniciado
- 🟡 = em andamento
- ✅ = concluído

Regra de atualização: **cada etapa começa com 🔴**. Quando iniciar, muda para 🟡. Quando finalizar e validar, muda para ✅.

---

## Regras rígidas (não negociáveis)
1. **Não remover XTTS**: Bark entra como motor adicional.
2. **Feature flag obrigatória**: deve ser possível voltar para XTTS sem redeploy complexo.
3. **Fallback obrigatório**: se Bark falhar (timeout/erro), volta para XTTS ou texto.
4. **Sem quebrar contratos**: endpoints atuais (`/generate`, `/generate_batch`, etc) permanecem funcionando.
5. **Sem comentários novos no código**, a menos que solicitado.
6. **Compatível com Windows/PowerShell**.
7. **Sem reset de banco** e sem mudanças de schema para a primeira versão (MVP).

---

## Critérios de validação (obrigatórios em toda etapa)
Ao concluir uma etapa (marcar ✅), deve ser verdadeiro que:
- `node --check` passa para os `.mjs` tocados na etapa.
- Deploy do Modal do serviço alterado passa (quando aplicável).
- Uma chamada de smoke test retorna áudio 200 OK (quando aplicável).

Observação: como o projeto atual mistura backend e frontend, `npm run build` pode ser usado como reforço, mas não é obrigatório para etapas puramente serverless/Modal.

---

## Estrutura alvo (resultado final esperado)

### Infra (Modal)
- `infra/modal-audio/` (XTTS atual, permanece)
- `infra/modal-audio-bark/`
  - `app.py`: endpoints Bark
  - (opcional) `README.md` (somente se você pedir)

### Server (Node)
- `server/integracoes/ia/audio-modal.mjs` (XTTS atual + batch atual)
- `server/integracoes/ia/audio-bark-modal.mjs` (novo client Bark)
- `server/whatsapp/fluxos/conversa-agente.fluxo.mjs`
  - roteamento por engine (feature flag / persona)
  - fallback automático

### Configuração
- `.env`
  - `TTS_ENGINE_DEFAULT=xtts|bark`
  - `TTS_ENGINE_FALLBACK=xtts|bark`
  - `BARK_VOICE_DEFAULT=<id>`
  - URLs Modal Bark (`MODAL_AUDIO_BARK_URL` ou `MODAL_AUDIO_BARK_GENERATE_URL`/`MODAL_BARK_GENERATE_URL`, `MODAL_AUDIO_BARK_GENERATE_BATCH_URL`/`MODAL_BARK_GENERATE_BATCH_URL`)
  - Timeout Bark (`MODAL_AUDIO_BARK_TTS_TIMEOUT_MS`, opcional)
  - Limites Bark (`BARK_AUDIO_MAX_CHARS_PER_CHUNK`, `BARK_AUDIO_MAX_CHUNKS`)

---

## Etapas (por ordem de execução)

### ✅ Etapa 0 — Baseline e decisões de produto
**Objetivo**: definir o “como medir” e os limites do Bark no seu caso.
- Bark será **default** para todos, com **XTTS como fallback** e kill switch via env.
- Tamanho máximo ideal: **~60s** (texto da LLM normalmente menor; manter chunking + concatenação).
- Vozes por **arquétipo/personalidade** (mapeamento `voicePreset/personality → voiceId Bark`).
- Idioma: **pt-BR** (por enquanto), otimizado para esse caso.
- Regras de quando responder por áudio: **igual ao XTTS** (quando o usuário pedir áudio e quando o usuário enviar áudio em `mirror/both`).

**Validação**
- Documento atualizado com as decisões.

---

### ✅ Etapa 1 — Criar serviço Bark no Modal (isolado do XTTS)
**Objetivo**: ter endpoints Bark funcionando sem mexer no XTTS.
- Criar `infra/modal-audio-bark/app.py`.
- Implementar:
  - `POST /generate` (text + voice_id/preset → ogg)
  - `POST /generate_batch` (lista de textos → 1 ogg concatenado)
- Montar `Volume` para cache em `/tts` (ou `/bark`) para evitar downloads repetidos.
- Fixar configurações de GPU e timeout.

**Validação**
- Deploy do app Bark com URLs publicadas.
- 1 chamada simples retorna `200` com áudio.
**Status atual**
- Implementação e validação concluídas.

---

### ✅ Etapa 2 — Cliente Node para Bark (paralelo ao XTTS)
**Objetivo**: criar um módulo cliente igual ao `audio-modal.mjs`, sem alterar o atual.
- Criar `server/integracoes/ia/audio-bark-modal.mjs`.
- Implementar:
  - `generateSpeech(text, voiceId, language)`
  - `generateSpeechBatch(texts, voiceId, language)`
- Timeouts e logs compatíveis com o padrão atual.

**Validação**
- `node --check` do arquivo novo.
- Smoke test chamando o Modal Bark e validando retorno.
**Status atual**
- Implementação e validação concluídas.

---

### ✅ Etapa 3 — Feature flag + roteamento no fluxo WhatsApp
**Objetivo**: escolher engine sem quebrar comportamento.
- Adicionar `TTS_ENGINE_DEFAULT` no `.env` (default: `bark`).
- Adicionar `TTS_ENGINE_FALLBACK` no `.env` (default: `xtts`).
- Adicionar seleção por persona:
  - se persona tiver um campo (futuro): `ttsEngine`
  - enquanto isso, usar `persona.voicePreset` como “chave” para decidir Bark vs XTTS, ou usar env.
- Regras sugeridas:
  - se `TTS_ENGINE_DEFAULT=bark`, usar Bark (com fallback)
  - se `TTS_ENGINE_DEFAULT=xtts`, manter tudo como hoje
- Fallback:
  - Bark falhou → tenta XTTS
  - XTTS falhou → texto

**Validação**
- `node --check` no fluxo tocado.
- Teste manual: forçar Bark e ver 1 áudio entregue.
**Status atual**
- Implementação e validação concluídas.

---

### ✅ Etapa 4 — “Vozes” Bark: catálogo e consistência
**Objetivo**: garantir “identidade de produto” com vozes estáveis e poucas variações.
- Definir um catálogo pequeno de vozes Bark (ex.: 5–10).
- Criar mapeamento de persona → voiceId Bark:
  - simples por `voicePreset` (ex.: `sedutora`, `dominante`, etc.)
  - com fallback para `BARK_VOICE_DEFAULT`
- Garantir que o mesmo usuário/persona sempre use a mesma voz.
 - Permitir `voicePreset` com prefixo `bark:` ou id `v1/` e `v2/`.

**Validação**
- Mensagens repetidas mantêm a mesma voz/preset.
**Status atual**
- Implementação e validação concluídas.

---

### 🟡 Etapa 5 — Qualidade: tuning de texto e limites de duração
**Objetivo**: reduzir robô/artefatos mantendo estabilidade.
- Ajustar normalização de texto específica para Bark (pontuação/pausas).
- Definir limite de caracteres por chunk (Bark tende a ser melhor em respostas curtas).
- Manter concatenação para entregar 1 áudio no WhatsApp.

**Validação**
- 10 prompts variados (curtos e médios) sem “drift” perceptível.
**Status atual**
- Implementação concluída. Validação técnica concluída (10 prompts com retorno OK). Ajustes de presets pt-br e máscaras aplicados. Avaliação auditiva pendente.

---

### 🟡 Etapa 6 — Observabilidade e rollout seguro
**Objetivo**: lançar sem sustos.
- Logar qual engine foi usada (`xtts` vs `bark`), tempo e taxa de erro.
- Adicionar “kill switch” via env:
  - `TTS_ENGINE_DEFAULT=xtts` desliga Bark instantaneamente
- Fazer A/B test manual (ou por porcentagem, se quiser depois).

**Validação**
- Conseguir alternar engine sem redeploy do Modal (apenas reiniciar server).

**Status atual**
- Implementação concluída. Validação técnica concluída (ordem das engines via env confirmada). Validação operacional pendente.

---

## Perguntas esclarecedoras (para fechar o plano 100%)
Perguntas respondidas e incorporadas na Etapa 0.
