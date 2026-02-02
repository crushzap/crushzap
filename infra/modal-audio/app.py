import base64
import os
import tempfile
import time
import shutil
import glob
import subprocess

import modal

app = modal.App("crushzap-audio")

_DEVICE = None
_WHISPER_MODEL = None
_TTS_MODEL = None

_TTS_VOLUME = modal.Volume.from_name("crushzap-tts-cache", create_if_missing=True)

os.environ["TTS_HOME"] = "/tts"
os.environ["COQUI_TOS_AGREED"] = "1"
os.environ["HF_HOME"] = "/tts/hf"
os.environ["HUGGINGFACE_HUB_CACHE"] = "/tts/hf/hub"

def _acquire_lock(lock_path: str, timeout_s: int = 900, poll_s: float = 0.25):
    deadline = time.time() + timeout_s
    while True:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode("utf-8"))
            os.close(fd)
            return True
        except FileExistsError:
            if time.time() >= deadline:
                return False
            time.sleep(poll_s)

def _release_lock(lock_path: str):
    try:
        os.remove(lock_path)
    except FileNotFoundError:
        pass

def _clear_xtts_cache():
    candidates = set([
        "/tts/tts_models--multilingual--multi-dataset--xtts_v2",
        "/root/.local/share/tts/tts_models--multilingual--multi-dataset--xtts_v2",
        "/tts/hf",
        "/root/.cache/huggingface",
        "/root/.cache/tts",
    ])
    if os.path.exists("/__modal/volumes"):
        for p in glob.glob("/__modal/volumes/**/tts_models--multilingual--multi-dataset--xtts_v2", recursive=True):
            candidates.add(p)
        for p in glob.glob("/__modal/volumes/**/hf", recursive=True):
            candidates.add(p)
    for p in candidates:
        if os.path.exists(p):
            shutil.rmtree(p, ignore_errors=True)

def _detect_audio_ext(data: bytes) -> str:
    if len(data) >= 12 and data[0:4] == b"RIFF" and data[8:12] == b"WAVE":
        return ".wav"
    if len(data) >= 4 and data[0:4] == b"OggS":
        return ".ogg"
    if len(data) >= 3 and data[0:3] == b"ID3":
        return ".mp3"
    if len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0:
        return ".mp3"
    return ".wav"

def _normalize_audio_to_wav(input_path: str) -> str:
    out_path = tempfile.mktemp(suffix=".wav")
    subprocess.run(
        ["ffmpeg", "-y", "-i", input_path, "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le", out_path],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return out_path

def _concat_wavs(paths: list[str]) -> str:
    list_path = tempfile.mktemp(suffix=".txt")
    with open(list_path, "w", encoding="utf-8") as f:
        for p in paths:
            f.write(f"file '{p}'\n")
    out_path = tempfile.mktemp(suffix=".wav")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_path, "-c:a", "pcm_s16le", out_path],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        if os.path.exists(list_path):
            os.remove(list_path)
    except Exception:
        pass
    return out_path

def _tts_to_file_with_retry(text: str, speaker_wav: str, language: str, file_path: str):
    global _TTS_MODEL
    retried = False
    while True:
        try:
            _TTS_MODEL.tts_to_file(text=text, speaker_wav=speaker_wav, language=language, file_path=file_path)
            return
        except Exception as e:
            msg = str(e)
            if retried or ("PytorchStreamReader" not in msg and "failed finding central directory" not in msg):
                raise
            _TTS_MODEL = None
            _clear_xtts_cache()
            _ensure_tts()
            retried = True

def _ensure_models():
    raise RuntimeError("_ensure_models is deprecated")

def _ensure_device():
    global _DEVICE
    import torch
    if _DEVICE is None:
        _DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    return _DEVICE

def _ensure_whisper():
    global _WHISPER_MODEL
    import whisper
    device = _ensure_device()
    model_name = (os.environ.get("WHISPER_MODEL") or "large-v3").strip() or "large-v3"
    if _WHISPER_MODEL is None:
        _WHISPER_MODEL = whisper.load_model(model_name, device=device)
    return _WHISPER_MODEL

