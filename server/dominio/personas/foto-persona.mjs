import crypto from 'node:crypto'
import { uploadImagemPublicaSupabase } from '../../integracoes/supabase/cliente.mjs'
import { gerarImagemGemini } from '../../integracoes/ia/gemini-imagem.mjs'
import { gerarImagemXai } from '../../integracoes/ia/xai-imagem.mjs'
import { gerarImagemModal } from '../../integracoes/ia/modal-client.mjs'
import { buildPromptFotoPersona, buildPromptFotoPersonaXai } from './prompt-foto.mjs'

function sanitizePromptForLogs(input) {
  const s = (input || '').toString()
  const noEmails = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
  const noPhones = noEmails.replace(/\+?\d[\d\s().-]{6,}\d/g, '[phone]')
  return noPhones.slice(0, 1800)
}

function shouldLog() {
  const v = readEnvStr('PERSONA_FOTO_LOGS', '').toString().trim().toLowerCase()
  if (!v) return true
  return v === '1' || v === 'true' || v === 'sim' || v === 'yes'
}

function logFoto(event, payload) {
  if (!shouldLog()) return
  try {
    console.log('[Persona Foto]', event, payload || {})
  } catch {}
}

function isUrl(s) {
  const v = (s || '').toString().trim()
  return v.startsWith('http://') || v.startsWith('https://')
}

function extFromMime(mimeType) {
  const mt = (mimeType || '').toString().toLowerCase()
  if (mt.includes('png')) return 'png'
  if (mt.includes('webp')) return 'webp'
  if (mt.includes('jpeg') || mt.includes('jpg')) return 'jpg'
  return 'png'
}

function deterministicSeed(personaId) {
  const hex = crypto.createHash('sha256').update(String(personaId || '')).digest('hex').slice(0, 8)
  const n = parseInt(hex, 16)
  if (!Number.isFinite(n)) return 1337
  return n % 2147483647
}

function readEnvBool(name, def = false) {
  const v = readEnvStr(name, '').toString().trim().toLowerCase()
  if (!v) return def
  return v === '1' || v === 'true' || v === 'sim' || v === 'yes'
}

function readEnvStr(name, def = '') {
  const raw = (process.env[name] || '').toString().trim()
  if (!raw) return def
  const noHashComment = raw.split('#')[0].trim()
  const noParenComment = noHashComment.split('(')[0].trim()
  return noParenComment || def
}

function readEnvInt(name, def) {
  const v = Number((process.env[name] || '').toString().trim())
  return Number.isFinite(v) ? v : def
}

function isPersonaPromptCompleto(personaPrompt) {
  const p = (personaPrompt || '').toString()
  if (p.length < 80) return false
  if (!/Aparência\s*:/i.test(p)) return false
  return true
}

async function gerarImagemPorProvider({ provider, prompt, timeoutMs, seed }) {
  if (provider === 'xai') return gerarImagemXai({ prompt, timeoutMs })
  if (provider === 'modal') return gerarImagemModal({ prompt, negativePrompt: '', aspectRatio: '2:3', workflow: 'pack', seed })
  return gerarImagemGemini({ prompt, aspectRatio: '2:3', timeoutMs })
}

function normalizePersonaFotoProvider(raw, def) {
  const v = (raw || '').toString().trim().toLowerCase()
  if (v === 'xai') return 'xai'
  if (v === 'gemini') return 'gemini'
  if (v === 'modal') return 'modal'
  return def
}

