Ótima escolha! Modal.com é uma das melhores opções para rodar ComfyUI de forma serverless/on-demand — ou seja, a GPU só liga quando você chama a API (via POST com o workflow JSON + prompt), processa a imagem e desliga automaticamente após um tempo idle (configurable, ex.: 5 minutos). Isso evita custos "always-on" como em alguns planos do RunComfy, e é perfeito pro seu CrushZap (pay-per-use real, escalável, integra fácil no Node.js).
Aqui o guia prático passo a passo para começar (baseado no exemplo oficial do Modal para ComfyUI + Flux em 2026). Você vai deployar um endpoint API que recebe prompt (e refs para consistência) e retorna a imagem gerada.
1. Cadastro e Setup Inicial (leva 5-10 min)

Vá em https://modal.com e crie uma conta gratuita (email ou GitHub/Google).
Instale o CLI no seu PC local (precisa Python 3.9+):textpip install modal
Autentique:textmodal setup(Vai abrir browser pra login e gerar token. Se erro, tente python -m modal setup.)
Modal dá créditos iniciais grátis para novos users (geralmente $10-30, suficiente pra dezenas/milhas de testes com Flux Schnell/Dev). Depois é pay-per-second de GPU (RTX/A100/L40S ~$0.50-2/hora, dependendo do tipo — ex.: 30s por imagem = centavos).

2. Estrutura Básica do Projeto
Crie uma pasta no seu PC:
textmkdir modal-comfyui
cd modal-comfyui
Crie arquivos:

app.py (código principal)
workflow_api.json (seu workflow exportado do ComfyUI local ou online, com "API Format")

3. Código Principal (app.py) — Copie e adapte
Aqui uma versão simplificada baseada no exemplo oficial do Modal. Ele instala ComfyUI, baixa Flux Schnell (leve e rápido pra testes), roda headless e expõe uma API POST.
Python# app.py
import json
import subprocess
import uuid
from pathlib import Path
from typing import Dict

import modal
from fastapi import Response

app = modal.App("crushzap-comfyui")

# Imagem base com ComfyUI + deps
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install("fastapi[standard]==0.115.4", "comfy-cli==1.5.3", "huggingface-hub==0.36.0")
    .run_commands("comfy --skip-prompt install --fast-deps --nvidia --version 0.3.71")
    # Instale nodes custom se precisar (ex.: IPAdapter, PuLID)
    # .run_commands("comfy node install --fast-deps ipadapter-plus@latest")  # exemplo
)

# Volume para cache de models (evita redownload toda vez)
vol = modal.Volume.from_name("comfy-cache", create_if_missing=True)

# Baixe Flux Schnell (ou troque por Dev uncensored merge do Civitai/HF)
def download_model():
    from huggingface_hub import hf_hub_download
    model_path = hf_hub_download(
        repo_id="Comfy-Org/flux1-schnell",
        filename="flux1-schnell-fp8.safetensors",
        cache_dir="/cache",
    )
    subprocess.run(f"ln -s {model_path} /root/comfy/ComfyUI/models/checkpoints/flux1-schnell-fp8.safetensors", shell=True, check=True)

image = image.run_function(download_model, volumes={"/cache": vol})

# Adicione seu workflow JSON (exporte do ComfyUI com "API Format")
image = image.add_local_file(Path(__file__).parent / "workflow_api.json", "/root/workflow_api.json")

@app.cls(
    gpu="A10G",  # Comece com A10G barato (~$0.50/h); troque pra L40S/H100 se precisar mais VRAM
    image=image,
    volumes={"/cache": vol},
    scaledown_window=300,  # Desliga após 5 min idle
    timeout=1200,  # 20 min max por geração
)
class ComfyUI:
    port: int = 8000

    @modal.enter()
    def start_comfy(self):
        subprocess.Popen(["comfy", "launch", "--background", "--port", str(self.port)])

    def poll_health(self):
        import requests
        try:
            requests.get(f"http://127.0.0.1:{self.port}/system_stats", timeout=5)
        except:
            raise RuntimeError("ComfyUI not healthy")

    @modal.method()
    def generate(self, prompt: str):
        self.poll_health()
        workflow_path = "/root/workflow_api.json"
        workflow = json.loads(Path(workflow_path).read_text())

        # Atualiza prompt no node de texto (ajuste ID do node conforme seu workflow)
        workflow["6"]["inputs"]["text"] = prompt  # Exemplo: node 6 = CLIP Text Encode

        client_id = uuid.uuid4().hex
        workflow["9"]["inputs"]["filename_prefix"] = client_id  # Node Save Image

        temp_workflow = f"/tmp/{client_id}.json"
        with open(temp_workflow, "w") as f:
            json.dump(workflow, f)

        # Rode o workflow
        subprocess.run(
            ["comfy", "run", "--workflow", temp_workflow, "--wait", "--timeout", "1200", "--verbose"],
            check=True,
        )

        # Pega a imagem gerada
        output_dir = Path("/root/comfy/ComfyUI/output")
        for file in output_dir.iterdir():
            if file.name.startswith(client_id):
                return file.read_bytes()

        raise RuntimeError("No image generated")

@app.function()
@modal.web_endpoint(method="POST")
def api(prompt: str):
    comfy = ComfyUI()
    img_bytes = comfy.generate.remote(prompt)
    return Response(img_bytes, media_type="image/png")
4. Deploy e Teste

Rode localmente pra testar (usa GPU cloud):textmodal run app.py
Deploy como app permanente:textmodal deploy app.pyModal dá um URL público (ex.: https://seu-user--api.modal.run). Chame via POST:JSON{
  "prompt": "seu prompt explícito aqui"
}
No seu Node.js: Use axios.post pro URL do Modal, passe o prompt dinâmico (do fixedPrompts).

5. Dicas para Flux Uncensored + Consistência

Troque o model por merge uncensored: Baixe do Civitai (ex.: flux.1dev-uncensored-msfluxnsfw) → adicione no download_model() via hf_hub_download ou curl.
Para refs/consistência: Adicione IPAdapter/PuLID no workflow JSON → passe URLs de refs no payload da API (adicione param "reference_images": [] no generate).
GPU: Comece com "A10G" (barato, 24GB VRAM). Para Flux Dev full: "L40S" ou "H100".
Cold start: Primeira chamada ~30-90s (container + load model). Depois <10s se idle recente.
Custo: Testes iniciais grátis. Depois ~R$ 0.10-0.50 por imagem longa (Flux Dev).

Se travar em algum passo (ex.: erro no download model), me manda o erro que eu ajudo a debuggar. Ou se quiser workflow JSON pronto pra close-up buceta/consolo, posso sugerir como exportar/adaptar. Vai ficar top pro seu SaaS — sob demanda, sem GPU parada! 🔥 Boa sorte no deploy! 😏