def _ensure_tts():
    global _TTS_MODEL
    from TTS.api import TTS
    device = _ensure_device()
    if _TTS_MODEL is not None:
        return _TTS_MODEL

    lock_path = "/tts/.xtts_download.lock"
    got_lock = _acquire_lock(lock_path)
    try:
        try:
            _TTS_MODEL = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
        except Exception as e:
            msg = str(e)
            if "PytorchStreamReader" in msg or "failed finding central directory" in msg:
                _clear_xtts_cache()
                _TTS_MODEL = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
            else:
                raise
    finally:
        if got_lock:
            _release_lock(lock_path)
    return _TTS_MODEL

def _read_env_str(name: str, default: str = "") -> str:
    v = (os.environ.get(name) or "").strip()
    return v if v else default

# Definição da imagem com dependências
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "git", "libsndfile1")
    .pip_install(
        "torch==2.1.2",
        "torchaudio==2.1.2",
        "openai-whisper==20231117",
        "transformers==4.36.2",
        "numpy==1.26.3",
        "scipy==1.11.4",
        "fastapi[standard]==0.115.4",
        "typing-extensions==4.9.0",
    )
    .run_commands(
        "python -c 'import whisper; whisper.load_model(\"large-v3\")'",
        "pip install --no-cache-dir coqui-tts==0.22.1"
    )
    .run_commands(
        "python -c \"import pathlib; p=pathlib.Path('/usr/local/lib/python3.10/site-packages/coqpit/coqpit.py'); s=p.read_text(encoding='utf-8'); s=s.replace('if issubclass(field_type, Serializable):', 'import inspect\\n    if inspect.isclass(field_type) and issubclass(field_type, Serializable):'); p.write_text(s, encoding='utf-8')\""
    )
)

