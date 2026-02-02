import { GoogleGenAI } from '@google/genai'

function withTimeout(promise, timeoutMs) {
  const ms = Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : 0
  if (!ms || ms <= 0) return promise
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ao gerar imagem')), ms)),
  ])
}

export async function gerarImagemGemini({ prompt, aspectRatio = '2:3', timeoutMs }) {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').toString().trim()
  if (!apiKey) return { ok: false, error: 'GEMINI_API_KEY não configurado' }
  const model = (process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image').toString().trim()
  const ai = new GoogleGenAI({ apiKey })

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio },
        },
      }),
      timeoutMs,
    )

    const parts = response?.candidates?.[0]?.content?.parts || []
    for (const part of parts) {
      const inline = part?.inlineData
      if (!inline?.data) continue
      const bytes = Buffer.from(inline.data, 'base64')
      const mimeType = (inline.mimeType || 'image/png').toString()
      return { ok: true, bytes, mimeType, model }
    }
    return { ok: false, error: 'Resposta do Gemini não retornou imagem' }
  } catch (e) {
    return { ok: false, error: (e?.message || 'Falha ao gerar imagem no Gemini').toString() }
  }
}

