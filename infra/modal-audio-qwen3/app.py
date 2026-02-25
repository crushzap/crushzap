import base64
import os
import tempfile
import subprocess
import time
import inspect
import hashlib

import modal

app = modal.App("crushzap-audio-qwen3")

_DEVICE = None
_QWEN_VOICE_DESIGN_MODEL = None
_QWEN_BASE_MODEL = None

_QWEN_VOLUME = modal.Volume.from_name("crushzap-qwen3-cache", create_if_missing=True)

_CLONE_PROMPT_CACHE: dict[str, object] = {}

os.environ["HF_HOME"] = "/qwen3/hf"
os.environ["HUGGINGFACE_HUB_CACHE"] = "/qwen3/hf/hub"
os.environ["XDG_CACHE_HOME"] = "/qwen3/cache"
os.environ["TRANSFORMERS_NO_ADVISORY_WARNINGS"] = "1"
os.environ["TRANSFORMERS_VERBOSITY"] = "error"


def _read_env_str(name: str, default: str = "") -> str:
    v = (os.environ.get(name) or "").strip()
    return v if v else default


def _read_env_bool(name: str, default: bool = False) -> bool:
    v = (os.environ.get(name) or "").strip().lower()
    if v == "":
        return default
    return v in ["1", "true", "yes", "y", "on"]


def _ensure_device():
    global _DEVICE
    import torch
    if _DEVICE is None:
        _DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"
    return _DEVICE


def _load_model(model_id: str):
    from qwen_tts import Qwen3TTSModel
    import torch
    device = _ensure_device()
    dtype = torch.bfloat16 if device.startswith("cuda") else torch.float32
    attn = _read_env_str("QWEN3_ATTN_IMPL", "sdpa")
    if device.startswith("cuda") and attn:
        try:
            return Qwen3TTSModel.from_pretrained(
                model_id,
                device_map=device,
                dtype=dtype,
                attn_implementation=attn,
            )
        except Exception:
            return Qwen3TTSModel.from_pretrained(model_id, device_map=device, dtype=dtype)
    return Qwen3TTSModel.from_pretrained(model_id, device_map=device, dtype=dtype)


def _ensure_voice_design_model():
    global _QWEN_VOICE_DESIGN_MODEL
    if _QWEN_VOICE_DESIGN_MODEL is None:
        model_id = _read_env_str("QWEN3_MODEL_ID", "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign")
        _QWEN_VOICE_DESIGN_MODEL = _load_model(model_id)
    return _QWEN_VOICE_DESIGN_MODEL


def _ensure_base_model():
    global _QWEN_BASE_MODEL
    if _QWEN_BASE_MODEL is None:
        design_id = _read_env_str("QWEN3_MODEL_ID", "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign")
        base_id = design_id.replace("VoiceDesign", "Base") if "VoiceDesign" in design_id else "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
        _QWEN_BASE_MODEL = _load_model(base_id)
    return _QWEN_BASE_MODEL


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


def _write_temp_audio_from_b64(b64: str) -> str:
    raw = base64.b64decode(b64)
    ext = _detect_audio_ext(raw)
    path = tempfile.mktemp(suffix=ext)
    with open(path, "wb") as f:
        f.write(raw)
    return path


def _normalize_to_wav(input_path: str) -> str:
    out_path = tempfile.mktemp(suffix=".wav")
    max_seconds = float(_read_env_str("QWEN3_SAMPLE_MAX_SECONDS", "6"))
    silence_db = _read_env_str("QWEN3_SAMPLE_SILENCE_DB", "-35")
    silence_sec = _read_env_str("QWEN3_SAMPLE_SILENCE_SEC", "0.15")
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-ac",
        "1",
        "-ar",
        "24000",
        "-af",
        f"silenceremove=start_periods=1:start_duration={silence_sec}:start_threshold={silence_db}dB:stop_periods=1:stop_duration={silence_sec}:stop_threshold={silence_db}dB",
    ]
    if max_seconds > 0:
        cmd += ["-t", str(max_seconds)]
    cmd += [out_path]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return out_path


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _concat_wavs(paths: list[str]) -> str:
    list_path = tempfile.mktemp(suffix=".txt")
    with open(list_path, "w", encoding="utf-8") as f:
        for p in paths:
            f.write(f"file '{p}'\n")
    out_wav_path = tempfile.mktemp(suffix=".wav")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_path, "-c:a", "pcm_s16le", out_wav_path],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        if os.path.exists(list_path):
            os.remove(list_path)
    except Exception:
        pass
    return out_wav_path