@app.cls(
    gpu=_read_env_str("GPU_TYPE", "T4"),  # T4 é suficiente e barato
    image=image,
    timeout=600,  # 10 minutos max por job
    scaledown_window=300,
    secrets=[modal.Secret.from_name("custom-secret")] if _read_env_str("MODAL_SECRET_NAME") else [],
)
class AudioEngine:
    def _load_models(self):
        global _DEVICE, _WHISPER_MODEL, _TTS_MODEL
        import torch
        import whisper
        from TTS.api import TTS

        if _DEVICE is None:
            _DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

        if _WHISPER_MODEL is None:
            _WHISPER_MODEL = whisper.load_model("large-v3", device=_DEVICE)

        if _TTS_MODEL is None:
            lock_path = "/tts/.xtts_download.lock"
            got_lock = _acquire_lock(lock_path)
            try:
                try:
                    _TTS_MODEL = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(_DEVICE)
                except Exception as e:
                    msg = str(e)
                    if "PytorchStreamReader" in msg or "failed finding central directory" in msg:
                        _clear_xtts_cache()
                        _TTS_MODEL = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(_DEVICE)
                    else:
                        raise
            finally:
                if got_lock:
                    _release_lock(lock_path)

        self.device = _DEVICE
        self.whisper_model = _WHISPER_MODEL
        self.tts = _TTS_MODEL

    @modal.enter()
    def setup(self):
        self._load_models()


    @modal.method()
    def transcribe_audio(self, audio_bytes: bytes) -> str:
        if getattr(self, "whisper_model", None) is None:
            self._load_models()
        # Whisper precisa de um arquivo físico
        with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            result = self.whisper_model.transcribe(tmp_path, beam_size=5)
            text = result.get("text", "").strip()
            return text
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    @modal.method()
    def generate_speech(self, text: str, speaker_wav_bytes: bytes, language: str = "pt") -> dict:
        if getattr(self, "tts", None) is None:
            self._load_models()
        speaker_path = None
        speaker_norm_path = None
        try:
            ext = _detect_audio_ext(speaker_wav_bytes)
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as speaker_tmp:
                speaker_tmp.write(speaker_wav_bytes)
                speaker_path = speaker_tmp.name
            speaker_norm_path = _normalize_audio_to_wav(speaker_path)
        except Exception:
            if speaker_path and os.path.exists(speaker_path):
                os.remove(speaker_path)
            raise

        output_path = tempfile.mktemp(suffix=".wav")
        output_ogg_path = tempfile.mktemp(suffix=".ogg")

        try:
            self.tts.tts_to_file(
                text=text,
                speaker_wav=speaker_norm_path,
                language=language,
                file_path=output_path
            )
            with open(output_path, "rb") as f:
                generated_bytes = f.read()

            try:
                import subprocess
                subprocess.run(
                    [
                        "ffmpeg",
                        "-y",
                        "-i",
                        output_path,
                        "-c:a",
                        "libopus",
                        "-b:a",
                        "48k",
                        output_ogg_path,
                    ],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                if os.path.exists(output_ogg_path) and os.path.getsize(output_ogg_path) > 256:
                    with open(output_ogg_path, "rb") as ogg:
                        return {"bytes": ogg.read(), "content_type": "audio/ogg"}
            except Exception:
                pass
            return {"bytes": generated_bytes, "content_type": "audio/wav"}
        finally:
            if speaker_path and os.path.exists(speaker_path):
                os.remove(speaker_path)
            if speaker_norm_path and os.path.exists(speaker_norm_path):
                os.remove(speaker_norm_path)
            if os.path.exists(output_path):
                os.remove(output_path)
            if os.path.exists(output_ogg_path):
                os.remove(output_ogg_path)


# --- Endpoints HTTP ---

@app.function(image=image, volumes={"/tts": _TTS_VOLUME}, timeout=900, gpu=_read_env_str("GPU_TYPE", "T4"))
@modal.fastapi_endpoint(method="POST")
def transcribe(payload: dict):
    from fastapi.responses import JSONResponse
    
    audio_b64 = payload.get("audio_base64")
    if not audio_b64:
        return JSONResponse({"error": "audio_base64 is required"}, status_code=400)

    try:
        audio_bytes = base64.b64decode(audio_b64)
        _ensure_whisper()
        with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        try:
            fp16 = _ensure_device() == "cuda"
            result = _WHISPER_MODEL.transcribe(tmp_path, beam_size=5, fp16=fp16)
            text = (result.get("text", "") or "").strip()
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        return {"text": text, "version": "2026-02-01-a"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.function(image=image, volumes={"/tts": _TTS_VOLUME}, timeout=900, gpu=_read_env_str("GPU_TYPE", "T4"))
@modal.fastapi_endpoint(method="POST")
def generate(payload: dict):
    from fastapi.responses import JSONResponse
    
    text = payload.get("text")
    speaker_b64 = payload.get("speaker_wav_base64")
    language = payload.get("language", "pt")

    if not text or not speaker_b64:
        return JSONResponse({"error": "text and speaker_wav_base64 are required"}, status_code=400)

    global _TTS_MODEL
    try:
        _ensure_tts()
        speaker_paths = []
        speaker_norm_paths = []
        combined_path = None
        speaker_norm_path = None
        try:
            arr = speaker_b64 if isinstance(speaker_b64, list) else [speaker_b64]
            max_samples = int((os.environ.get("XTTS_MAX_SAMPLES") or os.environ.get("QWEN3_MAX_SAMPLES") or "4").strip() or "4")
            max_samples = max(1, min(4, max_samples))
            for b64 in [x for x in arr if x]:
                speaker_bytes = base64.b64decode(b64)
                ext = _detect_audio_ext(speaker_bytes)
                with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as speaker_tmp:
                    speaker_tmp.write(speaker_bytes)
                    speaker_paths.append(speaker_tmp.name)
                speaker_norm_paths.append(_normalize_audio_to_wav(speaker_paths[-1]))
                if len(speaker_norm_paths) >= max_samples:
                    break
            if not speaker_norm_paths:
                raise ValueError("speaker_wav_base64 is required")
            speaker_norm_path = speaker_norm_paths[0]
            if len(speaker_norm_paths) > 1:
                combined_path = _concat_wavs(speaker_norm_paths)
                speaker_norm_path = combined_path
        except Exception:
            raise

        output_path = tempfile.mktemp(suffix=".wav")
        output_ogg_path = tempfile.mktemp(suffix=".ogg")

        try:
            retried = False
            while True:
                try:
                    _tts_to_file_with_retry(text=text, speaker_wav=speaker_norm_path, language=language, file_path=output_path)
                    break
                except Exception as e:
                    msg = str(e)
                    if retried or ("PytorchStreamReader" not in msg and "failed finding central directory" not in msg):
                        raise
                    _TTS_MODEL = None
                    _clear_xtts_cache()
                    _ensure_models()
                    retried = True
            with open(output_path, "rb") as f:
                generated_bytes = f.read()

            audio_bytes = generated_bytes
            content_type = "audio/wav"
            try:
                import subprocess
                subprocess.run(
                    [
                        "ffmpeg",
                        "-y",
                        "-i",
                        output_path,
                        "-c:a",
                        "libopus",
                        "-b:a",
                        "48k",
                        output_ogg_path,
                    ],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                if os.path.exists(output_ogg_path) and os.path.getsize(output_ogg_path) > 256:
                    with open(output_ogg_path, "rb") as ogg:
                        audio_bytes = ogg.read()
                        content_type = "audio/ogg"
            except Exception:
                pass
        finally:
            for p in speaker_paths:
                try:
                    if p and os.path.exists(p):
                        os.remove(p)
                except Exception:
                    pass
            for p in speaker_norm_paths:
                try:
                    if p and os.path.exists(p):
                        os.remove(p)
                except Exception:
                    pass
            if combined_path and os.path.exists(combined_path):
                os.remove(combined_path)
            if os.path.exists(output_path):
                os.remove(output_path)
            if os.path.exists(output_ogg_path):
                os.remove(output_ogg_path)
        
        return {
            "audio_base64": base64.b64encode(audio_bytes).decode("utf-8"),
            "content_type": content_type,
            "version": "2026-02-01-a",
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.function(image=image, volumes={"/tts": _TTS_VOLUME}, timeout=900, gpu=_read_env_str("GPU_TYPE", "T4"))
@modal.fastapi_endpoint(method="POST")
def generate_batch(payload: dict):
    from fastapi.responses import JSONResponse

    texts = payload.get("texts")
    speaker_b64 = payload.get("speaker_wav_base64")
    language = payload.get("language", "pt")

    if not isinstance(texts, list) or not speaker_b64:
        return JSONResponse({"error": "texts (array) and speaker_wav_base64 are required"}, status_code=400)

    clean_texts = [str(x).strip() for x in texts if str(x).strip()]
    if not clean_texts:
        return JSONResponse({"error": "texts is empty"}, status_code=400)

    global _TTS_MODEL
    speaker_paths = []
    speaker_norm_paths = []
    combined_path = None
    speaker_norm_path = None
    part_paths = []
    list_path = None
    out_ogg_path = None
    try:
        _ensure_tts()
        arr = speaker_b64 if isinstance(speaker_b64, list) else [speaker_b64]
        max_samples = int((os.environ.get("XTTS_MAX_SAMPLES") or os.environ.get("QWEN3_MAX_SAMPLES") or "4").strip() or "4")
        max_samples = max(1, min(4, max_samples))
        for b64 in [x for x in arr if x]:
            speaker_bytes = base64.b64decode(b64)
            ext = _detect_audio_ext(speaker_bytes)
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as speaker_tmp:
                speaker_tmp.write(speaker_bytes)
                speaker_paths.append(speaker_tmp.name)
            speaker_norm_paths.append(_normalize_audio_to_wav(speaker_paths[-1]))
            if len(speaker_norm_paths) >= max_samples:
                break
        if not speaker_norm_paths:
            raise ValueError("speaker_wav_base64 is required")
        speaker_norm_path = speaker_norm_paths[0]
        if len(speaker_norm_paths) > 1:
            combined_path = _concat_wavs(speaker_norm_paths)
            speaker_norm_path = combined_path

        for idx, txt in enumerate(clean_texts):
            part_wav = tempfile.mktemp(suffix=f".part{idx}.wav")
            _tts_to_file_with_retry(text=txt, speaker_wav=speaker_norm_path, language=language, file_path=part_wav)
            part_paths.append(part_wav)

        list_path = tempfile.mktemp(suffix=".txt")
        with open(list_path, "w", encoding="utf-8") as f:
            for p in part_paths:
                f.write(f"file '{p}'\n")

        out_ogg_path = tempfile.mktemp(suffix=".ogg")
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_path, "-c:a", "libopus", "-b:a", "48k", out_ogg_path],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        with open(out_ogg_path, "rb") as ogg:
            audio_bytes = ogg.read()

        return {
            "audio_base64": base64.b64encode(audio_bytes).decode("utf-8"),
            "content_type": "audio/ogg",
            "version": "2026-02-01-a",
            "parts": len(clean_texts),
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        for p in part_paths:
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass
        for p in speaker_paths:
            try:
                if p and os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass
        for p in speaker_norm_paths:
            try:
                if p and os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass
        for p in (combined_path, list_path, out_ogg_path):
            try:
                if p and os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass
