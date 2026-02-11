import json
import os
import random
import subprocess
import time
import uuid
from pathlib import Path

import modal

app = modal.App("crushzap-comfyui-flux")

APP_VERSION = "2026-02-10-flux-persephone"
HANDS_POSITIVE_PROMPT = "Perfect hand, Detailed hand, detailed perfect hands, five fingers per hand, anatomically correct fingers, no fused fingers, no extra digits, no missing fingers, realistic hand proportions, detailed knuckles and nails, natural hand pose, small delicate feminine hands, slender fingers, petite hands, short nails"
HANDS_NEGATIVE_PROMPT = "deformed hands, mutated fingers, extra fingers, missing fingers, fused fingers, bad anatomy hands, poorly drawn hands, blurry hands, lowres hands, six fingers, three fingers, large hands, big hands, masculine hands, thick fingers"


def _read_env_str(name: str, default: str = "") -> str:
    v = (os.environ.get(name) or "").strip()
    return v if v else default


def _read_env_int(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    try:
        return int(raw)
    except Exception:
        return default


def _read_env_float(name: str, default: float) -> float:
    raw = (os.environ.get(name) or "").strip()
    try:
        return float(raw)
    except Exception:
        return default


def _modal_secrets() -> list[modal.Secret]:
    secret_name = _read_env_str("MODAL_COMFY_SECRET_NAME", "custom-secret")
    return [modal.Secret.from_name(secret_name)] if secret_name else []


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "libgl1", "libglib2.0-0", "wget", "unzip")
    .pip_install(
        "fastapi[standard]==0.115.4",
        "comfy-cli==1.5.3",
        "huggingface-hub==0.36.0",
        "requests==2.32.3",
        "pillow==11.1.0",
        "transformers==4.44.2",
    )
    .run_commands("comfy --skip-prompt install --fast-deps --nvidia --version 0.3.71")
    .run_commands(
        "mkdir -p /root/comfy/ComfyUI/custom_nodes",
        "rm -rf /root/comfy/ComfyUI/custom_nodes/ComfyUI-Manager || true",
        "rm -f /root/comfy/ComfyUI/custom_nodes/websocket_image_save.py || true",
        "mkdir -p /root/comfy/ComfyUI/models/controlnet",
        "wget https://huggingface.co/black-forest-labs/FLUX.1-controlnet/resolve/main/controlnet_flux.safetensors -O /root/comfy/ComfyUI/models/controlnet/controlnet_flux.safetensors || true",
    )
)

vol = modal.Volume.from_name("comfy-cache", create_if_missing=True)


def _ensure_assets_present():
    import shutil
    import os

    cache_root = _read_env_str("MODEL_CACHE_DIR", "/cache")
    unet_dir = "/root/comfy/ComfyUI/models/unet"
    ckpt_dir = "/root/comfy/ComfyUI/models/checkpoints"
    os.makedirs(unet_dir, exist_ok=True)
    os.makedirs(ckpt_dir, exist_ok=True)

    unet_filename = _read_env_str("FLUX_UNET_FILENAME", "flux1-dev-fp8.safetensors")
    candidates = [
        f"{cache_root}/checkpoints/{unet_filename}",
        f"{cache_root}/unet/{unet_filename}",
        f"{ckpt_dir}/{unet_filename}",
        f"{unet_dir}/{unet_filename}",
    ]
    src = ""
    for c in candidates:
        if os.path.exists(c):
            src = c
            break
    if not src:
        try:
            print(f"[Assets] Tentando baixar fallback FP8 do HuggingFace: {unet_filename}")
            from huggingface_hub import hf_hub_download
            hf_path = hf_hub_download(repo_id="Comfy-Org/flux1-dev", filename="flux1-dev-fp8.safetensors")
            if os.path.exists(hf_path):
                target = f"{ckpt_dir}/{unet_filename}"
                try:
                    shutil.copyfile(hf_path, target)
                    src = target
                    print(f"[Assets] Fallback baixado: {target}")
                except Exception as e:
                    print(f"[Assets] Erro ao copiar fallback: {e}")
        except Exception as e:
            print(f"[Assets] Falha ao baixar fallback HuggingFace: {e}")

    dest = f"{unet_dir}/{unet_filename}"
    dest_ckpt = f"{ckpt_dir}/{unet_filename}"
    if src:
        try:
            subprocess.run(f'ln -sf "{src}" "{dest}"', shell=True, check=True)
            subprocess.run(f'ln -sf "{src}" "{dest_ckpt}"', shell=True, check=True)
        except Exception:
            try:
                shutil.copyfile(src, dest)
                shutil.copyfile(src, dest_ckpt)
            except Exception as e:
                print(f"[Assets] Erro ao copiar UNet {unet_filename}: {e}")
    else:
        print(f"[Assets] UNet não encontrado: {unet_filename}")

    try:
        cache_ckpts = os.path.join(cache_root, "checkpoints")
        if os.path.isdir(cache_ckpts):
            for fname in os.listdir(cache_ckpts):
                if not (fname.endswith(".safetensors") or fname.endswith(".ckpt")):
                    continue
                full_src = os.path.join(cache_ckpts, fname)
                if not os.path.exists(full_src):
                    continue
                link_ckpt = os.path.join(ckpt_dir, fname)
                link_unet = os.path.join(unet_dir, fname)
                try:
                    subprocess.run(f'ln -sf "{full_src}" "{link_ckpt}"', shell=True, check=True)
                    subprocess.run(f'ln -sf "{full_src}" "{link_unet}"', shell=True, check=True)
                except Exception:
                    try:
                        shutil.copyfile(full_src, link_ckpt)
                        shutil.copyfile(full_src, link_unet)
                    except Exception as e:
                        print(f"[Assets] Erro ao copiar {fname}: {e}")
    except Exception as e:
        print(f"[Assets] Erro ao preparar checkpoints: {e}")

