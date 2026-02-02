const MODAL_QWEN3_URL = (process.env.MODAL_QWEN3_API_URL || process.env.MODAL_AUDIO_QWEN3_URL || '').toString().trim();
const MODAL_QWEN3_GENERATE_URL = (process.env.MODAL_QWEN3_GENERATE_URL || process.env.MODAL_AUDIO_QWEN3_GENERATE_URL || '').toString().trim()
  || (MODAL_QWEN3_URL ? `${MODAL_QWEN3_URL.replace(/\/+$/, '')}/generate` : '');
const MODAL_QWEN3_GENERATE_BATCH_URL = (process.env.MODAL_QWEN3_GENERATE_BATCH_URL || process.env.MODAL_AUDIO_QWEN3_GENERATE_BATCH_URL || '').toString().trim()
  || (MODAL_QWEN3_GENERATE_URL
    ? MODAL_QWEN3_GENERATE_URL.replace(/\/generate\/?$/, '/generate_batch').replace(/-generate\.modal\.run\/?$/, '-generate-batch.modal.run')
    : '');
const MODAL_QWEN3_STITCH_URL = (process.env.MODAL_QWEN3_STITCH_URL || '').toString().trim()
  || (MODAL_QWEN3_URL ? `${MODAL_QWEN3_URL.replace(/\/+$/, '')}/stitch` : '')
  || (MODAL_QWEN3_GENERATE_URL ? MODAL_QWEN3_GENERATE_URL.replace(/\/generate\/?$/, '/stitch').replace(/-generate\.modal\.run\/?$/, '-stitch.modal.run') : '');
const TTS_TIMEOUT_MS = Math.max(10000, parseInt((process.env.MODAL_QWEN3_TTS_TIMEOUT_MS || '420000').toString(), 10) || 420000);
const QWEN3_REQUEST_TIMEOUT_MS = Math.max(10000, parseInt((process.env.MODAL_QWEN3_REQUEST_TIMEOUT_MS || '420000').toString(), 10) || 420000);
const QWEN3_RETRY_COUNT = Math.max(0, parseInt((process.env.MODAL_QWEN3_RETRY_COUNT || '2').toString(), 10) || 2);
const QWEN3_RETRY_BASE_DELAY_MS = Math.max(100, parseInt((process.env.MODAL_QWEN3_RETRY_BASE_DELAY_MS || '350').toString(), 10) || 350);
const QWEN3_RETRY_MAX_DELAY_MS = Math.max(200, parseInt((process.env.MODAL_QWEN3_RETRY_MAX_DELAY_MS || '2000').toString(), 10) || 2000);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shouldRetryQwen3Error(err) {
  const status = Number(err?.status);
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  const msg = (err?.message || '').toString().toLowerCase();
  if (msg.includes('fetch failed') || msg.includes('network') || msg.includes('timeout')) return true;
  if (msg.includes('aborted')) return false;
  if (err?.name === 'AbortError') return false;
  return false;
}

if (!MODAL_QWEN3_GENERATE_URL) {
  console.warn('⚠️ URLs do Modal Qwen3 não definidas. Configure MODAL_QWEN3_GENERATE_URL (ou MODAL_QWEN3_API_URL).');
}
if (!MODAL_QWEN3_GENERATE_BATCH_URL) {
  console.warn('⚠️ URL do Modal Qwen3 batch não definida. Configure MODAL_QWEN3_GENERATE_BATCH_URL.');
}

