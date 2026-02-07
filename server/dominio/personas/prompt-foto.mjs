function extrairEntre(texto, inicio, fim) {
  const i = texto.indexOf(inicio)
  if (i < 0) return ''
  const rest = texto.slice(i + inicio.length)
  const j = fim ? rest.indexOf(fim) : -1
  return (j >= 0 ? rest.slice(0, j) : rest).trim()
}

function extrairMatch(texto, re) {
  const m = texto.match(re)
  return (m?.[1] || '').toString().trim()
}

function normalizeOutfit(outfit) {
  const o = (outfit || '').toString().trim()
  if (!o) return ''
  const low = o.toLowerCase()
  if (low.includes('biquíni') || low.includes('biquini')) return 'biquíni, praia e verão'
  return o
}

function extrairAtributosCorpo(appearancePt) {
  const ap = (appearancePt || '').toString()
  const breast = extrairMatch(ap, /seios\s+([^,]+)(?:,|$)/i)
  const butt = extrairMatch(ap, /bunda\s+([^,]+)(?:,|$)/i)
  const body = extrairMatch(ap, /corpo\s+([^,]+)(?:,|$)/i)
  return { breast, butt, body }
}

function traduzirTamanhoPt(v) {
  const s = (v || '').toString().trim().toLowerCase()
  if (!s) return ''
  if (s.includes('muito grande')) return 'very large (full bust)'
  if (s.includes('muito grandes')) return 'very large (full bust)'
  if (s.includes('grandes')) return 'large'
  if (s.includes('médios') || s.includes('medios') || s.includes('médias') || s.includes('medias')) return 'medium'
  if (s.includes('pequenos') || s.includes('pequenas')) return 'small'
  return (v || '').toString().trim()
}

function sanitizeAppearanceAge(appearancePt) {
  const s = (appearancePt || '').toString()
  return s.replace(/(\d{1,3})\s*anos/gi, (m, n) => {
    const age = Number(n)
    if (!Number.isFinite(age)) return m
    return age < 21 ? '21 anos' : m
  })
}

function inferIdentityReinforcement(appearancePt) {
  const low = (appearancePt || '').toString().toLowerCase()
  const positive = []
  const negative = []

  const isBlack = low.includes('negra') || low.includes('pele escura') || low.includes('black')
  const isWhite = low.includes('branca') || low.includes('pele clara') || low.includes('caucasian') || low.includes('white')
  const isLatina = low.includes('latina')
  const isAsian = low.includes('asiat') || low.includes('asian')
  const isArab = low.includes('arabe') || low.includes('arab')

  if (isBlack) {
    positive.push('black woman, dark brown skin')
    negative.push('caucasian', 'white woman', 'white skin', 'pale skin', 'light skin', 'freckles')
  } else if (isWhite) {
    positive.push('caucasian woman, light skin')
    negative.push('dark skin', 'black woman', 'brown skin')
  } else if (isLatina) {
    positive.push('latina woman')
  } else if (isAsian) {
    positive.push('asian woman')
  } else if (isArab) {
    positive.push('arab woman')
  }

  const wantsBlonde = low.includes('loiro') || low.includes('blonde')
  const wantsBrown = low.includes('castanho') || low.includes('brown hair')
  const wantsRed = low.includes('ruivo') || low.includes('red hair')
  const wantsBlackHair = low.includes('cabelo preto') || low.includes('black hair')
  const wantsPink = low.includes('rosa') || low.includes('pink')
  const wantsBlue = low.includes('azul') || low.includes('blue')

  const wantsBraids = low.includes('tranca') || low.includes('braid')
  const wantsBun = low.includes('coque') || low.includes('bun')
  const wantsCurly = low.includes('cachead') || low.includes('curly')
  const wantsAfro = low.includes('afro')
  const wantsStraight = low.includes('liso') || low.includes('straight')

  if (wantsBraids) {
    positive.push('braided hair (box braids)')
    negative.push('loose hair', 'wavy hair', 'curly hair')
  } else if (wantsBun) {
    positive.push('hair in a bun')
    negative.push('loose hair', 'hair down', 'open hair')
  } else if (wantsAfro) {
    positive.push('afro hair')
    negative.push('straight hair')
  } else if (wantsCurly) {
    positive.push('curly hair')
    negative.push('braided hair', 'straight hair')
  } else if (wantsStraight) {
    positive.push('straight hair')
    negative.push('braided hair', 'curly hair')
  }

  if (wantsBlackHair) {
    positive.push('black hair')
  } else if (wantsBlonde) {
    positive.push('blonde hair')
  } else if (wantsRed) {
    positive.push('red hair')
  } else if (wantsBrown) {
    positive.push('brown hair')
  } else if (wantsPink) {
    positive.push('pink hair')
  } else if (wantsBlue) {
    positive.push('blue hair')
  }

  const reinforce = positive.length
    ? `Identity constraints (PRIMARY, do not change even if other traits conflict): ${positive.join(', ')}. `
    : ''
  const avoid = negative.length ? `Avoid: ${Array.from(new Set(negative)).join(', ')}. ` : ''
  return { reinforce, avoid }
}

