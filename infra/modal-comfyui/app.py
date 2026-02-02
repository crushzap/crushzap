import base64
import json
import os
import subprocess
import time
import uuid
from pathlib import Path

import modal

app = modal.App("crushzap-comfyui")


def _read_env_str(name: str, default: str = "") -> str:
    v = (os.environ.get(name) or "").strip()
    return v if v else default


def _read_env_int(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    try:
        return int(raw)
    except Exception:
        return default


def _modal_secrets() -> list[modal.Secret]:
    secret_name = _read_env_str("MODAL_COMFY_SECRET_NAME", "custom-secret")
    return [modal.Secret.from_name(secret_name)] if secret_name else []


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install(
        "fastapi[standard]==0.115.4",
        "comfy-cli==1.5.3",
        "huggingface-hub==0.36.0",
        "requests==2.32.3",
    )
    .run_commands("comfy --skip-prompt install --fast-deps --nvidia --version 0.3.71")
    .run_commands(
        "mkdir -p /root/comfy/ComfyUI/custom_nodes",
        "rm -rf /root/comfy/ComfyUI/custom_nodes/ComfyUI_IPAdapter_plus || true",
        "cd /root/comfy/ComfyUI/custom_nodes && git clone --depth 1 https://github.com/cubiq/ComfyUI_IPAdapter_plus.git",
        "test -f /root/comfy/ComfyUI/custom_nodes/ComfyUI_IPAdapter_plus/requirements.txt && python -m pip install -r /root/comfy/ComfyUI/custom_nodes/ComfyUI_IPAdapter_plus/requirements.txt || true",
    )
)

vol = modal.Volume.from_name("comfy-cache", create_if_missing=True)


