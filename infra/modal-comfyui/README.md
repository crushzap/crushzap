# Modal + ComfyUI (API serverless)

Este diretório contém o serviço Python que roda o ComfyUI no Modal e expõe um endpoint HTTP que retorna a imagem (PNG) como resposta.

## Passo a passo (depois de criar conta e pegar créditos no Modal)

### 1) Instalar e autenticar o CLI do Modal (no seu PC)

Pré-requisito: Python 3.9+

```powershell
pip install modal
modal setup
```

### 2) Criar o volume de cache (uma vez só)

O volume evita baixar modelos do zero a cada cold start.

```powershell
modal volume create comfy-cache
```

### 2.1) Subir checkpoint e LoRA do seu PC para o volume do Modal (recomendado)

Não coloque `.safetensors` dentro do repo (fica gigante, lento e costuma vazar em commit). O ideal é subir para o Volume do Modal e o `app.py` cria links simbólicos para as pastas do ComfyUI.

Se o seu `modal` não está no PATH, use `python -m modal ...`.

Exemplos (ajuste os caminhos locais):

```powershell
python -m modal volume put comfy-cache "C:\caminho\juggernautXL_ragnarokBy.safetensors" "/checkpoints/"
python -m modal volume put comfy-cache "C:\caminho\Nobody_margaux.safetensors" "/loras/"
python -m modal volume ls comfy-cache /
```

### 3) Preparar o workflow API do ComfyUI

1. Abra seu ComfyUI local.
2. Monte/ajuste o workflow.
3. Exporte em formato de API (API Format).
4. Salve como `workflow_api.json` nesta pasta:
   - `infra/modal-comfyui/workflow_api.json`

### 4) Ajustar os nós do workflow (prompt/negative/filename)

O serviço tenta identificar automaticamente nós de texto (CLIPTextEncode) e o nó de `filename_prefix`, mas o mais confiável é setar estas env vars no Modal:

- `WORKFLOW_PROMPT_NODE_ID` (ex.: `6`)
- `WORKFLOW_NEGATIVE_NODE_ID` (ex.: `7`)
- `WORKFLOW_FILENAME_NODE_ID` (ex.: `9`)

Você encontra esses IDs olhando o JSON exportado.

### 4.1) Configurar quais arquivos de checkpoint/LoRA o Modal deve usar

No Modal (env vars do app), configure:

- `CHECKPOINT_FILENAME` (ex.: `juggernautXL_ragnarokBy.safetensors`)
- `LORA_FILENAME` (ex.: `Nobody_margaux.safetensors`)

O serviço procura primeiro no Volume:

- `/cache/checkpoints/<CHECKPOINT_FILENAME>`
- `/cache/loras/<LORA_FILENAME>`

Se não achar, ele tenta baixar via HuggingFace (quando `MODEL_REPO_ID` / `LORA_REPO_ID` estiverem configurados).

### 5) Deploy do serviço no Modal

Na pasta `infra/modal-comfyui`:

```powershell
modal deploy app.py
```

Depois do deploy, o Modal vai mostrar uma URL pública do endpoint. Guarde essa URL.

### 5.1) Ajustes recomendados no Modal (evitar timeout / ajustar porta)

No Modal, configure env vars do app:

- `COMFYUI_PORT=8188` (porta padrão do ComfyUI; o launch usa `-- --port ...`)
- `WEB_TIMEOUT=1200` (segundos; evita cancelamento em cold start)
- `JOB_TIMEOUT=1200` (segundos; timeout do `comfy run`)

### 6) Configurar o CrushZap para usar o Modal

No `.env` do CrushZap, configure:

- `MODAL_COMFY_API_URL` = URL do endpoint do Modal
- `MODAL_COMFY_TIMEOUT_MS` = timeout total (ex.: `180000`)
- (opcional) `MODAL_COMFY_API_KEY` = chave para proteger o endpoint (se você implementar validação no serviço)

### 7) Teste rápido (sem WhatsApp)

Use um script/node ou Postman/Insomnia para fazer POST no `MODAL_COMFY_API_URL` com JSON:

```json
{
  "prompt": "sua descrição aqui",
  "negative_prompt": "",
  "aspect_ratio": "2:3",
  "steps": 36,
  "cfg": 2.7,
  "refs": [],
  "poseType": ""
}
```

Se estiver ok, a resposta será `image/png`.
