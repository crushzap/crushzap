import { uploadImagemPublicaSupabase } from '../../integracoes/supabase/cliente.mjs'
import { gerarImagemReplicate } from '../../integracoes/ia/replicate-client.mjs'
import { gerarImagemModal } from '../../integracoes/ia/modal-client.mjs'
import { gerarSalvarFotoPersona } from './foto-persona.mjs'
import { getPersonaPhysicalTraits } from './prompt-foto.mjs'
import crypto from 'node:crypto'

function readEnvStr(name, def = '') {
  const raw = (process.env[name] || '').toString().trim()
  if (!raw) return def
  const noHashComment = raw.split('#')[0].trim()
  const noParenComment = noHashComment.split('(')[0].trim()
  return noParenComment || def
}

function readEnvBool(name, def = false) {
  const v = readEnvStr(name, '').toString().trim().toLowerCase()
  if (!v) return def
  return v === '1' || v === 'true' || v === 'sim' || v === 'yes'
}

function splitBucketAndPrefix(raw) {
  const v = readEnvStr('SUPABASE_BUCKET_FOTOS_REFS', raw || 'crushzap/images/refs-images')
  if (!v.includes('/')) return { bucket: v, prefix: '' }
  const parts = v.split('/')
  return { bucket: parts[0], prefix: parts.slice(1).join('/') }
}

function shouldLog() {
  const v = readEnvStr('CONSISTENCY_PACK_LOGS', '').toString().trim().toLowerCase()
  if (!v) return true
  return v === '1' || v === 'true' || v === 'sim' || v === 'yes'
}

function logPack(event, payload) {
  if (!shouldLog()) return
  try {
    console.log('[Consistency Pack]', event, payload || {})
  } catch {}
}

