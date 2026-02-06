# Plano de Evolução da Geração NSFW (ComfyUI + Modal)

Este documento descreve um plano **por etapas** para evoluir a geração de imagens no Modal, introduzindo **ControlNet OpenPose** e **Inpainting** para conteúdo NSFW de alta qualidade, utilizando uma arquitetura de **Workflows Genéricos**.

**Objetivo**: Implementar controle de pose e detalhamento anatômico (close-ups) mantendo a consistência da persona, usando workflows únicos reutilizáveis.

## Legenda de status das etapas
- 🔴 = não iniciado
- 🟡 = em andamento
- ✅ = concluído

Regra de atualização: **cada etapa começa com 🔴**. Ao iniciar, mudo para 🟡. Ao finalizar e validar, mudo para ✅.

---

## Regras rígidas (não negociáveis)
1.  **Não quebrar geração atual**: O fluxo existente (`workflow_api.json`) deve continuar funcionando inalterado.
2.  **Princípio DRY (Don't Repeat Yourself)**: Utilizar workflows genéricos (`workflow_pose_api.json`) onde a pose é injetada dinamicamente, evitando múltiplos arquivos JSON.
3.  **Não resetar infra sem backup**: Alterações no `app.py` devem ser incrementais.
4.  **Compatibilidade Windows**: Comandos de terminal PowerShell-friendly.
5.  **Validação TypeScript**: `npx tsc --noEmit` deve passar zerado.

---

## Estrutura alvo (resultado final esperado)

### Infraestrutura Modal (`infra/modal-comfyui/`)
- `app.py`: Atualizado com libs (`controlnet_aux`, `impact-pack`) e modelos (`OpenPoseXL2`, `YOLO`). Lógica de injeção dinâmica de imagens de pose.
- `workflow_pose_api.json`: **Workflow Único** que aceita qualquer imagem de pose como input + IPAdapter para face.
- `workflow_inpainting_api.json`: **Workflow Único** para inpainting (close-ups) que aceita imagem base + máscara.

### Backend (`server/integracoes/ia/`)
- `modal-client.mjs`: Atualizado para enviar `pose_image_base64` e `mask_base64`.
- `image-generator.mjs`: Responsável por selecionar o arquivo de pose correto do disco (`assets/poses/`) e enviá-lo para o Modal.

### Assets (`assets/`)
- `assets/poses/`: Banco de imagens de referência (skeletons/real samples) organizados por categoria.

---

## Etapas (por ordem de execução)

### 🔴 Etapa 0 — Linha de base e inventário
**Objetivo**: Garantir estabilidade antes de começar.
- Verificar integridade de `app.py` atual.
- Criar arquivo de plano `.trae/plano-evolucao-nsfw-comfyui.md`.

**Validação**
- `npx tsc --noEmit`.

---

### 🔴 Etapa 1 — Preparação da Infraestrutura Modal (app.py)
**Objetivo**: Adicionar capacidades ao container Modal sem alterar o endpoint de execução.
- Editar `app.py` para incluir:
    - Instalação de `comfyui_controlnet_aux` e `ComfyUI-Impact-Pack`.
    - Download automático de `OpenPoseXL2.safetensors` e modelos de detecção.
- Não alterar a função `generate` ainda.

**Validação**
- Sintaxe do Python correta.
- Build do Docker (simulado ou real) sem erros.

---

### 🔴 Etapa 2 — Criação de Workflows Genéricos
**Objetivo**: Criar os templates JSON que aceitam injeção dinâmica.
- Criar `infra/modal-comfyui/workflow_pose_api.json`:
    - Adicionar nó `LoadImage` (renomeado para "Pose Input").
    - Conectar a `DWPreprocessor` -> `ControlNetApply`.
    - Manter `IPAdapter` para consistência da persona.
- Criar `infra/modal-comfyui/workflow_inpainting_api.json`:
    - Adicionar nós de inpainting e máscara.
- Registrar novos arquivos no `app.py`.

**Validação**
- JSONs válidos.
- IDs dos nós mapeados corretamente para injeção dinâmica no `app.py`.

---

### 🔴 Etapa 3 — Adaptação do Cliente Modal (Backend)
**Objetivo**: Permitir que o backend envie os assets dinâmicos.
- Atualizar `server/integracoes/ia/modal-client.mjs`:
    - Adicionar lógica para ler arquivo local (se path for passado) ou usar URL, converter para Base64 e enviar como `pose_image` ou `mask_image`.

**Validação**
- `npx tsc --noEmit`

---

### 🔴 Etapa 4 — Gestão de Assets e Roteamento
**Objetivo**: O "cérebro" que escolhe a pose.
- Criar `assets/poses/` e adicionar poses iniciais (ex: `doggy_v1.png`, `missionary_v1.png`).
- Atualizar `server/integracoes/ia/image-generator.mjs`:
    - Identificar intenção do prompt (regex ou tag).
    - Selecionar arquivo de pose correspondente.
    - Invocar `modalClient` com o novo parâmetro `pose_image`.

**Validação**
- `npx tsc --noEmit`

---

### 🔴 Etapa 5 — Deploy e Validação Final
**Objetivo**: Colocar em produção.
- Deploy da nova versão.
- Teste de geração com pose específica.

**Validação**
- Imagem gerada respeita a pose E a persona.
