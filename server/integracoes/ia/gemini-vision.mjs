
import { GoogleGenAI } from '@google/genai'
import { descreverImagemGrok } from './grok-vision.mjs'

function withTimeout(promise, timeoutMs) {
  const ms = Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : 0
  if (!ms || ms <= 0) return promise
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ao descrever imagem')), ms)),
  ])
}

export async function descreverImagemGemini({ buffer, mimeType, prompt, timeoutMs = 25000 }) {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').toString().trim()
  if (!apiKey) return { ok: false, error: 'GEMINI_API_KEY não configurado' }
  
  // Usar modelo flash que é multimodal e rápido
  const model = (process.env.GEMINI_VISION_MODEL || 'gemini-2.0-flash').toString().trim()
  const ai = new GoogleGenAI({ apiKey })

  try {
    const defaultPrompt = [
      'Descreva esta imagem com MUITA riqueza de detalhes e sem inventar.',
      'Se houver texto legível (placas, legendas, chats, marcas d’água), transcreva exatamente como aparece.',
      'Cite: ambiente/locação, hora do dia/iluminação, pessoas/animais (aparência, expressão, postura), ações, objetos e cores.',
      'Diga se é foto, print, desenho/ilustração, meme ou figurinha.',
      'Se houver nudez/sexo/violência, descreva objetivamente o que está visível.',
      'Se algo estiver incerto, diga "não dá pra confirmar".',
      'Tamanho: seja detalhado, mas evite textos gigantes (algo entre 900 e 1400 caracteres, quando fizer sentido).',
      'Formato de resposta:',
      '1) Resumo (1–2 frases).',
      '2) Detalhes (itens).',
      '3) Texto na imagem (transcrição exata ou "nenhum texto legível").',
      'Responda em Português do Brasil.',
    ].join('\n')
    const finalPrompt = prompt || defaultPrompt
    const maxFromEnv = Number.parseInt((process.env.GEMINI_VISION_MAX_OUTPUT_TOKENS || '').toString().trim(), 10)
    const baseMaxOutputTokens = Number.isFinite(maxFromEnv) && maxFromEnv > 0 ? maxFromEnv : 1200
    const thinkingFromEnv = Number.parseInt((process.env.GEMINI_VISION_THINKING_BUDGET || '').toString().trim(), 10)
    const thinkingBudget = Number.isFinite(thinkingFromEnv) ? thinkingFromEnv : 0

    const imagePart = {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: mimeType || 'image/png'
      }
    }

    const gerar = async ({ textPrompt, maxOutputTokens }) => {
      return withTimeout(
        ai.models.generateContent({
          model,
          contents: [
              { role: 'user', parts: [ { text: textPrompt }, imagePart ] }
          ],
          config: {
              temperature: 0.3,
              maxOutputTokens,
              thinkingConfig: { thinkingBudget },
              safetySettings: [
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
              ],
          }
        }),
        timeoutMs
      )
    }

    const extrairTexto = (resp) => {
      const parts = resp?.candidates?.[0]?.content?.parts
      if (!Array.isArray(parts)) return ''
      return parts.map(p => (p?.text || '')).filter(Boolean).join('').trim()
    }

    const response = await gerar({ textPrompt: finalPrompt, maxOutputTokens: baseMaxOutputTokens })

    const debug = (process.env.DEBUG_GEMINI_VISION || '').toString().trim().toLowerCase() === 'true'
    if (debug) console.log('[Gemini Vision] Response:', JSON.stringify(response, null, 2))

    let text = extrairTexto(response)
    const finishReason = response?.candidates?.[0]?.finishReason
    if (finishReason === 'MAX_TOKENS') {
      const retryMax = Math.max(Math.floor(baseMaxOutputTokens * 1.5), baseMaxOutputTokens + 600)
      const retryPrompt = [
        finalPrompt,
        '',
        'IMPORTANTE: Na resposta anterior você foi cortado por limite de tokens.',
        'Responda NOVAMENTE com a DESCRIÇÃO COMPLETA do início ao fim (não continue do meio).',
        'Não interrompa frases e inclua no mínimo 12 frases no total.',
      ].join('\n')

      const retryResponse = await gerar({ textPrompt: retryPrompt, maxOutputTokens: retryMax })
      if (debug) console.log('[Gemini Vision][retry] Response:', JSON.stringify(retryResponse, null, 2))
      const retryText = extrairTexto(retryResponse)
      if (retryText) text = retryText
    }

    if (!text) {
        // Se falhou por bloqueio (finishReason) ou simplesmente não veio texto, tenta Grok
        console.warn('[Gemini Vision] Falha ou bloqueio detectado. Tentando fallback para Grok...')
        return await descreverImagemGrok({ buffer, mimeType, prompt, timeoutMs })
    }

    return { ok: true, text: text.trim(), model }
  } catch (e) {
    console.error('[Gemini Vision Error]', e)
    console.warn('[Gemini Vision] Erro fatal. Tentando fallback para Grok...')
    return await descreverImagemGrok({ buffer, mimeType, prompt, timeoutMs })
  }
}