def _download_default_model():
    from huggingface_hub import hf_hub_download
    import os

    cache_root = _read_env_str("MODEL_CACHE_DIR", "/cache")
    ckpt_dir = "/root/comfy/ComfyUI/models/checkpoints"
    lora_dir = "/root/comfy/ComfyUI/models/loras"
    clip_vision_dir = "/root/comfy/ComfyUI/models/clip_vision"
    ipadapter_dir = "/root/comfy/ComfyUI/models/ipadapter"
    os.makedirs(ckpt_dir, exist_ok=True)
    os.makedirs(lora_dir, exist_ok=True)
    os.makedirs(clip_vision_dir, exist_ok=True)
    os.makedirs(ipadapter_dir, exist_ok=True)

    def link_if_exists(src_path: str, dest_path: str) -> bool:
        if os.path.exists(src_path):
            subprocess.run(f"ln -sf {src_path} {dest_path}", shell=True, check=True)
            return True
        return False

    checkpoint_filename = _read_env_str("CHECKPOINT_FILENAME", _read_env_str("MODEL_FILENAME", "flux1-schnell-fp8.safetensors"))
    checkpoint_from_volume = f"{cache_root}/checkpoints/{checkpoint_filename}"
    checkpoint_dest = f"{ckpt_dir}/{checkpoint_filename}"

    if not link_if_exists(checkpoint_from_volume, checkpoint_dest):
        repo_id = _read_env_str("MODEL_REPO_ID", "Comfy-Org/flux1-schnell")
        token = _read_env_str("HF_TOKEN", "")
        model_path = hf_hub_download(
            repo_id=repo_id,
            filename=checkpoint_filename,
            cache_dir=cache_root,
            token=token if token else None,
        )
        subprocess.run(f"ln -sf {model_path} {checkpoint_dest}", shell=True, check=True)

    lora_filename = _read_env_str("LORA_FILENAME", "")
    if lora_filename:
        lora_from_volume = f"{cache_root}/loras/{lora_filename}"
        lora_dest = f"{lora_dir}/{lora_filename}"
        if not link_if_exists(lora_from_volume, lora_dest):
            lora_repo_id = _read_env_str("LORA_REPO_ID", "")
            if lora_repo_id:
                token = _read_env_str("HF_TOKEN", "")
                lora_path = hf_hub_download(
                    repo_id=lora_repo_id,
                    filename=lora_filename,
                    cache_dir=cache_root,
                    token=token if token else None,
                )
                subprocess.run(f"ln -sf {lora_path} {lora_dest}", shell=True, check=True)

    clip_vision_filename = _read_env_str("CLIP_VISION_FILENAME", "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors")
    if clip_vision_filename:
        clip_vision_repo_id = _read_env_str("CLIP_VISION_REPO_ID", "h94/IP-Adapter")
        clip_vision_hf_filename = _read_env_str("CLIP_VISION_HF_FILENAME", "models/image_encoder/model.safetensors")
        clip_vision_from_volume = f"{cache_root}/clip_vision/{clip_vision_filename}"
        clip_vision_dest = f"{clip_vision_dir}/{clip_vision_filename}"
        if not link_if_exists(clip_vision_from_volume, clip_vision_dest):
            token = _read_env_str("HF_TOKEN", "")
            model_path = hf_hub_download(
                repo_id=clip_vision_repo_id,
                filename=clip_vision_hf_filename,
                cache_dir=cache_root,
                token=token if token else None,
            )
            os.makedirs(f"{cache_root}/clip_vision", exist_ok=True)
            subprocess.run(f"cp -f {model_path} {clip_vision_from_volume}", shell=True, check=True)
            subprocess.run(f"ln -sf {clip_vision_from_volume} {clip_vision_dest}", shell=True, check=True)

    ipadapter_filename = _read_env_str("IPADAPTER_FILENAME", "ip-adapter-plus_sdxl_vit-h.safetensors")
    if ipadapter_filename:
        ipadapter_repo_id = _read_env_str("IPADAPTER_REPO_ID", "h94/IP-Adapter")
        ipadapter_hf_filename = _read_env_str("IPADAPTER_HF_FILENAME", "sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors")
        ipadapter_from_volume = f"{cache_root}/ipadapter/{ipadapter_filename}"
        ipadapter_dest = f"{ipadapter_dir}/{ipadapter_filename}"
        if not link_if_exists(ipadapter_from_volume, ipadapter_dest):
            token = _read_env_str("HF_TOKEN", "")
            model_path = hf_hub_download(
                repo_id=ipadapter_repo_id,
                filename=ipadapter_hf_filename,
                cache_dir=cache_root,
                token=token if token else None,
            )
            os.makedirs(f"{cache_root}/ipadapter", exist_ok=True)
            subprocess.run(f"cp -f {model_path} {ipadapter_from_volume}", shell=True, check=True)
            subprocess.run(f"ln -sf {ipadapter_from_volume} {ipadapter_dest}", shell=True, check=True)


image = image.run_function(_download_default_model, volumes={"/cache": vol})
image = image.add_local_file(Path(__file__).parent / "workflow_api.json", "/root/workflow_api.json")
image = image.add_local_file(Path(__file__).parent / "workflow_pack_api.json", "/root/workflow_pack_api.json")

def _extract_assets_from_workflow(workflow: dict) -> tuple[str, str, str, str]:
    ckpt_name = ""
    lora_name = ""
    clip_vision_name = ""
    ipadapter_name = ""
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        class_type = str(node.get("class_type") or "")
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        if not ckpt_name and class_type == "CheckpointLoaderSimple":
            ckpt_name = str(inputs.get("ckpt_name") or "").strip()
        if not lora_name and class_type == "LoraLoader":
            lora_name = str(inputs.get("lora_name") or "").strip()
        if not clip_vision_name and class_type == "CLIPVisionLoader":
            clip_vision_name = str(inputs.get("clip_name") or "").strip()
        if not ipadapter_name and class_type == "IPAdapterModelLoader":
            ipadapter_name = str(inputs.get("ipadapter_file") or "").strip()
    return ckpt_name, lora_name, clip_vision_name, ipadapter_name


def _ensure_assets_present():
    import os
    import shutil

    cache_root = _read_env_str("MODEL_CACHE_DIR", "/cache")
    ckpt_dir = "/root/comfy/ComfyUI/models/checkpoints"
    lora_dir = "/root/comfy/ComfyUI/models/loras"
    clip_vision_dir = "/root/comfy/ComfyUI/models/clip_vision"
    ipadapter_dir = "/root/comfy/ComfyUI/models/ipadapter"
    os.makedirs(ckpt_dir, exist_ok=True)
    os.makedirs(lora_dir, exist_ok=True)

    wf_default = json.loads(Path("/root/workflow_api.json").read_text(encoding="utf-8"))
    wf_pack = json.loads(Path("/root/workflow_pack_api.json").read_text(encoding="utf-8"))
    ckpt_default, lora_default, clip_default, ip_default = _extract_assets_from_workflow(wf_default)
    ckpt_pack, lora_pack, clip_pack, ip_pack = _extract_assets_from_workflow(wf_pack)

    checkpoint_filename = _read_env_str("CHECKPOINT_FILENAME", ckpt_default or ckpt_pack)
    lora_filename = _read_env_str("LORA_FILENAME", lora_default or lora_pack)
    clip_vision_filename = _read_env_str("CLIP_VISION_FILENAME", clip_default or clip_pack)
    ipadapter_filename = _read_env_str("IPADAPTER_FILENAME", ip_default or ip_pack)

    if checkpoint_filename:
        src = f"{cache_root}/checkpoints/{checkpoint_filename}"
        dest = f"{ckpt_dir}/{checkpoint_filename}"
        if os.path.exists(src):
            try:
                if not os.path.exists(dest):
                    shutil.copyfile(src, dest)
                else:
                    subprocess.run(f"ln -sf {src} {dest}", shell=True, check=True)
            except Exception:
                subprocess.run(f"ln -sf {src} {dest}", shell=True, check=True)
        print("[Assets] checkpoint", {"default": ckpt_default, "pack": ckpt_pack, "env": _read_env_str("CHECKPOINT_FILENAME", ""), "src_exists": os.path.exists(src), "dest_exists": os.path.exists(dest)})

    if lora_filename:
        src = f"{cache_root}/loras/{lora_filename}"
        dest = f"{lora_dir}/{lora_filename}"
        if os.path.exists(src):
            try:
                if not os.path.exists(dest):
                    shutil.copyfile(src, dest)
                else:
                    subprocess.run(f"ln -sf {src} {dest}", shell=True, check=True)
            except Exception:
                subprocess.run(f"ln -sf {src} {dest}", shell=True, check=True)
        print("[Assets] lora", {"default": lora_default, "pack": lora_pack, "env": _read_env_str("LORA_FILENAME", ""), "src_exists": os.path.exists(src), "dest_exists": os.path.exists(dest)})

    if clip_vision_filename:
        os.makedirs(clip_vision_dir, exist_ok=True)
        src = f"{cache_root}/clip_vision/{clip_vision_filename}"
        dest = f"{clip_vision_dir}/{clip_vision_filename}"
        if os.path.exists(src):
            try:
                if not os.path.exists(dest):
                    shutil.copyfile(src, dest)
                else:
                    subprocess.run(f"ln -sf {src} {dest}", shell=True, check=True)
            except Exception:
                subprocess.run(f"ln -sf {src} {dest}", shell=True, check=True)
        print("[Assets] clip_vision", {"default": clip_default, "pack": clip_pack, "env": _read_env_str("CLIP_VISION_FILENAME", ""), "src_exists": os.path.exists(src), "dest_exists": os.path.exists(dest)})

    if ipadapter_filename:
        os.makedirs(ipadapter_dir, exist_ok=True)
        src = f"{cache_root}/ipadapter/{ipadapter_filename}"
        dest = f"{ipadapter_dir}/{ipadapter_filename}"
        if os.path.exists(src):
            try:
                if not os.path.exists(dest):
                    shutil.copyfile(src, dest)
                else:
                    subprocess.run(f"ln -sf {src} {dest}", shell=True, check=True)
            except Exception:
                subprocess.run(f"ln -sf {src} {dest}", shell=True, check=True)
        print("[Assets] ipadapter", {"default": ip_default, "pack": ip_pack, "env": _read_env_str("IPADAPTER_FILENAME", ""), "src_exists": os.path.exists(src), "dest_exists": os.path.exists(dest)})

    try:
        ckpts = sorted(os.listdir(ckpt_dir))[:50]
        loras = sorted(os.listdir(lora_dir))[:50]
        print("[Assets] models/checkpoints (first 50):", ckpts)
        print("[Assets] models/loras (first 50):", loras)
        clips = sorted(os.listdir(clip_vision_dir))[:50]
        ips = sorted(os.listdir(ipadapter_dir))[:50]
        print("[Assets] models/clip_vision (first 50):", clips)
        print("[Assets] models/ipadapter (first 50):", ips)
    except Exception:
        pass