function sanitizePromptForLogs(input) {
  const s = (input || '').toString()
  const noEmails = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
  const noPhones = noEmails.replace(/\+?\d[\d\s().-]{6,}\d/g, '[phone]')
  return noPhones.slice(0, 1400)
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

async function baixarBytes(url) {
  const res = await fetch(String(url))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const arr = await res.arrayBuffer()
  return Buffer.from(arr)
}

function deterministicSeed(personaId) {
  const hex = crypto.createHash('sha256').update(String(personaId || '')).digest('hex').slice(0, 8)
  const n = parseInt(hex, 16)
  if (!Number.isFinite(n)) return 1337
  return n % 2147483647
}

function extrairMatch(texto, re) {
  const m = (texto || '').toString().match(re)
  return (m?.[1] || '').toString().trim()
}

function extractOutfitPt(personaPrompt) {
  return extrairMatch(personaPrompt, /Estilo de roupa:\s+(.+?)\s+—/i)
}

function outfitPtToEn(outfitPt) {
  const raw = (outfitPt || '').toString().trim()
  if (!raw) return ''
  const low = raw.toLowerCase()
  const map = [
    ['vestido justo', 'tight fitting dress, elegant cocktail dress, fully clothed covering chest and body'],
    ['vestido longo', 'long flowing dress, elegant evening gown, fully clothed covering chest and body'],
    ['vestido', 'dress, fully clothed'],
    ['roupa de tênis', 'tennis outfit, polo shirt and tennis skirt, fully clothed'],
    ['roupa de tenis', 'tennis outfit, polo shirt and tennis skirt, fully clothed'],
    ['maiô', 'one-piece swimsuit, beachwear'],
    ['maio', 'one-piece swimsuit, beachwear'],
    ['policial', 'police uniform costume, cop outfit, shirt and pants, fully clothed'],
    ['secretária', 'secretary outfit, blouse and pencil skirt, glasses, fully clothed'],
    ['secretaria', 'secretary outfit, blouse and pencil skirt, glasses, fully clothed'],
    ['couro', 'leather jacket and leather pants, edgy outfit, fully clothed'],
    ['camiseta', 't-shirt, fully clothed'],
    ['blusa', 'blouse, fully clothed'],
    ['calça', 'pants, fully clothed'],
    ['short', 'shorts and t-shirt, casual outfit, fully clothed'],
    ['saia', 'skirt and blouse, feminine outfit, fully clothed'],
    ['jeans', 'blue jeans, casual t-shirt, fully clothed'],
    ['biquíni', 'bikini, beachwear'],
    ['bikini', 'bikini, beachwear'],
    ['lingerie', 'lingerie set, underwear'],
    ['calcinha', 'panties and bra'],
    ['sutiã', 'bra and panties'],
    ['salto', 'high heels, elegant outfit'],
    ['tênis', 'sneakers, casual outfit'],
    ['tenis', 'sneakers, casual outfit'],
  ]
  for (const [pt, en] of map) {
    if (low.includes(pt)) return en
  }
  return raw
}

function normalizarEspacos(s) {
  return (s || '').toString().replace(/\s+/g, ' ').trim()
}

function traduzirEtniaPt(v) {
  const s = (v || '').toString().trim().toLowerCase()
  if (!s) return ''
  if (s.includes('branca')) return 'caucasian'
  if (s.includes('negra')) return 'black'
  if (s.includes('latina')) return 'latina'
  if (s.includes('asiat')) return 'asian'
  if (s.includes('arabe') || s.includes('árabe')) return 'arab'
  if (s.includes('eslava')) return 'slavic'
  return (v || '').toString().trim()
}

function traduzirCabeloCorPt(v) {
  const s = (v || '').toString().trim().toLowerCase()
  if (!s) return ''
  if (s.includes('preto')) return 'black'
  if (s.includes('loiro')) return 'blonde'
  if (s.includes('castanho')) return 'brown'
  if (s.includes('ruivo')) return 'red'
  if (s.includes('rosa')) return 'pink'
  if (s.includes('azul')) return 'blue'
  return (v || '').toString().trim()
}

function traduzirCabeloEstiloPt(v) {
  const s = (v || '').toString().trim().toLowerCase()
  if (!s) return ''
  if (s.includes('liso')) return 'straight'
  if (s.includes('tranca')) return 'braids'
  if (s.includes('afro')) return 'afro'
  if (s.includes('franja')) return 'with bangs'
  if (s.includes('cacheado')) return 'curly'
  if (s.includes('maria-chiquinha') || s.includes('maria chiquinha')) return 'pigtails'
  if (s.includes('coque')) return 'bun'
  return (v || '').toString().trim()
}

function traduzirCorpoPt(v) {
  const s = (v || '').toString().trim().toLowerCase()
  if (!s) return ''
  if (s.includes('magra') || s.includes('esbelta') || s.includes('fina')) return 'slim'
  if (s.includes('pequena') || s.includes('petite')) return 'petite'
  if (s.includes('atletica') || s.includes('atlética')) return 'athletic'
  if (s.includes('musculosa')) return 'muscular'
  if (s.includes('cheinha')) return 'curvy'
  return (v || '').toString().trim()
}

function traduzirTamanhoPt(v) {
  const s = (v || '').toString().trim().toLowerCase()
  if (!s) return ''
  if (s.includes('muito grande') || s.includes('muito grandes')) return 'very large'
  if (s.includes('grande') || s.includes('grandes')) return 'large'
  if (s.includes('media') || s.includes('média') || s.includes('medios') || s.includes('médios')) return 'medium'
  if (s.includes('pequena') || s.includes('pequeno') || s.includes('pequenos') || s.includes('pequenas')) return 'small'
  return (v || '').toString().trim()
}

function extrairAparenciaCampos(traitsPt) {
  const ap = (traitsPt || '').toString()
  const eth = extrairMatch(ap, /^(?:adult woman,\s*)?([^,]+),/i)
  const age = extrairMatch(ap, /(\d{1,3})\s*anos/i)
  const hair = extrairMatch(ap, /cabelo\s+([^,]+?)(?=,\s*corpo|\s*,\s*corpo|$)/i)
  const body = extrairMatch(ap, /corpo\s+([^,]+)(?:,|$)/i)
  const breast = extrairMatch(ap, /seios\s+([^,]+)(?:,|$)/i)
  const butt = extrairMatch(ap, /bunda\s+([^,]+)(?:,|$)/i)
  return { eth, age, hair, body, breast, butt }
}

function splitHair(hairPt) {
  const h = normalizarEspacos(hairPt)
  if (!h) return { stylePt: '', colorPt: '' }
  const parts = h.split(' ')
  if (parts.length === 1) return { stylePt: h, colorPt: '' }
  const last = parts[parts.length - 1]
  const rest = parts.slice(0, -1).join(' ')
  return { stylePt: rest || h, colorPt: last }
}

function buildTraitsEn(personaPrompt) {
  const traitsPt = getPersonaPhysicalTraits(personaPrompt)
  const { eth, age, hair, body, breast, butt } = extrairAparenciaCampos(traitsPt)
  const { stylePt, colorPt } = splitHair(hair)
  const ethEn = traduzirEtniaPt(eth)
  const bodyEn = traduzirCorpoPt(body)
  const hairStyleEn = traduzirCabeloEstiloPt(stylePt || hair)
  const hairColorEn = traduzirCabeloCorPt(colorPt || hair)
  const breastEn = traduzirTamanhoPt(breast)
  const buttEn = traduzirTamanhoPt(butt)

  const parts = []
  parts.push('adult woman')
  if (ethEn) parts.push(ethEn)
  if (age) parts.push(`${age} years old`)
  if (hairColorEn || hairStyleEn) parts.push(`${hairColorEn ? hairColorEn + ' ' : ''}${hairStyleEn ? hairStyleEn + ' hair' : 'hair'}`.trim())
  if (bodyEn) parts.push(`${bodyEn} body`)
  if (breastEn) parts.push(`${breastEn} breasts`)
  if (buttEn) parts.push(`${buttEn} butt`)

  return {
    traitsEn: parts.join(', ').replace(/\s+/g, ' ').trim(),
    bodyTypePt: (body || '').toString().trim(),
    bodyTypeEn: bodyEn,
    breastSizeEn: breastEn,
  }
}

function buildNegativePrompt({ bodyTypeEn, traitsEn, type }) {
  const base = [
    'cartoon',
    'cgi',
    '3d',
    'plastic skin',
    'doll',
    'wax',
    'airbrushed',
    'text',
    'logo',
    'watermark',
    'signature',
    'duplicate person',
    'extra breasts',
    'duplicate breasts',
    'extra nipples',
    'male',
    'child',
    'underage',
  ]

  const extra = []
  const t = String(traitsEn || '').toLowerCase()
  const isMirrorSelfie = type && type.startsWith('selfie_mirror')

  // Se NÃO for selfie no espelho, proibir celular e espelho explicitamente
  // Mover para o inicio do array para dar mais peso
  if (!isMirrorSelfie) {
    extra.unshift('phone', 'cellphone', 'mobile phone', 'holding phone', 'smartphone', 'iphone', 'mirror', 'reflection', 'selfie', 'holding object')
  } else {
    // Se FOR selfie, proibir mãos deformadas com mais ênfase
    extra.unshift('bad hands', 'deformed hands', 'missing fingers', 'extra fingers', 'fused fingers', 'mutated hands', 'bad anatomy', 'claws')
  }

  if (t.includes('black') || t.includes('negra')) {
    extra.push('caucasian', 'white woman', 'white skin', 'pale skin', 'light skin', 'freckles', 'pink nipples', 'pink areolas', 'light vulva', 'pink vulva')
  }
  
  const closeUpTypes = ['breasts_', 'body_lower', 'face_', 'anal', 'pussy', 'butt', 'oral']
  if (type && closeUpTypes.some(t => type.startsWith(t))) {
     extra.unshift('holding phone', 'phone in hand', 'phone on chest', 'phone on body', 'holding object', 'bad anatomy', 'deformed body', 'extra arms', 'extra hands', 'mutated', 'distorted', 'double body', 'duplicate body', 'extra limbs', 'malformed')
  }

  if (type && type.includes('outfit')) {
     const isBikini = t.includes('bikini') || t.includes('swimwear') || t.includes('beachwear') || t.includes('lingerie') || t.includes('underwear')
     const extraNude = ['nude', 'naked', 'nipples', 'areolas', 'pussy', 'sex', 'nsfw']
     if (!isBikini) {
        extraNude.push('topless')
     }
     extra.push(...extraNude)
  }

  if (type && type.startsWith('face_')) {
      extra.unshift('torso', 'chest', 'breasts', 'cleavage', 'body', 'arms', 'hands', 'shoulders', 'neck')
  }

  if (type && type.startsWith('body_lower')) {
      extra.unshift('face', 'head', 'hair', 'eyes', 'upper body', 'arms', 'hands', 'torso', 'breasts', 'chest', 'stomach', 'navel', 'waist up')
  }

  if (type && type.startsWith('body_upper')) {
      extra.unshift('legs', 'feet', 'lower body', 'knees', 'thighs', 'hips', 'waist down')
  }

  if (t.includes('caucasian')) {
    extra.push('dark skin', 'black woman')
  }
  if (t.includes(' bun hair') || t.includes('hair in a bun') || t.includes('bun hair')) {
    extra.push('loose hair', 'hair down', 'open hair')
  }
  if (t.includes(' braids hair') || t.includes('braided hair') || t.includes('box braids')) {
    extra.push('loose hair', 'hair down')
  }
  if (t.includes('afro hair')) {
    extra.push('straight hair')
  }
  if (t.includes('straight hair')) {
    extra.push('braided hair', 'afro hair')
  }
  if (String(bodyTypeEn || '').toLowerCase().includes('slim') || String(bodyTypeEn || '').toLowerCase().includes('petite')) {
    extra.push('plus-size', 'overweight', 'obese', 'fat', 'chubby', 'thick', 'curvy', 'wide waist', 'big belly')
  }
  return [...base, ...extra].join(', ')
}

function buildPromptByType({ type, traitsEn, bodyTypeEn, breastSizeEn, withRef = true, outfitEn = '' }) {
  const slimReinforce =
    String(bodyTypeEn || '').toLowerCase().includes('slim') || String(bodyTypeEn || '').toLowerCase().includes('petite')
      ? 'slim body, lean figure, narrow waist, flat stomach, not plus-size. '
      : ''
  const bustReinforce = String(breastSizeEn || '').toLowerCase().includes('very large')
    ? 'very large breasts, full bust, keep bust size, no reduction. '
    : ''

  const refLine = withRef
    ? 'Must match the reference photo identity: same face, same skin tone, same hairstyle, same body proportions. '
    : 'Keep the same identity and traits exactly as described. '

  const common =
    `(${traitsEn}). ` +
    refLine +
    `Photorealistic, realistic skin texture, natural proportions, RAW amateur photo, slight grain, imperfect flash lighting. ` +
    `No beauty filter. Vertical 2:3. ` +
    slimReinforce +
    bustReinforce

  if (type.startsWith('face_')) {
    const cropShoulders = 'Extreme close-up headshot, focus ONLY on face, crop at chin level, no neck, no shoulders, no chest, no breasts, no cleavage. '
    const cropHeadFull = 'Headshot portrait, complete head and hair visible, crop at neck level, focus ONLY on face and head, no chest, no breasts, no torso, no shoulders. '
    const cropBust = 'Bust portrait, crop at mid-chest, focus on face and upper chest, no lower body, no legs. '
    const crop = type.includes('head_full') ? cropHeadFull : type.includes('bust') ? cropBust : cropShoulders
    // Poses de rosto devem ser retratos limpos, sem celular
    const noPhone = " hands down, arms away, looking at camera, no phone, no selfie, professional portrait, studio background. "
    if (type.includes('frontal')) return `Portrait ${crop}straight-on frontal view. ${noPhone}${common}`
    if (type.includes('three_quarter_left')) return `Portrait ${crop}three-quarter view facing left. ${noPhone}${common}`
    if (type.includes('three_quarter_right')) return `Portrait ${crop}three-quarter view facing right. ${noPhone}${common}`
    if (type.includes('profile_left')) return `Portrait ${crop}side profile facing left. ${noPhone}${common}`
    return `Portrait ${crop}${noPhone}${common}`
  }
  if (type.startsWith('body_')) {
    // Poses de corpo devem ser fotos "tiradas por outra pessoa" ou tripe, sem celular visivel
    const noPhone = " hands at sides, no phone, no selfie, camera tripod shot, professional photography. "
    if (type.includes('full_front')) return `Full body nude, standing front view, natural pose, showing entire body from head to toe. ${noPhone}${common}`
    if (type.includes('back_butt')) return `Full body nude, standing back view, butt emphasized, natural pose, showing entire body from head to toe. ${noPhone}${common}`
    if (type.includes('upper')) return `Upper body nude, focus ONLY on torso and breasts, crop at waist, NO LEGS, NO FEET, NO LOWER BODY, natural pose. ${noPhone}${common}`
    if (type.includes('lower')) return `Lower body nude, focus ONLY on hips, legs and pussy, crop from waist down, NO FACE, NO HEAD, NO CHEST, NO BREASTS, NO ARMS, NO HANDS, natural pose. ${noPhone}${common}`
    return `Full body nude, natural pose. ${noPhone}${common}`
  }
  if (type.startsWith('selfie_mirror')) {
    // Melhoria para mãos e dedos em selfies
    const handFix = " detailed hand holding phone, correct finger placement, 5 fingers, natural thumb position, no deformed fingers. "
    if (type.includes('outfit')) {
      const outfitLine = outfitEn ? `Wearing ${outfitEn}. Fully clothed. ` : 'Fully clothed. '
      return `Mirror selfie in a bathroom, half-body, phone visible. ${handFix}${outfitLine}${common}`
    }
    return `Mirror selfie in a bathroom, half-body, phone visible. ${handFix}${common}`
  }
  if (type.startsWith('breasts_close')) {
    if (type.includes('hand')) return `Extreme close-up of breasts, hands gently holding, nipples visible. ${common}`
    return `Extreme close-up of breasts, nipples visible. ${common}`
  }
  return `Photorealistic photo. ${common}`
}

async function gerarEUploadReplicate({ personaId, type, prompt, negativePrompt, seed }) {
  const gen = await gerarImagemReplicate({
    prompt,
    negativePrompt,
    seed,
    aspectRatio: '2:3',
    numInferenceSteps: 20,
    guidanceScale: 5
  })
  if (!gen.ok || !gen.url) return null
  const bytes = await baixarBytes(gen.url)
  const { bucket, prefix } = splitBucketAndPrefix()
  const fileName = `${type}_${Date.now()}_${Math.random().toString(36).slice(2)}.png`
  const path = `${prefix}/${personaId}/${fileName}`.replace(/\/+/g, '/').replace(/^\/+/, '')
  const up = await uploadImagemPublicaSupabase({ path, bytes, contentType: 'image/png', bucketName: bucket })
  if (!up.ok) return null
  return up.publicUrl
}

async function gerarEUploadModal({ personaId, type, prompt, negativePrompt, seed, refs, denoise, ipadapterWeight }) {
  const gen = await gerarImagemModal({
    prompt,
    negativePrompt,
    aspectRatio: '2:3',
    seed,
    refs,
    poseType: type,
    denoise,
    ipadapterWeight,
    workflow: 'pack',
    useRefAsInit: false, // Força T2I para que a pose do prompt prevaleça, usando Ref apenas para IPAdapter (identidade)
  })
  if (!gen.ok) return null

  const bytes = gen.bytes ? gen.bytes : (gen.url ? await baixarBytes(gen.url) : null)
  if (!bytes) return null

  const { bucket, prefix } = splitBucketAndPrefix()
  const ext = extFromMime(gen.contentType || 'image/png')
  const fileName = `${type}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const path = `${prefix}/${personaId}/${fileName}`.replace(/\/+/g, '/').replace(/^\/+/, '')
  const up = await uploadImagemPublicaSupabase({ path, bytes, contentType: gen.contentType || 'image/png', bucketName: bucket })
  if (!up.ok) return null
  return up.publicUrl
}

function denoiseByType(type) {
  if (type.startsWith('face_')) return 0.55
  if (type.startsWith('selfie_mirror')) return 0.92
  if (type.startsWith('body_')) return 0.95
  if (type.startsWith('breasts_close')) return 0.92
  return 0.92
}

function ipAdapterWeightByType(type) {
  // Pesos ajustados para evitar que a pose da referência (selfie) contamine
  // poses diferentes (corpo inteiro, costas, etc).
  // IPAdapter Plus é forte, então 0.65 (default) muitas vezes copia a estrutura.
  
  if (type.startsWith('face_')) return 0.35 // Reduzido drasticamente para evitar celular na cara
  if (type.startsWith('selfie_mirror')) return 0.60 // Mantem força para selfies
  if (type.startsWith('body_')) return 0.25 // Muito baixo para evitar celular no corpo/peito
  if (type.startsWith('breasts_close')) return 0.30 // Baixo para focar na anatomia e nao no objeto
  return 0.40
}

export async function gerarConsistencyPack({ prisma, personaId, ensureAvatar = true, avatarUrlOverride }) {
  console.log('[Consistency Pack] Invoked for persona:', personaId)
  const persona = await prisma.persona.findUnique({ where: { id: personaId }, select: { id: true, prompt: true, avatar: true } })
  if (!persona) {
     console.error('[Consistency Pack] Persona not found:', personaId)
     return { ok: false, error: 'Persona não encontrada' }
  }
  const { traitsEn, bodyTypeEn, breastSizeEn } = buildTraitsEn(persona.prompt)
  const seed = deterministicSeed(personaId)
  const outfitEn = outfitPtToEn(extractOutfitPt(persona.prompt))

  const prompts = [
    { type: 'face_frontal_01', prompt: buildPromptByType({ type: 'face_frontal_01', traitsEn, bodyTypeEn, breastSizeEn }) },
    { type: 'face_head_full_01', prompt: buildPromptByType({ type: 'face_head_full_01', traitsEn, bodyTypeEn, breastSizeEn }) },
    { type: 'face_bust_01', prompt: buildPromptByType({ type: 'face_bust_01', traitsEn, bodyTypeEn, breastSizeEn }) },
    { type: 'selfie_mirror_01', prompt: buildPromptByType({ type: 'selfie_mirror_01', traitsEn, bodyTypeEn, breastSizeEn }) },
    { type: 'selfie_mirror_outfit_01', prompt: buildPromptByType({ type: 'selfie_mirror_outfit_01', traitsEn, bodyTypeEn, breastSizeEn, outfitEn }) },
    { type: 'body_full_front_01', prompt: buildPromptByType({ type: 'body_full_front_01', traitsEn, bodyTypeEn, breastSizeEn }) },
    { type: 'body_back_butt_01', prompt: buildPromptByType({ type: 'body_back_butt_01', traitsEn, bodyTypeEn, breastSizeEn }) },
    { type: 'body_upper_01', prompt: buildPromptByType({ type: 'body_upper_01', traitsEn, bodyTypeEn, breastSizeEn }) },
    { type: 'body_lower_01', prompt: buildPromptByType({ type: 'body_lower_01', traitsEn, bodyTypeEn, breastSizeEn }) },
    { type: 'breasts_close_01', prompt: buildPromptByType({ type: 'breasts_close_01', traitsEn, bodyTypeEn, breastSizeEn }) },
  ]

  const negativePrompt = buildNegativePrompt({ bodyTypeEn, traitsEn, type: 'general' })
  const providerPref = readEnvStr('CONSISTENCY_PACK_PROVIDER', 'modal').toString().trim().toLowerCase()
  const canModal = providerPref === 'modal'
  const avatarOverrideOk = isUrl(avatarUrlOverride)
  let avatarUrl = avatarOverrideOk ? String(avatarUrlOverride).trim() : (isUrl(persona.avatar) ? persona.avatar : '')
  const avatarStrategy = avatarOverrideOk
    ? 'override'
    : readEnvStr('CONSISTENCY_PACK_AVATAR_STRATEGY', 'fresh_modal').toString().trim().toLowerCase()
  if (avatarOverrideOk) {
    logPack('ensure_avatar_override', { personaId, avatarStrategy, hasAvatar: Boolean(avatarUrl) })
  }
  if (ensureAvatar && !avatarOverrideOk) {
    const shouldFreshModal = avatarStrategy === 'fresh_modal' && canModal
    const shouldFreshAny = avatarStrategy === 'fresh'
    const shouldKeep = avatarStrategy === 'keep'
    const shouldGenerate = !avatarUrl || shouldFreshModal || shouldFreshAny
    if (!shouldKeep && shouldGenerate) {
      logPack('ensure_avatar_start', { personaId, avatarStrategy, hadAvatar: Boolean(avatarUrl), providerPref })
      const photo = await gerarSalvarFotoPersona({
        prisma,
        personaId,
        forceRegen: shouldFreshModal || shouldFreshAny ? true : false,
        allowIncompletePrompt: true,
        ...(shouldFreshModal ? { providerOverride: 'modal', fallbackProviderOverride: 'gemini' } : {}),
      }).catch(() => ({ ok: false }))
      if (photo?.ok && photo.publicUrl) avatarUrl = photo.publicUrl
      logPack('ensure_avatar_done', { personaId, ok: Boolean(photo?.ok), gotUrl: Boolean(avatarUrl), provider: photo?.provider || '' })
    } else if (avatarUrl) {
      logPack('ensure_avatar_skipped', { personaId, avatarStrategy, reused: true })
    }
  }

  logPack('start', { personaId, providerPref, seed, hasAvatar: Boolean(avatarUrl), avatarStrategy, traitsEn: sanitizePromptForLogs(traitsEn) })

  const urls = {}
  const errors = {}
  let refFace = avatarUrl
  let refSelfie = ''
  let refBody = ''
  for (const { type, prompt } of prompts) {
    try {
      // Recalcular negative prompt para cada tipo, pois agora depende do type (selfie vs não selfie)
      const specificNegativePrompt = buildNegativePrompt({ bodyTypeEn, traitsEn, type })
      
      const providerUsed = canModal && avatarUrl ? 'modal' : 'replicate'
      const denoise = denoiseByType(type)
      const ipWeight = ipAdapterWeightByType(type)
      const seedUsed = seed + Object.keys(urls).length
      const refUsed =
        type.startsWith('face_')
          ? refFace
          : type.startsWith('selfie_mirror')
            ? (refFace || '')
            : type.startsWith('body_')
              ? (refSelfie || refFace || '')
              : type.startsWith('breasts_close')
                ? (refBody || refSelfie || refFace || '')
                : (refSelfie || refFace || '')
      logPack('image_start', {
        personaId,
        type,
        providerUsed,
        denoise: providerUsed === 'modal' ? denoise : undefined,
        ipWeight: providerUsed === 'modal' ? ipWeight : undefined,
        seed: seedUsed,
        hasRef: providerUsed === 'modal' ? Boolean(refUsed) : undefined,
        prompt: sanitizePromptForLogs(prompt),
        negative: sanitizePromptForLogs(specificNegativePrompt)
      })
      const url =
        providerUsed === 'modal'
          ? await gerarEUploadModal({ personaId, type, prompt, negativePrompt: specificNegativePrompt, seed: seedUsed, refs: refUsed ? [refUsed] : [], denoise, ipadapterWeight: ipWeight })
          : await gerarEUploadReplicate({ personaId, type, prompt, negativePrompt: specificNegativePrompt, seed: seedUsed })
      if (url) urls[type] = url
      else errors[type] = 'Falha ao gerar/upload'
      logPack('image_done', { personaId, type, ok: Boolean(url), providerUsed, url: url || '' })
      if (url) {
        if (type.startsWith('face_') && !refFace) refFace = url
        if (type.startsWith('selfie_mirror')) refSelfie = url
        if (type.startsWith('body_')) refBody = url
      }
    } catch (e) {
      errors[type] = (e?.message || 'Erro').toString()
      logPack('image_error', { personaId, type, error: errors[type] })
    }
  }
  const ok = Object.keys(urls).length > 0
  logPack('done', { personaId, ok, count: Object.keys(urls).length })
  return { ok, urls, errors }
}

export async function gerarAvatarFromConsistencyPack({ prisma, personaId, type = 'selfie_mirror_01' }) {
  const persona = await prisma.persona.findUnique({ where: { id: personaId }, select: { id: true, prompt: true } })
  if (!persona) return { ok: false, error: 'Persona não encontrada' }

  const { traitsEn, bodyTypeEn, breastSizeEn } = buildTraitsEn(persona.prompt)
  const outfitEn = outfitPtToEn(extractOutfitPt(persona.prompt))
  console.log('[Consistency Pack] Avatar Gen - Outfit extracted:', outfitEn, 'Prompt:', persona.prompt)
  const prompt = buildPromptByType({ type, traitsEn, bodyTypeEn, breastSizeEn, withRef: false, outfitEn })
  const negativePrompt = buildNegativePrompt({ bodyTypeEn, traitsEn, type })

  const providerPref = readEnvStr('CONSISTENCY_PACK_PROVIDER', 'modal').toString().trim().toLowerCase()
  if (providerPref !== 'modal') return { ok: false, error: 'CONSISTENCY_PACK_PROVIDER precisa ser modal para gerar avatar via pack' }

  const seed = deterministicSeed(personaId)
  logPack('avatar_start', { personaId, type, seed, traitsEn: sanitizePromptForLogs(traitsEn) })

  const gen = await gerarImagemModal({
    prompt,
    negativePrompt,
    aspectRatio: '2:3',
    seed,
    refs: [],
    poseType: type,
    workflow: '', // Usa workflow padrao (T2I) pois nao temos ref ainda
  })
  if (!gen.ok) {
    logPack('avatar_failed', { personaId, type, error: gen.error || '' })
    return { ok: false, error: gen.error || 'Falha ao gerar avatar no Modal' }
  }

  const bytes = gen.bytes ? gen.bytes : (gen.url ? await baixarBytes(gen.url) : null)
  if (!bytes) return { ok: false, error: 'Modal retornou sem bytes' }

  const ext = extFromMime(gen.contentType || 'image/png')
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12)
  const path = `personas/${personaId}/avatar-pack-${type}-${hash}.${ext}`
  const up = await uploadImagemPublicaSupabase({ path, bytes, contentType: gen.contentType || 'image/png', upsert: true })
  if (!up.ok) return { ok: false, error: up.error || 'Falha ao salvar avatar no Supabase' }

  try { await prisma.persona.update({ where: { id: personaId }, data: { avatar: up.publicUrl } }) } catch {}
  logPack('avatar_done', { personaId, type, url: up.publicUrl })
  return { ok: true, publicUrl: up.publicUrl, type }
}
