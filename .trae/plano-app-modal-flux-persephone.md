# Plano de Execução (App Modal Flux Persephone) (sem quebrar nada)

Este documento descreve um plano **por etapas** para criar um novo app Modal para Flux Persephone, mantendo o app atual (SDXL/Juggernaut) intacto.

Objetivo: **isolar o novo fluxo Flux**, **reutilizar o máximo possível do app atual**, e **garantir validação por etapas**.

---

## Legenda de status das etapas
- 🔴 = não iniciado
- 🟡 = em andamento
- ✅ = concluído

Regra de atualização: **cada etapa começa com 🔴**. Quando iniciar uma etapa, mudar para 🟡. Quando finalizar e validar, mudar para ✅.

---

## Regras rígidas (não negociáveis)
1. **Não alterar comportamento** do app atual (SDXL/Juggernaut).
2. **Não apagar ou resetar banco**, nem executar comandos de reset.
3. **Nunca executar comandos `npx prisma`**.
4. **Sem comentários novos no código**, a menos que solicitado.
5. **Compatível com Windows/PowerShell** (sem `&&`).
6. **Não usar `curl`** no PowerShell.
7. **Ignorar erros de Redis e erros de auth do client** conforme regras do projeto.
8. **Modelo Persephone já baixado**: enviar direto via PowerShell para o app, usando Volume do Modal.

---

## Critérios de validação (obrigatórios em cada etapa marcada ✅)
- `npx tsc --noEmit`
- `npm run build`
- `node --check` para os arquivos `.mjs` tocados na etapa
- `python -m modal volume ls comfy-cache /` quando houver upload de modelos

---

## Estrutura alvo (resultado final esperado)

### Infra (Modal)
- `infra/modal-comfyui-flux/app.py` (novo app)
- `infra/modal-comfyui-flux/workflow_flux_api.json` (workflow base Flux)
- `infra/modal-comfyui-flux/workflow_flux_pose_api.json` (workflow pose Flux, se necessário)
- `infra/modal-comfyui-flux/workflow_flux_inpainting_api.json` (workflow inpainting Flux, se necessário)

### Server (integração)
- `server/integracoes/ia/modal-client.mjs` (suporte a endpoint do app Flux)
- `server/integracoes/ia/image-generator.mjs` (seleção de provider Flux)
- `server/whatsapp/fluxos/resolve-image-prompt.mjs` (ajustes de prompt para Flux)

---

## Etapas (por ordem de execução)

### 🔴 Etapa 0 — Preparação e inventário mínimo
**Objetivo**: mapear pontos de reutilização e confirmar estrutura atual.
- Mapear arquivos do app atual: `infra/modal-comfyui/app.py` e workflows.
- Mapear pontos de integração: `image-generator.mjs`, `modal-client.mjs`, `resolve-image-prompt.mjs`.
- Definir nome do novo app Modal e caminhos do novo diretório.

**Validação**
- `npx tsc --noEmit`
- `npm run build`

---

### 🔴 Etapa 1 — Subir modelo Persephone para o Volume do Modal
**Objetivo**: garantir que o modelo esteja disponível no Volume sem depender de download remoto.

**Comandos (PowerShell)**
```powershell
python -m modal volume put comfy-cache "E:\APLICATIVOS\projects\aura\comfyui\models\checkpoints\persephoneFluxNSFWSFW_20FP8.safetensors" "/checkpoints/"
python -m modal volume ls comfy-cache /
```

**Validação**
- `python -m modal volume ls comfy-cache /`

---

### 🔴 Etapa 2 — Criar novo app Modal Flux (infra)
**Objetivo**: copiar a base do app atual e ajustar para Flux.
- Criar `infra/modal-comfyui-flux/` copiando estrutura do app atual.
- Atualizar `app.py`:
  - `modal.App("crushzap-comfyui-flux")`
  - instalar nodes Flux no build
  - ajustar paths de modelos para Flux (unet/clip/vae conforme necessário)
  - apontar workflows Flux
- Adicionar workflows Flux em JSON (base, pose, inpainting).

**Validação**
- `python -m modal.cli.entry_point deploy .\infra\modal-comfyui-flux\app.py`

---

### 🔴 Etapa 3 — Ajustar workflows Flux
**Objetivo**: substituir nodes SDXL por Flux.
- Trocar `CheckpointLoader`/`KSampler` por `FluxLoader`/`FluxSampler`.
- Trocar `CLIPTextEncode` por `ClipTextEncodeFlux`.
- Ajustar `steps` (20–30) e `cfg` (1–4).
- Garantir `SaveImage` e nome de arquivo compatíveis com o app.

**Validação**
- `node --check` no JSON tocado não se aplica; validação via deploy e geração.

---

### 🔴 Etapa 4 — Integrar app Flux no backend
**Objetivo**: permitir seleção do novo app no fluxo de geração.
- Atualizar `modal-client.mjs` para aceitar endpoint Flux (env própria).
- Atualizar `image-generator.mjs` para chamar o app Flux quando configurado.
- Ajustar `resolve-image-prompt.mjs` para prompts Flux mais curtos e naturais.

**Validação**
- `npx tsc --noEmit`
- `npm run build`
- `node --check server/integracoes/ia/modal-client.mjs`
- `node --check server/integracoes/ia/image-generator.mjs`
- `node --check server/whatsapp/fluxos/resolve-image-prompt.mjs`

---

### 🔴 Etapa 5 — Teste de geração e ajuste fino
**Objetivo**: confirmar que o app Flux gera imagem correta.
- Usar prompt de teste Flux com anatomia detalhada e mãos corretas.
- Ajustar `steps/cfg` se necessário.

**Validação**
- Geração bem-sucedida via endpoint Modal Flux.

---

## Notas importantes
- O app atual continua intacto e pode ser usado como fallback.
- O modelo Persephone será carregado a partir do Volume do Modal.
- Qualquer ajuste de prompts deve manter consistência com o fluxo atual.