def _append_tail_silence(input_wav_path: str) -> str:
    tail_ms = float(_read_env_str("QWEN3_TAIL_SILENCE_MS", "220"))
    if tail_ms <= 0:
        return input_wav_path
    out_path = tempfile.mktemp(suffix=".wav")
    tail_seconds = max(0.05, tail_ms / 1000.0)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            input_wav_path,
            "-f",
            "lavfi",
            "-t",
            str(tail_seconds),
            "-i",
            "anullsrc=r=24000:cl=mono",
            "-filter_complex",
            "[0:a][1:a]concat=n=2:v=0:a=1",
            out_path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return out_path


def _create_silence_wav(seconds: float) -> str:
    out_path = tempfile.mktemp(suffix=".wav")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-t",
            str(seconds),
            "-i",
            "anullsrc=r=24000:cl=mono",
            out_path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return out_path


def _convert_to_wav_24k_mono(input_path: str) -> str:
    out_path = tempfile.mktemp(suffix=".wav")
    subprocess.run(
        ["ffmpeg", "-y", "-i", input_path, "-ac", "1", "-ar", "24000", out_path],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return out_path


def _encode_ogg(input_wav_path: str) -> tuple[bytes, str]:
    out_ogg = tempfile.mktemp(suffix=".ogg")
    out_mp3 = tempfile.mktemp(suffix=".mp3")
    try:
        ffmpeg_bin = _read_env_str("QWEN3_FFMPEG_BIN", "/usr/bin/ffmpeg").strip() or "ffmpeg"
        if ffmpeg_bin != "ffmpeg" and not os.path.exists(ffmpeg_bin):
            ffmpeg_bin = "ffmpeg"
        require_ogg = _read_env_bool("QWEN3_REQUIRE_OGG", True)
        ogg_bitrate = _read_env_str("QWEN3_OGG_BITRATE", "32k")
        ogg_ar = _read_env_str("QWEN3_OGG_SAMPLE_RATE", "48000")
        min_size = _read_env_int("QWEN3_OGG_MIN_BYTES", 128) or 128
        last_err = ""
        for codec, bitrate in [("libopus", ogg_bitrate), ("opus", ogg_bitrate), ("libvorbis", "96k"), ("vorbis", "96k")]:
            try:
                attempts = []
                if codec == "libopus":
                    attempts.append(["-application", "voip"])
                attempts.append([])
                for extra_args in attempts:
                    res = subprocess.run(
                        [
                            ffmpeg_bin,
                            "-hide_banner",
                            "-loglevel",
                            "error",
                            "-y",
                            "-i",
                            input_wav_path,
                            "-ac",
                            "1",
                            "-ar",
                            ogg_ar,
                            "-f",
                            "ogg",
                            "-c:a",
                            codec,
                            "-b:a",
                            bitrate,
                            *extra_args,
                            out_ogg,
                        ],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.PIPE,
                        text=True,
                    )
                    if res.returncode != 0:
                        raw = (res.stderr or "").strip()
                        if raw:
                            lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
                            tail_lines = lines[-8:] if len(lines) > 8 else lines
                            last_err = f"{codec}: " + " | ".join(tail_lines)
                        else:
                            last_err = f"ffmpeg failed ({codec})"
                        if os.path.exists(out_ogg):
                            try:
                                os.remove(out_ogg)
                            except Exception:
                                pass
                        continue
                    if os.path.exists(out_ogg) and os.path.getsize(out_ogg) > min_size:
                        with open(out_ogg, "rb") as f:
                            return f.read(), "audio/ogg"
            except Exception:
                if os.path.exists(out_ogg):
                    try:
                        os.remove(out_ogg)
                    except Exception:
                        pass
        if require_ogg:
            tail = (last_err or "unknown").replace("\n", " ").strip()[-280:]
            raise RuntimeError(f"ogg_encoding_failed: {tail}")
        try:
            subprocess.run(
                [ffmpeg_bin, "-y", "-i", input_wav_path, "-c:a", "libmp3lame", "-b:a", "128k", out_mp3],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if os.path.exists(out_mp3) and os.path.getsize(out_mp3) > 256:
                with open(out_mp3, "rb") as f:
                    return f.read(), "audio/mpeg"
        except Exception:
            if os.path.exists(out_mp3):
                try:
                    os.remove(out_mp3)
                except Exception:
                    pass
    finally:
        for path in [out_ogg, out_mp3]:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception:
                pass
    with open(input_wav_path, "rb") as f:
        return f.read(), "audio/wav"


def _normalize_language(lang: str) -> str:
    l = (lang or "").strip().lower()
    if l in ["pt-br", "pt_br", "portuguese-br", "brazilian portuguese", "português brasileiro", "portugues brasileiro"]:
        return "Portuguese"
    if l in ["pt", "portuguese", "português"]:
        return "Portuguese"
    if l in ["en", "english", "ingles", "inglês"]:
        return "English"
    if l in ["es", "spanish", "espanhol"]:
        return "Spanish"
    if l in ["fr", "french", "francês", "frances"]:
        return "French"
    return "Portuguese"


def _call_method(method, **kwargs):
    sig = inspect.signature(method)
    filtered = {k: v for k, v in kwargs.items() if k in sig.parameters}
    return method(**filtered)


def _unpack_wavs(result):
    if isinstance(result, tuple) and len(result) >= 2:
        return result[0], result[1]
    if isinstance(result, dict):
        wavs = result.get("wavs") or result.get("wav") or result.get("audio")
        sr = result.get("sr") or result.get("sample_rate")
        if wavs is not None and sr is not None:
            return wavs, sr
    raise ValueError("resultado de áudio inválido")


def _write_wav_from_array(wav, sr: int) -> str:
    import soundfile as sf
    path = tempfile.mktemp(suffix=".wav")
    sf.write(path, wav, sr)
    return path


def _read_env_float(name: str, default: float | None = None) -> float | None:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except Exception:
        return default


def _read_env_int(name: str, default: int | None = None) -> int | None:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except Exception:
        return default


def _read_env_str_list(name: str) -> list[str]:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return []
    return [x.strip() for x in raw.split(",") if x.strip()]


def _build_generation_kwargs(has_sample: bool = False):
    kwargs = {}
    if has_sample:
        temperature = _read_env_float("QWEN3_TEMPERATURE_SAMPLE", 0.9)
        top_p = _read_env_float("QWEN3_TOP_P_SAMPLE", 0.95)
        speed = _read_env_float("QWEN3_SPEED_SAMPLE", 1.25)
    else:
        temperature = _read_env_float("QWEN3_TEMPERATURE", 1.05)
        top_p = _read_env_float("QWEN3_TOP_P", 0.98)
        speed = _read_env_float("QWEN3_SPEED", 1.3)
    seed = _read_env_int("QWEN3_SEED")
    if temperature is not None:
        kwargs["temperature"] = temperature
    if top_p is not None:
        kwargs["top_p"] = top_p
    if speed is not None:
        kwargs["speed"] = speed
    if seed is not None:
        kwargs["seed"] = seed
    return kwargs


def _build_design_kwargs():
    kwargs = {}
    emotion = _read_env_str_list("QWEN3_EMOTION")
    if not emotion:
        emotion = ["flirty", "excited", "seductive", "passionate", "breathy", "natural"]
    kwargs["emotion"] = emotion
    return kwargs


def _build_voice_instruct(voice_prompt: str, has_sample: bool = False) -> str:
    force_read = _read_env_str("QWEN3_FORCE_READ_PROMPT", "")
    if has_sample and not _read_env_bool("QWEN3_FORCE_READ_WITH_SAMPLES", False):
        force_read = ""
    sexo_instruct = "Voz feminina brasileira. Não use voz masculina."
    if has_sample:
        sotaque_instruct = "Use sotaque 100% brasileiro (pt-BR). Evite sotaque europeu (pt-PT)."
        prosodia_instruct = (
            "Siga o áudio de referência: imite o timbre, a entonação e o ritmo. Fale natural e conversacional, com pausas curtas e ritmo um pouco mais rápido, sem dicção exagerada."
        )
    else:
        sotaque_instruct = (
            "Use sotaque 100% brasileiro (pt-BR), como falado no Rio de Janeiro ou São Paulo: pronúncia aberta, chiado no s, "
            "r gutural no final das palavras, tom descontraído e caloroso. Evite sotaque europeu (pt-PT) com s fechado ou "
            "formalidade excessiva. Fale como uma brasileira nativa jovem e sedutora. Exemplo: casa soa como ca-za, não ca-sa; "
            "rio com r suave."
        )
        prosodia_instruct = (
            "Use prosódia natural e fluida, com ritmo variado como em conversa real: pausas curtas e naturais, entonação expressiva, "
            "velocidade um pouco mais rápida e com variações naturais. Evite pausas longas, dicção exagerada ou fala robótica, soe humana e envolvente."
        )
    merged_prompt = " ".join([p for p in [force_read, sexo_instruct, sotaque_instruct, prosodia_instruct, voice_prompt] if p]).strip()
    return merged_prompt


def _build_voice_clone_prompt(voice_prompt: str, language: str, sample_paths: list[str], use_design: bool = True) -> tuple[object, list[str]]:
    ref_text = _read_env_str("QWEN3_VOICE_PROMPT_REF_TEXT", "E aí, amorzinho? Tô morrendo de saudade, vem me pegar forte... ahh, assim!")
    merged_prompt = _build_voice_instruct(voice_prompt, bool(sample_paths))
    design_paths = []
    if use_design and merged_prompt:
        model = _ensure_voice_design_model()
        design_kwargs = _build_design_kwargs()
        result = _call_method(
            model.generate_voice_design,
            text=ref_text,
            ref_text=ref_text,
            language=language,
            instruct=merged_prompt,
            **design_kwargs,
        )
        wavs, sr = _unpack_wavs(result)
        if isinstance(wavs, list):
            wav = wavs[0]
        else:
            wav = wavs
        design_paths.append(_write_wav_from_array(wav, sr))
    combined = [*design_paths, *sample_paths]
    if not combined:
        raise ValueError("voice_prompt ou speaker_wav_base64 é obrigatório")
    if len(combined) == 1:
        combined_path = combined[0]
    else:
        combined_path = _concat_wavs(combined)
    model = _ensure_base_model()
    x_vector_only_mode = _read_env_bool("QWEN3_X_VECTOR_ONLY_MODE", bool(sample_paths))
    clone_ref_text = _read_env_str("QWEN3_CLONE_REF_TEXT", "").strip()
    if not clone_ref_text and not x_vector_only_mode:
        if sample_paths:
            clone_ref_text = _read_env_str("QWEN3_SAMPLE_REF_TEXT", "Oi.")
        else:
            clone_ref_text = ref_text
    sample_hashes = []
    for p in sample_paths:
        try:
            sample_hashes.append(_sha256_file(p))
        except Exception:
            sample_hashes.append(f"err:{os.path.basename(p)}")
    cache_key = "|".join([
        "v1",
        language,
        "design" if use_design else "no-design",
        "xvec" if x_vector_only_mode else "icl",
        hashlib.sha256(("|".join(sample_hashes)).encode("utf-8")).hexdigest(),
        hashlib.sha256(clone_ref_text.encode("utf-8")).hexdigest(),
        hashlib.sha256((voice_prompt or "").encode("utf-8")).hexdigest() if use_design else "vp0",
    ])
    prompt = _CLONE_PROMPT_CACHE.get(cache_key)
    if prompt is None:
        try:
            kwargs = {"ref_audio": combined_path, "language": language, "x_vector_only_mode": x_vector_only_mode}
            if clone_ref_text:
                kwargs["ref_text"] = clone_ref_text
            prompt = _call_method(model.create_voice_clone_prompt, **kwargs)
        except Exception:
            fallback_ref_text = clone_ref_text or _read_env_str("QWEN3_SAMPLE_REF_TEXT", "Oi.")
            prompt = _call_method(model.create_voice_clone_prompt, ref_audio=combined_path, ref_text=fallback_ref_text, language=language)
        _CLONE_PROMPT_CACHE[cache_key] = prompt
    cleanup = [p for p in combined if p != combined_path]
    if combined_path not in cleanup:
        cleanup.append(combined_path)
    return prompt, cleanup


image = (
    modal.Image.from_registry("pytorch/pytorch:2.2.2-cuda12.1-cudnn8-devel", add_python="3.10")
    .apt_install("ffmpeg", "libsndfile1", "sox", "build-essential", "git", "ninja-build", "python3-dev")
    .pip_install("packaging==24.1", "numpy==1.26.3")
    .pip_install("flash-attn==2.5.9.post1")
    .pip_install(
        "qwen-tts==0.0.5",
        "soundfile==0.12.1",
        "fastapi[standard]==0.115.4",
        "typing-extensions==4.9.0",
    )
)


def _generate_internal(payload: dict):
    from fastapi.responses import JSONResponse

    text = payload.get("text")
    voice_prompt = payload.get("voice_prompt") or payload.get("voicePrompt") or payload.get("voice_design")
    speaker_wav_base64 = payload.get("speaker_wav_base64")
    language = _normalize_language(payload.get("language", "pt"))

    if not text:
        return JSONResponse({"error": "text is required"}, status_code=400)

    voice_prompt = (voice_prompt or _read_env_str("QWEN3_VOICE_PROMPT_DEFAULT", "")).strip()

    sample_paths = []
    cleanup_paths = []
    t0 = time.time()
    try:
        default_sample_b64 = _read_env_str("QWEN3_DEFAULT_SAMPLE_BASE64", "")
        if not speaker_wav_base64 and default_sample_b64:
            speaker_wav_base64 = default_sample_b64
        if isinstance(speaker_wav_base64, list):
            for b in [x for x in speaker_wav_base64 if x]:
                raw_path = _write_temp_audio_from_b64(b)
                norm_path = _normalize_to_wav(raw_path)
                cleanup_paths.extend([raw_path, norm_path])
                sample_paths.append(norm_path)
        elif speaker_wav_base64:
            raw_path = _write_temp_audio_from_b64(speaker_wav_base64)
            norm_path = _normalize_to_wav(raw_path)
            cleanup_paths.extend([raw_path, norm_path])
            sample_paths.append(norm_path)

        max_samples = _read_env_int("QWEN3_MAX_SAMPLES", 2) or 2
        if max_samples < 1:
            max_samples = 1
        if len(sample_paths) > max_samples:
            extra = sample_paths[max_samples:]
            sample_paths = sample_paths[:max_samples]
            cleanup_paths.extend(extra)

        sample_count = len(sample_paths)
        print(f"[Qwen3][TTS] has_sample={bool(sample_count)} sample_count={sample_count} voice_prompt_len={len(voice_prompt)}")

        gen_kwargs = _build_generation_kwargs(sample_count > 0)
        use_fast_mode = _read_env_bool("QWEN3_FAST_MODE", True)
        merged_prompt = _build_voice_instruct(voice_prompt, sample_count > 0)
        if use_fast_mode and voice_prompt and sample_count == 0:
            model = _ensure_voice_design_model()
            design_kwargs = _build_design_kwargs()
            result = _call_method(
                model.generate_voice_design,
                text=str(text),
                language=language,
                instruct=merged_prompt,
                **design_kwargs,
                **gen_kwargs,
            )
        elif sample_count == 0:
            prompt, prompt_cleanup = _build_voice_clone_prompt(voice_prompt, language, sample_paths, use_design=True)
            cleanup_paths.extend(prompt_cleanup)
            model = _ensure_base_model()
            result = _call_method(
                model.generate_voice_clone,
                text=str(text),
                language=language,
                voice_clone_prompt=prompt,
                **gen_kwargs,
            )
        else:
            use_design_with_samples = _read_env_bool("QWEN3_USE_DESIGN_WITH_SAMPLES", False)
            prompt, prompt_cleanup = _build_voice_clone_prompt(voice_prompt, language, sample_paths, use_design=use_design_with_samples)
            cleanup_paths.extend(prompt_cleanup)
            model = _ensure_base_model()
            result = _call_method(
                model.generate_voice_clone,
                text=str(text),
                language=language,
                voice_clone_prompt=prompt,
                **gen_kwargs,
            )
        wavs, sr = _unpack_wavs(result)
        if isinstance(wavs, list):
            wav = wavs[0]
        else:
            wav = wavs
        wav_path = _write_wav_from_array(wav, sr)
        cleanup_paths.append(wav_path)
        final_path = _append_tail_silence(wav_path)
        if final_path != wav_path:
            cleanup_paths.append(final_path)
        audio_bytes, content_type = _encode_ogg(final_path)
        return {
            "audio_base64": base64.b64encode(audio_bytes).decode("utf-8"),
            "content_type": content_type,
            "version": "2026-02-01-qwen3-a",
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        for p in cleanup_paths:
            try:
                if p and os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass
        print(f"[Qwen3][TTS] done ms={int((time.time() - t0) * 1000)}")


@app.function(image=image, volumes={"/qwen3": _QWEN_VOLUME}, timeout=900, gpu=_read_env_str("QWEN3_GPU_TYPE", "L4"))
@modal.fastapi_endpoint(method="POST")
def stitch(payload: dict):
    from fastapi.responses import JSONResponse

    wavs_base64 = payload.get("wavs_base64") or payload.get("wavsBase64") or payload.get("speaker_wav_base64")
    if not isinstance(wavs_base64, list) or not wavs_base64:
        return JSONResponse({"error": "wavs_base64 (array) is required"}, status_code=400)

    silence_between_ms = float(payload.get("silence_between_ms") or payload.get("silenceBetweenMs") or 0)
    tail_ms = float(payload.get("tail_ms") or payload.get("tailMs") or 0)
    cleanup_paths = []
    t0 = time.time()
    try:
        parts = []
        for b in [x for x in wavs_base64 if x]:
            raw_path = _write_temp_audio_from_b64(b)
            wav_path = _convert_to_wav_24k_mono(raw_path)
            cleanup_paths.extend([raw_path, wav_path])
            parts.append(wav_path)
            if silence_between_ms > 0:
                sil = _create_silence_wav(max(0.02, silence_between_ms / 1000.0))
                cleanup_paths.append(sil)
                parts.append(sil)

        if not parts:
            return JSONResponse({"error": "wavs_base64 is empty"}, status_code=400)

        merged = _concat_wavs(parts)
        cleanup_paths.append(merged)
        if tail_ms > 0:
            os.environ["QWEN3_TAIL_SILENCE_MS"] = str(tail_ms)
        final_path = _append_tail_silence(merged)
        if final_path != merged:
            cleanup_paths.append(final_path)
        audio_bytes, content_type = _encode_ogg(final_path)
        return {
            "audio_base64": base64.b64encode(audio_bytes).decode("utf-8"),
            "content_type": content_type,
            "version": "2026-02-02-qwen3-stitch-a",
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        for p in cleanup_paths:
            try:
                if p and os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass
        print(f"[Qwen3][STITCH] done ms={int((time.time() - t0) * 1000)}")


@app.function(image=image, volumes={"/qwen3": _QWEN_VOLUME}, timeout=900, gpu=_read_env_str("QWEN3_GPU_TYPE", "L4"))
@modal.fastapi_endpoint(method="POST")
def generate_batch(payload: dict):
    from fastapi.responses import JSONResponse

    texts = payload.get("texts")
    voice_prompt = payload.get("voice_prompt") or payload.get("voicePrompt") or payload.get("voice_design")
    speaker_wav_base64 = payload.get("speaker_wav_base64")
    language = _normalize_language(payload.get("language", "pt"))

    if not isinstance(texts, list):
        return JSONResponse({"error": "texts (array) is required"}, status_code=400)

    clean_texts = [str(x).strip() for x in texts if str(x).strip()]
    if not clean_texts:
        return JSONResponse({"error": "texts is empty"}, status_code=400)

    voice_prompt = (voice_prompt or _read_env_str("QWEN3_VOICE_PROMPT_DEFAULT", "")).strip()

    sample_paths = []
    cleanup_paths = []
    t0 = time.time()
    try:
        default_sample_b64 = _read_env_str("QWEN3_DEFAULT_SAMPLE_BASE64", "")
        if not speaker_wav_base64 and default_sample_b64:
            speaker_wav_base64 = default_sample_b64
        if isinstance(speaker_wav_base64, list):
            for b in [x for x in speaker_wav_base64 if x]:
                raw_path = _write_temp_audio_from_b64(b)
                norm_path = _normalize_to_wav(raw_path)
                cleanup_paths.extend([raw_path, norm_path])
                sample_paths.append(norm_path)
        elif speaker_wav_base64:
            raw_path = _write_temp_audio_from_b64(speaker_wav_base64)
            norm_path = _normalize_to_wav(raw_path)
            cleanup_paths.extend([raw_path, norm_path])
            sample_paths.append(norm_path)

        max_samples = _read_env_int("QWEN3_MAX_SAMPLES", 2) or 2
        if max_samples < 1:
            max_samples = 1
        if len(sample_paths) > max_samples:
            extra = sample_paths[max_samples:]
            sample_paths = sample_paths[:max_samples]
            cleanup_paths.extend(extra)

        sample_count = len(sample_paths)
        print(f"[Qwen3][TTS] has_sample={bool(sample_count)} sample_count={sample_count} voice_prompt_len={len(voice_prompt)} parts={len(clean_texts)}")

        part_paths = []
        gen_kwargs = _build_generation_kwargs(sample_count > 0)
        use_fast_mode = _read_env_bool("QWEN3_FAST_MODE", True)
        merged_prompt = _build_voice_instruct(voice_prompt, sample_count > 0)
        if use_fast_mode and voice_prompt and sample_count == 0:
            model = _ensure_voice_design_model()
            design_kwargs = _build_design_kwargs()
            for idx, text in enumerate(clean_texts):
                result = _call_method(
                    model.generate_voice_design,
                    text=str(text),
                    language=language,
                    instruct=merged_prompt,
                    **design_kwargs,
                    **gen_kwargs,
                )
                wavs, sr = _unpack_wavs(result)
                wav = wavs[0] if isinstance(wavs, list) else wavs
                wav_path = _write_wav_from_array(wav, sr)
                part_paths.append(wav_path)
                cleanup_paths.append(wav_path)
        elif sample_count == 0:
            prompt, prompt_cleanup = _build_voice_clone_prompt(voice_prompt, language, sample_paths, use_design=True)
            cleanup_paths.extend(prompt_cleanup)
            model = _ensure_base_model()
            for idx, text in enumerate(clean_texts):
                result = _call_method(
                    model.generate_voice_clone,
                    text=str(text),
                    language=language,
                    voice_clone_prompt=prompt,
                    **gen_kwargs,
                )
                wavs, sr = _unpack_wavs(result)
                wav = wavs[0] if isinstance(wavs, list) else wavs
                wav_path = _write_wav_from_array(wav, sr)
                part_paths.append(wav_path)
                cleanup_paths.append(wav_path)
        else:
            use_design_with_samples = _read_env_bool("QWEN3_USE_DESIGN_WITH_SAMPLES", False)
            prompt, prompt_cleanup = _build_voice_clone_prompt(voice_prompt, language, sample_paths, use_design=use_design_with_samples)
            cleanup_paths.extend(prompt_cleanup)
            model = _ensure_base_model()
            for idx, text in enumerate(clean_texts):
                result = _call_method(
                    model.generate_voice_clone,
                    text=str(text),
                    language=language,
                    voice_clone_prompt=prompt,
                    **gen_kwargs,
                )
                wavs, sr = _unpack_wavs(result)
                wav = wavs[0] if isinstance(wavs, list) else wavs
                wav_path = _write_wav_from_array(wav, sr)
                part_paths.append(wav_path)
                cleanup_paths.append(wav_path)

        part_silence_ms = float(_read_env_str("QWEN3_PART_SILENCE_MS", "0"))
        if len(part_paths) > 1 and part_silence_ms > 0:
            silence_path = _create_silence_wav(part_silence_ms / 1000.0)
            cleanup_paths.append(silence_path)
            expanded = []
            for idx, p in enumerate(part_paths):
                expanded.append(p)
                if idx < len(part_paths) - 1:
                    expanded.append(silence_path)
            merged_path = _concat_wavs(expanded)
        else:
            merged_path = _concat_wavs(part_paths) if len(part_paths) > 1 else part_paths[0]
        if merged_path not in cleanup_paths:
            cleanup_paths.append(merged_path)
        final_path = _append_tail_silence(merged_path)
        if final_path != merged_path:
            cleanup_paths.append(final_path)
        audio_bytes, content_type = _encode_ogg(final_path)
        return {
            "audio_base64": base64.b64encode(audio_bytes).decode("utf-8"),
            "content_type": content_type,
            "version": "2026-02-01-qwen3-a",
            "parts": len(clean_texts),
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        for p in cleanup_paths:
            try:
                if p and os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass
        print(f"[Qwen3][TTS] done_batch ms={int((time.time() - t0) * 1000)}")
