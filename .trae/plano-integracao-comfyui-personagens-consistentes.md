# Plano de Integração do ComfyUI para Personagens Consistentes (sem quebrar nada)

Este documento descreve um plano **por etapas** para integrar o ComfyUI (API remota) ao fluxo de geração de imagens NSFW do CrushZap, com foco em **personagens consistentes** via referências (IP-Adapter/PuLID) e **fluxo flexível** alinhado ao roleplay/pedido do usuário — mantendo rotas, contratos e comportamento atuais, com **fallback** para Replicate/Fal.

## Legenda de status das etapas
- 🔴 = não iniciado
- 🟡 = em andamento
- ✅ = concluído

Regra de atualização: **cada etapa começa com 🔴**. Quando iniciar, muda para 🟡. Quando finalizar e validar, muda para ✅.

---

## Regras rígidas (não negociáveis)
1. **Não alterar comportamento**: o sistema deve continuar funcionando exatamente como hoje.
2. **Não mudar rotas existentes** sem etapa específica e aprovada para isso.
3. **Não mudar contrato de resposta** (status HTTP, shape de JSON, mensagens enviadas no WhatsApp) sem aprovação explícita.
4. **Não mudar regras de negócio** de:
   - onboarding
   - billing (renovação/upgrade/avulso)
   - upgrade
   - comandos
   - controle de trial/assinatura/limites
5. **Não mudar persistência** (tabelas/colunas/semântica) e **não executar reset de banco**.
6. **Nunca executar comandos `npx prisma`** nem qualquer ação destrutiva no banco.
7. **Refatoração incremental**: inserir ComfyUI primeiro, melhorar depois. Cada etapa deve ser “pequena” e validável.
8. **Sem comentários novos no código**, a menos que você peça.
9. **Compatível com Windows/PowerShell** (sem `&&`).
10. **Conteúdo**: nudez adulta explícita permitida; **filtrar apenas ilegal** (pedofilia, bestialidade, etc.). **Sem safety-checker forçado** no provider (quando possível).
11. **UX**: manter mensagens de espera do WhatsApp (leve “atraso” humanizado).
12. **Custo-benefício**: iniciar com o que tiver melhor custo (cloud pay-as-you-go).
13. **Fallback**: manter Replicate/Fal como fallback automático.
14. **Armazenamento**: refs e imagens finais no **Supabase** (pasta dedicada a criar no bucket).
15. **Consistency Pack automático**: gerar refs da persona automaticamente (preferência por **Replicate** para custo menor).

---

## Critérios de validação (obrigatórios em toda etapa)
- `npx tsc --noEmit` passa (0 erros).
- `node --check` nos módulos tocados passa.
- Rotas principais continuam respondendo:
  - webhook WhatsApp (GET verify e POST receive)
  - admin (login + rotas principais)
  - pagamentos (checkout pix + webhook Mercado Pago)

---

## Estrutura alvo (resultado final esperado)
Separar responsabilidades e introduzir ComfyUI sem quebrar nada:
- **Integrações IA (providers)**:
  - `server/integracoes/ia/comfyui-client.mjs` (HTTP API: queue/poll/output)
  - `server/integracoes/ia/image-generator.mjs` (orquestra providers: ComfyUI → Replicate → Fal)
- **Workflows**:
  - `server/dominio/image-workflows/comfyui-workflow.json` (base parametrizável)
  - Mapeamento de inputs: prompt/negative/refs/pose
- **Persona Consistency Pack**:
  - `server/dominio/personas/consistency-pack.mjs`
  - Geração automática de 5–10 refs via Replicate (custo menor) contendo: face frontal/lateral, meio corpo, corpo nude e close-up de seios. **Sem close-up de vagina no pack**; close-ups de vagina serão gerados on-demand com ComfyUI usando ROI/Inpaint + ControlNet + IP-Adapter/PuLID para garantir qualidade/consistência.
