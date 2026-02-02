const MODAL_URL = process.env.MODAL_AUDIO_URL;
const MODAL_TRANSCRIBE_URL = (process.env.MODAL_AUDIO_TRANSCRIBE_URL || '').toString().trim()
  || (MODAL_URL ? `${MODAL_URL.replace(/\/+$/, '')}/transcribe` : '')
const MODAL_GENERATE_URL = (process.env.MODAL_AUDIO_GENERATE_URL || '').toString().trim()
  || (MODAL_URL ? `${MODAL_URL.replace(/\/+$/, '')}/generate` : '')
const MODAL_GENERATE_BATCH_URL = (process.env.MODAL_AUDIO_GENERATE_BATCH_URL || '').toString().trim()
  || (MODAL_GENERATE_URL
    ? MODAL_GENERATE_URL.replace(/\/generate\/?$/, '/generate_batch').replace(/-generate\.modal\.run\/?$/, '-generate-batch.modal.run')
    : '')
const STT_TIMEOUT_MS = Math.max(10000, parseInt((process.env.MODAL_AUDIO_STT_TIMEOUT_MS || '240000').toString(), 10) || 240000)
const TTS_TIMEOUT_MS = Math.max(10000, parseInt((process.env.MODAL_AUDIO_TTS_TIMEOUT_MS || '420000').toString(), 10) || 420000)

if (!MODAL_TRANSCRIBE_URL || !MODAL_GENERATE_URL) {
  console.warn('⚠️ URLs do Modal para áudio não definidas. Configure MODAL_AUDIO_TRANSCRIBE_URL e MODAL_AUDIO_GENERATE_URL (ou MODAL_AUDIO_URL).')
}
if (!MODAL_GENERATE_BATCH_URL) {
  console.warn('⚠️ URL do Modal para áudio batch não definida. Configure MODAL_AUDIO_GENERATE_BATCH_URL.')
}

/**
 * Cliente para interagir com a API de Áudio no Modal.
 */
export const audioModal = {
  async _postJson(url, body, timeoutMs) {
    const t0 = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = json?.error || `HTTP ${res.status}`
        const err = new Error(msg)
        err.status = res.status
        err.data = json
        throw err
      }
      return json
    } catch (e) {
      console.error('[AudioModal]', { url, ms: Date.now() - t0, error: e?.message || String(e) })
      throw e
    } finally {
      const ms = Date.now() - t0
      if (ms >= 2000) console.log('[AudioModal]', { url, ms })
      clearTimeout(timeout)
    }
  },

  /**
   * Transcreve um áudio para texto.
   * @param {Buffer} audioBuffer - Buffer do arquivo de áudio
   * @returns {Promise<string>} Texto transcrito
   */
  async transcribe(audioBuffer) {
    if (!MODAL_TRANSCRIBE_URL) throw new Error('MODAL_AUDIO_TRANSCRIBE_URL not configured');

    const audioBase64 = audioBuffer.toString('base64');

    console.log('[AudioModal][STT] start', { bytes: audioBuffer?.length || 0 })
    const response = await this._postJson(MODAL_TRANSCRIBE_URL, { audio_base64: audioBase64 }, STT_TIMEOUT_MS)
    console.log('[AudioModal][STT] done', { chars: (response?.text || '').toString().length })
    return response.text
  },

  /**
   * Gera áudio a partir de texto (TTS).
   * @param {string} text - Texto para falar
   * @param {Buffer|Buffer[]} voiceSampleBuffer - Buffer(s) do áudio de referência da voz
   * @param {string} language - Código do idioma (pt, en, es)
   * @returns {Promise<Buffer>} Buffer do áudio gerado (WAV)
   */
  async generateSpeech(text, voiceSampleBuffer, language = 'pt') {
    if (!MODAL_GENERATE_URL) throw new Error('MODAL_AUDIO_GENERATE_URL not configured');

    const arr = Array.isArray(voiceSampleBuffer) ? voiceSampleBuffer.filter(Boolean) : [voiceSampleBuffer].filter(Boolean)
    const speakerBase64 = arr.length === 1
      ? arr[0].toString('base64')
      : arr.map(b => b.toString('base64'))

    console.log('[AudioModal][TTS] start', { chars: (text || '').toString().length, language, sampleCount: arr.length, sampleBytes: arr[0]?.length || 0 })
    const response = await this._postJson(MODAL_GENERATE_URL, { text, speaker_wav_base64: speakerBase64, language }, TTS_TIMEOUT_MS)
    if (response?.error) throw new Error(response.error)
    console.log('[AudioModal][TTS] done', { contentType: response.content_type || 'audio/ogg', b64: (response?.audio_base64 || '').toString().length })
    return {
      buffer: Buffer.from(response.audio_base64, 'base64'),
      contentType: response.content_type || 'audio/ogg',
    }
  },

  async generateSpeechBatch(texts, voiceSampleBuffer, language = 'pt') {
    if (!MODAL_GENERATE_BATCH_URL) throw new Error('MODAL_AUDIO_GENERATE_BATCH_URL not configured');
    const arr = Array.isArray(texts) ? texts.map(t => (t || '').toString()).filter(Boolean) : []
    if (!arr.length) throw new Error('texts is empty')
    const samples = Array.isArray(voiceSampleBuffer) ? voiceSampleBuffer.filter(Boolean) : [voiceSampleBuffer].filter(Boolean)
    const speakerBase64 = samples.length === 1
      ? samples[0].toString('base64')
      : samples.map(b => b.toString('base64'))

    console.log('[AudioModal][TTS] start_batch', { parts: arr.length, language, sampleCount: samples.length, sampleBytes: samples[0]?.length || 0 })
    const response = await this._postJson(MODAL_GENERATE_BATCH_URL, { texts: arr, speaker_wav_base64: speakerBase64, language }, TTS_TIMEOUT_MS)
    if (response?.error) throw new Error(response.error)
    console.log('[AudioModal][TTS] done_batch', { contentType: response.content_type || 'audio/ogg', b64: (response?.audio_base64 || '').toString().length, parts: response?.parts || arr.length })
    return {
      buffer: Buffer.from(response.audio_base64, 'base64'),
      contentType: response.content_type || 'audio/ogg',
    }
  }
};