image = image.run_function(_ensure_assets_present, volumes={"/cache": vol})
image = image.add_local_file(Path(__file__).parent / "workflow_flux_api.json", "/root/workflow_flux_api.json")
image = image.add_local_file(Path(__file__).parent / "workflow_flux_persephone_api.json", "/root/workflow_flux_persephone_api.json")
image = image.add_local_file(Path(__file__).parent / "workflow_flux_persephone.json", "/root/workflow_flux_persephone.json")
image = image.add_local_file(Path(__file__).parent / "flux_inpainting.json", "/root/flux_inpainting.json")


@app.cls(
    gpu=_read_env_str("GPU_TYPE", "A100-40GB"),
    image=image,
    volumes={"/cache": vol},
    secrets=_modal_secrets(),
    scaledown_window=_read_env_int("SCALEDOWN_WINDOW", 900),
    timeout=_read_env_int("JOB_TIMEOUT", 1800),
)
class ComfyUIService:
    port: int = _read_env_int("COMFYUI_PORT", 8188)
    _log_path: str = "/tmp/comfyui-server.log"
    _log_file = None
    _object_info: dict = {}

    @modal.enter()
    def start(self):
        print("[app] Starting container...", {"version": APP_VERSION})
        try:
            _ensure_assets_present()
            time.sleep(5)
        except Exception as e:
            print(f"[app] CRITICAL: _ensure_assets_present failed: {e}")

        try:
            import shutil

            mgr = Path("/root/comfy/ComfyUI/custom_nodes/ComfyUI-Manager")
            if mgr.exists():
                shutil.rmtree(mgr, ignore_errors=True)
            ws = Path("/root/comfy/ComfyUI/custom_nodes/websocket_image_save.py")
            if ws.exists():
                try:
                    ws.unlink()
                except Exception:
                    pass
        except Exception:
            pass

        launch = ["python", "main.py", "--listen", "127.0.0.1", "--port", str(self.port)]
        try:
            self._log_file = open(self._log_path, "a", encoding="utf-8", buffering=1)
            subprocess.Popen(launch, cwd="/root/comfy/ComfyUI", stdout=self._log_file, stderr=subprocess.STDOUT)
        except Exception:
            subprocess.Popen(launch, cwd="/root/comfy/ComfyUI")

        import requests

        started = time.time()
        while time.time() - started < 180:
            try:
                r = requests.get(f"http://127.0.0.1:{self.port}/system_stats", timeout=5)
                if r.status_code == 200:
                    try:
                        oi = requests.get(f"http://127.0.0.1:{self.port}/object_info", timeout=120)
                        if oi.status_code == 200:
                            parsed = oi.json()
                            self._object_info = parsed if isinstance(parsed, dict) else {}
                    except Exception:
                        self._object_info = {}
                    return
            except Exception:
                pass
            time.sleep(1)
        raise RuntimeError("ComfyUI não respondeu no healthcheck")

    @modal.method()
    def generate(self, payload: dict) -> bytes:
        requested = str((payload or {}).get("workflow") or "").strip().lower()
        model_req = str((payload or {}).get("model") or "").strip().lower()
        wants_flux = (model_req == "flux") or (requested in ("persephone", "flux-persephone", "flux"))
        wants_flux_inpaint = requested in ("flux_inpainting", "flux-inpainting", "inpaint_flux", "inpainting_flux")
        workflow_path = "/root/workflow_flux_api.json"
        t0 = time.time()
        nodes_map = {}
        info = {}
        try:
            info = self._object_info if isinstance(self._object_info, dict) else {}
        except Exception:
            info = {}

        if not info:
            import requests

            try:
                oi = requests.get(f"http://127.0.0.1:{self.port}/object_info", timeout=120)
                if oi.status_code == 200:
                    info = oi.json()
                else:
                    info = {}
            except Exception:
                info = {}

        have_flux_nodes = False
        if isinstance(info, dict):
            nodes_map = info.get("nodes") or info.get("node_class_mappings") or {}
            if isinstance(nodes_map, dict):
                have_flux_nodes = ("FluxLoader" in nodes_map) and ("FluxSampler" in nodes_map or "FluxInpaintSampler" in nodes_map)

        if wants_flux_inpaint:
            if not have_flux_nodes:
                raise RuntimeError("Flux inpainting requer nós Flux (FluxInpaintSampler) no ComfyUI")
            workflow_path = "/root/flux_inpainting.json"
        elif wants_flux:
            workflow_path = "/root/workflow_flux_persephone.json" if have_flux_nodes else "/root/workflow_flux_persephone_api.json"

        print(
            "[generate]",
            {
                "version": APP_VERSION,
                "workflow": requested or "default",
                "workflow_path": workflow_path,
            },
        )

        workflow_text = Path(workflow_path).read_text(encoding="utf-8")
        workflow = json.loads(workflow_text)
        try:
            first_node = (workflow.get("1") or {}).get("class_type")
            print("[workflow_first_node]", {"class_type": first_node, "path": workflow_path})
        except Exception:
            pass
        client_id = uuid.uuid4().hex

        params = dict(payload or {})
        if params.get("seed") is None:
            params["seed"] = random.randint(1, 2_147_483_647)
        params["filename_prefix"] = client_id

        def _read_b64(*keys: str) -> str:
            for k in keys:
                val = str(params.get(k) or "").strip()
                if val:
                    return val
            return ""

        def _write_png_from_b64(b64: str, suffix: str) -> str:
            import base64

            input_dir = Path("/root/comfy/ComfyUI/input")
            input_dir.mkdir(parents=True, exist_ok=True)
            p = input_dir / f"{client_id}_{suffix}.png"
            p.write_bytes(base64.b64decode(b64, validate=False))
            return str(p)

        prompt = str(params.get("prompt") or "").strip()
        negative = str(params.get("negative_prompt") or "").strip()
        pose_type = str(params.get("poseType") or "").strip().lower()
        if pose_type and ("hand" in pose_type or "spread" in pose_type or "finger" in pose_type):
            prompt = f"{prompt}, {HANDS_POSITIVE_PROMPT}" if prompt else HANDS_POSITIVE_PROMPT
            negative = f"{negative}, {HANDS_NEGATIVE_PROMPT}" if negative else HANDS_NEGATIVE_PROMPT
        steps = params.get("steps")
        cfg = params.get("cfg")
        steps_val = int(steps) if steps is not None else _read_env_int("FLUX_STEPS", 25)
        cfg_val = float(cfg) if cfg is not None else _read_env_float("FLUX_CFG", 1.0)
        seed_val = int(params.get("seed") or 1337)
        requested_ckpt = str((params.get("ckpt_name") or "")).strip()
        env_ckpt = _read_env_str("FLUX_UNET_FILENAME", "flux1-dev-fp8.safetensors")
        unet_filename = requested_ckpt if requested_ckpt else env_ckpt
        print("[Flux] Using model:", unet_filename)
        if wants_flux:
            print(f"[Flux] Loading workflow: {workflow_path}, model: persephoneFluxNSFWSFW_20FP8.safetensors")

        try:
            cache_root = _read_env_str("MODEL_CACHE_DIR", "/cache")
            candidates = [
                f"/root/comfy/ComfyUI/models/checkpoints/{unet_filename}",
                f"/root/comfy/ComfyUI/models/unet/{unet_filename}",
                f"{cache_root}/checkpoints/{unet_filename}",
                f"{cache_root}/unet/{unet_filename}",
            ]
            if not any(Path(p).exists() for p in candidates):
                raise RuntimeError(f"Checkpoint não encontrado: {unet_filename}")
        except Exception as e:
            raise RuntimeError(str(e))

        ref_b64 = _read_b64("refImageBase64", "ref_image_base64")
        if wants_flux and not ref_b64:
            raise ValueError("Missing refImageBase64")

        ref_path = ""
        pose_path = ""
        base_path = ""
        mask_path = ""
        if ref_b64:
            try:
                ref_path = _write_png_from_b64(ref_b64, "ref")
            except Exception:
                ref_path = ""
        pose_b64 = _read_b64("poseImageBase64", "pose_image_base64")
        if pose_b64:
            try:
                pose_path = _write_png_from_b64(pose_b64, "pose")
            except Exception:
                pose_path = ""
        base_b64 = _read_b64("baseImageBase64", "base_image_base64")
        if base_b64:
            try:
                base_path = _write_png_from_b64(base_b64, "base")
            except Exception:
                base_path = ""
        mask_b64 = _read_b64("maskImageBase64", "mask_base64", "mask_image_base64")
        if mask_b64:
            try:
                mask_path = _write_png_from_b64(mask_b64, "mask")
            except Exception:
                mask_path = ""

        batch_size_val = int(params.get("batch_size") or _read_env_int("FLUX_BATCH_SIZE", 1))
        denoise_raw = params.get("denoise")
        denoise_val = float(denoise_raw) if denoise_raw is not None else 0.8
        ipadapter_weight = params.get("ipadapter_weight")
        ipadapter_weight_val = float(ipadapter_weight) if ipadapter_weight is not None else 0.7
        control_strength = params.get("control_strength")
        control_strength_val = float(control_strength) if control_strength is not None else 0.9

        for node_id, node in workflow.items():
            class_type = str(node.get("class_type") or "")
            inputs = node.get("inputs") or {}
            if class_type == "FluxLoader":
                inputs["model_name"] = "persephoneFluxNSFWSFW_20FP8.safetensors" if model_req == "flux" else unet_filename
            if class_type == "CheckpointLoaderSimple":
                inputs["ckpt_name"] = unet_filename
            if class_type in ("ClipTextEncodeFlux", "CLIPTextEncodeFlux"):
                if str(node_id) == "2":
                    inputs["text"] = prompt
                elif str(node_id) == "3":
                    inputs["text"] = negative
            if class_type == "CLIPTextEncode":
                inputs["clip"] = ["1", 1]
                if str(node_id) == "2":
                    inputs["text"] = prompt
                elif str(node_id) == "3":
                    inputs["text"] = negative
            if class_type == "EmptyLatentImage":
                inputs["width"] = int(params.get("width") or inputs.get("width") or 1024)
                inputs["height"] = int(params.get("height") or inputs.get("height") or 1536)
                inputs["batch_size"] = int(batch_size_val)
            if class_type in ("FluxSampler", "FluxInpaintSampler"):
                inputs["seed"] = int(seed_val)
                inputs["steps"] = int(steps_val)
                inputs["cfg"] = float(cfg_val)
                inputs["denoise"] = float(denoise_val)
            if class_type == "KSampler":
                inputs["steps"] = int(steps_val)
                inputs["cfg"] = float(cfg_val)
                inputs["seed"] = int(seed_val)
                inputs["model"] = ["1", 0]
            if class_type == "IPAdapterFlux":
                if ref_path:
                    inputs["image"] = ref_path
                inputs["weight"] = float(ipadapter_weight_val)
            if class_type == "ApplyControlNetFlux":
                if pose_path:
                    inputs["image"] = pose_path
                inputs["strength"] = float(control_strength_val)
            if class_type == "LoadImage":
                if base_path:
                    inputs["image"] = base_path
            if class_type == "LoadImageMask":
                if mask_path:
                    inputs["image"] = mask_path
            if class_type == "SaveImage":
                inputs["filename_prefix"] = client_id
            if class_type == "VAEDecode":
                inputs["vae"] = ["1", 2]
            node["inputs"] = inputs

        vae_name = str(params.get("vae_name") or "").strip()
        if model_req == "flux" and vae_name and isinstance(nodes_map, dict):
            if ("VAELoader" in nodes_map) and ("VAEDecode" in nodes_map) and ("5" in workflow) and ("7" in workflow):
                workflow["90"] = {"inputs": {"vae_name": vae_name}, "class_type": "VAELoader", "_meta": {"title": "Load VAE"}}
                workflow["91"] = {
                    "inputs": {"samples": ["5", 0], "vae": ["90", 0]},
                    "class_type": "VAEDecode",
                    "_meta": {"title": "Decode (External VAE)"},
                }
                try:
                    w7 = workflow.get("7") or {}
                    i7 = (w7.get("inputs") or {}) if isinstance(w7, dict) else {}
                    i7["images"] = ["91", 0]
                    w7["inputs"] = i7
                    workflow["7"] = w7
                    print("[Flux] External VAE enabled:", vae_name)
                except Exception:
                    pass

        from urllib.parse import quote

        api_base = f"http://127.0.0.1:{self.port}"
        timeout_s = int(_read_env_int("JOB_TIMEOUT", 1800))
        ready_started = time.time()
        while time.time() - ready_started < 180:
            try:
                sr = requests.get(f"{api_base}/system_stats", timeout=5)
                if sr.status_code == 200:
                    break
            except Exception:
                pass
            time.sleep(1)

        ready_started = time.time()
        while time.time() - ready_started < 180:
            try:
                oi = requests.get(f"{api_base}/object_info", timeout=30)
                if oi.status_code == 200:
                    break
            except Exception:
                pass
            time.sleep(1)

        start_t = time.time()
        pr = None
        try:
            last_err = None
            prompt_id = None
            for attempt in range(1, 7):
                try:
                    pr = requests.post(
                        f"{api_base}/prompt",
                        json={"prompt": workflow, "client_id": client_id},
                        timeout=120 if attempt == 1 else 45,
                    )
                    if not pr.ok:
                        body = ""
                        try:
                            body = (pr.text or "")[:1000]
                        except Exception:
                            body = ""
                        raise RuntimeError(f"HTTP {pr.status_code} body={body}")
                    prompt_id = (pr.json() or {}).get("prompt_id")
                    if prompt_id:
                        break
                    raise RuntimeError("prompt_id_missing")
                except Exception as e:
                    last_err = e
                    time.sleep(2)
            if not prompt_id:
                raise RuntimeError(f"ComfyUI não retornou prompt_id. last_error={last_err}")
        except Exception as e:
            server_log_tail = ""
            try:
                if Path(self._log_path).exists():
                    server_log_tail = Path(self._log_path).read_text(encoding="utf-8", errors="ignore")[-4000:]
            except Exception:
                server_log_tail = ""
            resp_text = ""
            try:
                resp_text = (pr.text or "")[:2000] if pr is not None else ""  # type: ignore[union-attr]
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
        out = candidates[0].read_bytes()
        print("[Time] generation_done_s", round(time.time() - t0, 2))
        return out

    @modal.method()
    def get_object_info(self) -> dict:
        import requests

        try:
            info = self._object_info if isinstance(self._object_info, dict) else {}
        except Exception:
            info = {}
        if info:
            return info
        try:
            oi = requests.get(f"http://127.0.0.1:{self.port}/object_info", timeout=120)
            if oi.status_code == 200:
                parsed = oi.json()
                self._object_info = parsed if isinstance(parsed, dict) else {}
                return self._object_info
        except Exception:
            pass
        return {}


@app.function(image=image, timeout=_read_env_int("WEB_TIMEOUT", 1800), secrets=_modal_secrets())
@((getattr(modal, "fastapi_endpoint", None) or getattr(modal, "web_endpoint"))(method="POST"))
def api(payload: dict | None = None):
    from fastapi import Response
    from fastapi.responses import JSONResponse

    if not isinstance(payload, dict):
        return JSONResponse({"error": "Body JSON inválido"}, status_code=400)
    if not str(payload.get("prompt") or "").strip():
        return JSONResponse({"error": "Campo 'prompt' é obrigatório"}, status_code=400)

    comfy = ComfyUIService()
    try:
        img_bytes = comfy.generate.remote(payload)
        return Response(content=img_bytes, media_type="image/png")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.function(image=image, timeout=_read_env_int("WEB_TIMEOUT", 1800), secrets=_modal_secrets())
@((getattr(modal, "fastapi_endpoint", None) or getattr(modal, "web_endpoint"))(method="GET"))
def nodes():
    from fastapi.responses import JSONResponse
    comfy = ComfyUIService()
    try:
        info = comfy.get_object_info.remote()
        return JSONResponse(info or {})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