export const audioQwen3Modal = {
  async _postJson(url, body, timeoutMs) {
    let lastError = null;
    for (let attempt = 0; attempt <= QWEN3_RETRY_COUNT; attempt += 1) {
      const t0 = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = json?.error || `HTTP ${res.status}`;
          const err = new Error(msg);
          err.status = res.status;
          err.data = json;
          throw err;
        }
        return json;
      } catch (e) {
        lastError = e;
        const canRetry = attempt < QWEN3_RETRY_COUNT && shouldRetryQwen3Error(e);
        console.error('[AudioQwen3Modal]', { url, ms: Date.now() - t0, error: e?.message || String(e), attempt, canRetry });
        if (!canRetry) throw e;
        const delay = Math.min(QWEN3_RETRY_MAX_DELAY_MS, QWEN3_RETRY_BASE_DELAY_MS * (2 ** attempt));
        await sleep(delay);
      } finally {
        const ms = Date.now() - t0;
        if (ms >= 2000) console.log('[AudioQwen3Modal]', { url, ms });
        clearTimeout(timeout);
      }
    }
    throw lastError || new Error('Falha ao chamar Modal Qwen3');
  },

  async generateSpeech(text, voicePrompt, language = 'pt', voiceSampleBuffer = null) {
    const r = await this.generateSpeechBatch([text], voicePrompt, language, voiceSampleBuffer);
    return r;
  },

  async generateSpeechBatch(texts, voicePrompt, language = 'pt', voiceSampleBuffer = null) {
    if (!MODAL_QWEN3_GENERATE_BATCH_URL) throw new Error('MODAL_QWEN3_GENERATE_BATCH_URL not configured');
    const arr = Array.isArray(texts) ? texts.map(t => (t || '').toString()).filter(Boolean) : [];
    if (!arr.length) throw new Error('texts is empty');
    const payload = { texts: arr, voice_prompt: voicePrompt, language };
    if (Array.isArray(voiceSampleBuffer)) {
      const list = voiceSampleBuffer.filter(Boolean).map(b => b.toString('base64'));
      if (list.length) payload.speaker_wav_base64 = list;
    } else if (voiceSampleBuffer) {
      payload.speaker_wav_base64 = voiceSampleBuffer.toString('base64');
    }
    const sampleCount = Array.isArray(voiceSampleBuffer) ? voiceSampleBuffer.filter(Boolean).length : (voiceSampleBuffer ? 1 : 0);
    console.log('[AudioQwen3Modal][TTS] start_batch', { parts: arr.length, language, hasSample: !!sampleCount, sampleCount, voicePromptLen: (voicePrompt || '').toString().length });
    const response = await this._postJson(MODAL_QWEN3_GENERATE_BATCH_URL, payload, Math.min(TTS_TIMEOUT_MS, QWEN3_REQUEST_TIMEOUT_MS));
    if (response?.error) throw new Error(response.error);
    console.log('[AudioQwen3Modal][TTS] done_batch', { contentType: response.content_type || 'audio/ogg', b64: (response?.audio_base64 || '').toString().length, parts: response?.parts || arr.length });
    return {
      buffer: Buffer.from(response.audio_base64, 'base64'),
      contentType: response.content_type || 'audio/ogg',
    };
  },

  async stitchWavs(wavBuffers, opts = {}) {
    if (!MODAL_QWEN3_STITCH_URL) throw new Error('MODAL_QWEN3_STITCH_URL not configured');
    const arr = Array.isArray(wavBuffers) ? wavBuffers.filter(Boolean) : [];
    if (!arr.length) throw new Error('wavBuffers is empty');
    const payload = {
      wavs_base64: arr.map(b => b.toString('base64')),
      silence_between_ms: opts.silenceBetweenMs || 0,
      tail_ms: opts.tailMs || 0,
    };
    console.log('[AudioQwen3Modal][STITCH] start', { parts: arr.length, silenceBetweenMs: payload.silence_between_ms || 0, tailMs: payload.tail_ms || 0 });
    const response = await this._postJson(MODAL_QWEN3_STITCH_URL, payload, Math.min(TTS_TIMEOUT_MS, QWEN3_REQUEST_TIMEOUT_MS));
    if (response?.error) throw new Error(response.error);
    console.log('[AudioQwen3Modal][STITCH] done', { contentType: response.content_type || 'audio/ogg', b64: (response?.audio_base64 || '').toString().length });
    return {
      buffer: Buffer.from(response.audio_base64, 'base64'),
      contentType: response.content_type || 'audio/ogg',
    };
  },
};