- **WhatsApp Fluxo**:
  - Reutilizar `server/whatsapp/fluxos/conversa-agente.fluxo.mjs` sem mudar contrato
  - Apenas direcionar provider preferencial e escolher refs/pose conforme a tag `[SEND_PHOTO]`

---

## Etapas (por ordem de execução)

### 🔴 Etapa 0 — Linha de base e travas de segurança
**Objetivo**: baseline antes de mexer.
- Rodar validações base (TypeScript e check Node).
- Confirmar que o webhook WhatsApp e fluxos estão operacionais.

**Validação**
- `npx tsc --noEmit`
- `node --check server/index.mjs` e módulos tocados

---

### 🟡 Etapa 1 — Cliente ComfyUI (API remota)
**Objetivo**: criar cliente HTTP para enfileirar e recuperar resultado.
- Criar `server/integracoes/ia/comfyui-client.mjs` com:
  - `queuePrompt(payload)` → POST `/prompt` (body com workflow + inputs dinâmicos)
  - `pollStatus(jobId|status_url)` → aguarda conclusão
  - `getOutputs(jobId)` → baixa imagem (URL ou bytes)
- Variáveis de ambiente:
  - `COMFYUI_API_BASE`, `COMFYUI_API_KEY` (se exigido), `COMFYUI_TIMEOUT_MS`

**Regras da etapa**
- Não mudar o shape de retorno do orquestrador: `{ ok, url, provider, error? }`
- Sem safety-checker forçado; permitir NSFW adulto.

**Validação**
- `npx tsc --noEmit`
- `node --check server/integracoes/ia/comfyui-client.mjs`

---

### 🔴 Etapa 2 — Workflow ComfyUI NSFW (parametrizável)
**Objetivo**: definir JSON base com IP-Adapter/PuLID + ControlNet + Sampler Flux.
- Arquivo: `server/dominio/image-workflows/comfyui-workflow.json`
- Inputs:
  - `prompt` (positivo), `negative_prompt`
  - `refs[]` (face/corpo/close-up), `poseType` (e.g., `close_pussy`, `breasts`)
  - `steps`, `cfg`, `aspect_ratio`

**Regras da etapa**
- Usar prompts “amateur/phone/grain/bad lighting” para estética realista.
- Evitar deformações com negatives agressivos.

**Validação**
- `node --check` no módulo que carrega/aplica o JSON

---

### 🟡 Etapa 3 — Orquestrador de providers (priorizar ComfyUI)
**Objetivo**: estender `image-generator.mjs` para tentar ComfyUI → Replicate → Fal.
- Integrar `comfyui-client.mjs` como primeira tentativa.
- Manter comportamento/fallback atuais.

**Regras da etapa**
- Mesma assinatura: `gerarImagemNSFW({ prompt, aspectRatio, negativePrompt })`.
- Logs discretos; sem vazar secrets.

**Validação**
- `npx tsc --noEmit`
- `node --check server/integracoes/ia/image-generator.mjs`

---

### 🔴 Etapa 4 — Mapeamento `[SEND_PHOTO]` → inputs ComfyUI
**Objetivo**: converter o pedido do LLM em entradas do workflow (sem mudar UX).
- Reutilizar `resolveImagePrompt(...)` para:
  - Identificar tipo: `close_pussy` (vagina) e `breasts` (seios)
  - Montar `prompt/negative` e inferir `poseType` + seleção de `refs[]`
- Não mudar a ordem/roteamento; só ampliar dados para ComfyUI.

**Validação**
- `npx tsc --noEmit`
- Fluxos WhatsApp continuam enviando texto/imagem como hoje

---

### 🟡 Etapa 5 — Consistency Pack automático (via Replicate)
**Objetivo**: gerar refs da persona (5–10 imagens) automaticamente após criação/edição.
- Criar `server/dominio/personas/consistency-pack.mjs`:
  - Tipos: face frontal, 3/4 esquerda, 3/4 direita, perfil lateral; corpo nude frente e lateral; selfie no espelho; close-up seios e seios com mãos. **Não gerar close-up vagina no pack**.
  - Provider preferencial: **Replicate** (custo menor); se falhar, ComfyUI.
  - Close-up vagina: gerado on-demand com ComfyUI usando ROI/Inpaint + ControlNet + IP-Adapter/PuLID.
