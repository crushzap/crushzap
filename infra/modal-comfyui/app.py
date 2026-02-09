import base64
import json
import os
import subprocess
import time
import uuid
import io
from pathlib import Path

import modal

app = modal.App("crushzap-comfyui")

_PLACEHOLDER_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+uZQAAAAASUVORK5CYII="
)
APP_VERSION = "2026-02-03-inpaint-mask-fix5"
HANDS_LORA_FILENAME = "Better hands - SDXL v2.0.safetensors"
DEFAULT_LOCAL_HANDS_LORA_PATH_WIN = r"E:\APLICATIVOS\projects\aura\comfyui\models\loras\Better hands - SDXL v2.0.safetensors"
HANDS_POSITIVE_PROMPT = (
    "Perfect hand, Detailed hand, detailed perfect hands, five fingers per hand, "
    "anatomically correct fingers, no fused fingers, no extra digits, no missing fingers, "
    "realistic hand proportions, detailed knuckles and nails, natural hand pose, "
    "small delicate feminine hands, slender fingers, petite hands, short nails"
)
HANDS_NEGATIVE_PROMPT = (
    "deformed hands, mutated fingers, extra fingers, missing fingers, fused fingers, "
    "bad anatomy hands, poorly drawn hands, blurry hands, lowres hands, six fingers, three fingers, "
    "large hands, big hands, masculine hands, thick fingers"
)


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
    .apt_install("git", "libgl1", "libglib2.0-0")
    .pip_install(
        "fastapi[standard]==0.115.4",
        "comfy-cli==1.5.3",
        "huggingface-hub==0.36.0",
        "requests==2.32.3",
        "pillow==11.1.0",
    )
    .run_commands("comfy --skip-prompt install --fast-deps --nvidia --version 0.3.71")
    .run_commands(
        "mkdir -p /root/comfy/ComfyUI/custom_nodes",
        "rm -rf /root/comfy/ComfyUI/custom_nodes/ComfyUI_IPAdapter_plus || true",
        "cd /root/comfy/ComfyUI/custom_nodes && git clone --depth 1 https://github.com/cubiq/ComfyUI_IPAdapter_plus.git",
        "test -f /root/comfy/ComfyUI/custom_nodes/ComfyUI_IPAdapter_plus/requirements.txt && python -m pip install -r /root/comfy/ComfyUI/custom_nodes/ComfyUI_IPAdapter_plus/requirements.txt || true",
        # ControlNet Aux (Preprocessors)
        "rm -rf /root/comfy/ComfyUI/custom_nodes/comfyui_controlnet_aux || true",
        "cd /root/comfy/ComfyUI/custom_nodes && git clone --depth 1 https://github.com/Fannovel16/comfyui_controlnet_aux.git",
        "test -f /root/comfy/ComfyUI/custom_nodes/comfyui_controlnet_aux/requirements.txt && python -m pip install -r /root/comfy/ComfyUI/custom_nodes/comfyui_controlnet_aux/requirements.txt || true",
        # Impact Pack (Detailers)
        "rm -rf /root/comfy/ComfyUI/custom_nodes/ComfyUI-Impact-Pack || true",
        "cd /root/comfy/ComfyUI/custom_nodes && git clone --depth 1 https://github.com/ltdrdata/ComfyUI-Impact-Pack.git",
        "test -f /root/comfy/ComfyUI/custom_nodes/ComfyUI-Impact-Pack/requirements.txt && python -m pip install -r /root/comfy/ComfyUI/custom_nodes/ComfyUI-Impact-Pack/requirements.txt || true",
        "rm -rf /root/comfy/ComfyUI/custom_nodes/ComfyUI-Impact-Subpack || true",
        "cd /root/comfy/ComfyUI/custom_nodes && git clone --depth 1 https://github.com/ltdrdata/ComfyUI-Impact-Subpack.git",
        "test -f /root/comfy/ComfyUI/custom_nodes/ComfyUI-Impact-Subpack/requirements.txt && python -m pip install -r /root/comfy/ComfyUI/custom_nodes/ComfyUI-Impact-Subpack/requirements.txt || true",
        "python -m pip install ultralytics",
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
    controlnet_dir = "/root/comfy/ComfyUI/models/controlnet"
    bbox_dir = "/root/comfy/ComfyUI/models/ultralytics/bbox"
    os.makedirs(ckpt_dir, exist_ok=True)
    os.makedirs(lora_dir, exist_ok=True)
    os.makedirs(clip_vision_dir, exist_ok=True)
    os.makedirs(ipadapter_dir, exist_ok=True)
    os.makedirs(controlnet_dir, exist_ok=True)
    os.makedirs(bbox_dir, exist_ok=True)

    def link_if_exists(src_path: str, dest_path: str) -> bool:
        if os.path.exists(src_path):
            # Usar aspas para suportar caminhos com espaços
            subprocess.run(f'ln -sf "{src_path}" "{dest_path}"', shell=True, check=True)
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
image = image.add_local_file(Path(__file__).parent / "workflow_pose_api.json", "/root/workflow_pose_api.json")
image = image.add_local_file(Path(__file__).parent / "workflow_skeleton_api.json", "/root/workflow_skeleton_api.json")
image = image.add_local_file(Path(__file__).parent / "workflow_inpainting_api.json", "/root/workflow_inpainting_api.json")
image = image.add_local_file(Path(__file__).parent / "workflow_inpainting_scene_api.json", "/root/workflow_inpainting_scene_api.json")

def _maybe_add_local_hands_lora(img: modal.Image) -> modal.Image:
    raw = _read_env_str("LOCAL_HANDS_LORA_PATH", "")
    candidates = []
    if raw:
        candidates.append(raw)
    candidates.append(DEFAULT_LOCAL_HANDS_LORA_PATH_WIN)
    for c in candidates:
        try:
            p = Path(c)
            if p.exists() and p.is_file():
                return img.add_local_file(p, f"/root/comfy/ComfyUI/models/loras/{HANDS_LORA_FILENAME}")
        except Exception:
            continue
    return img

image = _maybe_add_local_hands_lora(image)

def _extract_assets_from_workflow(workflow: dict) -> tuple[str, str, str, str]:
    ckpt_name = ""
    lora_name = ""
    clip_vision_name = ""
    ipadapter_name = ""
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        class_type = str(node.get("class_type") or "")
        class_type_lower = class_type.lower().strip()
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        if not ckpt_name and class_type == "CheckpointLoaderSimple":
            ckpt_name = str(inputs.get("ckpt_name") or "").strip()
        if class_type == "LoraLoader":
            candidate = str(inputs.get("lora_name") or "").strip()
            if candidate and candidate != HANDS_LORA_FILENAME and not lora_name:
                lora_name = candidate
        if not clip_vision_name and class_type == "CLIPVisionLoader":
            clip_vision_name = str(inputs.get("clip_name") or "").strip()
        if not ipadapter_name and class_type == "IPAdapterModelLoader":
            ipadapter_name = str(inputs.get("ipadapter_file") or "").strip()
    return ckpt_name, lora_name, clip_vision_name, ipadapter_name


def _ensure_assets_present():
    print("[Assets] Checking assets...")
    import os
    import shutil
    import subprocess
    from huggingface_hub import hf_hub_download

    cache_root = _read_env_str("MODEL_CACHE_DIR", "/cache")
    ckpt_dir = "/root/comfy/ComfyUI/models/checkpoints"
    lora_dir = "/root/comfy/ComfyUI/models/loras"
    clip_vision_dir = "/root/comfy/ComfyUI/models/clip_vision"
    ipadapter_dir = "/root/comfy/ComfyUI/models/ipadapter"
    controlnet_dir = "/root/comfy/ComfyUI/models/controlnet"
    bbox_dir = "/root/comfy/ComfyUI/models/ultralytics/bbox"
    os.makedirs(ckpt_dir, exist_ok=True)
    os.makedirs(lora_dir, exist_ok=True)
    os.makedirs(clip_vision_dir, exist_ok=True)
    os.makedirs(ipadapter_dir, exist_ok=True)
    os.makedirs(controlnet_dir, exist_ok=True)
    os.makedirs(bbox_dir, exist_ok=True)

    def link_if_exists(src_path: str, dest_path: str) -> bool:
        if os.path.exists(src_path):
            subprocess.run(f"ln -sf {src_path} {dest_path}", shell=True, check=True)
            return True
        return False

    wf_default = json.loads(Path("/root/workflow_api.json").read_text(encoding="utf-8"))
    wf_pack = json.loads(Path("/root/workflow_pack_api.json").read_text(encoding="utf-8"))
    wf_pose = json.loads(Path("/root/workflow_pose_api.json").read_text(encoding="utf-8"))
    wf_skel = json.loads(Path("/root/workflow_skeleton_api.json").read_text(encoding="utf-8"))
    wf_inpaint = json.loads(Path("/root/workflow_inpainting_api.json").read_text(encoding="utf-8"))
    wf_inpaint_scene = json.loads(Path("/root/workflow_inpainting_scene_api.json").read_text(encoding="utf-8"))

    ckpt_default, lora_default, clip_default, ip_default = _extract_assets_from_workflow(wf_default)
    ckpt_pack, lora_pack, clip_pack, ip_pack = _extract_assets_from_workflow(wf_pack)
    ckpt_pose, lora_pose, clip_pose, ip_pose = _extract_assets_from_workflow(wf_pose)
    ckpt_skel, lora_skel, clip_skel, ip_skel = _extract_assets_from_workflow(wf_skel)
    ckpt_inpaint, lora_inpaint, clip_inpaint, ip_inpaint = _extract_assets_from_workflow(wf_inpaint)
    ckpt_inpaint_scene, lora_inpaint_scene, clip_inpaint_scene, ip_inpaint_scene = _extract_assets_from_workflow(wf_inpaint_scene)

    # HARDCODED: Força RealVisXL para garantir atualização
    # checkpoint_filename = _read_env_str("CHECKPOINT_FILENAME", ckpt_default or ckpt_pack or ckpt_pose or ckpt_skel or ckpt_inpaint_scene or ckpt_inpaint)
    checkpoint_filename = "realvisxlV50_v50LightningBakedvae.safetensors"
    
    lora_filename = _read_env_str("LORA_FILENAME", lora_default or lora_pack or lora_pose or lora_skel or lora_inpaint_scene or lora_inpaint)
    clip_vision_filename = _read_env_str("CLIP_VISION_FILENAME", clip_default or clip_pack or clip_pose or clip_skel or clip_inpaint_scene or clip_inpaint)
    ipadapter_filename = _read_env_str("IPADAPTER_FILENAME", ip_default or ip_pack or ip_pose or ip_skel or ip_inpaint_scene or ip_inpaint)

    if checkpoint_filename:
        src = f"{cache_root}/checkpoints/{checkpoint_filename}"
        dest = f"{ckpt_dir}/{checkpoint_filename}"
        if os.path.exists(src):
            try:
                # Se for link simbólico quebrado ou arquivo antigo, remove
                if os.path.islink(dest) or os.path.exists(dest):
                    os.unlink(dest)
                
                # Tenta linkar primeiro (mais rápido)
                subprocess.run(f'ln -sf "{src}" "{dest}"', shell=True, check=True)
            except Exception:
                # Fallback para cópia se link falhar
                try:
                    shutil.copyfile(src, dest)
                except Exception as e:
                    print(f"[Assets] Erro ao copiar checkpoint {checkpoint_filename}: {e}")
        else:
            print(f"[Assets] Checkpoint não encontrado no cache: {src}")
            
        print("[Assets] checkpoint", {"default": ckpt_default, "pack": ckpt_pack, "env": _read_env_str("CHECKPOINT_FILENAME", ""), "src_exists": os.path.exists(src), "dest_exists": os.path.exists(dest)})

    if lora_filename:
        src = f"{cache_root}/loras/{lora_filename}"
        dest = f"{lora_dir}/{lora_filename}"
        if os.path.exists(src):
            try:
                if not os.path.exists(dest):
                    shutil.copyfile(src, dest)
                else:
                    subprocess.run(f'ln -sf "{src}" "{dest}"', shell=True, check=True)
            except Exception:
                subprocess.run(f'ln -sf "{src}" "{dest}"', shell=True, check=True)
        print("[Assets] lora", {"default": lora_default, "pack": lora_pack, "env": _read_env_str("LORA_FILENAME", ""), "src_exists": os.path.exists(src), "dest_exists": os.path.exists(dest)})

    hands_src = f"{cache_root}/loras/{HANDS_LORA_FILENAME}"
    hands_dest = f"{lora_dir}/{HANDS_LORA_FILENAME}"
    if not os.path.exists(hands_dest):
        if os.path.exists(hands_src):
            try:
                shutil.copyfile(hands_src, hands_dest)
            except Exception:
                try:
                    subprocess.run(f"ln -sf {hands_src} {hands_dest}", shell=True, check=True)
                except Exception:
                    pass
        else:
            hands_url = _read_env_str("HANDS_LORA_URL", "")
            if hands_url:
                try:
                    import requests

                    os.makedirs(f"{cache_root}/loras", exist_ok=True)
                    with requests.get(hands_url, stream=True, timeout=120) as r:
                        r.raise_for_status()
                        with open(hands_src, "wb") as f:
                            for chunk in r.iter_content(chunk_size=1024 * 1024):
                                if chunk:
                                    f.write(chunk)
                    try:
                        shutil.copyfile(hands_src, hands_dest)
                    except Exception:
                        subprocess.run(f"ln -sf {hands_src} {hands_dest}", shell=True, check=True)
                except Exception as e:
                    print(f"[Assets] Erro ao baixar Hands LoRA: {e}")

    if clip_vision_filename:
        os.makedirs(clip_vision_dir, exist_ok=True)
        src = f"{cache_root}/clip_vision/{clip_vision_filename}"
        dest = f"{clip_vision_dir}/{clip_vision_filename}"
        if os.path.exists(src):
            try:
                if not os.path.exists(dest):
                    shutil.copyfile(src, dest)
                else:
                    subprocess.run(f'ln -sf "{src}" "{dest}"', shell=True, check=True)
            except Exception:
                subprocess.run(f'ln -sf "{src}" "{dest}"', shell=True, check=True)
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
                    subprocess.run(f'ln -sf "{src}" "{dest}"', shell=True, check=True)
            except Exception:
                subprocess.run(f'ln -sf "{src}" "{dest}"', shell=True, check=True)
        print("[Assets] ipadapter", {"default": ip_default, "pack": ip_pack, "env": _read_env_str("IPADAPTER_FILENAME", ""), "src_exists": os.path.exists(src), "dest_exists": os.path.exists(dest)})

    hands_lora_filename = "Better hands - SDXL v2.0.safetensors"
    hands_lora_from_volume = f"{cache_root}/loras/{hands_lora_filename}"
    hands_lora_dest = f"{lora_dir}/{hands_lora_filename}"
    if not link_if_exists(hands_lora_from_volume, hands_lora_dest):
        token = _read_env_str("HF_TOKEN", "")
        try:
            model_path = hf_hub_download(
                repo_id="OedoSoldier/better-hands-sdxl",
                filename="Better hands - SDXL v2.0.safetensors",
                cache_dir=cache_root,
                token=token if token else None,
            )
            # Copia para o volume se não existir lá (cache persistente)
            if not os.path.exists(hands_lora_from_volume):
                os.makedirs(f"{cache_root}/loras", exist_ok=True)
                shutil.copyfile(model_path, hands_lora_from_volume)
            
            # Linka para o destino
            subprocess.run(f'ln -sf "{model_path}" "{hands_lora_dest}"', shell=True, check=True)
        except Exception as e:
            print(f"Erro baixando Better Hands Lora: {e}")

    bbox_filename = "hand_yolov8n.pt"
    bbox_from_volume = f"{cache_root}/bbox/{bbox_filename}"
    bbox_dest = f"{bbox_dir}/{bbox_filename}"
    if not link_if_exists(bbox_from_volume, bbox_dest):
        token = _read_env_str("HF_TOKEN", "")
        try:
            # Baixando do repo do impact pack ou similar
            model_path = hf_hub_download(
                repo_id="Bingsu/adetailer",
                filename=bbox_filename,
                cache_dir=cache_root,
                token=token if token else None,
            )
            subprocess.run(f"ln -sf {model_path} {bbox_dest}", shell=True, check=True)
        except Exception as e:
            print(f"Erro baixando Hand Yolo Bbox: {e}")

    # ControlNet OpenPose
    cn_filename = "OpenPoseXL2.safetensors"
    cn_from_volume = f"{cache_root}/controlnet/{cn_filename}"
    cn_dest = f"{controlnet_dir}/{cn_filename}"
    if not link_if_exists(cn_from_volume, cn_dest):
        try:
            token = _read_env_str("HF_TOKEN", "")
            model_path = hf_hub_download(
                repo_id="thibaud/controlnet-openpose-sdxl-1.0",
                filename=cn_filename,
                cache_dir=cache_root,
                token=token if token else None,
            )
            os.makedirs(f"{cache_root}/controlnet", exist_ok=True)
            # Copia para cache se não existir
            if not os.path.exists(cn_from_volume):
                shutil.copyfile(model_path, cn_from_volume)
            
            # ATENÇÃO: Usando cópia física para pasta de modelos para evitar problemas de symlink
            if os.path.exists(cn_dest): os.unlink(cn_dest)
            shutil.copyfile(cn_from_volume, cn_dest)
            print(f"[Assets] ControlNet copiado fisicamente para: {cn_dest}")

        except Exception as e:
            print(f"[Assets] Erro ao baixar ControlNet {cn_filename}: {e}")
            
    # Força refresh da lista de modelos no ComfyUI
    try:
        if os.path.exists(controlnet_dir):
            os.utime(controlnet_dir, None)
            # Debug: Listar arquivos
            print(f"[Assets] Conteúdo de {controlnet_dir}: {os.listdir(controlnet_dir)}")
    except Exception as e: 
        print(f"[Assets] Erro listando controlnets: {e}")

    for cn_filename, cn_repo_id in [
        ("diffusers_xl_canny_full.safetensors", "lllyasviel/sd_control_collection"),
        ("diffusers_xl_depth_full.safetensors", "lllyasviel/sd_control_collection"),
    ]:
        cn_from_volume = f"{cache_root}/controlnet/{cn_filename}"
        cn_dest = f"{controlnet_dir}/{cn_filename}"
        if not link_if_exists(cn_from_volume, cn_dest):
            try:
                token = _read_env_str("HF_TOKEN", "")
                model_path = hf_hub_download(
                    repo_id=cn_repo_id,
                    filename=cn_filename,
                    cache_dir=cache_root,
                    token=token if token else None,
                )
                os.makedirs(f"{cache_root}/controlnet", exist_ok=True)
                subprocess.run(f"cp -f {model_path} {cn_from_volume}", shell=True, check=True)
                subprocess.run(f"ln -sf {cn_from_volume} {cn_dest}", shell=True, check=True)
            except Exception as e:
                print(f"[Assets] Erro ao baixar ControlNet {cn_filename}: {e}")

    # Impact Pack BBox (YOLO)
    for bbox_name in ["face_yolo8n.pt", "hand_yolo8n.pt"]:
        bbox_from = f"{cache_root}/bbox/{bbox_name}"
        bbox_dest = f"{bbox_dir}/{bbox_name}"
        if not link_if_exists(bbox_from, bbox_dest):
            try:
                token = _read_env_str("HF_TOKEN", "")
                model_path = hf_hub_download(
                    repo_id="Bingsu/adetailer",
                    filename=bbox_name,
                    cache_dir=cache_root,
                    token=token if token else None,
                )
                os.makedirs(f"{cache_root}/bbox", exist_ok=True)
                subprocess.run(f"cp -f {model_path} {bbox_from}", shell=True, check=True)
                subprocess.run(f"ln -sf {bbox_from} {bbox_dest}", shell=True, check=True)
            except Exception as e:
                print(f"[Assets] Erro ao baixar BBox {bbox_name}: {e}")

    # LoRA Metal Stocks (BDSM)
    lora_bdsm = "metalstocks2-03.safetensors"
    lora_bdsm_from = f"{cache_root}/loras/{lora_bdsm}"
    lora_bdsm_dest = f"{lora_dir}/{lora_bdsm}"
    if not link_if_exists(lora_bdsm_from, lora_bdsm_dest):
        try:
             lora_bdsm_repo_id = _read_env_str("METALSTOCKS_LORA_REPO_ID", "")
             lora_bdsm_hf_filename = _read_env_str("METALSTOCKS_LORA_FILENAME", lora_bdsm)
             if not lora_bdsm_repo_id:
                 raise RuntimeError("METALSTOCKS_LORA_REPO_ID não configurado (LoRA BDSM ausente no volume)")
             token = _read_env_str("HF_TOKEN", "")
             lora_path = hf_hub_download(
                 repo_id=lora_bdsm_repo_id,
                 filename=lora_bdsm_hf_filename,
                 cache_dir=cache_root,
                 token=token if token else None,
             )
             os.makedirs(f"{cache_root}/loras", exist_ok=True)
             subprocess.run(f"cp -f {lora_path} {lora_bdsm_from}", shell=True, check=True)
             subprocess.run(f"ln -sf {lora_bdsm_from} {lora_bdsm_dest}", shell=True, check=True)
        except Exception as e:
             print(f"[Assets] Erro ao baixar LoRA BDSM: {e}")

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


def _node_required_inputs(object_info: dict, class_type: str) -> dict:
    try:
        required = (object_info.get(class_type) or {}).get("input", {}).get("required", {})
        return required if isinstance(required, dict) else {}
    except Exception:
        return {}


def _node_outputs(object_info: dict, class_type: str) -> list[str]:
    try:
        outputs = (object_info.get(class_type) or {}).get("output", [])
        if isinstance(outputs, list):
            return [str(x) for x in outputs]
    except Exception:
        pass
    return []


def _pick_node_type_by_predicate(object_info: dict, predicate) -> str | None:
    if not isinstance(object_info, dict) or not object_info:
        return None
    for k, v in object_info.items():
        try:
            if not isinstance(k, str) or not isinstance(v, dict):
                continue
            if predicate(k, v):
                return k
        except Exception:
            continue
    return None


def _pick_choice_ending_with(object_info: dict, class_type: str, input_name: str, suffix: str) -> str | None:
    try:
        spec = _node_required_inputs(object_info, class_type).get(input_name)
        if not isinstance(spec, list) or len(spec) < 2:
            return None
        meta = spec[1]
        if not isinstance(meta, dict):
            return None
        choices = meta.get("choices")
        if not isinstance(choices, list):
            return None
        suf = str(suffix).lower()
        for c in choices:
            cs = str(c)
            if cs.lower().endswith(suf):
                return cs
        return None
    except Exception:
        return None


def _read_workflow_prompt_text(workflow: dict) -> str:
    try:
        ids = _pick_clip_text_nodes(workflow)
        if not ids:
            return ""
        node = workflow.get(ids[0]) or {}
        inputs = node.get("inputs") if isinstance(node, dict) else {}
        return str((inputs or {}).get("text") or "")
    except Exception:
        return ""


def _inject_hands_detailer(workflow: dict, params: dict, object_info: dict) -> dict:
    if not isinstance(object_info, dict) or not object_info:
        return workflow
    disable = str(params.get("disable_hand_detailer") or "").strip().lower() in ("1", "true", "yes", "y", "on")
    if disable:
        return workflow
    if _read_env_str("DISABLE_HAND_DETAILER", "").strip().lower() in ("1", "true", "yes", "y", "on"):
        return workflow

    # Verifica se deve aplicar o detailer
    requested_workflow = str(params.get("workflow") or "").strip().lower()
    prompt_text = _read_workflow_prompt_text(workflow).lower()
    always = _read_env_str("HANDS_DETAILER_ALWAYS", "false").strip().lower() in ("1", "true", "yes", "y", "on")
    should = always or requested_workflow in ("pose", "pack") or ("hand" in prompt_text) or ("hands" in prompt_text)
    
    if not should:
        return workflow

    # Procura node ADetailer (mais simples e eficaz se disponível)
    adetailer_type = "ADetailer" if "ADetailer" in object_info else None
    
    # Se tiver ADetailer, usa ele (rota preferencial)
    if adetailer_type:
        vae_decode_id = _find_first_node_id(workflow, "VAEDecode")
        save_id = _find_first_node_id(workflow, "SaveImage")
        ckpt_id = _find_first_node_id(workflow, "CheckpointLoaderSimple")
        
        if vae_decode_id and save_id and ckpt_id:
            adetailer_id = _next_numeric_node_id(workflow)
            
            # Inputs do ADetailer
            inputs = {
                "image": [vae_decode_id, 0],
                "model": [ckpt_id, 0], # Precisa do modelo base para inpainting
                "positive": "perfect hands, five fingers per hand, detailed fingers, no deformities, anatomically correct",
                "negative": "deformed hands, extra fingers, missing fingers, fused fingers, bad anatomy, polydactyly, six fingers",
                "detection_hint": "hand",
                "bbox_detector": "hand_yolov8n.pt",
                "confidence": 0.3,
                "denoise": 0.35, # Denoise baixo para preservar coerência, mas alto o suficiente para corrigir
                "steps": 20,
                "seed": random.randint(0, 2**32 - 1)
            }
            
            # Adiciona clip se disponível (opcional, mas bom)
            if "clip" in _node_required_inputs(object_info, adetailer_type):
                inputs["clip"] = [ckpt_id, 1]
                
            workflow[adetailer_id] = {
                "inputs": inputs,
                "class_type": adetailer_type,
                "_meta": {"title": "Hand Detailer (ADetailer)"}
            }
            
            # Reconecta o SaveImage para pegar do ADetailer em vez do VAE
            workflow[save_id]["inputs"]["images"] = [adetailer_id, 0]
            print(f"[HandsDetailer] Injected ADetailer (node {adetailer_id})")
            return workflow

    # Fallback para o sistema antigo de Ultralytics (mais complexo/menos confiável se ADetailer não estiver instalado)
    vae_decode_id = _find_first_node_id(workflow, "VAEDecode")
    save_id = _find_first_node_id(workflow, "SaveImage")
    if not vae_decode_id or not save_id:
        return workflow
    base_image_ref = [vae_decode_id, 0]

    provider_type = "UltralyticsDetectorProvider" if "UltralyticsDetectorProvider" in object_info else None
    if not provider_type:
        provider_type = _pick_node_type_by_predicate(object_info, lambda k, v: "ultralyticsdetectorprovider" in k.lower())
    if not provider_type:
        print("[HandsDetailer] skipped (no UltralyticsDetectorProvider)")
        return workflow

    provider_id = _next_numeric_node_id(workflow)
    model_choice = _pick_choice_ending_with(object_info, provider_type, "model_name", "hand_yolo8n.pt") or "bbox/hand_yolo8n.pt"
    workflow[provider_id] = {"inputs": {"model_name": model_choice}, "class_type": provider_type}
    provider_outputs = _node_outputs(object_info, provider_type)
    bbox_out_idx = 0
    for i, t in enumerate(provider_outputs):
        if str(t).upper() == "BBOX_DETECTOR":
            bbox_out_idx = i
            break

    bbox_segs_type = _pick_node_type_by_predicate(
        object_info,
        lambda k, v: (
            "bbox" in k.lower()
            and "segs" in k.lower()
            and "segs" in [str(x).upper() for x in (v.get("output") or [])]
            and isinstance((v.get("input") or {}).get("required", {}), dict)
        ),
    )
    if not bbox_segs_type:
        print("[HandsDetailer] skipped (no bbox->segs node)")
        return workflow

    bbox_segs_id = _next_numeric_node_id(workflow)
    bbox_req = _node_required_inputs(object_info, bbox_segs_type)
    bbox_inputs: dict = {}
    image_key = "image" if "image" in bbox_req else None
    det_key = None
    for cand in ("bbox_detector", "detector", "bbox", "BBOX_DETECTOR"):
        if cand in bbox_req:
            det_key = cand
            break
    if image_key:
        bbox_inputs[image_key] = base_image_ref
    if det_key:
        bbox_inputs[det_key] = [provider_id, bbox_out_idx]

    try:
        thr = float(_read_env_str("HANDS_DETECT_THRESHOLD", "0.40"))
    except Exception:
        thr = 0.40
    try:
        dilation = int(_read_env_int("HANDS_DETECT_DILATION", 3))
    except Exception:
        dilation = 3
    try:
        crop_factor = float(_read_env_str("HANDS_DETECT_CROP_FACTOR", "1.35"))
    except Exception:
        crop_factor = 1.35
    try:
        drop_size = int(_read_env_int("HANDS_DETECT_DROP_SIZE", 5))
    except Exception:
        drop_size = 5

    for k, v in {"threshold": thr, "dilation": dilation, "crop_factor": crop_factor, "drop_size": drop_size, "labels": "hand"}.items():
        if k in bbox_req:
            bbox_inputs[k] = v
    workflow[bbox_segs_id] = {"inputs": bbox_inputs, "class_type": bbox_segs_type}
    bbox_segs_outputs = _node_outputs(object_info, bbox_segs_type)
    segs_out_idx = 0
    for i, t in enumerate(bbox_segs_outputs):
        if str(t).upper() == "SEGS":
            segs_out_idx = i
            break

    detailer_type = _pick_node_type_by_predicate(
        object_info,
        lambda k, v: (
            "detailer" in k.lower()
            and "segs" in k.lower()
            and "image" in [str(x).upper() for x in (v.get("output") or [])]
            and isinstance((v.get("input") or {}).get("required", {}), dict)
        ),
    )
    if not detailer_type:
        print("[HandsDetailer] skipped (no detailer segs node)")
        return workflow

    detailer_id = _next_numeric_node_id(workflow)
    detailer_req = _node_required_inputs(object_info, detailer_type)
    pipe_key = None
    for k in detailer_req.keys():
        if "pipe" in str(k).lower():
            pipe_key = str(k)
            break

    detailer_inputs: dict = {}
    if "image" in detailer_req:
        detailer_inputs["image"] = base_image_ref
    if "segs" in detailer_req:
        detailer_inputs["segs"] = [bbox_segs_id, segs_out_idx]
    if "guide_size" in detailer_req:
        detailer_inputs["guide_size"] = 384.0
    if "max_size" in detailer_req:
        detailer_inputs["max_size"] = 1024.0
    if "steps" in detailer_req:
        try:
            detailer_inputs["steps"] = int(_read_env_int("HANDS_DETAILER_STEPS", 28))
        except Exception:
            detailer_inputs["steps"] = 28
    if "cfg" in detailer_req:
        try:
            detailer_inputs["cfg"] = float(_read_env_str("HANDS_DETAILER_CFG", "7.0"))
        except Exception:
            detailer_inputs["cfg"] = 7.0
    if "sampler_name" in detailer_req:
        detailer_inputs["sampler_name"] = "dpmpp_2m_sde"
    if "scheduler" in detailer_req:
        detailer_inputs["scheduler"] = "karras"
    if "denoise" in detailer_req:
        try:
            detailer_inputs["denoise"] = float(_read_env_str("HANDS_DETAILER_DENOISE", "0.48"))
        except Exception:
            detailer_inputs["denoise"] = 0.48

    if pipe_key:
        pipe_output_kind = "DETAILER_PIPE"
        pipe_builder_type = _pick_node_type_by_predicate(
            object_info,
            lambda k, v: (
                pipe_output_kind in [str(x).upper() for x in (v.get("output") or [])]
                and isinstance((v.get("input") or {}).get("required", {}), dict)
            ),
        )
        if not pipe_builder_type:
            print("[HandsDetailer] skipped (detailer needs pipe; no pipe builder)", {"detailer": detailer_type, "pipe_key": pipe_key})
            return workflow

        ksampler_id = _find_first_node_id(workflow, "KSampler")
        ks_inputs = (workflow.get(ksampler_id) or {}).get("inputs") if ksampler_id else {}
        vae_inputs = (workflow.get(vae_decode_id) or {}).get("inputs") if vae_decode_id else {}
        clip_ids = _pick_clip_text_nodes(workflow)
        clip_ref = None
        if clip_ids:
            ci = workflow.get(clip_ids[0]) or {}
            cin = ci.get("inputs") if isinstance(ci, dict) else {}
            if isinstance(cin, dict) and isinstance(cin.get("clip"), list):
                clip_ref = cin.get("clip")

        pipe_req = _node_required_inputs(object_info, pipe_builder_type)
        pipe_inputs: dict = {}
        if isinstance(ks_inputs, dict):
            if "model" in pipe_req and isinstance(ks_inputs.get("model"), list):
                pipe_inputs["model"] = ks_inputs.get("model")
            if "positive" in pipe_req and isinstance(ks_inputs.get("positive"), list):
                pipe_inputs["positive"] = ks_inputs.get("positive")
            if "negative" in pipe_req and isinstance(ks_inputs.get("negative"), list):
                pipe_inputs["negative"] = ks_inputs.get("negative")
        if isinstance(vae_inputs, dict):
            if "vae" in pipe_req and isinstance(vae_inputs.get("vae"), list):
                pipe_inputs["vae"] = vae_inputs.get("vae")
        if "clip" in pipe_req and isinstance(clip_ref, list):
            pipe_inputs["clip"] = clip_ref

        missing = [k for k in pipe_req.keys() if k not in pipe_inputs]
        if missing:
            print("[HandsDetailer] skipped (pipe inputs missing)", {"pipe_builder": pipe_builder_type, "missing": missing[:8]})
            return workflow

        pipe_id = _next_numeric_node_id(workflow)
        workflow[pipe_id] = {"inputs": pipe_inputs, "class_type": pipe_builder_type}
        detailer_inputs[pipe_key] = [pipe_id, 0]

    workflow[detailer_id] = {"inputs": detailer_inputs, "class_type": detailer_type}
    detailer_outputs = _node_outputs(object_info, detailer_type)
    img_out_idx = 0
    for i, t in enumerate(detailer_outputs):
        if str(t).upper() == "IMAGE":
            img_out_idx = i
            break

    redirected = 0
    for nid, node in workflow.items():
        if not isinstance(node, dict) or node.get("class_type") != "SaveImage":
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        if isinstance(inputs.get("images"), list) and len(inputs["images"]) == 2 and str(inputs["images"][0]) == str(vae_decode_id) and int(inputs["images"][1]) == 0:
            inputs["images"] = [detailer_id, img_out_idx]
            redirected += 1

    print(
        "[HandsDetailer] injected",
        {
            "workflow": requested_workflow or "default",
            "provider": provider_type,
            "bbox2segs": bbox_segs_type,
            "detailer": detailer_type,
            "pipe": bool(pipe_key),
            "redirected_saveimage": redirected,
            "threshold": thr,
            "dilation": dilation,
            "crop_factor": crop_factor,
            "drop_size": drop_size,
            "steps": detailer_inputs.get("steps"),
            "cfg": detailer_inputs.get("cfg"),
            "denoise": detailer_inputs.get("denoise"),
        },
    )
    return workflow


def _ref_matches(v: object, node_id: str, output_index: int) -> bool:
    if not isinstance(v, list) or len(v) != 2:
        return False
    try:
        return str(v[0]) == str(node_id) and int(v[1]) == int(output_index)
    except Exception:
        return False


def _next_numeric_node_id(workflow: dict) -> str:
    mx = 0
    for k in workflow.keys():
        try:
            mx = max(mx, int(str(k)))
        except Exception:
            continue
    return str(mx + 1)


def _find_first_node_id(workflow: dict, class_type: str) -> str | None:
    target = class_type.lower().strip()
    for node_id, node in workflow.items():
        if isinstance(node, dict) and str(node.get("class_type") or "").lower().strip() == target:
            return str(node_id)
    return None


def _pick_best_clip_provider_id(workflow: dict, hands_node_id: str | None) -> str | None:
    if not hands_node_id:
        return None
    for nid, node in workflow.items():
        if str(nid) == str(hands_node_id):
            continue
        if not isinstance(node, dict) or node.get("class_type") != "LoraLoader":
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        if _ref_matches(inputs.get("model"), str(hands_node_id), 0) and _ref_matches(inputs.get("clip"), str(hands_node_id), 1):
            return str(nid)
    return str(hands_node_id)


def _ensure_hands_lora(workflow: dict, strength: float) -> str | None:
    ckpt_id = _find_first_node_id(workflow, "CheckpointLoaderSimple")
    if not ckpt_id:
        return None

    for nid, node in workflow.items():
        if not isinstance(node, dict) or node.get("class_type") != "LoraLoader":
            continue
        inputs = node.get("inputs")
        if isinstance(inputs, dict) and str(inputs.get("lora_name") or "").strip() == HANDS_LORA_FILENAME:
            return str(nid)

    existing_lora_direct = None
    for nid, node in workflow.items():
        if not isinstance(node, dict) or node.get("class_type") != "LoraLoader":
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        if _ref_matches(inputs.get("model"), ckpt_id, 0) and _ref_matches(inputs.get("clip"), ckpt_id, 1):
            existing_lora_direct = str(nid)
            break

    hands_id = _next_numeric_node_id(workflow)
    workflow[hands_id] = {
        "inputs": {
            "lora_name": HANDS_LORA_FILENAME,
            "strength_model": float(strength),
            "strength_clip": float(strength),
            "model": [ckpt_id, 0],
            "clip": [ckpt_id, 1],
        },
        "class_type": "LoraLoader",
        "_meta": {"title": "Load Hands LoRA"},
    }

    if existing_lora_direct and existing_lora_direct in workflow:
        workflow[existing_lora_direct].setdefault("inputs", {})["model"] = [hands_id, 0]
        workflow[existing_lora_direct].setdefault("inputs", {})["clip"] = [hands_id, 1]
        return hands_id

    for nid, node in workflow.items():
        if str(nid) == str(hands_id):
            continue
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        if _ref_matches(inputs.get("model"), ckpt_id, 0):
            inputs["model"] = [hands_id, 0]
        if _ref_matches(inputs.get("clip"), ckpt_id, 1):
            inputs["clip"] = [hands_id, 1]
    return hands_id


def _append_prompt_fragment(base: str, fragment: str) -> str:
    b = str(base or "").strip()
    f = str(fragment or "").strip()
    if not f:
        return b
    if not b:
        return f
    if f.lower() in b.lower():
        return b
    if b.endswith(","):
        return b + " " + f
    return b + ", " + f


def _inject_style_lora_after(workflow: dict, upstream_id: str, lora_name: str, strength: float) -> str:
    new_id = _next_numeric_node_id(workflow)
    workflow[new_id] = {
        "inputs": {
            "lora_name": lora_name,
            "strength_model": float(strength),
            "strength_clip": float(strength),
            "model": [upstream_id, 0],
            "clip": [upstream_id, 1],
        },
        "class_type": "LoraLoader",
        "_meta": {"title": "Load Extra LoRA"},
    }
    for nid, node in workflow.items():
        if str(nid) == str(new_id):
            continue
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        if _ref_matches(inputs.get("model"), upstream_id, 0):
            inputs["model"] = [new_id, 0]
        if _ref_matches(inputs.get("clip"), upstream_id, 1):
            inputs["clip"] = [new_id, 1]
    return new_id


def _apply_workflow_params(workflow: dict, params: dict) -> dict:
    prompt_node_id = _read_env_str("WORKFLOW_PROMPT_NODE_ID", "")
    negative_node_id = _read_env_str("WORKFLOW_NEGATIVE_NODE_ID", "")
    filename_node_id = _read_env_str("WORKFLOW_FILENAME_NODE_ID", "")
    requested_workflow = str(params.get("workflow") or "").strip().lower()

    clip_ids = _pick_clip_text_nodes(workflow)
    pos_id = prompt_node_id if (prompt_node_id and prompt_node_id in workflow) else (clip_ids[0] if clip_ids else "")
    neg_id = negative_node_id if (negative_node_id and negative_node_id in workflow) else (clip_ids[1] if len(clip_ids) > 1 else "")

    existing_prompt = ""
    existing_negative = ""
    if pos_id and pos_id in workflow:
        existing_prompt = str((workflow[pos_id].get("inputs") or {}).get("text") or "")
    if neg_id and neg_id in workflow:
        existing_negative = str((workflow[neg_id].get("inputs") or {}).get("text") or "")

    prompt = str(params.get("prompt") or "").strip() or existing_prompt
    negative = str(params.get("negative_prompt") or "").strip() or existing_negative

    pose_type_lower = str(params.get("poseType") or "").strip().lower()
    prompt_lower = prompt.lower()
    prompt_explicitly_hides_hands = ("no hands" in prompt_lower) or ("hands out of frame" in prompt_lower) or ("no fingers" in prompt_lower)
    disable_hand_fix = str(params.get("disable_hand_fix") or "").strip().lower() in ("1", "true", "yes", "y", "on")
    # Agora só desabilita se realmente NÃO for anal_hands/anal_hands_hold (esses PRECISAM de correção)
    disable_hand_fix_effective = disable_hand_fix or (
        pose_type_lower.startswith(("anal", "pussy")) 
        and not pose_type_lower.startswith(("anal_hands")) 
        and prompt_explicitly_hides_hands
    )

    if not disable_hand_fix_effective:
        prompt = _append_prompt_fragment(prompt, HANDS_POSITIVE_PROMPT)
        negative = _append_prompt_fragment(negative, HANDS_NEGATIVE_PROMPT)
        try:
            # Aumenta strength para garantir que o Lora pegue (antes estava 0.7, pode ser pouco para close-ups)
            hands_strength = float(params.get("hands_lora_strength") or _read_env_str("HANDS_LORA_STRENGTH", "0.8"))
        except Exception:
            hands_strength = 0.8
        
        # Chama ensure_hands_lora que injeta o nó SE não existir, e reconecta o fluxo
        hands_node_id = _ensure_hands_lora(workflow, hands_strength)
        
        # Se injetou, precisamos garantir que o fluxo passe por ele
        if hands_node_id:
            # Reconecta KSampler ou qualquer nó que use MODEL para usar o output do Lora de mãos
            # Procura nós consumidores de MODEL (KSampler, IPAdapter, ControlNetApply, etc)
            upstream_model_src = _find_first_node_id(workflow, "CheckpointLoaderSimple")
            if upstream_model_src:
                for nid, node in workflow.items():
                    if str(nid) == str(hands_node_id): continue
                    if "inputs" not in node: continue
                    inputs = node["inputs"]
                    # Se o nó está plugado no Checkpoint original, move para o Lora de Mãos
                    if _ref_matches(inputs.get("model"), upstream_model_src, 0):
                        inputs["model"] = [hands_node_id, 0]
                        print(f"[Assets] Reconectado node {nid} (model) para Hands Lora {hands_node_id}")
                    if _ref_matches(inputs.get("clip"), upstream_model_src, 1):
                        inputs["clip"] = [hands_node_id, 1]
                        print(f"[Assets] Reconectado node {nid} (clip) para Hands Lora {hands_node_id}")
            
    else:
        hands_node_id = None

    if pos_id and pos_id in workflow:
        workflow[pos_id].setdefault("inputs", {})["text"] = prompt
    if neg_id and neg_id in workflow:
        workflow[neg_id].setdefault("inputs", {})["text"] = negative

    extra_lora = str(params.get("extra_lora") or "").strip()
    if extra_lora:
        lora_node_id = None
        for nid, node in workflow.items():
            if not isinstance(node, dict) or node.get("class_type") != "LoraLoader":
                continue
            inputs = node.get("inputs")
            if not isinstance(inputs, dict):
                continue
            if str(inputs.get("lora_name") or "").strip() == HANDS_LORA_FILENAME:
                continue
            lora_node_id = str(nid)
            break

        if lora_node_id and lora_node_id in workflow:
            workflow[lora_node_id].setdefault("inputs", {})["lora_name"] = extra_lora
            workflow[lora_node_id].setdefault("inputs", {})["strength_model"] = 0.8
            workflow[lora_node_id].setdefault("inputs", {})["strength_clip"] = 0.8
        else:
            upstream = hands_node_id or _find_first_node_id(workflow, "CheckpointLoaderSimple")
            if upstream:
                _inject_style_lora_after(workflow, str(upstream), extra_lora, 0.8)

    best_clip_provider_id = _pick_best_clip_provider_id(workflow, hands_node_id)
    if best_clip_provider_id:
        for nid in _pick_clip_text_nodes(workflow):
            if nid not in workflow:
                continue
            inputs = workflow[nid].get("inputs")
            if isinstance(inputs, dict) and "clip" in inputs:
                inputs["clip"] = [best_clip_provider_id, 1]

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

    # Sobrescreve o checkpoint se definido no ENV
    # env_ckpt = _read_env_str("CHECKPOINT_FILENAME", "")
    env_ckpt = "realvisxlV50_v50LightningBakedvae.safetensors" # HARDCODED
    if env_ckpt:
        for node in workflow.values():
            if not isinstance(node, dict): continue
            if node.get("class_type") == "CheckpointLoaderSimple":
                inputs = node.get("inputs")
                if isinstance(inputs, dict) and "ckpt_name" in inputs:
                    inputs["ckpt_name"] = env_ckpt
                    print(f"[App] Checkpoint substituído dinamicamente por: {env_ckpt}")

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
        class_type_lower = class_type.lower().strip()
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

        if "controlnetapply" in class_type_lower and params.get("control_strength") is not None and "strength" in inputs:
            try:
                inputs["strength"] = float(params.get("control_strength"))
            except Exception:
                pass
        if params.get("denoise") is not None and "denoise" in inputs:
            try:
                inputs["denoise"] = float(params.get("denoise"))
            except Exception:
                pass

        if class_type == "KSampler" and requested_workflow == "pack":
            if params.get("cfg") is None and "cfg" in inputs:
                try:
                    inputs["cfg"] = max(float(inputs.get("cfg") or 0), 6.0)
                except Exception:
                    inputs["cfg"] = 6.0
            if params.get("steps") is None and "steps" in inputs:
                try:
                    inputs["steps"] = max(int(inputs.get("steps") or 0), 40)
                except Exception:
                    inputs["steps"] = 40

    return workflow


@app.cls(
    gpu=_read_env_str("GPU_TYPE", "A10G"),
    image=image,
    volumes={"/cache": vol},
    secrets=_modal_secrets(),
    scaledown_window=_read_env_int("SCALEDOWN_WINDOW", 300),
    timeout=_read_env_int("JOB_TIMEOUT", 1200),
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
            print("[app] Assets ensured. Sleeping 5s to sync FS...")
            time.sleep(5) 
        except Exception as e:
            print(f"[app] CRITICAL: _ensure_assets_present failed: {e}")
            
        launch = ["python", "main.py", "--listen", "127.0.0.1", "--port", str(self.port)]
        print(f"[app] Launching ComfyUI: {launch}")
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
                    try:
                        oi = requests.get(f"http://127.0.0.1:{self.port}/object_info", timeout=30)
                        if oi.status_code == 200:
                            parsed = oi.json()
                            self._object_info = parsed if isinstance(parsed, dict) else {}
                            print(
                                "[ComfyUI] object_info_loaded",
                                {
                                    "node_count": len(self._object_info),
                                    "has_ultralytics": "UltralyticsDetectorProvider" in self._object_info,
                                },
                            )
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
        use_scene = False
        if requested == "pack":
            workflow_path = "/root/workflow_pack_api.json"
        elif requested == "pose":
            workflow_path = "/root/workflow_pose_api.json"
        elif requested == "skeleton":
            workflow_path = "/root/workflow_skeleton_api.json"
        elif requested == "inpainting":
            use_scene = _read_env_str("INPAINT_SCENE_CONTROLNET", "true").strip().lower() not in ("false", "0", "no")
            workflow_path = "/root/workflow_inpainting_scene_api.json" if use_scene else "/root/workflow_inpainting_api.json"
        else:
            workflow_path = "/root/workflow_api.json"
        print(
            "[generate]",
            {
                "version": APP_VERSION,
                "workflow": requested or "default",
                "workflow_path": workflow_path,
                "inpaint_scene": use_scene if requested == "inpainting" else None,
            },
        )
        workflow = json.loads(Path(workflow_path).read_text(encoding="utf-8"))
        client_id = uuid.uuid4().hex

        params = dict(payload or {})
        if params.get("seed") is None:
            try:
                import random

                params["seed"] = random.randint(1, 2_147_483_647)
            except Exception:
                params["seed"] = 1337
        params["filename_prefix"] = client_id

        input_dir = Path("/root/comfy/ComfyUI/input")
        input_dir.mkdir(parents=True, exist_ok=True)

        def _ensure_placeholder_png(filename: str):
            try:
                p = input_dir / filename
                p.write_bytes(base64.b64decode(_PLACEHOLDER_PNG_B64, validate=True))
                try:
                    sz = p.stat().st_size
                    print("[Inputs] placeholder_written", {"file": filename, "bytes": sz, "note": "will be replaced if base64 input is provided"})
                except Exception:
                    pass
            except Exception as e:
                print(f"Erro criando placeholder {filename}: {e}")

        _ensure_placeholder_png("ref.png")
        _ensure_placeholder_png("pose.png")

        def _save_input_b64(key: str, suffix: str, node_id: str):
            val = str(params.get(key) or "").strip()
            if not val or node_id not in workflow:
                return
            try:
                img_bytes = base64.b64decode(val, validate=False)
                fname = f"{client_id}_{suffix}.png"
                out_path = input_dir / fname
                if requested == "inpainting" and key == "base_image_base64":
                    try:
                        from PIL import Image

                        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                        ar = str(params.get("aspect_ratio") or "").strip()
                        base_res = int(_read_env_int("INPAINT_BASE_RES", 1024))

                        def _mul64(x: float) -> int:
                            v = int(round(x / 64.0) * 64)
                            return max(64, v)

                        target_w = 0
                        target_h = 0
                        if ar == "2:3":
                            target_w, target_h = base_res, _mul64(base_res * 1.5)
                        elif ar == "3:2":
                            target_w, target_h = _mul64(base_res * 1.5), base_res
                        elif ar == "1:1":
                            target_w, target_h = base_res, base_res
                        elif ar == "9:16":
                            target_w, target_h = base_res, _mul64(base_res * (16.0 / 9.0))
                        elif ar == "16:9":
                            target_w, target_h = _mul64(base_res * (16.0 / 9.0)), base_res

                        if target_w and target_h:
                            src_w, src_h = img.size
                            target_ar = target_w / float(target_h)
                            src_ar = src_w / float(src_h)
                            if src_ar > target_ar:
                                new_w = int(src_h * target_ar)
                                left = max(0, (src_w - new_w) // 2)
                                img = img.crop((left, 0, left + new_w, src_h))
                            else:
                                new_h = int(src_w / target_ar)
                                top = max(0, (src_h - new_h) // 2)
                                img = img.crop((0, top, src_w, top + new_h))
                            img = img.resize((target_w, target_h))
                        img.save(out_path, format="PNG", optimize=True)
                        workflow[node_id].setdefault("inputs", {})["image"] = fname
                        try:
                            print("[Inputs] base_normalized", {"file": fname, "size": list(img.size), "aspect_ratio": ar or None})
                        except Exception:
                            pass
                        return
                    except Exception as e:
                        print("[Inputs] base_normalize_failed", {"error": str(e)})
                if requested == "skeleton" and key == "pose_image_base64":
                    try:
                        from PIL import Image, ImageOps, ImageFilter

                        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                        img = ImageOps.grayscale(img)
                        img = img.point(lambda p: 255 if p > 20 else 0)
                        img = img.filter(ImageFilter.GaussianBlur(radius=0.5))
                        img = img.convert("RGB")
                        img.save(out_path, format="PNG", optimize=True)
                    except Exception:
                        out_path.write_bytes(img_bytes)
                else:
                    out_path.write_bytes(img_bytes)
                workflow[node_id].setdefault("inputs", {})["image"] = fname
                try:
                    print("[Inputs] input_saved", {"key": key, "file": fname, "bytes": len(img_bytes), "node_id": node_id})
                except Exception:
                    pass
            except Exception as e:
                print(f"Erro salvando input {key}: {e}")

        _save_input_b64("pose_image_base64", "pose", "20")
        _save_input_b64("ref_image_base64", "ref", "9")
        _save_input_b64("base_image_base64", "base", "30")
        _save_input_b64("mask_base64", "mask", "31")

        if requested == "inpainting" and "30" in workflow and "31" in workflow:
            try:
                base_path = input_dir / f"{client_id}_base.png"
                mask_val = str(params.get("mask_base64") or "").strip()
                if base_path.exists() and not mask_val:
                    from PIL import Image, ImageChops, ImageDraw, ImageFilter

                    img = Image.open(base_path)
                    pose_type = str(params.get("poseType") or "").strip().lower()
                    w, h = img.size
                    img_rgb = img.convert("RGB")

                    def _build_grey_overlay_mask() -> tuple[Image.Image, float]:
                        px = img_rgb.getdata()
                        out = bytearray(w * h)
                        i = 0
                        hit = 0
                        for r, g, b in px:
                            if abs(r - g) <= 6 and abs(r - b) <= 6 and 90 <= r <= 210:
                                out[i] = 255
                                hit += 1
                            i += 1
                        m = Image.frombytes("L", (w, h), bytes(out))
                        try:
                            m = m.filter(ImageFilter.MaxFilter(size=9))
                        except Exception:
                            pass
                        try:
                            m = m.filter(ImageFilter.GaussianBlur(radius=2))
                        except Exception:
                            pass
                        ratio = (hit / float(w * h)) if w and h else 0.0
                        return m, ratio

                    mask_l = Image.new("L", (w, h), color=0)
                    if pose_type == "doggystyle":
                        draw = ImageDraw.Draw(mask_l)
                        left = int(w * 0.10)
                        right = int(w * 0.90)
                        top = int(h * 0.18)
                        bottom = int(h * 0.98)
                        radius = int(min(w, h) * 0.06)
                        try:
                            draw.rounded_rectangle([left, top, right, bottom], radius=radius, fill=255)
                        except Exception:
                            draw.rectangle([left, top, right, bottom], fill=255)
                        try:
                            mask_l = mask_l.filter(ImageFilter.GaussianBlur(radius=2))
                        except Exception:
                            pass

                    grey_l, grey_ratio = _build_grey_overlay_mask()
                    try:
                        mask_l = ImageChops.lighter(mask_l, grey_l)
                    except Exception:
                        pass
                    if grey_ratio > 0.01:
                        for node in workflow.values():
                            if not isinstance(node, dict):
                                continue
                            class_type = str(node.get("class_type") or "")
                            inputs = node.get("inputs")
                            if not isinstance(inputs, dict):
                                continue
                            if "controlnetapply" in class_type.lower() and "strength" in inputs:
                                try:
                                    inputs["strength"] = min(float(inputs["strength"]), 0.6)
                                except Exception:
                                    pass
                        for node in workflow.values():
                            if not isinstance(node, dict):
                                continue
                            inputs = node.get("inputs")
                            if not isinstance(inputs, dict):
                                continue
                            if "denoise" in inputs:
                                try:
                                    inputs["denoise"] = max(float(inputs["denoise"]), 0.65)
                                except Exception:
                                    pass

                    mask = Image.merge("RGB", (mask_l, mask_l, mask_l))
                    mask_name = f"{client_id}_mask.png"
                    mask_path = input_dir / mask_name
                    mask.save(mask_path, format="PNG", optimize=True)
                    workflow["31"].setdefault("inputs", {})["image"] = mask_name
            except Exception as e:
                print(f"[Inpaint] erro gerando mask default: {e}")

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

        has_ref_b64 = bool(str(params.get("ref_image_base64") or "").strip())
        if refs and not has_ref_b64:
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

        workflow = _inject_hands_detailer(workflow, params, getattr(self, "_object_info", {}) or {})

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

    comfy = ComfyUIService()
    try:
        img_bytes = comfy.generate.remote(payload)
        return Response(content=img_bytes, media_type="image/png")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