export function sanitizeForImageGen(text) {
  if (!text) return ''
  // Remove acentos
  const noAccents = text.normalize('NFD').replace(/[\u0300-\u036f]/g, "")
  // Remove caracteres que não sejam letras, números, pontuação básica e espaço
  const clean = noAccents.replace(/[^a-zA-Z0-9\s.,;?!()-]/g, '')
  return clean
}

export function getPersonaPhysicalTraits(personaPrompt) {
  const p = (personaPrompt || '').toString()
  
  // Tenta encontrar o bloco de aparência com regex flexível
  // Captura tudo após "Aparência:" (ou variações) até encontrar um ponto final seguido de espaço e letra maiúscula (início de nova frase),
  // ou até encontrar "Profissão", "Estilo", ou quebra de linha dupla.
  const regex = /(?:Aparência|Appearance|Físico|Corpo)[:\s]+([\s\S]+?)(?=(?:\.\s+[A-Z]|Profissão|Occupation|Estilo|Style|\n\n|$))/i
  const match = p.match(regex)
  
  let appearance = match ? match[1].trim() : ''

  // Fallback: se o regex falhar, tenta o método antigo mas com fallback para o resto do texto
  if (!appearance) {
     appearance = extrairEntre(p, 'Aparência:', '. Use detalhes')
  }
  
  // Se ainda vazio, tenta pegar tudo depois de Aparência até o fim (caso não tenha delimitador)
  if (!appearance) {
     appearance = extrairEntre(p, 'Aparência:', '')
  }

  const safeAppearance = appearance || 'attractive, feminine, natural'
  
  let traits = sanitizeAppearanceAge(safeAppearance)
  // Remove acentos para evitar problemas de tokenização/interpretação
  traits = traits.normalize('NFD').replace(/[\u0300-\u036f]/g, "")
  
  if (!traits.toLowerCase().includes('adult woman')) {
    traits = 'adult woman, ' + traits
  }
  
  // Limita tamanho para evitar poluição excessiva
  if (traits.length > 500) traits = traits.slice(0, 500)
    
  return traits
}

export function buildPromptFotoPersona({ personaName, personaPrompt }) {
  const name = (personaName || 'Crush').toString().trim()
  const p = (personaPrompt || '').toString()

  const personality =
    extrairMatch(p, /Personalidade escolhida\s*\(obrigat[óo]rio seguir\):\s*([^.]+)\./i) ||
    extrairMatch(p, /Sua personalidade é\s+(.+?)\s+—/i)
  const appearance = getPersonaPhysicalTraits(p)
  const outfit = extrairMatch(p, /Estilo de roupa:\s+(.+?)\s+—/i)

  const safePersonality = personality || 'carinhosa e envolvente'
  const safeAppearance = appearance || 'attractive, feminine, natural'
  const safeAppearanceClean = sanitizeAppearanceAge(safeAppearance)
  const safeOutfit = normalizeOutfit(outfit) || 'casual stylish outfit'
  const { reinforce: identityReinforce, avoid: identityAvoid } = inferIdentityReinforcement(safeAppearanceClean)
  const attrs = extrairAtributosCorpo(safeAppearanceClean)
  const breastSize = traduzirTamanhoPt(attrs.breast)
  const buttSize = traduzirTamanhoPt(attrs.butt)
  const bodyType = (attrs.body || '').toString().trim()

  const negBase = [
    'no text',
    'no logo',
    'no watermark',
    'no signature',
    'no extra fingers',
    'no extra hands',
    'no deformed hands',
    'no distorted face',
    'no duplicate person',
    'no child',
    'no underage',
    'no male'
  ]

  const negExtra = []
  const bLow = (breastSize || '').toString().toLowerCase()
  const buttLow = (buttSize || '').toString().toLowerCase()
  if (bLow.includes('large') || bLow.includes('full bust') || bLow.includes('very large')) {
    negExtra.push('no small breasts', 'no flat chest')
  }
  if (buttLow.includes('large') || buttLow.includes('very large')) {
    negExtra.push('no flat butt', 'no small butt')
  }
  const negative = [...negBase, ...negExtra].join(', ')

  const proportions =
    breastSize || buttSize || bodyType
      ? `Body proportions must match exactly: body type "${bodyType || 'as described'}"; breasts "${breastSize || 'as described'}"; butt "${buttSize || 'as described'}". `
      : ''

  const emphasisParts = []
  if (breastSize) emphasisParts.push(`Breasts must look ${breastSize}; keep natural shape; avoid reduction.`)
  if (buttSize) emphasisParts.push(`Butt must look ${buttSize}; keep natural shape; avoid reduction.`)
  if (bodyType) emphasisParts.push(`Body type must be "${bodyType}".`)
  const btLow = bodyType.toLowerCase()
  if (btLow.includes('magra') || btLow.includes('esbelta') || btLow.includes('fina') || btLow.includes('pequena')) {
    emphasisParts.push(`Body must be slim; avoid curvy or plus-size.`)
  }
  const emphasis = emphasisParts.length ? ` ${emphasisParts.join(' ')}` : ''

  return (
    `Photorealistic half-body portrait of a single adult woman (age 21+), looking at the camera. ` +
    identityReinforce +
    `Appearance descriptors (Portuguese, interpret literally): ${safeAppearanceClean}. ` +
    `Outfit and style (Portuguese, interpret literally): ${safeOutfit}. ` +
    proportions + emphasis +
    `High-end DSLR photo, 85mm lens, shallow depth of field, realistic skin texture, natural makeup, sharp focus on face, soft studio lighting, neutral blurred background. ` +
    `Framing: half-body portrait, vertical composition, aspect ratio 2:3. ` +
    `Constraints: ${negative}. ` +
    identityAvoid
  )
}