def _pick_clip_text_nodes(workflow: dict) -> list[str]:
    ids = []
    for node_id, node in workflow.items():
        if not isinstance(node, dict):
            continue
        class_type = str(node.get("class_type") or "")
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        if "text" in inputs and "cliptextencode" in class_type.lower():
            ids.append(str(node_id))
    return ids


def _apply_workflow_params(workflow: dict, params: dict) -> dict:
    prompt = str(params.get("prompt") or "")
    negative = str(params.get("negative_prompt") or "")
    prompt_node_id = _read_env_str("WORKFLOW_PROMPT_NODE_ID", "")
    negative_node_id = _read_env_str("WORKFLOW_NEGATIVE_NODE_ID", "")
    filename_node_id = _read_env_str("WORKFLOW_FILENAME_NODE_ID", "")

    if prompt_node_id and prompt_node_id in workflow:
        workflow[prompt_node_id].setdefault("inputs", {})["text"] = prompt
    if negative_node_id and negative_node_id in workflow:
        workflow[negative_node_id].setdefault("inputs", {})["text"] = negative

    if (not prompt_node_id) or (negative and not negative_node_id):
        clip_ids = _pick_clip_text_nodes(workflow)
        if clip_ids:
            if not prompt_node_id:
                workflow[clip_ids[0]].setdefault("inputs", {})["text"] = prompt
            if negative and not negative_node_id and len(clip_ids) > 1:
                workflow[clip_ids[1]].setdefault("inputs", {})["text"] = negative

    if filename_node_id and filename_node_id in workflow:
        workflow[filename_node_id].setdefault("inputs", {})["filename_prefix"] = str(params.get("filename_prefix") or "")
    else:
        for node in workflow.values():
            if not isinstance(node, dict):
                continue
            inputs = node.get("inputs")
            if isinstance(inputs, dict) and "filename_prefix" in inputs:
                inputs["filename_prefix"] = str(params.get("filename_prefix") or "")
                break

    passthrough = {
        "seed": params.get("seed"),
        "steps": params.get("steps"),
        "cfg": params.get("cfg"),
        "aspect_ratio": params.get("aspect_ratio"),
        "poseType": params.get("poseType"),
        "refs": params.get("refs"),
    }
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        class_type = str(node.get("class_type") or "")
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for k, v in passthrough.items():
            if v is None:
                continue
            if k in inputs:
                inputs[k] = v

        if class_type in ("IPAdapterApply", "IPAdapterAdvanced"):
            if params.get("ipadapter_weight") is not None and "weight" in inputs:
                inputs["weight"] = float(params.get("ipadapter_weight"))
            if params.get("ipadapter_noise") is not None and "noise" in inputs:
                inputs["noise"] = float(params.get("ipadapter_noise"))
            if params.get("ipadapter_weight_type") is not None and "weight_type" in inputs:
                inputs["weight_type"] = str(params.get("ipadapter_weight_type"))
            if params.get("ipadapter_start_at") is not None and "start_at" in inputs:
                inputs["start_at"] = float(params.get("ipadapter_start_at"))
            if params.get("ipadapter_end_at") is not None and "end_at" in inputs:
                inputs["end_at"] = float(params.get("ipadapter_end_at"))

    return workflow