- Salvar no Supabase (pasta dedicada por persona).

**Regras da etapa**
- Não alterar dados da persona além de anexar links das refs.
- Conteúdo adulto explícito permitido; filtrar apenas ilegal.

**Validação**
- `npx tsc --noEmit`
- Uploads geram URLs públicas válidas no Supabase

---

### 🔴 Etapa 6 — Armazenamento e organização no Supabase
**Objetivo**: estruturar paths e buckets.
- Pastas sugeridas:
  - Bucket de refs personas via `.env`: `SUPABASE_BUCKET_FOTOS_REFS=crushzap/images/refs-images`
  - Organização por persona: `crushzap/images/refs-images/{personaId}/...`
  - Bucket de nudes finais: existente (`SUPABASE_BUCKET_FOTOS_NUDES`) com prefixo de conversa
- **Ação do usuário**: criar a pasta de refs no bucket (conforme preferência).

**Validação**
- `node --check server/integracoes/supabase/cliente.mjs`
- Upload/GET public URL funcionando

---

### 🔴 Etapa 7 — Observabilidade, latência e custos
**Objetivo**: medir e ajustar.
- Métricas: tempo por provider, taxa de erro, custo por imagem.
- Logs leves com IDs de conversa/persona; sem conteúdos sensíveis brutos.
 - Ajustes: steps/cfg/ratio conforme qualidade vs latência aceitável no WhatsApp. Padrões sugeridos:
   - Geral 2:3: 832×1216
   - Close-ups críticos: 960×1440 (gerados dinamicamente no ComfyUI)
   - Econômico: 768×1152

**Validação**
- `npx tsc --noEmit`
- Logs sem dados sensíveis

---

### 🔴 Etapa 8 — Política de conteúdo e segurança
**Objetivo**: reforçar filtros mínimos legais.
- Adulto explícito liberado; bloquear apenas prompts ilegais (pedofilia/zoo/incesto forçado).
- Sem safety-checker externo obrigatório; controle pelo backend.

**Validação**
- Testes de prompts ilegais bloqueados e adultos permitidos

---

### 🔴 Etapa 9 — Testes em dev e Beta
**Objetivo**: validar UX e consistência antes de escalar.
- Dev local (GTX 1650): usar SDXL/Pony/Flux-schnell para validar pipeline (baixa resolução).
- Beta em cloud (RunComfy/RunPod/Modal): medir consistência/vibe amadora e tempo de resposta.
- Manter mensagens de “espera” atuais (humanização).

**Validação**
- `npx tsc --noEmit`
- Fluxo WhatsApp funcional end-to-end com ComfyUI

---

### 🔴 Etapa 10 — Escalonamento e tuning
**Objetivo**: consolidar operação em produção.
- Escolher provider cloud de melhor custo-benefício e estabilidade.
- Autoscaling e prewarming conforme volume.
- Ajustar thresholds de fallback para manter SLA.

**Validação**
- Métricas estáveis; erros dentro do aceitável

---

## Inventário mínimo de rotas (inalteradas)
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

---

## Perguntas pontuais (para afinar execução)
1. Criamos a pasta de **refs** no Supabase como `refs/{personaId}` dentro do bucket `fotos-personas`? Ou prefere outro nome (ex.: `personas-refs`)?
2. Para o **Consistency Pack**, preferimos Replicate sempre (custo), ou tentamos ComfyUI quando já houver sessão ativa (para manter estilo/refs)?
3. Tamanhos padrão das imagens de refs e das imagens finais (aspect ratio `2:3` ok)? Algum outro ratio desejado?
4. Há limite de tempo alvo por imagem (ex.: 8–15s)? Mantemos como aceitável enquanto a mensagem de espera estiver ativa.