export async function gerarSalvarFotoPersona({ prisma, personaId, forceRegen, providerOverride, fallbackProviderOverride, allowIncompletePrompt }) {
  const enabled = readEnvBool('PERSONA_FOTO_ENABLED', false)
  if (!enabled) return { ok: false, error: 'Foto da persona desabilitada' }

  const persona = await prisma.persona.findUnique({ where: { id: personaId }, select: { id: true, name: true, prompt: true, avatar: true } })
  if (!persona) return { ok: false, error: 'Persona não encontrada' }

  const allowIncomplete =
    typeof allowIncompletePrompt === 'boolean' ? allowIncompletePrompt : readEnvBool('PERSONA_FOTO_ALLOW_INCOMPLETE_PROMPT', false)
  if (!allowIncomplete && !isPersonaPromptCompleto(persona.prompt)) {
    logFoto('skipped_incomplete_prompt', { personaId: persona.id })
    return { ok: false, error: 'Prompt da persona incompleto para gerar foto' }
  }

  const forceRegenFinal = typeof forceRegen === 'boolean' ? forceRegen : readEnvBool('PERSONA_FOTO_FORCE_REGEN', false)
  if (!forceRegenFinal && isUrl(persona.avatar)) {
    logFoto('reused', { personaId: persona.id, url: persona.avatar })
    return { ok: true, publicUrl: persona.avatar, reused: true }
  }
  if (forceRegenFinal && isUrl(persona.avatar)) {
    logFoto('force_regen', { personaId: persona.id, previousUrl: persona.avatar })
  }

  const provider = normalizePersonaFotoProvider(providerOverride || readEnvStr('PERSONA_FOTO_PROVIDER', 'gemini'), 'gemini')
  const fallbackProvider = normalizePersonaFotoProvider(fallbackProviderOverride || readEnvStr('PERSONA_FOTO_FALLBACK_PROVIDER', 'xai'), 'xai')
  const timeoutMs = readEnvInt('PERSONA_FOTO_TIMEOUT_MS', 45000)
  const seed = deterministicSeed(persona.id)

  const promptGemini = buildPromptFotoPersona({ personaName: persona.name, personaPrompt: persona.prompt })
  const promptXai = buildPromptFotoPersonaXai({ personaName: persona.name, personaPrompt: persona.prompt })
  const promptPrimary = provider === 'xai' ? promptXai : promptGemini
  const promptFallback = fallbackProvider === 'xai' ? promptXai : promptGemini
  logFoto('start', { personaId: persona.id, provider, fallbackProvider, timeoutMs })
  logFoto('prompt', { personaId: persona.id, prompt: sanitizePromptForLogs(promptPrimary) })

  const primary = await gerarImagemPorProvider({ provider, prompt: promptPrimary, timeoutMs, seed })
  if (!primary.ok) logFoto('provider_error', { personaId: persona.id, provider, error: primary.error })
  const usedProvider = primary.ok ? provider : (provider === fallbackProvider ? provider : fallbackProvider)
  const result = primary.ok ? primary : (provider === fallbackProvider ? primary : await gerarImagemPorProvider({ provider: fallbackProvider, prompt: promptFallback, timeoutMs, seed }))
  if (!primary.ok && !result.ok) logFoto('provider_error', { personaId: persona.id, provider: fallbackProvider, error: result.error })
  if (!result.ok) {
    logFoto('failed', { personaId: persona.id, providerTried: usedProvider, error: result.error })
    return { ok: false, error: result.error || 'Falha ao gerar imagem' }
  }
  if (!primary.ok && result.ok) logFoto('fallback_used', { personaId: persona.id, from: provider, to: fallbackProvider })
  if (result.revisedPrompt) logFoto('revised_prompt', { personaId: persona.id, provider: usedProvider, revisedPrompt: sanitizePromptForLogs(result.revisedPrompt) })
  logFoto('generated', { personaId: persona.id, provider: usedProvider, model: result.model, mimeType: result.mimeType, bytes: result.bytes?.length })

  const ext = extFromMime(result.mimeType)
  const hash = crypto.createHash('sha256').update(result.bytes).digest('hex').slice(0, 12)
  const path = `personas/${persona.id}/foto-perfil-2x3-${hash}.${ext}`

  const up = await uploadImagemPublicaSupabase({ path, bytes: result.bytes, contentType: result.mimeType, upsert: true })
  if (!up.ok) {
    logFoto('upload_failed', { personaId: persona.id, path, error: up.error })
    return { ok: false, error: up.error || 'Falha ao salvar no Supabase' }
  }
  logFoto('uploaded', { personaId: persona.id, path: up.path, publicUrl: up.publicUrl })

  try {
    await prisma.persona.update({ where: { id: persona.id }, data: { avatar: up.publicUrl } })
    logFoto('saved', { personaId: persona.id })
  } catch (e) {
    logFoto('save_failed', { personaId: persona.id, error: (e?.message || 'Falha ao salvar no Postgres').toString() })
  }

  return { ok: true, publicUrl: up.publicUrl, reused: false, provider: usedProvider }
}