@app.cls(
    gpu=_read_env_str("GPU_TYPE", "A10G"),
    image=image,
    volumes={"/cache": vol},
    secrets=_modal_secrets(),
    scaledown_window=_read_env_int("SCALEDOWN_WINDOW", 300),
    timeout=_read_env_int("JOB_TIMEOUT", 1200),
)
class ComfyUI:
    port: int = _read_env_int("COMFYUI_PORT", 8188)
    _log_path: str = "/tmp/comfyui-server.log"
    _log_file = None

    @modal.enter()
    def start(self):
        _ensure_assets_present()
        launch = ["python", "main.py", "--listen", "127.0.0.1", "--port", str(self.port)]
        try:
            self._log_file = open(self._log_path, "a", encoding="utf-8", buffering=1)
            subprocess.Popen(launch, cwd="/root/comfy/ComfyUI", stdout=self._log_file, stderr=subprocess.STDOUT)
        except Exception:
            subprocess.Popen(launch, cwd="/root/comfy/ComfyUI")
        import requests

        started = time.time()
        while time.time() - started < 90:
            try:
                r = requests.get(f"http://127.0.0.1:{self.port}/system_stats", timeout=5)
                if r.status_code == 200:
                    return
            except Exception:
                pass
            time.sleep(1)
        raise RuntimeError("ComfyUI não respondeu no healthcheck")

    @modal.method()
    def generate(self, payload: dict) -> bytes:
        requested = str((payload or {}).get("workflow") or "").strip().lower()
        workflow_path = "/root/workflow_pack_api.json" if requested == "pack" else "/root/workflow_api.json"
        workflow = json.loads(Path(workflow_path).read_text(encoding="utf-8"))
        client_id = uuid.uuid4().hex

        params = dict(payload or {})
        params["filename_prefix"] = client_id
        workflow = _apply_workflow_params(workflow, params)

        def find_first_node_id(class_type: str) -> str | None:
            target = class_type.lower().strip()
            for node_id, node in workflow.items():
                if isinstance(node, dict) and str(node.get("class_type") or "").lower().strip() == target:
                    return str(node_id)
            return None

        refs = params.get("refs")
        if not isinstance(refs, list):
            refs = []
        refs = [str(u).strip() for u in refs if str(u or "").strip()]

        use_ref_as_init = params.get("use_ref_as_init")
        if not isinstance(use_ref_as_init, bool):
            use_ref_as_init = True

        if refs:
            load_image_id = find_first_node_id("LoadImage")
            vae_encode_id = find_first_node_id("VAEEncode")
            ksampler_id = find_first_node_id("KSampler")
            empty_latent_id = find_first_node_id("EmptyLatentImage")
            if load_image_id:
                import requests
                from urllib.parse import urlparse

                input_dir = Path("/root/comfy/ComfyUI/input")
                input_dir.mkdir(parents=True, exist_ok=True)
                ref_b64 = params.get("ref_image_base64")
                ref_bytes = None
                if isinstance(ref_b64, str) and ref_b64.strip():
                    try:
                        ref_bytes = base64.b64decode(ref_b64.strip(), validate=False)
                    except Exception as e:
                        raise RuntimeError("ref_image_base64 inválido") from e
                if ref_bytes is None:
                    url = refs[0]
                    parsed = urlparse(url)
                    ext = Path(parsed.path).suffix.lower().lstrip(".")
                    if ext not in ("png", "jpg", "jpeg", "webp"):
                        ext = "png"
                    headers = {
                        "User-Agent": "Mozilla/5.0",
                        "Accept": "image/*,*/*;q=0.8",
                    }
                    candidates = [url]
                    if "download=" not in url.lower():
                        candidates.append(url + ("&" if "?" in url else "?") + "download=1")
                    r = None
                    for u in candidates:
                        try:
                            r = requests.get(u, headers=headers, timeout=45)
                            if r.ok:
                                break
                        except Exception:
                            continue
                    if r is None:
                        raise RuntimeError("Falha ao baixar ref (sem resposta HTTP)")
                    r.raise_for_status()
                    ref_bytes = r.content
                file_name = f"{client_id}_ref.png"
                file_path = input_dir / file_name
                file_path.write_bytes(ref_bytes)
                if not file_path.exists() or file_path.stat().st_size < 64:
                    raise RuntimeError("Falha ao baixar ref (arquivo vazio)")

                workflow[load_image_id].setdefault("inputs", {})["image"] = file_name

                if ksampler_id:
                    if use_ref_as_init and vae_encode_id:
                        workflow[ksampler_id].setdefault("inputs", {})["latent_image"] = [vae_encode_id, 0]
                        if "denoise" in workflow[ksampler_id].get("inputs", {}):
                            workflow[ksampler_id]["inputs"]["denoise"] = float(params.get("denoise") or _read_env_str("REF_DENOISE", "0.6"))
                    else:
                        if empty_latent_id:
                            workflow[ksampler_id].setdefault("inputs", {})["latent_image"] = [empty_latent_id, 0]
                        if "denoise" in workflow[ksampler_id].get("inputs", {}):
                            workflow[ksampler_id]["inputs"]["denoise"] = 1
        else:
            ksampler_id = find_first_node_id("KSampler")
            empty_latent_id = find_first_node_id("EmptyLatentImage")
            if ksampler_id and empty_latent_id:
                workflow[ksampler_id].setdefault("inputs", {})["latent_image"] = [empty_latent_id, 0]
                if "denoise" in workflow[ksampler_id].get("inputs", {}):
                    workflow[ksampler_id]["inputs"]["denoise"] = 1

        temp_workflow = f"/tmp/{client_id}.json"
        Path(temp_workflow).write_text(json.dumps(workflow), encoding="utf-8")

        import requests
        import time
        from urllib.parse import quote

        api_base = f"http://127.0.0.1:{self.port}"
        timeout_s = int(_read_env_int("JOB_TIMEOUT", 1200))
        start_t = time.time()
        try:
            pr = requests.post(
                f"{api_base}/prompt",
                json={"prompt": workflow, "client_id": client_id},
                timeout=30,
            )
            pr.raise_for_status()
            prompt_id = (pr.json() or {}).get("prompt_id")
            if not prompt_id:
                raise RuntimeError(f"ComfyUI não retornou prompt_id. body={pr.text[:1000]}")
        except Exception as e:
            server_log_tail = ""
            try:
                if Path(self._log_path).exists():
                    server_log_tail = Path(self._log_path).read_text(encoding="utf-8", errors="ignore")[-4000:]
            except Exception:
                server_log_tail = ""
            resp_text = ""
            try:
                resp_text = pr.text[:2000]  # type: ignore[name-defined]
            except Exception:
                resp_text = ""
            raise RuntimeError(f"Falha ao enfileirar prompt no ComfyUI. resp={resp_text} server_log_tail={server_log_tail}") from e

        last_history = None
        while time.time() - start_t < timeout_s:
            try:
                hr = requests.get(f"{api_base}/history/{quote(str(prompt_id))}", timeout=30)
                hr.raise_for_status()
                last_history = hr.json()
                if isinstance(last_history, dict) and str(prompt_id) in last_history:
                    info = last_history[str(prompt_id)] or {}
                    if info.get("status") and isinstance(info["status"], dict):
                        status_str = str(info["status"].get("status_str") or "")
                        if status_str.lower() in ("success", "error"):
                            if status_str.lower() == "error":
                                raise RuntimeError(f"ComfyUI retornou status=error. history={json.dumps(info)[:2000]}")
                            break
            except Exception:
                pass
            time.sleep(0.5)
        else:
            raise RuntimeError(f"Timeout aguardando ComfyUI finalizar. prompt_id={prompt_id} history={str(last_history)[:1000]}")

        output_dir = Path("/root/comfy/ComfyUI/output")
        candidates = []
        for file in output_dir.iterdir():
            if file.name.startswith(client_id):
                candidates.append(file)
        if not candidates:
            raise RuntimeError("Nenhuma imagem foi gerada")
        candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        return candidates[0].read_bytes()


@app.function(image=image, timeout=_read_env_int("WEB_TIMEOUT", 1200), secrets=_modal_secrets())
@((getattr(modal, "fastapi_endpoint", None) or getattr(modal, "web_endpoint"))(method="POST"))
def api(payload: dict | None = None):
    from fastapi import Response
    from fastapi.responses import JSONResponse

    if not isinstance(payload, dict):
        return JSONResponse({"error": "Body JSON inválido"}, status_code=400)
    if not str(payload.get("prompt") or "").strip():
        return JSONResponse({"error": "Campo 'prompt' é obrigatório"}, status_code=400)

    comfy = ComfyUI()
    try:
        img_bytes = comfy.generate.remote(payload)
        return Response(content=img_bytes, media_type="image/png")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