export function buildPromptFotoPersonaXai({ personaName, personaPrompt }) {
  const name = (personaName || 'Crush').toString().trim()
  const p = (personaPrompt || '').toString()
  const personality = extrairMatch(p, /Sua personalidade é\s+(.+?)\s+—/i)
  const appearance = getPersonaPhysicalTraits(p)
  const outfit = extrairMatch(p, /Estilo de roupa:\s+(.+?)\s+—/i)
  const safePersonality = personality || 'carinhosa e envolvente'
  const safeAppearance = appearance || 'adult woman, attractive, feminine, natural'
  const safeAppearanceClean = sanitizeAppearanceAge(safeAppearance)
  const safeOutfit = normalizeOutfit(outfit) || 'casual stylish outfit'
  const { reinforce: identityReinforce, avoid: identityAvoid } = inferIdentityReinforcement(safeAppearanceClean)
  const attrs = extrairAtributosCorpo(safeAppearanceClean)
  const breastSize = traduzirTamanhoPt(attrs.breast)
  const buttSize = traduzirTamanhoPt(attrs.butt)
  const bodyType = (attrs.body || '').toString().trim()

  const negBase = [
    'no text',
    'no logo',
    'no watermark',
    'no signature',
    'no extra fingers',
    'no extra hands',
    'no deformed hands',
    'no distorted face',
    'no duplicate person',
    'no child',
    'no underage',
    'no male',
    'no teen',
  ]
  const negExtra = []
  const bLow = (breastSize || '').toString().toLowerCase()
  const buttLow = (buttSize || '').toString().toLowerCase()
  if (bLow.includes('large') || bLow.includes('full bust') || bLow.includes('very large')) {
    negExtra.push('no small breasts', 'no flat chest')
  }
  if (buttLow.includes('large') || buttLow.includes('very large')) {
    negExtra.push('no flat butt', 'no small butt')
  }
  const negative = [...negBase, ...negExtra].join(', ')

  const proportions =
    breastSize || buttSize || bodyType
      ? `Proporções exatas: corpo "${bodyType || 'descrito'}"; seios "${breastSize || 'descritos'}"; bunda "${buttSize || 'descrita'}". `
      : ''

  const emphasisParts = []
  if (breastSize) emphasisParts.push(`Seios devem parecer ${breastSize}.`)
  if (buttSize) emphasisParts.push(`Bunda deve parecer ${buttSize}.`)
  if (bodyType) emphasisParts.push(`Tipo de corpo "${bodyType}".`)
  const btLow2 = bodyType.toLowerCase()
  if (btLow2.includes('magra') || btLow2.includes('esbelta') || btLow2.includes('fina') || btLow2.includes('pequena')) {
    emphasisParts.push(`Corpo precisa ser magro; evitar curvilíneo ou plus-size.`)
  }
  const emphasis = emphasisParts.length ? emphasisParts.join(' ') + ' ' : ''

  const base =
    `Photorealistic half-body portrait, adult woman (21+), vertical 2:3. ` +
    identityReinforce +
    `Aparência (pt-br, literal): ${safeAppearanceClean}. ` +
    `Roupa (pt-br, literal): ${safeOutfit}. ` +
    proportions +
    emphasis +
    `Foto realista, rosto nítido, luz suave, profundidade de campo rasa. ` +
    `Restrições: ${negative}. ` +
    identityAvoid

  if (base.length <= 1024) return base
  const noEmphasis = emphasis ? base.replace(emphasis, '') : base
  if (noEmphasis.length <= 1024) return noEmphasis
  const noProportions = proportions ? noEmphasis.replace(proportions, '') : noEmphasis
  if (noProportions.length <= 1024) return noProportions
  return noProportions.slice(0, 1024)
}
