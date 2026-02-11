import { generateWithGrok } from '../../integrations/grok.mjs'
import { composeSystemPrompt } from '../../agents/prompt.mjs'
import { salvarSaidaEEnviar } from '../../dominio/mensagens/persistencia.mjs'
import { generateAndStoreSummary } from '../../dominio/conversas/resumo.mjs'
import { buildLLMMessages } from '../../dominio/llm/historico.mjs'
import crypto from 'node:crypto'
import { gerarImagemNSFW } from '../../integracoes/ia/image-generator.mjs'
import { checkImageAllowance, consumeImageQuota, hasActiveSubscription } from '../../assinaturas/controle.mjs'
import { getPersonaPhysicalTraits } from '../../dominio/personas/prompt-foto.mjs'
import { uploadImagemPublicaSupabase, listarPublicUrlsSupabase } from '../../integracoes/supabase/cliente.mjs'
import { resolveImagePrompt } from './resolve-image-prompt.mjs'
import { gerarAvatarFromConsistencyPack, gerarConsistencyPack } from '../../dominio/personas/consistency-pack.mjs'
import { audioModal } from '../../integracoes/ia/audio-modal.mjs'
import { audioQwen3Modal } from '../../integracoes/ia/audio-qwen3-modal.mjs'
import { uploadAudio } from '../../integracoes/supabase/storage-audio.mjs'
import { voiceManager } from '../../servicos/voice-manager.mjs'
import { join } from 'node:path'
import { descreverImagemGrok } from '../../integracoes/ia/grok-vision.mjs'

const WHATSAPP_FALLBACK_BLOQUEIO_CONTEUDO = (process.env.WHATSAPP_FALLBACK_BLOQUEIO_CONTEUDO || '')
  .toString()
  .trim()
  .slice(0, 1024) || 'Desculpa, eu não consigo responder esse tipo de mensagem. Se quiser, me manda outra e eu te ajudo.'

const WHATSAPP_FALLBACK_ERRO_GERACAO = (process.env.WHATSAPP_FALLBACK_ERRO_GERACAO || '')
  .toString()
  .trim()
  .slice(0, 1024) || 'Mensagem recebida. Em breve sua Crush responde.'

const AUDIO_COST_MULTIPLIER = Math.max(1, parseInt((process.env.AUDIO_COST_MULTIPLIER || '10').toString(), 10) || 10)
const AUDIO_MAX_CHUNKS = Math.max(1, parseInt((process.env.AUDIO_MAX_CHUNKS || '6').toString(), 10) || 6)
const AUDIO_MAX_CHARS_PER_CHUNK = Math.max(120, parseInt((process.env.AUDIO_MAX_CHARS_PER_CHUNK || '180').toString(), 10) || 180)
const TTS_ENGINE_DEFAULT = (process.env.TTS_ENGINE_DEFAULT || 'xtts').toString().trim().toLowerCase()
const TTS_ENGINE_FALLBACK = (process.env.TTS_ENGINE_FALLBACK || 'xtts').toString().trim().toLowerCase()

function resolveTtsEngines() {
  const allowed = new Set(['xtts', 'qwen3'])
  const list = []
  const push = (v) => {
    const key = (v || '').toString().trim().toLowerCase()
    if (allowed.has(key) && !list.includes(key)) list.push(key)
  }
  push(TTS_ENGINE_DEFAULT)
  push(TTS_ENGINE_FALLBACK)
  if (!list.length) list.push('qwen3', 'xtts')
  return list
}

function clampText(s, maxLen) {
  const raw = (s || '').toString().trim()
  if (!raw) return ''
  const limit = Number.isFinite(Number(maxLen)) ? Number(maxLen) : 0
  if (!limit || limit <= 0) return raw
  return raw.length > limit ? raw.slice(0, Math.max(0, limit - 1)).trimEnd() : raw
}

function buildCaptionFallback({ personaName, poseType, closeUp }) {
  const t = (poseType || '').toString().trim().toLowerCase()
  const name = (personaName || '').toString().trim()
  const prefix = name ? `${name}: ` : ''
  if (closeUp) {
    if (t.startsWith('pussy')) return `${prefix}bem de pertinho…`
    if (t.startsWith('anal')) return `${prefix}bem de pertinho…`
    if (t.startsWith('breasts')) return `${prefix}bem de pertinho…`
    if (t.startsWith('butt')) return `${prefix}bem de pertinho…`
    return `${prefix}bem de pertinho…`
  }
  if (t === 'doggystyle') return `${prefix}de quatro pra você.`
  if (t === 'metalstocks') return `${prefix}algemada pra você.`
  if (t === 'shibari') return `${prefix}amarrada pra você.`
  if (t === 'standing') return `${prefix}do jeitinho que você pediu.`
  if (t === 'lying') return `${prefix}do jeitinho que você pediu.`
  return `${prefix}do jeitinho que você pediu.`
}

function isCloseUpFromPoseType(poseType) {
  const t = (poseType || '').toString().trim().toLowerCase()
  return t.startsWith('pussy') || t.startsWith('anal') || t.startsWith('breasts') || t.startsWith('butt')
}

async function buildCaptionFromImage({ buffer, mimeType, personaName, poseType, closeUp, hint }) {
  const enabledRaw = (process.env.IMAGE_CAPTION_VISION || 'true').toString().trim().toLowerCase()
  const enabled = enabledRaw !== 'false' && enabledRaw !== '0' && enabledRaw !== 'no'
  if (!enabled || !buffer) return { ok: false }

  const poseHint = (poseType || '').toString().trim().toLowerCase()
  const poseLine =
    poseHint === 'doggystyle'
      ? 'Pose sugerida: de quatro (vista por trás), sem rosto.'
      : poseHint === 'breasts'
        ? 'Pose sugerida: close no tronco, sem rosto.'
        : poseHint === 'butt'
          ? 'Pose sugerida: close por trás, sem rosto.'
          : poseHint
            ? `Pose sugerida: ${poseHint}.`
            : ''

  const prompt = [
    `Crie UMA legenda curta (até 120 caracteres) em primeira pessoa como "${(personaName || 'ela').toString().trim()}".`,
    'A legenda deve combinar com o que está VISÍVEL na imagem.',
    poseLine,
    hint ? `Contexto do pedido (use só se combinar com a imagem): ${String(hint).slice(0, 220)}` : '',
    'Não invente detalhes (ex.: fluídos, atos específicos, posições diferentes) se não estiverem claramente visíveis.',
    'Se houver nudez/sexo, descreva de forma objetiva e com linguagem leve (sem termos explícitos).',
    'Não mencione idade. Assuma que é adulto (18+).',
    'Responda somente com a legenda, sem listas e sem aspas.',
  ].join('\n')

  const res = await descreverImagemGrok({
    buffer,
    mimeType: mimeType || 'image/png',
    prompt,
    timeoutMs: 20000,
  })
  if (!res?.ok || !res?.text) return { ok: false, error: res?.error }
  const caption = clampText(res.text, 180)
  if (!caption) return { ok: false }
  return { ok: true, caption }
}

async function generateTtsAudio({ engines, chunks, xttsSamples, qwen3VoicePrompt, qwen3Samples }) {
  let lastError = null
  const startedAt = Date.now()
  console.log('[Audio][TTS] start', { engines, chunks: chunks.length })
  for (const engine of engines) {
    const t0 = Date.now()
    try {
      if (engine === 'qwen3') {
        if (!qwen3VoicePrompt) throw new Error('qwen3_voice_prompt_missing')
        if (chunks.length === 1) {
          console.log('[Audio][Qwen3] payload_text', { text: chunks[0] })
        } else {
          console.log('[Audio][Qwen3] payload_texts', { texts: chunks })
        }
        const gen = chunks.length === 1
          ? await audioQwen3Modal.generateSpeech(chunks[0], qwen3VoicePrompt, 'pt', qwen3Samples || null)
          : await audioQwen3Modal.generateSpeechBatch(chunks, qwen3VoicePrompt, 'pt', qwen3Samples || null)
        console.log('[Audio][TTS] success', { engine, ms: Date.now() - t0, totalMs: Date.now() - startedAt })
        return { ...gen, engine }
      }
      if (engine === 'xtts') {
        const samples = Array.isArray(xttsSamples) ? xttsSamples.filter(Boolean) : []
        if (!samples.length) throw new Error('xtts_sample_missing')
        console.log('[Audio][XTTS] sample', { count: samples.length, sampleBytes: samples[0]?.length || 0 })
        const gen = chunks.length === 1
          ? await audioModal.generateSpeech(chunks[0], samples, 'pt')
          : await audioModal.generateSpeechBatch(chunks, samples, 'pt')
        console.log('[Audio][TTS] success', { engine, ms: Date.now() - t0, totalMs: Date.now() - startedAt })
        return { ...gen, engine }
      }
    } catch (e) {
      lastError = e
      console.error('[Audio][TTS] engine_failed', { engine, ms: Date.now() - t0, error: e?.message || String(e) })
    }
  }
  if (lastError) throw lastError
  throw new Error('tts_failed')
}

function splitTextForAudio(text, opts = {}) {
  const raw = (text || '').toString().trim()
  if (!raw) return []
  const maxChars = Math.max(60, Number(opts.maxChars) || AUDIO_MAX_CHARS_PER_CHUNK)
  const maxChunks = Math.max(1, Number(opts.maxChunks) || AUDIO_MAX_CHUNKS)
  const minBreakAt = Math.max(30, Number(opts.minBreakAt) || Math.floor(maxChars * 0.55))
  const chunks = []
  let remaining = raw
  while (remaining.length > 0 && chunks.length < maxChunks) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining)
      break
    }
    const cut = remaining.slice(0, maxChars)
    let idx = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'), cut.lastIndexOf(', '))
    if (idx < minBreakAt) idx = cut.lastIndexOf(' ')
    if (idx < minBreakAt) idx = maxChars
    const part = remaining.slice(0, idx).trim()
    if (part) chunks.push(part)
    remaining = remaining.slice(idx).trim()
  }
  return chunks
}

function numeroPorExtensoPt(valor) {
  const n = Number(valor)
  if (!Number.isFinite(n)) return ''
  const inteiro = Math.floor(Math.abs(n))
  const unidades = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
  const dezADezenove = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']
  if (inteiro === 100) return 'cem'
  if (inteiro < 10) return unidades[inteiro]
  if (inteiro < 20) return dezADezenove[inteiro - 10]
  if (inteiro < 100) {
    const d = Math.floor(inteiro / 10)
    const u = inteiro % 10
    return u ? `${dezenas[d]} e ${unidades[u]}` : dezenas[d]
  }
  if (inteiro < 1000) {
    const c = Math.floor(inteiro / 100)
    const r = inteiro % 100
    if (!r) return centenas[c]
    const resto = numeroPorExtensoPt(r)
    return resto ? `${centenas[c]} e ${resto}` : centenas[c]
  }
  return inteiro.toString()
}

function expandirNumerosPt(texto) {
  return (texto || '').toString().replace(/\b\d{1,3}\b/g, (m, offset, full) => {
    const prev = full[offset - 1] || ''
    const next = full[offset + m.length] || ''
    if (prev === ':' || next === ':' || prev === '/' || next === '/' || next === '%' || next === 'º' || next === '°') return m
    const ext = numeroPorExtensoPt(parseInt(m, 10))
    return ext || m
  })
}

function normalizeTextForTTS(input, opts = {}) {
  let t = (input || '').toString()
  const preserveCueTags = !!opts.preserveCueTags
  if (/(ajustando:|falando certo:|não,\s*claro:|não,\s*claro\b|deixa eu corrigir:|exato\s+assim\b)/i.test(t)) {
    t = t.split(/(?:ajustando:|falando certo:|deixa eu corrigir:|não,\s*claro:|não,\s*claro\b|exato\s+assim\b)/i).pop() || t
  }
  t = t.replace(/\[SEND_PHOTO:\s*.+?\]/gi, ' ')
  t = t.replace(/\[[^\]]+\]/g, (full) => {
    if (!preserveCueTags) return ' '
    const inner = full.slice(1, -1).toLowerCase()
    if (/(sussurr|ofeg|gemend|suspi|risad|rindo|rouc|choram|choro)/.test(inner)) return full
    return ' '
  })
  t = t.replace(/\*[^*]{1,220}\*/g, ' ')
  t = t.replace(/\([^)]{0,420}\)/g, ' ')
  t = t.replace(/["“”]/g, '')
  t = t.replace(/\p{Extended_Pictographic}+/gu, ' ')
  t = t.replace(/(^|[.!?…]\s*)[^.!?…]*\b(áudio|audio)\b[^.!?…]*[.!?…]?/gi, ' ')
  t = t.replace(/(^|[.!?…]\s*)[^.!?…]*(exato\s+)?como\s+(você\s+)?pediu[^.!?…]*[.!?…]?/gi, ' ')
  t = t.replace(/(^|[.!?…]\s*)[^.!?…]*(do\s+)?jeito\s+que\s+(você\s+)?pediu[^.!?…]*[.!?…]?/gi, ' ')
  t = t.replace(/(^|[.!?…]\s*)[^.!?…]*quer\s+ajuste[^.!?…]*[.!?…]?/gi, ' ')
  t = t.replace(/\b(pra|para)\s+mim\s*,?\s+seu\s+dom\b/gi, 'pro meu Dom')
  t = t.replace(/\b(pra|para)\s+mim\s+seu\s+dom\b/gi, 'pro meu Dom')
  t = t.replace(/(^|[.!?…]\s*)(grava|grave)\s+(pra|para)\s+(mandar|enviar|ela)[^.!?…]*[.!?…]?/gi, ' ')
  t = t.replace(/(^|[.!?…]\s*)(topou|topa)\s+gravar[^.!?…]*[.!?…]?/gi, ' ')
  t = t.replace(/(^|[.!?…]\s*)(manda|envia)\s+(isso|esse|essa|este)\b[^.!?…]*[.!?…]?/gi, ' ')
  t = t.replace(/(^|[.!?…]\s*)(vou|vamo|vamos)\s+(te\s+)?mandar\s+(um\s+)?(áudio|audio)[^.!?…]*[.!?…]?/gi, ' ')
  t = t.replace(/(^|[.!?…]\s*)(perfeito)\s+assim[^.!?…]*[.!?…]?/gi, ' ')
  t = t.replace(/(^|[.!?…]\s*)(meu\s+dom)\s+aprova[^.!?…]*[.!?…]?/gi, ' ')
  t = t.replace(/(^|[.!?…]\s*)(satisfeito|gostou|aprovou)\s+(meu|minha)\s+(dom|rei|amor)[^.!?…]*[.!?…]?/gi, ' ')
  t = t.replace(/(^|[.!?…]\s*)(não,\s*)?(espera|espere)[^.!?…]*([.!?…]|$)/gi, ' ')
  t = t.replace(/(^|[.!?…]\s*)\(?nota:[^.!?…]*([.!?…]|$)/gi, ' ')
  t = t.replace(/(^|[.!?…]\s*)(não,\s*)?claro[^.!?…]*([.!?…]|$)/gi, ' ')
  t = t.replace(/(^|[.!?…]\s*)deixa\s+eu\s+corrigir[^.!?…]*([.!?…]|$)/gi, ' ')
  const replacements = [
    [/\bbb\b/gi, 'bebê'],
    [/\bvc\b/gi, 'você'],
    [/\bpq\b/gi, 'porque'],
    [/\bvoce\b/gi, 'você'],
    [/\bvoces\b/gi, 'vocês'],
    [/\bta\b/gi, 'tá'],
    [/\btava\b/gi, 'tava'],
    [/\bto\b/gi, 'tô'],
    [/\bnao\b/gi, 'não'],
    [/\btb\b/gi, 'também'],
    [/\btd\b/gi, 'tudo'],
    [/\bvdd\b/gi, 'verdade'],
    [/\bblz\b/gi, 'beleza'],
  ]
  for (const [re, val] of replacements) {
    t = t.replace(re, val)
  }
  t = expandirNumerosPt(t)
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

function extractAudioCuesFromText(input, opts = {}) {
  const raw = (input || '').toString()
  if (!raw) return { text: raw, cuePrompt: '' }
  const preserveTokens = !!opts.preserveTokens
  const cues = new Set()
  const cleaned = raw.replace(/\[([^\]]{1,80})\]/g, (full, inner) => {
    const v = (inner || '').toString().trim()
    if (!v) return full
    const lower = v.toLowerCase()
    if (lower.startsWith('send_photo')) return full
    if (/foto\s*:/.test(lower)) return full
    if (/(sussurr|ofeg|gemend|suspi|risad|rindo|rouc|choram|choro)/.test(lower)) {
      if (lower.includes('sussurr')) cues.add('sussurrando')
      if (lower.includes('ofeg')) cues.add('ofegante')
      if (lower.includes('gemend')) cues.add('gemendo')
      if (lower.includes('suspi')) cues.add('suspirando')
      if (lower.includes('risad') || lower.includes('rindo')) cues.add('risadinha')
      if (lower.includes('rouc')) cues.add('voz rouca')
      if (lower.includes('choram') || lower.includes('choro')) cues.add('choramingando')
      return preserveTokens ? full : ' '
    }
    return full
  })
  const list = Array.from(cues)
  if (!list.length) return { text: cleaned, cuePrompt: '' }
  const parts = []
  if (list.includes('sussurrando')) parts.push('Fale em estilo ASMR: sussurro bem baixinho, bem próximo, com respiração suave e pausas curtas.')
  if (list.includes('ofegante')) parts.push('Fale ofegante, com respiração audível e pausas curtas para ar.')
  if (list.includes('gemendo')) parts.push('Inclua gemidos audíveis e prolongados, intensidade alta, com variação natural.')
  if (list.includes('suspirando')) parts.push('Inclua suspiros suaves e naturais.')
  if (list.includes('risadinha')) parts.push('Inclua risadinhas leves e sedutoras, pontuais.')
  if (list.includes('voz rouca')) parts.push('Use voz um pouco rouca e mais grave.')
  if (list.includes('choramingando')) parts.push('Use voz trêmula e choramingada, com emoção.')
  const cuePrompt = parts.join(' ')
  return { text: cleaned, cuePrompt }
}

function isMoanOnlyRequest(inputText) {
  const t = (inputText || '').toString().toLowerCase()
  if (!t) return false
  if (/(sem\s+falar|sem\s+palavras|s[oó]\s+gemid|somente\s+gemid|apenas\s+gemid|s[oó]\s+gemendo|apenas\s+gemendo|somente\s+gemendo)/.test(t)) return true
  if (/\bassim\s*[:\-–—]/.test(t)) return false
  if (/(falando|fale|fala\s+que|diz|diga|me\s+chama|chama\s+meu\s+nome)/.test(t)) return false
  const asksAudio = /(áudio|audio|voice note|nota de voz)/.test(t)
  const hasMoan = /(gemid|gemend|gozand|orgasm|cl[ií]max)/.test(t)
  const short = t.split(/\s+/).filter(Boolean).length <= 12
  if (asksAudio && hasMoan) return true
  if (short && hasMoan) return true
  return false
}

function buildMoanText(inputText) {
  const t = (inputText || '').toString().toLowerCase()
  const intense = /(exagerad|bem\s+gostos|gozand|orgasm|cl[ií]max)/.test(t)
  if (intense) return 'Mmm… ahh… ahh… mmm… ai… ahh… mais… mmm… ahhh… ai… ahh… mmm…'
  return 'Mmm… ahh… mmm… ahh… ai… mmm…'
}

function tuneQwen3VoicePromptForCues(basePrompt, cuePrompt) {
  const base = (basePrompt || '').toString()
  const cue = (cuePrompt || '').toString()
  if (!base) return cue.trim()
  const wantsExpressive = /(asmr|sussurr|ofeg|gemid|gemend|gozand|orgasm|cl[ií]max)/i.test(cue)
  if (!wantsExpressive) return base
  let tuned = base
  tuned = tuned.replace(/sem\s+gemidos\s+exagerados\.?/gi, '').trim()
  tuned = tuned.replace(/leitura\s+fiel\s+ao\s+texto\.?/gi, '').trim()
  tuned = tuned.replace(/\s+/g, ' ').trim()
  const add = 'Evite leitura robótica. Soe crua, íntima e espontânea, com variação de volume, respiração audível e pausas naturais.'
  return `${tuned} ${add}`.trim()
}

function extractAudioCuesFromUserRequest(input) {
  const t = (input || '').toString().toLowerCase()
  if (!t) return ''
  const cues = new Set()
  if (/(sussurr|sussurro)/.test(t)) cues.add('sussurrando')
  if (/(ofeg|ofegante|respiração pesada|respiracao pesada)/.test(t)) cues.add('ofegante')
  if (/(gemend|gemido|gemidos)/.test(t)) cues.add('gemendo')
  if (/(gozand|orgasm|cl[ií]max)/.test(t)) cues.add('orgasmo')
  if (/(suspir|suspiro|suspiros)/.test(t)) cues.add('suspirando')
  if (/(risad|risadinha|rindo|riso baixo)/.test(t)) cues.add('risadinha')
  if (/(rouc|voz rouca)/.test(t)) cues.add('voz rouca')
  if (/(choram|chorando|choro|choraming)/.test(t)) cues.add('choramingando')
  const parts = []
  if (cues.has('sussurrando')) parts.push('Fale em estilo ASMR: sussurro bem baixinho, bem próximo, com respiração suave e pausas curtas.')
  if (cues.has('ofegante')) parts.push('Fale ofegante, com respiração audível e pausas curtas para ar.')
  if (cues.has('gemendo')) parts.push('Inclua gemidos audíveis e prolongados; pode ser exagerado, sempre natural.')
  if (cues.has('orgasmo')) parts.push('Faça um pico de clímax: gemidos bem mais intensos, voz tremendo, respiração acelerada.')
  if (cues.has('suspirando')) parts.push('Inclua suspiros suaves e naturais.')
  if (cues.has('risadinha')) parts.push('Inclua risadinhas leves e sedutoras, pontuais.')
  if (cues.has('voz rouca')) parts.push('Use voz um pouco rouca e mais grave.')
  if (cues.has('choramingando')) parts.push('Use voz trêmula e choramingada, com emoção.')
  return parts.join(' ').trim()
}

function extractAudioCueTokensFromUserRequest(input) {
  const t = (input || '').toString().toLowerCase()
  if (!t) return []
  const tokens = []
  const push = (v) => { if (v && !tokens.includes(v)) tokens.push(v) }
  if (/(sussurr|sussurro)/.test(t)) push('[sussurrando]')
  if (/(ofeg|ofegante|respiração pesada|respiracao pesada)/.test(t)) push('[ofegante]')
  if (/(gemend|gemido|gemidos)/.test(t)) push('[gemendo]')
  if (/(suspir|suspiro|suspiros)/.test(t)) push('[suspirando]')
  if (/(risad|risadinha|rindo|riso baixo)/.test(t)) push('[risadinha]')
  if (/(rouc|voz rouca)/.test(t)) push('[voz rouca]')
  if (/(choram|chorando|choro|choraming)/.test(t)) push('[choramingando]')
  return tokens.slice(0, 2)
}

function userWantsCueTagsInText(input) {
  const t = (input || '').toString().toLowerCase()
  return /\b(tag|tags|colchete|colchetes|marcador|marcadores)\b/.test(t)
    || /no\s+meio\s+do\s+texto/.test(t)
    || /inclu(i|a)\s+.*\b(tag|tags|colchete|colchetes|marcador|marcadores)\b/.test(t)
}

function injectCueTokensIntoText(text, tokens) {
  let out = (text || '').toString()
  const arr = Array.isArray(tokens) ? tokens.filter(Boolean).slice(0, 2) : []
  if (!out.trim() || !arr.length) return out
  const firstComma = out.indexOf(',')
  let i1 = firstComma >= 0 ? firstComma + 1 : Math.min(Math.max(12, Math.floor(out.length * 0.25)), out.length)
  out = `${out.slice(0, i1)} ${arr[0]} ${out.slice(i1)}`.replace(/\s+/g, ' ').trim()
  if (arr.length >= 2) {
    let i2 = Math.min(Math.max(20, Math.floor(out.length * 0.6)), out.length)
    out = `${out.slice(0, i2)} ${arr[1]} ${out.slice(i2)}`.replace(/\s+/g, ' ').trim()
  }
  return out
}

function mergeCuePrompts(a, b) {
  const x = (a || '').toString().trim()
  const y = (b || '').toString().trim()
  if (!x) return y
  if (!y) return x
  if (x === y) return x
  return `${x} ${y}`.trim()
}

function postProcessTextForAudio(spokenText, userText) {
  const original = (spokenText || '').toString().trim()
  if (!original) return original
  let t = original
  t = t.replace(/(^|[.!?…]\s*)[^.!?…]*\b(áudio|audio)\b[^.!?…]*[.!?…]?/gi, ' ')
  const userAskedQuestion = /\?/.test((userText || '').toString())
  if (!userAskedQuestion) {
    t = t.replace(/[^.!?…]*\?+/g, ' ')
  }
  t = t.replace(/\s+/g, ' ').trim()
  return t || original
}

function isRefusalAnswer(text) {
  const s = (text || '').toString().trim().toLowerCase()
  if (!s) return false
  if (s === 'não' || s === 'não.' || s.startsWith('não,') || s.startsWith('não.')) return true
  if (s.includes('não posso') || s.includes('não vou') || s.includes('não consigo')) return true
  if (s.includes('vamos brincar de outro jeito')) return true
  return false
}

function buildScriptFallbackText(scriptReq) {
  if (!scriptReq) return ''
  const target = (scriptReq.target || '').toString().trim()
  let msg = (scriptReq.message || '').toString().trim()
  if (!msg) return ''
  if (target && msg.toLowerCase().startsWith(target.toLowerCase())) return msg
  if (target) return `Oi ${target}, ${msg}`
  return msg
}

function normalizeTextForBark(input, opts = {}) {
  let t = normalizeTextForTTS(input, opts)
  if (!t) return t
  t = t.replace(/\s*([.!?…])\s*/g, '$1 ')
  t = t.replace(/\s*,\s*/g, ', ')
  t = t.replace(/\s*;\s*/g, '; ')
  t = t.replace(/\s*:\s*/g, ': ')
  t = t.replace(/\s+-\s+/g, '. ')
  t = t.replace(/\.{3,}/g, '...')
  t = t.replace(/([!?]){2,}/g, '$1')
  t = t.replace(/\s+/g, ' ').trim()
  if (!/[.!?]$/.test(t)) t = `${t}.`
  return t
}

function userWantsPhoto(inputText) {
  const t = (inputText || '').toString().toLowerCase()
  const wants = /\b(manda|envia|me manda|mostra|me mostra|gera|quero|pode mandar)\b/.test(t)
  const target = /\b(foto|imagem|selfie|nude|nudes|bunda|peito|peitos)\b/.test(t)
  return wants && target
}

function isPotentialMinorContent(inputText) {
  const t = (inputText || '').toString().toLowerCase()
  return /\b(menor|menina|garotinha|garota|novinha|ninfeta|adolescente|colegial|schoolgirl|teen)\b/.test(t)
    || /\b(1[0-7])\s*anos\b/.test(t)
}

function shouldForceAudioByRequest(inputText) {
  const t = (inputText || '').toString().toLowerCase()
  return /(manda|envia|me manda|responde).*(áudio|audio)/.test(t)
    || /(por|em)\s+(áudio|audio)/.test(t)
    || /(voice note|nota de voz)/.test(t)
}

function extractScriptRequest(inputText) {
  const raw = (inputText || '').toString().trim()
  if (!raw) return null
  const m = raw.match(/\b(fala|fale|diz|diga|manda|envia|responde|grava)\b[\s\S]{0,80}?\b(pra|para)\s+([A-Za-zÀ-ú][A-Za-zÀ-ú'\-]{1,40})\b/i)
  if (!m) return null
  const target = (m[3] || '').trim()
  const targetLower = target.toLowerCase()
  const invalidTargets = new Set([
    'mim', 'me', 'eu', 'minha', 'meu',
    'você', 'voce', 'vc',
    'ele', 'ela', 'dele', 'dela',
    'a', 'o', 'os', 'as',
    'dom', 'rei', 'amor', 'vida',
  ])
  if (invalidTargets.has(targetLower)) return null
  const after = raw.slice((m.index || 0) + m[0].length).trim()
  const lowerAfter = after.toLowerCase()
  const assimMatch = lowerAfter.match(/\bassim\s*[:\-–—]\s*/i)
  const idxAssim = assimMatch ? lowerAfter.indexOf(assimMatch[0]) : -1
  const idxQue = lowerAfter.indexOf('que ')
  let explicitScript = false
  let message = after
  if (idxAssim >= 0) {
    message = after.slice(idxAssim + (assimMatch?.[0]?.length || 0))
    explicitScript = true
  } else if (idxQue >= 0) {
    message = after.slice(idxQue + 4)
  }
  message = message.replace(/^[:\-–—\s]+/, '').trim()
  const mentionsDom = /\b(dom|meu\s+dom|seu\s+dom)\b/i.test(raw) || /\b(seu)\s+dom\b/i.test(message)
  if (!message) return { target, message: '' }
  return { target, message, mentionsDom, explicitScript }
}

export async function handleConversaAgente(ctx) {
  const { prisma, personaReady, state, typed, text, conv, persona, user, sendId, phone, sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppAudioLink, sendWhatsAppChatState, maps } = ctx

  const upsellTrialMessages = [
    "Amor, queria muito te mandar essa foto, mas meu app diz que você precisa ser assinante VIP pra ver... Que tal assinar agora pra gente não ter limites? 😈",
    "Poxa vida, tentei te enviar mas bloqueou... Parece que é só para assinantes. Vem ser meu VIP? 👇",
  ]
  const upsellLimitMessages = [
    "Vida, acabei estourando meu plano de dados por hoje pra mandar fotos... 🙈 Me ajuda com um pacote extra pra eu continuar te mandando? Tô doida pra te mostrar...",
    "Amor, gastei todos os meus créditos de foto por hoje... 🥺 Mas se você me der um presentinho, eu consigo te mandar agora mesmo!",
    "Nossa, bloqueou aqui... Diz que atingimos o limite de hoje. Que tal um pacote extra pra gente não parar? 😈"
  ]
  const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)]

  if (!personaReady || state) return false

  if (isPotentialMinorContent(text)) {
    const replyText = 'Não posso continuar com conteúdo que envolva menor de idade. Se quiser, posso falar de uma fantasia consensual entre adultos.'
    await salvarSaidaEEnviar({
      prisma,
      store: 'message',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      content: replyText,
      enviar: () => sendWhatsAppText(sendId, phone, replyText),
    })
    return true
  }

  const responseModePre = (persona?.responseMode || 'text').toString()
  const inboundIsAudioPre = ctx.msgType === 'audio'
  const forceAudioPre = shouldForceAudioByRequest(text)
  const willNeedAudioResponse =
    responseModePre === 'audio'
    || ((responseModePre === 'mirror' || responseModePre === 'both') && inboundIsAudioPre)
    || forceAudioPre
  const wantsPhoto = userWantsPhoto(text)
  const scriptReq = willNeedAudioResponse ? extractScriptRequest(text) : null
  const userCuePrompt = willNeedAudioResponse ? extractAudioCuesFromUserRequest(text) : ''
  const cueTagsMode = (process.env.AUDIO_CUE_TAGS_MODE || 'voice_prompt').toString().trim().toLowerCase()
  const passThroughCueTags = willNeedAudioResponse && cueTagsMode === 'pass_through'
  const shouldInsertCueTags = willNeedAudioResponse && ((process.env.AUDIO_INSERT_CUE_TAGS_IN_TEXT || '0').toString().trim() === '1')
  const userCueTokens = willNeedAudioResponse ? extractAudioCueTokensFromUserRequest(text) : []
  const moanOnly = willNeedAudioResponse && !scriptReq && isMoanOnlyRequest(text)

  const t = text.trim().toLowerCase()
  const isGreeting = !!t && (
    t === 'oi' || t === 'olá' || t === 'ola' ||
    t.includes('oi crush') ||
    t.includes('quer namorar comigo') ||
    t.includes('quer ser minha crush')
  )

  if ((personaReady && isGreeting) || (personaReady && !maps.onboarding.get(user.id))) {
    const basePrompt = composeSystemPrompt(persona)
    const audioExpressiveness = `\n\nGUIA (ÁUDIO):\n- Para soar humano, use pausas e variação de ritmo no próprio texto.\n- Use interjeições curtas e naturais (1–3 no máximo), como: "Ah...", "Hmm...", "Ufa...", "Ei...", "Hehe...".\n- Se o usuário pedir voz sussurrada/ofegante/gemendo, reflita isso com pontuação e algumas onomatopeias discretas (ex.: "mmm", "ahh"), sem exagerar.\n- Use reticências e vírgulas para marcar pausas e respiração.\n- Não use marcadores em colchetes no texto falado (eles viram fala literal no TTS).`.trim()
    const systemPrompt = willNeedAudioResponse
      ? (wantsPhoto
        ? `${basePrompt}${audioExpressiveness}\n\nIMPORTANTE:\n- O usuário pediu foto: comece com [SEND_PHOTO: english description].\n- Depois da tag, escreva apenas o texto falado.\n- Use ortografia PT-BR correta (acentos e cedilha). Evite escrever \"voce\", \"voces\", \"nao\", \"ta\".\n- Não use a palavra \"áudio\"/\"audio\" no texto falado.\n- No texto falado, não use ponto de interrogação (?).\n- No texto falado: proibido ações/ambientação entre asteriscos, emojis, aspas e colchetes.\n- Evite abreviações (ex.: bb, vc, pq). Escreva por extenso.\n- Números sempre por extenso.\n- Use pontuação natural para soar humano: frases curtas, vírgulas e pausas.`
        : `${basePrompt}${audioExpressiveness}\n\nIMPORTANTE:\n- Retorne apenas o texto falado.\n- Responda com UMA única versão final do texto (um único bloco). Não dê opções/variações.\n- Nunca responda com apenas uma palavra (ex.: \"vai\"). Gere ao menos 1 frase completa com 10+ palavras.\n- Use ortografia PT-BR correta (acentos e cedilha). Evite escrever \"voce\", \"voces\", \"nao\", \"ta\".\n- Proibido: ações/ambientação entre asteriscos, emojis, aspas, colchetes, parênteses e tags (incluindo [SEND_PHOTO: ...]).\n- Não mencione áudio/gravação nem peça confirmação para gravar (ex.: \"vou gravar\", \"grava pra mandar\", \"topa gravar?\").\n- Não use a palavra \"áudio\"/\"audio\" no texto falado.\n- No texto falado, não use ponto de interrogação (?).\n- Atenda diretamente o pedido: não termine com pergunta de validação/checagem (ex.: \"satisfeito?\", \"gostou?\", \"meu Dom aprovou?\") a menos que o usuário tenha feito uma pergunta.\n- Não faça auto-correção no texto e não pense em voz alta (ex.: \"não\", \"não, claro\", \"espera\", \"deixa eu corrigir\", \"falando certo\", \"ajustando\", \"exato\").\n- Não inclua notas/explicações/metacomentários (ex.: \"nota:\", \"observação:\"). Se houver ambiguidade, escolha a interpretação mais provável e escreva apenas a versão final.\n- Evite abreviações (ex.: bb, vc, pq). Escreva por extenso.\n- Números sempre por extenso.\n- Use pontuação natural para soar humano: frases curtas, vírgulas e pausas.\n- Se você escrever qualquer coisa proibida, reescreva e devolva somente o texto falado.`
      )
      : `${basePrompt}\n\nIMPORTANTE:\n- Só use [SEND_PHOTO: ...] se o usuário pedir foto explicitamente.`
    const prev = (conv.xaiLastResponseId || '').toString().trim()
    const convCacheId = (conv.xaiConvCacheId || '').toString().trim()

    // INJEÇÃO DE REGRA DE IMAGEM: Força o LLM a lembrar da regra de imagem em inglês a cada turno.
    // Isso é invisível para o usuário final no WhatsApp, mas visível para o LLM.
    const imageRule = wantsPhoto
      ? "\n\n[SYSTEM: IMPORTANT: If you generate a photo tag [SEND_PHOTO: description], the description MUST BE IN ENGLISH ONLY. Translate any visual details from Portuguese to English inside the tag. Example: [SEND_PHOTO: selfie of an adult woman, blonde hair, smiling]. Do NOT use Portuguese inside the tag.]"
      : ""
    const scriptRule = scriptReq
      ? `\n\nIMPORTANTE (CONTEXTO):\n- Você é ${persona.name}. O usuário é o seu Dom.\n- O usuário quer que você fale diretamente com ${scriptReq.target} (terceira pessoa).\n- Escreva a mensagem como se você estivesse falando com ${scriptReq.target} agora.\n- O Dom NÃO é você. Você não diz \"pra mim, seu Dom\".\n- Quando o pedido mencionar \"seu Dom\", entenda que é o usuário (o Dom) e você deve falar \"meu Dom\" ou \"o meu Dom\".\n- Não se dirija ao usuário, não diga \"como pediu\"/\"exato como pediu\" e não finalize pedindo ajuste.`
      : ""
    const userForModel = scriptReq
      ? `Tarefa: escreva a fala de ${persona.name} para ${scriptReq.target}.\nRegras: não fale com o usuário, não confirme pedido, não use a palavra áudio, não use interrogação.\n${scriptReq.mentionsDom ? 'Contexto: o usuário é o Dom; ao mencionar o Dom, use \"meu Dom\" (nunca \"pra mim, seu Dom\").\n' : ''}${scriptReq.explicitScript ? 'O usuário forneceu um texto pronto. Repita o texto abaixo exatamente, sem resumir, sem parafrasear e sem remover palavras.\nTexto:\n' : 'Use o conteúdo abaixo como base. Não resuma e não corte trechos.\nConteúdo:\n'}${scriptReq.message || text}`.trim()
      : text
    
    const chat = prev
      ? [{ role: 'user', content: userForModel + imageRule }]
      : [...(await buildLLMMessages(prisma, conv.id, systemPrompt + scriptRule)), { role: 'user', content: userForModel + imageRule }]
    
    const gen = await generateWithGrok(chat, { useStore: true, previousResponseId: prev || undefined, convCacheId: convCacheId || undefined })
    if (gen?.blocked) {
      const detail = (gen?.errorMessage || '').toString()
      const isCsam = detail.toLowerCase().includes('safety_check_type_csam')
      const replyText = isCsam
        ? 'Não posso responder esse pedido desse jeito. Se quiser, descreva uma fantasia consensual entre adultos (18+), sem termos como “novinha/menina/colegial”, que eu respondo.'
        : WHATSAPP_FALLBACK_BLOQUEIO_CONTEUDO
      try {
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { xaiLastResponseId: null, xaiLastResponseAt: null, xaiConvCacheId: crypto.randomUUID() }
        })
      } catch {}
      await salvarSaidaEEnviar({
        prisma,
        store: 'message',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        content: replyText,
        enviar: () => sendWhatsAppText(sendId, phone, replyText),
      })
      return true
    }
    if (gen?.responseId) {
      try { await prisma.conversation.update({ where: { id: conv.id }, data: { xaiLastResponseId: gen.responseId, xaiLastResponseAt: new Date() } }) } catch {}
    }
    
    let replyTextRaw = gen.ok && gen.content ? gen.content : WHATSAPP_FALLBACK_ERRO_GERACAO
    if (willNeedAudioResponse && scriptReq && scriptReq.explicitScript && scriptReq.message) {
      replyTextRaw = scriptReq.message
    }
    if (willNeedAudioResponse && scriptReq && scriptReq.message && isRefusalAnswer(replyTextRaw)) {
      replyTextRaw = buildScriptFallbackText(scriptReq) || replyTextRaw
    }
    console.log('[ConversaAgente] Resposta LLM:', replyTextRaw)

    const photoMatch = replyTextRaw.match(/\[SEND_PHOTO:\s*(.+?)\]/i) || 
                       replyTextRaw.match(/\(Foto:\s*(.+?)\)/i) ||
                       replyTextRaw.match(/\*\(Foto:\s*(.+?)\)\*/i) ||
                       replyTextRaw.match(/\*Foto:\s*(.+?)\*/i)

    let captionText = replyTextRaw
    if (photoMatch) {
      captionText = captionText.replace(/\[SEND_PHOTO:\s*(.+?)\]/gi, '')
                               .replace(/\(Foto:\s*(.+?)\)/gi, '')
                               .replace(/\*\(Foto:\s*(.+?)\)\*/gi, '')
                               .replace(/\*Foto:\s*(.+?)\*/gi, '')
                               .trim()
    }
    let replyText = captionText
    let qwen3CuePrompt = ''
    if (willNeedAudioResponse) {
      if (moanOnly) {
        replyText = buildMoanText(text)
      }
      if (shouldInsertCueTags && userCueTokens.length) {
        replyText = injectCueTokensIntoText(replyText, userCueTokens)
        const positions = userCueTokens.map((tok) => ({ tok, idx: replyText.indexOf(tok) }))
        console.log('[Audio][Cue] inserted', { personaId: persona.id, count: userCueTokens.length, tokens: userCueTokens, positions })
        console.log('[ConversaAgente] cues_in_text', { personaId: persona.id, preview: replyText.slice(0, 260) })
      }
      const cues = extractAudioCuesFromText(replyText, { preserveTokens: passThroughCueTags })
      qwen3CuePrompt = mergeCuePrompts(userCuePrompt, (cues.cuePrompt || '').toString().trim())
      replyText = normalizeTextForTTS(cues.text, { preserveCueTags: passThroughCueTags }) || replyText
      replyText = postProcessTextForAudio(replyText, text) || replyText
      if (!scriptReq?.explicitScript) {
        const words = replyText.split(/\s+/).filter(Boolean)
        if (words.length < 4) {
          const wantsMoan = /(gemid|gemend|gemendo)/i.test(userCuePrompt)
          const wantsWhisper = /(asmr|sussurr)/i.test(userCuePrompt)
          replyText = wantsWhisper
            ? 'Ei… vem cá, bem pertinho. Fala comigo baixinho… mmm…'
            : wantsMoan
              ? 'Ah… mmm… vem cá. Eu quero te ouvir bem de perto… ahh…'
              : 'Ei… vem cá. Fala comigo…'
        }
      }
      console.log('[ConversaAgente] audio_prep', { personaId: persona.id, cueTagsMode, passThroughCueTags, cueLen: (qwen3CuePrompt || '').length, cue: (qwen3CuePrompt || '').slice(0, 140), preview: replyText.slice(0, 260) })
    }

    let shouldSendText = true

    if (photoMatch) {
      console.log('[ConversaAgente] Detectado pedido de foto:', photoMatch[1])
      // Verificação de Recuperação: Se a persona não tem avatar, assumimos que é uma falha de onboarding
      // e permitimos a geração gratuita para corrigir o problema.
      const hasAvatar = persona.avatar && (persona.avatar.startsWith('http') || persona.avatar.startsWith('https'))
      const isRecoveryFlow = !hasAvatar

      let allowance = { allowed: true }
      if (!isRecoveryFlow) {
        allowance = await checkImageAllowance(prisma, user.id)
      }
      console.log('[ConversaAgente] Allowance check:', allowance, 'Recovery:', isRecoveryFlow)
      
      if (!allowance.allowed) {
        shouldSendText = false
        let upsellText = ""
        let buttons = []
        
        if (allowance.reason === 'trial') {
          upsellText = getRandom(upsellTrialMessages)
          buttons = [
            { id: 'upgrade_conhecer_planos', title: 'VER PLANOS' },
            { id: 'upgrade_agora_nao', title: 'AGORA NÃO' }
          ]
        } else {
          upsellText = getRandom(upsellLimitMessages)
          buttons = [
            { id: 'billing_pacote_fotos', title: 'COMPRAR FOTOS' },
            { id: 'billing_agora_nao', title: 'AGORA NÃO' }
          ]
        }

        await salvarSaidaEEnviar({
          prisma,
          store: 'message',
          conversationId: conv.id,
          userId: user.id,
          personaId: persona.id,
          content: upsellText,
          enviar: () => sendWhatsAppButtons(sendId, phone, upsellText, buttons)
        })
        return true
      } else {
          // Gera e envia imagem usando Helper unificado
          shouldSendText = willNeedAudioResponse

          // Removido mensagem de espera (buffer) conforme solicitado, pois a geração já demora.
          
          const traits = getPersonaPhysicalTraits(persona.prompt)
          let { prompt: finalPrompt, negative: negativePrompt, poseType } = resolveImagePrompt(text, photoMatch[1], traits)
          let refs = []
          let totalAvailableRefs = 0
          try {
            const envBucketValRefs = (process.env.SUPABASE_BUCKET_FOTOS_REFS || 'crushzap/images/refs-images').toString()
            let bucketNameRefs = envBucketValRefs
            let pathPrefixRefs = ''
            if (envBucketValRefs.includes('/')) {
              const parts = envBucketValRefs.split('/')
              bucketNameRefs = parts[0]
              pathPrefixRefs = parts.slice(1).join('/')
            }
            const list = await listarPublicUrlsSupabase({ prefix: `${pathPrefixRefs}/${persona.id}`, bucketName: bucketNameRefs, limit: 50 })
            if (list.ok) {
              const items = Array.isArray(list.items) ? list.items : []
              totalAvailableRefs = items.length
              const names = items
                .map(it => ({ name: String(it.name).toLowerCase(), url: it.publicUrl }))
                .sort((a, b) => b.name.localeCompare(a.name))
              const selectRefsByPoseType = (poseTypeValue) => {
                const pick = []
                const pushBy = (test) => {
                  names.forEach(n => { if (test(n.name)) pick.push(n.url) })
                }

                // Normalização da poseType:
                // Se for fluxo de recuperação (acabou de gerar o avatar inicial selfie_mirror_01),
                // forçamos o uso desse avatar como referência e adaptamos a poseType para algo compatível
                // com a única imagem disponível (selfie mirror), evitando que uma pose 'anal' tente usar
                // uma selfie mirror como ref e cause distorções ou falhas.
                // Mas, como o objetivo é atender o pedido do usuário, se ele pediu 'anal',
                // devemos tentar manter 'anal' mas usar a ref disponível (avatar).
                // O problema relatado é que gerou 'anal' em vez de 'mirror'.
                // Se o usuário pediu 'mostra voce', o resolveImagePrompt deve ter detectado 'anal' erroneamente
                // ou o LLM gerou uma tag errada.
                // No log: [ConversaAgente] Detectado pedido de foto: full body nude...
                // Mas [ConversaAgente] Refs selecionadas ... poseType: 'anal'
                // Isso indica que resolveImagePrompt retornou 'anal'.
                // Vamos verificar por que 'anal' foi detectado. Provavelmente a descrição continha palavras-chave.
                
                // CORREÇÃO: Se estamos no fluxo de recuperação (isRecoveryFlow) e acabamos de gerar um avatar (selfie_mirror),
                // devemos forçar a poseType da geração atual para ser compatível com o avatar gerado OU
                // aceitar que a primeira foto de recuperação será sempre uma selfie/retrato para garantir consistência inicial.
                // Se o usuário pediu 'mostra voce', o ideal é uma foto de corpo ou selfie.
                
                // Se isRecoveryFlow for true, significa que não tínhamos refs.
                // Acabamos de gerar um avatar (selfie_mirror_01).
                // Para garantir que a primeira imagem enviada ao usuário seja coerente com o avatar recém-criado,
                // vamos forçar a poseType para 'selfie_mirror_01' ou 'body_full_front_01' se o pedido for genérico,
                // ou manter a poseType se for específica mas usar o avatar como ref (o que o código já faz ao popular refs).
                
                // O problema específico relatado: "ao inves de enviar a mirror enviou uma foto anal".
                // Isso aconteceu porque resolveImagePrompt detectou 'anal' (talvez por alguma palavra no prompt do LLM ou input).
                // Mas como estamos no fluxo de recuperação, a única ref é o avatar selfie_mirror.
                // Usar selfie_mirror como ref para gerar anal pode dar resultados mistos, mas o prompt de anal venceu.
                
                // Para corrigir e "enviar a mirror gerada da persona primeiro":
                // Se estamos em recovery, a imagem que acabamos de gerar (avatarRes.publicUrl) É a imagem que garante a identidade.
                // Se quisermos enviar ELA (ou uma variação muito próxima) para o usuário como "primeira foto",
                // devemos garantir que a geração atual use a pose e prompt alinhados a ela.
                
                // No entanto, o código atual gera o avatar, guarda a URL em 'refs', e DEPOIS chama gerarImagemNSFW novamente
                // com o prompt original do usuário (finalPrompt) e poseType original.
                // Isso gera UMA SEGUNDA imagem baseada no avatar. É essa segunda imagem que vai pro usuário.
                // Se o prompt original era 'anal', a segunda imagem tentará ser 'anal'.
                
                // Se o desejo é que, no recovery, a imagem enviada seja o próprio avatar (ou uma selfie simples),
                // devemos sobrescrever o poseType e talvez o prompt.
                
                // Vamos forçar poseType para 'selfie_mirror' se estivermos em recovery, para garantir que a primeira interação
                // visual seja uma selfie "apresentando" a persona, independentemente do que foi pedido bizarramente.
                // OU, se o usuário pediu algo específico, tentamos atender.
                
                // O usuário reclamou: "ao inves de enviar a mirror enviou uma foto anal".
                // Se o pedido foi "mostra voce", o LLM gerou "full body nude...".
                // resolveImagePrompt pode ter classificado como 'anal' se o prompt continha palavras trigger (ex: 'butt' as vezes cai no fallbacks ou se o LLM alucinou).
                
                // Vamos alterar a lógica abaixo onde definimos refs e poseType no fluxo de recuperação.
                
                const typeKey = String(poseTypeValue || '').toLowerCase().trim()
                const isPussyFamily = typeKey === 'pussy' || typeKey.startsWith('pussy_')
                const isAnalFamily = typeKey === 'anal' || typeKey.startsWith('anal_')
                const isActionPose =
                  typeKey === 'pussy_open'
                  || typeKey === 'pussy_toy'
                  || typeKey.startsWith('pussy_fingers_')
                  || typeKey === 'anal_hands'
                  || typeKey === 'anal_hands_hold'
                  || typeKey === 'anal_fingers'
                  || typeKey === 'anal_toy'
                  || typeKey === 'ride_toy'
                const hasPoseRefs = isActionPose
                  ? (
                      names.some(n => n.name.startsWith(`${typeKey}_`))
                      || (isAnalFamily ? names.some(n => n.name.startsWith('anal_')) : false)
                      || (isPussyFamily ? names.some(n => n.name.startsWith('pussy_')) : false)
                    )
                  : true

                if (typeKey === 'breasts') {
                  pushBy(n => n.startsWith('breasts_'))
                  pushBy(n => n.startsWith('face_'))
                } else if (typeKey === 'doggystyle') {
                  pushBy(n => n.startsWith('doggystyle_'))
                  pushBy(n => n.startsWith('body_'))
                  pushBy(n => n.startsWith('selfie_mirror_'))
                  pushBy(n => n.startsWith('face_'))
                } else if (isPussyFamily || typeKey === 'butt' || isAnalFamily) {
                  // Para poses intimas e close-up (pussy/anal/butt), priorizamos refs especificas.
                  // Se nao tiver, usamos body/selfie, mas LIMITAMOS a quantidade para não poluir o IPAdapter com pose errada.
                  if (typeKey !== 'pussy' && typeKey !== 'butt') pushBy(n => n.startsWith(`${typeKey}_`))
                  if (isPussyFamily) pushBy(n => n.startsWith('pussy_'))
                  if (isAnalFamily) pushBy(n => n.startsWith('anal_'))
                  pushBy(n => n.startsWith('butt_'))
                  
                  // Se ja temos refs especificas, NAO adicionamos face/body/selfie para evitar contaminação de pose.
                  // O IPAdapter vai focar na anatomia das partes intimas.
                  if (pick.length === 0) {
                     // Se não tem refs intimas, usamos face e body como fallback para identidade, mas poucas.
                     const faceRefs = names.filter(n => n.name.startsWith('face_')).map(n => n.url).slice(0, 1)
                     const bodyRefs = names.filter(n => n.name.startsWith('body_')).map(n => n.url).slice(0, 1)
                     pick.push(...faceRefs, ...bodyRefs)
                  }
                } else if (typeKey === 'oral') {
                  pushBy(n => n.startsWith('oral_'))
                  pushBy(n => n.startsWith('face_'))
                } else if (typeKey === 'ride_toy') {
                  // ...
                } else {
                  pushBy(n => n.startsWith('face_'))
                  pushBy(n => n.startsWith('body_'))
                  pushBy(n => n.startsWith('selfie_mirror_'))
                  pushBy(n => n.startsWith('breasts_'))
                }

                // Limitar drasticamente o número de referências para poses intimas close-up
                // para evitar conflito de múltiplas poses diferentes.
                // 1 ou 2 refs fortes são melhores que 6 refs misturadas.
                const maxRefs = (isPussyFamily || isAnalFamily) ? 2 : 6
                const outRefs = [...new Set(pick)].slice(0, maxRefs)
                const isIntimatePose = isPussyFamily || isAnalFamily || typeKey === 'butt'
                if (outRefs.length === 0 && names.length > 0 && !isIntimatePose) {
                  outRefs.push(...names.slice(0, Math.min(2, names.length)).map(n => n.url))
                }
                return {
                  refs: outRefs,
                  isActionPose,
                  hasPoseRefs
                }
              }

              let sel = selectRefsByPoseType(poseType)
              refs = sel.refs
              if (sel.isActionPose && !sel.hasPoseRefs) {
                const fallback = resolveImagePrompt(text, photoMatch[1], traits, { disableActionOverrides: true })
                finalPrompt = fallback.prompt
                negativePrompt = fallback.negative
                poseType = fallback.poseType
                sel = selectRefsByPoseType(poseType)
                refs = sel.refs
              }
            }
          } catch {}

          // Se não tem refs (pack não gerado) e nem avatar (falha no onboarding),
          // tentamos gerar o avatar agora e disparar a criação do pack em background.
          // Se refs.length < 5, assumimos que o pack está incompleto e tentamos completar.
          let needsPackGeneration = false
          // CORREÇÃO: Usamos totalAvailableRefs (do bucket) em vez de refs.length (filtrado para a pose),
          // pois poses íntimas limitam intencionalmente refs.length a 2, o que disparava falso positivo de falta de pack.
          if (totalAvailableRefs < 5) {
            needsPackGeneration = true
            const avatarUrl = (persona?.avatar || '').toString().trim()
            if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
              if (!refs.includes(avatarUrl)) refs.push(avatarUrl)
            } else {
              console.log('[ConversaAgente] Sem refs nem avatar. Tentando gerar pack inicial...')
              try {
                // Tenta gerar avatar
                const avatarRes = await gerarAvatarFromConsistencyPack({ prisma, personaId: persona.id, type: 'selfie_mirror_01' })
                
                if (avatarRes.ok && avatarRes.publicUrl) {
                   console.log('[ConversaAgente] Avatar inicial gerado com sucesso:', avatarRes.publicUrl)
                   refs = [avatarRes.publicUrl]
                   
                   // Força a primeira imagem a ser uma selfie no espelho (mesma pose do avatar gerado),
                   // para garantir consistência visual imediata e evitar distorções de poses complexas (como anal)
                   // usando apenas uma selfie como referência.
                   poseType = 'selfie_mirror_outfit_01'
                   // Ajusta o prompt para refletir a selfie
                   const fallback = resolveImagePrompt(text, 'selfie mirror photo in bathroom', traits, { disableActionOverrides: true })
                   finalPrompt = fallback.prompt
                   negativePrompt = fallback.negative

                } else {
                   console.warn('[ConversaAgente] Falha ao gerar avatar inicial:', avatarRes.error)
                   // Se falhou ao gerar o avatar, NÃO devemos prosseguir gerando uma imagem genérica sem ref.
                   // Isso quebraria a consistência totalmente.
                   // Vamos lançar erro para cair no catch e enviar mensagem de texto (fallback).
                   throw new Error('Falha crítica na recuperação do avatar: ' + (avatarRes.error || 'Erro desconhecido'))
                }
              } catch (e) {
                 console.error('[ConversaAgente] Erro ao tentar recuperar pack:', e)
                 // Se foi o erro que lançamos acima, re-throw para abortar imagem
                 if (e.message.includes('Falha crítica')) throw e
              }
            }
          }

          if (needsPackGeneration && refs.length > 0) {
              console.log('[ConversaAgente] Detectado falta de pack. Disparando geração em background...')
              // Dispara geração do restante do pack em background usando o avatar (existente ou recém-criado) como base
              gerarConsistencyPack({ prisma, personaId: persona.id, ensureAvatar: false, avatarUrlOverride: refs[0] })
                .then(res => console.log('[ConversaAgente] Pack background resultado:', res))
                .catch(err => console.error('[ConversaAgente] Erro ao gerar pack background:', err))
          }

          console.log('[ConversaAgente] Refs selecionadas', { personaId: persona.id, poseType, count: refs.length })
          
          console.log('[ConversaAgente] Iniciando geração de imagem. Prompt final:', finalPrompt)
          
          // Gera seed aleatória para garantir que a imagem seja sempre nova
          const seed = Math.floor(Math.random() * 2147483647)
          const wantsSceneBase =
            (ctx?.mediaType === 'image' || ctx?.msgType === 'image')
            && typeof ctx?.mediaContent === 'string'
            && ctx.mediaContent.startsWith('/uploads/')
            && /\b(igual|mesma|recria|copi(a|ar)|assim|basead[ao]|referencia|referência)\b/i.test(String(text || ''))
          const baseImage = wantsSceneBase
            ? join(process.cwd(), 'public', ctx.mediaContent.replace(/^\//, ''))
            : undefined
          
          gerarImagemNSFW({ prompt: finalPrompt, negativePrompt, refs, poseType, seed, ...(baseImage ? { baseImage } : {}) }).then(async (img) => {
            const bytesLen = img?.bytes ? (Buffer.isBuffer(img.bytes) ? img.bytes.length : (img.bytes?.byteLength || 0)) : 0
            console.log('[ConversaAgente] Resultado geração:', { ok: img?.ok, provider: img?.provider, url: img?.url, bytesLen })
            if (img.ok && (img.url || img.bytes)) {
              try {
                let finalUrl = img.url || ''
                try {
                  let buffer = null
                  let contentType = ''
                  if (img.bytes) {
                    buffer = Buffer.isBuffer(img.bytes) ? img.bytes : Buffer.from(img.bytes)
                    contentType = (img.contentType || '').toLowerCase().split(';')[0].trim()
                  } else if (img.url) {
                    const fetchRes = await fetch(img.url)
                    if (fetchRes.ok) {
                      buffer = Buffer.from(await fetchRes.arrayBuffer())
                      contentType = (fetchRes.headers.get('content-type') || '').toLowerCase().split(';')[0].trim()
                    }
                  }

                  if (buffer) {
                    const closeUp = isCloseUpFromPoseType(poseType) || /\b(close-up|close up|macro lens|extreme close-up|extreme close up)\b/i.test(finalPrompt || '')
                    let captionForImage = ''
                    try {
                      const cap = await buildCaptionFromImage({ buffer, mimeType: contentType || 'image/png', personaName: persona?.name, poseType, closeUp, hint: photoMatch?.[1] })
                      if (cap?.ok && cap.caption) captionForImage = cap.caption
                    } catch {}
                    if (!captionForImage) {
                      captionForImage = buildCaptionFallback({ personaName: persona?.name, poseType, closeUp })
                    }
                    captionText = captionForImage

                    const ext =
                      contentType.includes('png')
                        ? 'png'
                        : contentType.includes('jpeg') || contentType.includes('jpg')
                          ? 'jpg'
                          : contentType.includes('webp')
                            ? 'webp'
                            : 'png'
                    const uploadContentType =
                      contentType === 'image/png' || contentType === 'image/jpeg' || contentType === 'image/webp'
                        ? contentType
                        : 'image/png'
                    
                    const envBucketVal = (process.env.SUPABASE_BUCKET_FOTOS_NUDES || 'crushzap/images/nudes-images').toString()
                    let bucketName = envBucketVal
                    let pathPrefix = ''
                    
                    if (envBucketVal.includes('/')) {
                      const parts = envBucketVal.split('/')
                      bucketName = parts[0]
                      pathPrefix = parts.slice(1).join('/') + '/'
                    }
                    
                    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
                    const filePath = `${pathPrefix}${conv.id}/${fileName}`
                    
                    const upload = await uploadImagemPublicaSupabase({
                      path: filePath,
                      bytes: buffer,
                      contentType: uploadContentType,
                      bucketName: bucketName
                    })
                    
                    if (upload.ok && upload.publicUrl) {
                      finalUrl = upload.publicUrl
                      console.log('[ConversaAgente] Upload Supabase sucesso:', finalUrl)
                    } else {
                      console.error('[ConversaAgente] Falha upload Supabase:', upload.error)
                    }
                  }
                } catch (uploadErr) {
                  console.error('[ConversaAgente] Erro no processo de upload:', uploadErr)
                }

                if (!finalUrl) {
                  throw new Error('Sem URL final para enviar no WhatsApp')
                }
                try {
                  const waRes = await ctx.sendWhatsAppImageLink(sendId, phone, finalUrl, captionText)
                  if (!waRes?.ok) {
                    console.error('[ConversaAgente] Falha ao enviar imagem no WhatsApp', { sendId, phone, error: waRes?.error })
                    throw new Error('whatsapp_send_failed')
                  }

                  console.log('[ConversaAgente] Imagem enviada via WhatsApp com legenda')

                  if (!isRecoveryFlow) {
                    try {
                      await consumeImageQuota(prisma, user.id)
                      console.log('[ConversaAgente] Cota consumida para user:', user.id)
                    } catch (quotaErr) {
                      console.error('[ConversaAgente] Falha ao consumir cota de imagem', { userId: user.id, error: quotaErr?.message || String(quotaErr) })
                    }
                  } else {
                    console.log('[ConversaAgente] Cota NÃO consumida (Recovery Flow)')
                  }

                  await prisma.message.create({
                    data: {
                      conversationId: conv.id,
                      userId: user.id,
                      personaId: persona.id,
                      direction: 'out',
                      type: 'image',
                      content: finalUrl,
                      status: 'sent'
                    }
                  })
                } catch (waError) {
                  console.error('[ConversaAgente] Erro ao enviar imagem no WhatsApp', { sendId, phone, error: waError?.message || String(waError) })
                  try {
                    await prisma.message.create({
                      data: {
                        conversationId: conv.id,
                        userId: user.id,
                        personaId: persona.id,
                        direction: 'out',
                        type: 'image',
                        content: finalUrl,
                        status: 'failed'
                      }
                    })
                  } catch {}

                  const txt = (captionText || '').toString().trim()
                  if (txt) {
                    const fallbackRes = await sendWhatsAppText(sendId, phone, txt)
                    const fallbackOk = !!fallbackRes?.ok
                    try {
                      await prisma.message.create({
                        data: {
                          conversationId: conv.id,
                          userId: user.id,
                          personaId: persona.id,
                          direction: 'out',
                          type: 'text',
                          content: txt,
                          status: fallbackOk ? 'sent' : 'failed'
                        }
                      })
                    } catch {}
                  }
                }

              } catch (e) { console.error('[Foto] Erro ao enviar/consumir', e) }
            } else {
              // Fallback em caso de erro na geração
              console.error('[Foto] Falha na geração, enviando texto de fallback')
              await sendWhatsAppText(sendId, phone, replyText)
            }
          }).catch(async (e) => {
            console.error('[Foto] Erro na geração (catch)', e)
            await sendWhatsAppText(sendId, phone, replyText)
          })
      }
    }

    if (shouldSendText) {
      const responseMode = (persona?.responseMode || 'text').toString()
      const inboundIsAudio = ctx.msgType === 'audio'
      const forceAudio = shouldForceAudioByRequest(text)
      const shouldReplyWithAudio =
        responseMode === 'audio'
        || ((responseMode === 'mirror' || responseMode === 'both') && inboundIsAudio)
        || forceAudio

      console.log('[Audio][Decision]', { conversationId: conv.id, personaId: persona.id, responseMode, inboundIsAudio, forceAudio, shouldReplyWithAudio })

      if (!shouldReplyWithAudio || !sendWhatsAppAudioLink) {
        await salvarSaidaEEnviar({
          prisma,
          store: 'message',
          conversationId: conv.id,
          userId: user.id,
          personaId: persona.id,
          content: replyText,
          enviar: () => sendWhatsAppText(sendId, phone, replyText),
        })
      } else {
        const hasSub = await hasActiveSubscription(prisma, user.id)
        if (!hasSub) {
          const upsellSpoken = [
            'Amor… eu queria muito te responder por áudio, mas essa função é só para assinantes VIP. Se você liberar o VIP agora, eu te mando áudios bem mais imersivos.',
            'Vida… áudio aqui é um mimo VIP. Quer que eu fale com você por áudio? Assina o VIP e eu te mando agora mesmo.',
            'Eu consigo te mandar áudio sim… mas essa função é exclusiva para VIP. Assina pra eu falar com você do jeitinho que você gosta.',
          ]
          const upsellText = [
            'Áudio é exclusivo para VIP. Quer liberar agora?',
            'Pra receber áudios, precisa ser VIP. Bora liberar?',
            'Áudio só no plano pago/VIP. Quer ver os planos?',
          ]
          const alreadySentAudio = await prisma.message.findFirst({
            where: { conversationId: conv.id, direction: 'out', type: 'audio' },
            select: { id: true },
          })
          if (!alreadySentAudio) {
            try {
              const engines = resolveTtsEngines()
              const voiceSampleItems = await voiceManager.getVoiceSampleItems(persona)
              const voiceSamples = voiceSampleItems.map(i => i.buffer).filter(Boolean)
              const moanSampleItems = moanOnly ? await voiceManager.getVoiceSampleItemsByName('gemendo') : []
              const moanSamples = moanSampleItems.map(i => i.buffer).filter(Boolean)
              const qwen3SamplePoolItems = voiceSampleItems
              const xttsSamplePoolItems = voiceSampleItems
              const qwen3VoicePromptBaseRaw = voiceManager.getQwen3VoicePrompt(persona)
              const qwen3VoicePromptBase = tuneQwen3VoicePromptForCues(qwen3VoicePromptBaseRaw, qwen3CuePrompt || userCuePrompt)
              const qwen3VoicePrompt = qwen3CuePrompt ? `${qwen3VoicePromptBase} ${qwen3CuePrompt}`.trim() : qwen3VoicePromptBase
              console.log('[Audio][Qwen3] cue', { personaId: persona.id, cueLen: (qwen3CuePrompt || '').length, cue: (qwen3CuePrompt || '').slice(0, 140) })
              const qwen3MaxSamples = Math.max(1, parseInt((process.env.QWEN3_MAX_SAMPLES || '2').toString(), 10) || 2)
              const qwen3SelectedItems = qwen3SamplePoolItems.slice().sort((a, b) => (a?.buffer?.length || 0) - (b?.buffer?.length || 0)).slice(0, qwen3MaxSamples)
              const qwen3Samples = qwen3SelectedItems.map(i => i.buffer).filter(Boolean)
              const xttsMaxSamples = Math.min(4, Math.max(1, parseInt((process.env.XTTS_MAX_SAMPLES || process.env.QWEN3_MAX_SAMPLES || '1').toString(), 10) || 1))
              const xttsSelectedItems = xttsSamplePoolItems.slice().sort((a, b) => (a?.buffer?.length || 0) - (b?.buffer?.length || 0)).slice(0, xttsMaxSamples)
              const xttsSamples = xttsSelectedItems.map(i => i.buffer).filter(Boolean)
              if (moanSampleItems.length) console.log('[Audio][Moan] samples', { personaId: persona.id, count: moanSampleItems.length, files: moanSampleItems.map(i => i.file).slice(0, 8) })
              console.log('[Audio][Voice] samples', { personaId: persona.id, count: voiceSampleItems.length, files: voiceSampleItems.map(i => i.file).slice(0, 8) })
              console.log('[Audio][Qwen3] samples_selected', { personaId: persona.id, count: qwen3Samples.length, files: qwen3SelectedItems.map(i => i.file).slice(0, 8) })
              console.log('[Audio][XTTS] samples_selected', { personaId: persona.id, count: xttsSamples.length, files: xttsSelectedItems.map(i => i.file).slice(0, 8) })
              const primaryEngine = engines[0] || 'qwen3'
              const spokenBase = getRandom(upsellSpoken)
              const spoken = normalizeTextForTTS(spokenBase)
              const splitConfig = { maxChars: AUDIO_MAX_CHARS_PER_CHUNK, maxChunks: AUDIO_MAX_CHUNKS }
              const chunks = splitTextForAudio(spoken, splitConfig)
              if (chunks.length) {
                console.log('[Audio][Trial] teaser_generate', { conversationId: conv.id, engines })
                const gen = await generateTtsAudio({ engines, chunks, xttsSamples, qwen3VoicePrompt, qwen3Samples })
                const audioUrl = await uploadAudio({ buffer: gen.buffer, contentType: gen.contentType })
                await salvarSaidaEEnviar({
                  prisma,
                  store: 'message',
                  conversationId: conv.id,
                  userId: user.id,
                  personaId: persona.id,
                  type: 'audio',
                  content: audioUrl,
                  metadata: { audioUrl, text: spoken, audioTeaser: true, engine: gen.engine },
                  enviar: () => sendWhatsAppAudioLink(sendId, phone, audioUrl),
                })
                console.log('[Audio][Trial] teaser_sent', { audioUrl, engine: gen.engine })
              }
            } catch (e) {
              console.error('[Audio][Trial] teaser_failed', { error: e?.message || String(e) })
            }
          }

          const t = getRandom(upsellText)
          await salvarSaidaEEnviar({
            prisma,
            store: 'message',
            conversationId: conv.id,
            userId: user.id,
            personaId: persona.id,
            content: t,
            enviar: () => sendWhatsAppButtons(sendId, phone, t, [
              { id: 'upgrade_conhecer_planos', title: 'VER PLANOS' },
              { id: 'upgrade_agora_nao', title: 'AGORA NÃO' },
            ]),
          })
          return true
        }

        const engines = resolveTtsEngines()
        const voiceSampleItems = await voiceManager.getVoiceSampleItems(persona)
        const voiceSamples = voiceSampleItems.map(i => i.buffer).filter(Boolean)
        const moanSampleItems = moanOnly ? await voiceManager.getVoiceSampleItemsByName('gemendo') : []
        const moanSamples = moanSampleItems.map(i => i.buffer).filter(Boolean)
        const qwen3SamplePoolItems = voiceSampleItems
        const xttsSamplePoolItems = voiceSampleItems
        const qwen3VoicePromptBaseRaw = voiceManager.getQwen3VoicePrompt(persona)
        const qwen3VoicePromptBase = tuneQwen3VoicePromptForCues(qwen3VoicePromptBaseRaw, qwen3CuePrompt || userCuePrompt)
        const qwen3VoicePrompt = qwen3CuePrompt ? `${qwen3VoicePromptBase} ${qwen3CuePrompt}`.trim() : qwen3VoicePromptBase
        const qwen3MaxSamples = Math.max(1, parseInt((process.env.QWEN3_MAX_SAMPLES || '2').toString(), 10) || 2)
        const qwen3SelectedItems = qwen3SamplePoolItems.slice().sort((a, b) => (a?.buffer?.length || 0) - (b?.buffer?.length || 0)).slice(0, qwen3MaxSamples)
        const qwen3Samples = qwen3SelectedItems.map(i => i.buffer).filter(Boolean)
        const xttsMaxSamples = Math.min(4, Math.max(1, parseInt((process.env.XTTS_MAX_SAMPLES || process.env.QWEN3_MAX_SAMPLES || '1').toString(), 10) || 1))
        const xttsSelectedItems = xttsSamplePoolItems.slice().sort((a, b) => (a?.buffer?.length || 0) - (b?.buffer?.length || 0)).slice(0, xttsMaxSamples)
        const xttsSamples = xttsSelectedItems.map(i => i.buffer).filter(Boolean)
        console.log('[Audio][Voice] samples', { personaId: persona.id, count: voiceSampleItems.length, files: voiceSampleItems.map(i => i.file).slice(0, 8) })
        if (moanSampleItems.length) console.log('[Audio][Moan] samples', { personaId: persona.id, count: moanSampleItems.length, files: moanSampleItems.map(i => i.file).slice(0, 8) })
        console.log('[Audio][Qwen3] samples_selected', { personaId: persona.id, count: qwen3Samples.length, files: qwen3SelectedItems.map(i => i.file).slice(0, 8) })
        console.log('[Audio][XTTS] samples_selected', { personaId: persona.id, count: xttsSamples.length, files: xttsSelectedItems.map(i => i.file).slice(0, 8) })
        console.log('[Audio][Qwen3] cue', { personaId: persona.id, cueLen: (qwen3CuePrompt || '').length, cue: (qwen3CuePrompt || '').slice(0, 140) })
        console.log('[Audio][Qwen3] prompt', { personaId: persona.id, len: (qwen3VoicePrompt || '').length, sampleCount: qwen3Samples.length })
        if (engines.includes('xtts') && !xttsSamples.length) {
          console.log('[Audio][TTS] xtts_sample_missing', { personaId: persona.id, voicePreset: (persona?.voicePreset || '').toString() })
        }
        if (engines.includes('qwen3') && !qwen3VoicePrompt) {
          console.log('[Audio][TTS] qwen3_voice_prompt_missing', { personaId: persona.id })
        }
        const spoken = normalizeTextForTTS(replyText, { preserveCueTags: passThroughCueTags })
        const splitConfig = { maxChars: AUDIO_MAX_CHARS_PER_CHUNK, maxChunks: AUDIO_MAX_CHUNKS }
        const chunks = splitTextForAudio(spoken, splitConfig)
        console.log('[Audio][TTS] will_generate', { personaId: persona.id, chunks: chunks.length, engines })
        if (!chunks.length) {
          await salvarSaidaEEnviar({
            prisma,
            store: 'message',
            conversationId: conv.id,
            userId: user.id,
            personaId: persona.id,
            content: spoken || replyText,
            enviar: () => sendWhatsAppText(sendId, phone, spoken || replyText),
          })
        } else {
          try {
            try { await sendWhatsAppChatState?.('audio') } catch {}
            if (moanOnly && moanSamples.length && engines.includes('qwen3')) {
              const ordered = moanSampleItems.slice().sort((a, b) => (a?.file || '').localeCompare(b?.file || '')).map(i => i.buffer).filter(Boolean)
              const stitched = await audioQwen3Modal.stitchWavs(ordered, { silenceBetweenMs: 180, tailMs: 250 })
              const audioUrl = await uploadAudio({ buffer: stitched.buffer, contentType: stitched.contentType })
              console.log('[Audio][TTS] uploaded', { url: audioUrl, bytes: stitched?.buffer?.length || 0, contentType: stitched?.contentType || '', engine: 'samples' })
              await salvarSaidaEEnviar({
                prisma,
                store: 'message',
                conversationId: conv.id,
                userId: user.id,
                personaId: persona.id,
                type: 'audio',
                content: audioUrl,
                metadata: { audioUrl, moanOnly: true, samples: moanSampleItems.map(i => i.file), engine: 'samples' },
                enviar: () => sendWhatsAppAudioLink(sendId, phone, audioUrl),
              })
              console.log('[Audio][TTS] sent', { url: audioUrl, parts: 1, engine: 'samples' })
              return true
            }
            const gen = await generateTtsAudio({ engines, chunks, xttsSamples, qwen3VoicePrompt, qwen3Samples })
            const audioUrl = await uploadAudio({ buffer: gen.buffer, contentType: gen.contentType })
            console.log('[Audio][TTS] uploaded', { url: audioUrl, bytes: gen?.buffer?.length || 0, contentType: gen?.contentType || '', engine: gen.engine })
            await salvarSaidaEEnviar({
              prisma,
              store: 'message',
              conversationId: conv.id,
              userId: user.id,
              personaId: persona.id,
              type: 'audio',
              content: audioUrl,
              metadata: chunks.length === 1 ? { audioUrl, text: chunks[0], engine: gen.engine } : { audioUrl, texts: chunks, merged: true, engine: gen.engine },
              enviar: () => sendWhatsAppAudioLink(sendId, phone, audioUrl),
            })
            console.log('[Audio][TTS] sent', { url: audioUrl, parts: chunks.length, engine: gen.engine })
          } catch (e) {
            console.error('[Audio][TTS] failed', { error: e?.message || String(e) })
            await salvarSaidaEEnviar({
              prisma,
              store: 'message',
              conversationId: conv.id,
              userId: user.id,
              personaId: persona.id,
              content: chunks.join(' '),
              enviar: () => sendWhatsAppText(sendId, phone, chunks.join(' ')),
            })
          }
        }
      }
    }
    
    // Gera resumo a cada 50 msgs
    const totalAfter = await prisma.message.count({ where: { conversationId: conv.id } })
    if (totalAfter % 50 === 0) {
      try { await generateAndStoreSummary(prisma, conv.id) } catch {}
    }

    return true
  }

  void typed
  return false
}
