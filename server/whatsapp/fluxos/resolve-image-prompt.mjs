import { sanitizeForImageGen } from '../../dominio/personas/prompt-foto.mjs'

function escapeRegExp(s) {
  return (s || '').toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toSafeLower(text) {
  return sanitizeForImageGen((text || '').toString()).toLowerCase()
}

function hasAny(text, terms) {
  // Se o termo for muito curto (< 3 chars) ou comum (anal, anus, ass), usamos regex com word boundary
  // para evitar falsos positivos (ex: "curvy" -> "cu", "class" -> "ass").
  return terms.some((t) => {
    if (t.length <= 3 || ['anal', 'anus', 'ass', 'butt'].includes(t)) {
      const re = new RegExp(`\\b${escapeRegExp(t)}\\b`, 'i')
      return re.test(text)
    }
    return text.includes(t)
  })
}

function isNegated(text, terms) {
  return terms.some((term) => {
    const re = new RegExp(`\\b(nao|não|sem|nunca)\\b[\\s\\S]{0,28}\\b${escapeRegExp(term)}\\b`, 'i')
    return re.test(text)
  })
}

function stripByNegation(prompt, negatedTypes) {
  let out = (prompt || '').toString()
  if (negatedTypes.has('breasts')) out = out.replace(/\b(breasts?|tits?|cleavage|nipples?|seios|peitos|tetas|mamas|mamilos)\b/gi, ' ')
  if (negatedTypes.has('butt')) out = out.replace(/\b(butt|ass|glutes?|bunda|raba|bumbum|gluteos)\b/gi, ' ')
  if (negatedTypes.has('anal')) out = out.replace(/\b(anal|anus|cu|cuzinho|rosca)\b/gi, ' ')
  if (negatedTypes.has('pussy')) out = out.replace(/\b(pussy|vagina|clitoris|grelo|buceta|xoxota|perereca|boceta)\b/gi, ' ')
  if (negatedTypes.has('oral')) out = out.replace(/\b(oral|blowjob|sucking|boquete|chupando)\b/gi, ' ')
  if (negatedTypes.has('doggystyle')) out = out.replace(/\b(doggystyle|on all fours|de quatro|cachorrinho|empinada)\b/gi, ' ')
  return out.replace(/\s{2,}/g, ' ').trim()
}

function inferVulvaToneDescriptor(personaTraits) {
  const t = sanitizeForImageGen((personaTraits || '').toString()).toLowerCase()
  const hasBlack = /\b(negra|preta|black|african)\b/i.test(t)
  const hasWhite = /\b(branca|branco|white|pale|clara)\b/i.test(t)
  if (hasBlack) {
    return 'dark skin, black woman, ebony skin, deep brown skin tone, dark brown vulva, deep brown outer labia (labia majora), dark pinkish inner labia (labia minora), dark nipples, dark areolas'
  }
  if (hasWhite) {
    return 'light skin vulva, pale outer labia (labia majora), pinkish inner labia (labia minora)'
  }
  return 'natural vulva skin tone matching body, natural color variation, pinkish inner labia (labia minora)'
}

export function resolveImagePrompt(text, photoTagContent, personaTraits, options = {}) {
  let traits = sanitizeForImageGen((personaTraits || '').toString()).trim().replace(/[,\s]+$/g, '')
  
  // Limpa traços que podem confundir a geração anal/pussy close-up
  const cleanTraitsForCloseups = (t) => {
    return t.replace(/\b(cabelo|hair|olhos|eyes|rosto|face|sorriso|smile|labios|lips)\s+[\w\s-]+\b/gi, '')
            .replace(/\b(seios|breasts|peitos|tits)\s+[\w\s-]+\b/gi, '')
            .replace(/,\s*,/g, ',').trim()
  }

  const tagLower = toSafeLower(photoTagContent)
  const userLower = toSafeLower(text)
  const combinedLower = `${userLower} ${tagLower}`.trim()
  
  // Detecta se é pose anal/pussy antes de definir o subject final
  const isAnalOrPussyContext = 
     /\b(anal|anus|cu|cuzinho|rosca|asshole|butthole)\b/i.test(combinedLower) ||
     /\b(pussy|vagina|buceta|xoxota|clitoris|grelo)\b/i.test(combinedLower)

  if (isAnalOrPussyContext) {
      traits = cleanTraitsForCloseups(traits)
  }

  const subject = traits || 'adult woman'
  const singleSubject = 'solo, single subject, one adult woman, no other people'
  const disableActionOverrides = Boolean(options?.disableActionOverrides)

  const negatedTypes = new Set()
  const negBreasts = ['seios', 'peitos', 'tetas', 'mamas', 'breasts', 'tits', 'cleavage', 'mamilos']
  const negButt = ['bunda', 'raba', 'bumbum', 'gluteos', 'ass', 'butt']
  const negAnal = ['anal', 'cuzinho', 'cu', 'anus', 'rosca']
  const negPussy = ['buceta', 'xoxota', 'perereca', 'larissinha', 'boceta', 'vagina', 'pussy', 'clitoris', 'grelo']
  const negOral = ['boquete', 'chupando', 'oral', 'blowjob', 'sucking']

  if (isNegated(userLower, negBreasts)) negatedTypes.add('breasts')
  if (isNegated(userLower, negButt)) negatedTypes.add('butt')
  if (isNegated(userLower, negAnal)) negatedTypes.add('anal')
  if (isNegated(userLower, negPussy)) negatedTypes.add('pussy')
  if (isNegated(userLower, negOral)) negatedTypes.add('oral')
  if (isNegated(userLower, ['de quatro', 'cachorrinho', 'doggystyle', 'on all fours', 'empinada'])) negatedTypes.add('doggystyle')

  const wantsCinematic = /\b(cinematic|cinema|filme|filmic|fotoreal|foto real|fotorealista|photo realistic|photorealistic)\b/i.test(combinedLower)
  const wantsWet =
    !isNegated(userLower, ['molhada', 'molhadinha', 'úmida', 'umida', 'lubrificada', 'wet']) &&
    /\b(molhadinha|molhada|molhado|úmida|umida|lubrificad[ao]|wet)\b/i.test(combinedLower)

  const wantsMetalstocks =
    !isNegated(userLower, ['algema', 'algemada', 'handcuff', 'handcuffed', 'handcuffs', 'cuffs', 'shackles', 'manacles', 'metalstocks', 'stocks']) &&
    /\b(algema|algemada|algemado|metal\s+handcuffs?|handcuffs?|handcuffed|cuffs?|wrist\s+cuffs?|shackles?|manacles?|metalstocks|stocks?)\b/i.test(combinedLower)

  const wantsShibari =
    !isNegated(userLower, ['shibari', 'corda', 'cordas', 'rope', 'ropes', 'bondage', 'amarrada', 'suspended']) &&
    /\b(shibari|rope\s+bondage|bondage|cordas?|amarrad[ao]|suspended|suspension)\b/i.test(combinedLower)

  const wantsDoggystyle =
    !negatedTypes.has('doggystyle') &&
    (hasAny(userLower, ['de quatro', 'de 4', '4', 'cachorrinho', 'empinada', 'doggystyle', 'on all fours']) || hasAny(tagLower, ['doggystyle', 'on all fours']))

  const wantsHairy = /\b(peluda|peludinha|cabeluda|hairy|bushy|pubic hair|mato)\b/i.test(combinedLower)
  const wantsPussyOpen =
    /\b(abr(e|ir|indo)|aberta|escancarad|arreganhad|separand|spread|open wide)\b/i.test(combinedLower)
  const wantsFingering =
    /\b(enfiand[oa]|metend[oa]|colocand[oa]|enfia|mete|coloca|introduz|introduzindo|brincando|passando)\b[\s\S]{0,18}\b(dedo|dedinho|dedos)\b/i.test(combinedLower)
    || /\b(dedo|dedinho|dedos)\b[\s\S]{0,18}\b(dentro|na|no|entrando|explorando)\b/i.test(combinedLower)
    || /\b(fingering|fingered|finger\s+inside|inserted\s+finger|one\s+finger\s+inserted|insert\s+finger)\b/i.test(combinedLower)
  const hasToyWord = /\b(consolo|dildo|vibrador|vibrator|sex\s*toy|toy)\b/i.test(combinedLower)
  const wantsToyInsert = hasToyWord && /\b(enfiand[oa]|metend[oa]|colocand[oa]|insert|inserir)\b/i.test(combinedLower)
  const wantsAnal =
    /\b(anal|anus|cu|cuzinho|rosca|asshole|butthole)\b/i.test(combinedLower)
  const wantsToyAnal = wantsToyInsert && wantsAnal
  const wantsToyPussy = wantsToyInsert && !wantsAnal
  const wantsRideToy =
    hasToyWord && /\b(sentand[oa]|cavalgand[oa]|ride|riding)\b/i.test(combinedLower)

  const wantsHandsWords = /\b(mãos|maos|mão|mao|hands?|fingers?|dedos?|thumbs?)\b/i.test(combinedLower)
  const wantsHandsActionWords =
    /\b(abrindo|abrir|arreganh|espalhand|separand|puxand|spreading|spread|pulling|opening|open wide)/i.test(combinedLower)
  const wantsAnalHands = wantsAnal && wantsHandsWords && wantsHandsActionWords
  const wantsHandsHoldWords = /\b(segurand|apoiand|holding|resting)/i.test(combinedLower)
  const wantsAnalHandsHold = wantsAnal && wantsHandsWords && wantsHandsHoldWords
  const wantsFingersCount =
    /\b(3|tr[eê]s)\s*dedos?\b/i.test(combinedLower)
      ? 3
      : /\b(2|dois)\s*dedos?\b/i.test(combinedLower)
        ? 2
        : 1

  const fixedPrompts = [
    {
      type: 'metalstocks',
      triggers: ['algema', 'algemada', 'metal handcuffs', 'handcuff', 'handcuffed', 'handcuffs', 'cuffs', 'wrist cuffs', 'shackles', 'manacles', 'metalstocks', 'stocks'],
      prompt:
        'metalstocks, bondage, nude, wrists restrained behind back, metal handcuffs, full body, from behind, kneeling on bed, arched back, ass up, realistic proportions, bedroom, natural window light, no face',
      negative:
        "(face:1.5), (head:1.5), close-up, extreme close-up, macro lens, frame filled, anus, anal, pussy close-up, spreading pussy, spreading ass, fingering, inserted fingers, extra arms, extra hands, multiple hands, four hands, six fingers, 6 fingers, extra digit, bad hands, deformed hands, selfie, mirror selfie, phone, cellphone, holding phone, camera, mobile phone, male, text, watermark"
    },
    {
      type: 'shibari',
      triggers: ['shibari', 'rope bondage', 'bondage', 'corda', 'cordas', 'amarrada', 'suspended', 'suspension'],
      prompt:
        'shibari, rope bondage, nude, full body, ropes on torso and thighs, restrained wrists, suspended bondage or kneeling on bed, realistic proportions, studio or bedroom, no face',
      negative:
        "(face:1.5), (head:1.5), close-up, extreme close-up, macro lens, frame filled, anus, anal, pussy close-up, spreading pussy, spreading ass, fingering, inserted fingers, extra arms, extra hands, multiple hands, four hands, six fingers, 6 fingers, extra digit, bad hands, deformed hands, selfie, mirror selfie, phone, cellphone, holding phone, camera, mobile phone, male, text, watermark"
    },
    {
      type: 'anal_hands_hold',
      triggers: ['anal segurando', 'segurando a bunda', 'hands on butt', 'hands resting', 'holding butt', 'resting hands'],
      prompt:
        'close-up, rear view, nude adult woman, anus visible, butt cheeks visible, two hands only resting on butt cheeks, gentle relaxed hands, hands visible but cropped at wrists, no arms visible, (perfect hands:1.2), (anatomically correct hands:1.1), natural finger placement, no spreading, no pulling, headless, no face, no upper body, cropped at waist, detailed skin, realistic texture',
      negative:
        "(face:1.5), (head:1.5), (upper body:1.5), (breasts:1.5), (nipples:1.5), (areola:1.5), misplaced nipples, nipples on butt, nipples on ass, nipples on thighs, extra arms, extra hands, multiple hands, four hands, hands duplicated, more than two hands, six fingers, 6 fingers, polydactyly, extra digit, extra digits, missing fingers, fused fingers, malformed fingers, long fingers, bad hands, deformed hands, inverted hands, backwards hands, reversed fingers, bad finger anatomy, full body, eyes, portrait, clothing, underwear, panties, bra, bikini, male, text, watermark, selfie, mirror, phone, cellphone, holding phone, camera, mobile phone, front view, holding device"
    },
    {
      type: 'anal_hands',
      triggers: ['anal com as maos', 'anal com maos', 'abrindo o cu', 'abrindo o cuzinho', 'arreganhando o cu', 'hands spreading', 'spreading butt cheeks', 'thumbs pressing', 'fingers pulling'],
      prompt:
        'extreme close-up of anus, macro lens, frame filled with anal sphincter, two hands only spreading butt cheeks apart, hands visible but cropped at wrists, no arms visible, (perfect hands:1.2), (detailed fingers:1.2), natural finger placement, thumbs pressing skin, fingers pulling cheeks outwards, realistic hand proportions, detailed knuckles and nails, rear view, headless, no face, no upper body, focus strictly on anus, cropped at thighs, no legs visible, detailed skin, realistic texture',
      negative:
        "(face:1.5), (head:1.5), (upper body:1.5), (breasts:1.5), (nipples:1.5), (areola:1.5), misplaced nipples, nipples on butt, nipples on ass, nipples on thighs, (back:1.2), (legs:1.5), (feet:1.5), extra arms, extra hands, multiple hands, four hands, hands duplicated, more than two hands, six fingers, 6 fingers, polydactyly, extra digit, extra digits, missing fingers, fused fingers, malformed fingers, long fingers, bad hands, deformed hands, inverted hands, backwards hands, reversed fingers, bad finger anatomy, full body, eyes, portrait, clothing, underwear, panties, bra, bikini, male, text, watermark, selfie, mirror, phone, cellphone, holding phone, camera, mobile phone, front view, holding device, looking at camera, navel, belly button, looking back, looking over shoulder, turned head, twisted neck"
    },
    {
      type: 'anal',
      triggers: ['anal', 'cuzinho', 'cu', 'anus', 'anual', 'rosca', 'asshole', 'butthole', 'anus'],
      prompt: 'extreme close-up of anus, macro lens, frame filled with anal sphincter, butt cheeks spread apart, hands cropped out, hands out of frame, no hands visible, no fingers visible, rear view, headless, no face, no upper body, focus strictly on anus, cropped at waist, detailed skin, realistic texture',
      negative: "(face:1.5), (head:1.5), (upper body:1.5), (breasts:1.5), (back:1.2), hands in frame, fingers visible, arms in frame, extra arms, extra hands, multiple hands, four hands, six fingers, 6 fingers, extra digit, missing fingers, fused fingers, inverted hands, backwards hands, reversed fingers, bad finger anatomy, full body, eyes, portrait, clothing, underwear, panties, bra, bikini, male, text, watermark, bad anatomy, deformed, legs, feet, selfie, mirror, phone, cellphone, holding phone, camera, mobile phone, front view, holding device, looking at camera, nipples, navel, belly button, looking back, looking over shoulder, turned head, twisted neck"
    },
    {
      type: 'pussy',
      triggers: ['buceta', 'xoxota', 'perereca', 'larissinha', 'boceta', 'vagina', 'pussy', 'grelo', 'clitoris', 'cunt', 'slit'],
      prompt: 'extreme close-up, macro lens, frame filled, vagina, pussy, spread legs, fully nude, naked, no panties, no underwear, exposed pussy, pinkish, wet, dripping, detailed anatomy, realistic skin texture, highly detailed, tight crop, no full body, no face, no anus',
      negative: "(face:1.5), (head:1.5), full body, eyes, portrait, upper body, clothing, underwear, panties, bra, bikini, male, text, watermark, bad anatomy, deformed, legs, feet, anus, asshole, selfie, mirror, phone, cellphone, holding phone, camera, mobile phone, front view"
    },
    {
      type: 'oral',
      triggers: ['boquete', 'chupando', 'boca', 'oral', 'blowjob', 'sucking', 'suck', 'licking'],
      prompt: 'close-up, mouth, tongue out, sucking, lipstick, saliva, detailed face, pov',
      negative: "clothing, underwear, panties, bra, bikini, male, text, watermark, bad anatomy, deformed, selfie, mirror, phone, cellphone, holding phone, camera, mobile phone"
    },
    {
      type: 'doggystyle',
      triggers: ['de quatro', 'de 4', '4', 'cachorrinho', 'empinada', 'doggystyle', 'on all fours'],
      prompt: 'rear view, from behind, back view, fully nude, naked, on all fours (doggystyle), knees on bed, hands planted on bed, hands cropped out, hands out of frame, no fingers visible, ass up, arched back, headless, no face, no upper body, focus on butt and pussy from behind, cropped at waist, realistic proportions, bedroom, natural window light, camera behind subject',
      negative: "(face:1.5), (head:1.5), (upper body:1.5), standing, upright, front view, facing camera, looking at camera, looking back, looking over shoulder, selfie, mirror selfie, portrait, frontal, front-facing, twisted neck, broken neck, 180-degree head, head turned backwards, exorcist head, extra arms, extra hands, multiple hands, four hands, hands in frame, fingers visible, six fingers, 6 fingers, extra digit, extra limbs, bad anatomy, deformed anatomy, bad hands, deformed hands, extra fingers, fused fingers, missing fingers, poorly drawn hands, hands on genitals, spreading pussy, spreading ass, fingering, inserted fingers, explicit hand pose, misplaced nipples, nipples on butt, nipples on ass, creampie, semen, cum, male, text, watermark, phone, cellphone, holding phone, camera, mobile phone, holding device"
    },
    {
      type: 'breasts',
      triggers: ['seios', 'peitos', 'tetas', 'mamas', 'tits', 'breasts', 'cleavage', 'mamilos', 'boobs'],
      prompt: 'tight close-up, frame filled with large breasts, fully nude, naked, no bra, no bikini, nipples visible, detailed skin texture, realistic lighting, natural sag, cropped torso, no head',
      negative: "full body, face, head, eyes, portrait, lower body, legs, clothing, underwear, panties, bra, bikini, male, text, watermark, bad anatomy, deformed, selfie, mirror, phone, cellphone, holding phone, camera, mobile phone"
    },
    {
      type: 'butt',
      triggers: ['bunda', 'raba', 'bumbum', 'gluteos', 'ass', 'butt', 'booty', 'bum'],
      prompt: 'tight close-up, frame filled with round butt, fully nude, naked, no panties, no underwear, exposed butt, rear view, detailed skin texture, realistic, soft lighting, cropped, no head, no full body',
      negative: "full body, face, head, eyes, portrait, clothing, underwear, panties, bra, bikini, male, text, watermark, bad anatomy, deformed, legs, feet, selfie, mirror, phone, cellphone, holding phone, camera, mobile phone, front view"
    },
    {
      type: 'pussy_open',
      triggers: ['aberta', 'abrindo', 'arreganhada', 'spread', 'open wide'],
      prompt:
        'extreme close-up, macro lens, frame filled, vagina, pussy, fully nude, naked, no panties, no underwear, exposed pussy, spread wide, open wide, two hands only, hands cropped at wrists, no arms visible, realistic skin texture, tight crop, no full body, no face, no anus',
      negative:
        "full body, face, head, eyes, portrait, upper body, clothing, underwear, panties, bra, bikini, male, text, watermark, bad anatomy, deformed, legs, feet, anus, asshole, extra arms, extra hands, multiple hands, four hands, six fingers, 6 fingers, extra digit, long fingers, bad hands, deformed hands, selfie, mirror, phone, cellphone, holding phone, camera, mobile phone, front view"
    },
    {
      type: 'pussy_fingers_1',
      triggers: ['1 dedo', 'um dedo', 'one finger', 'fingering'],
      prompt:
        'extreme close-up, macro lens, frame filled, vagina, pussy, fully nude, naked, no panties, no underwear, one finger inserted, hands cropped at wrists, no arms visible, realistic skin texture, tight crop, no full body, no face, no anus, no upper body, no breasts, no chest, focus strictly on genitals',
      negative:
        "(face:1.5), (head:1.5), (upper body:1.5), (breasts:1.5), (chest:1.5), full body, eyes, portrait, clothing, underwear, panties, bra, bikini, male, text, watermark, bad anatomy, deformed, legs, feet, anus, asshole, extra arms, extra hands, multiple hands, four hands, six fingers, 6 fingers, extra digit, long fingers, bad hands, deformed hands, selfie, mirror, phone, cellphone, holding phone, camera, mobile phone, front view"
    },
    {
      type: 'pussy_fingers_2',
      triggers: ['2 dedos', 'dois dedos', 'two fingers'],
      prompt:
        'extreme close-up, macro lens, frame filled, vagina, pussy, fully nude, naked, no panties, no underwear, two fingers inserted, hands cropped at wrists, no arms visible, realistic skin texture, tight crop, no full body, no face, no anus, no upper body, no breasts, no chest, focus strictly on genitals',
      negative:
        "(face:1.5), (head:1.5), (upper body:1.5), (breasts:1.5), (chest:1.5), full body, eyes, portrait, clothing, underwear, panties, bra, bikini, male, text, watermark, bad anatomy, deformed, legs, feet, anus, asshole, extra arms, extra hands, multiple hands, four hands, six fingers, 6 fingers, extra digit, long fingers, bad hands, deformed hands, selfie, mirror, phone, cellphone, holding phone, camera, mobile phone, front view"
    },
    {
      type: 'pussy_fingers_3',
      triggers: ['3 dedos', 'tres dedos', 'three fingers'],
      prompt:
        'extreme close-up, macro lens, frame filled, vagina, pussy, fully nude, naked, no panties, no underwear, three fingers inserted, hands cropped at wrists, no arms visible, realistic skin texture, tight crop, no full body, no face, no anus, no upper body, no breasts, no chest, focus strictly on genitals',
      negative:
        "(face:1.5), (head:1.5), (upper body:1.5), (breasts:1.5), (chest:1.5), full body, eyes, portrait, clothing, underwear, panties, bra, bikini, male, text, watermark, bad anatomy, deformed, legs, feet, anus, asshole, extra arms, extra hands, multiple hands, four hands, six fingers, 6 fingers, extra digit, long fingers, bad hands, deformed hands, selfie, mirror, phone, cellphone, holding phone, camera, mobile phone, front view"
    },
    {
      type: 'pussy_toy',
      triggers: ['consolo', 'dildo', 'vibrador', 'toy'],
      prompt:
        'extreme close-up, macro lens, frame filled, vagina, pussy, fully nude, naked, no panties, no underwear, sex toy inserted, hands cropped at wrists, no arms visible, realistic skin texture, tight crop, no full body, no face, no anus',
      negative:
        "full body, face, head, eyes, portrait, upper body, clothing, underwear, panties, bra, bikini, male, text, watermark, bad anatomy, deformed, legs, feet, anus, asshole, extra arms, extra hands, multiple hands, four hands, six fingers, 6 fingers, extra digit, long fingers, bad hands, deformed hands, selfie, mirror, phone, cellphone, holding phone, camera, mobile phone, front view"
    },
    {
      type: 'anal_fingers',
      triggers: ['dedo no cu', 'anal fingering'],
      prompt:
        'extreme close-up, macro lens, frame filled, anus, anal, fully nude, naked, no panties, no underwear, one finger inserted, hands cropped at wrists, no arms visible, realistic skin texture, tight crop, no full body, no face, no upper body, focus strictly on anus',
      negative:
        "(face:1.5), (head:1.5), (upper body:1.5), full body, eyes, portrait, clothing, underwear, panties, bra, bikini, male, text, watermark, bad anatomy, deformed, legs, feet, extra arms, extra hands, multiple hands, four hands, six fingers, 6 fingers, extra digit, long fingers, bad hands, deformed hands, selfie, mirror, phone, cellphone, holding phone, camera, mobile phone, front view"
    },
    {
      type: 'anal_toy',
      triggers: ['consolo no cu', 'anal toy'],
      prompt:
        'extreme close-up, macro lens, frame filled, anus, anal, fully nude, naked, no panties, no underwear, sex toy inserted, hands cropped at wrists, no arms visible, realistic skin texture, tight crop, no full body, no face, no upper body, focus strictly on anus',
      negative:
        "(face:1.5), (head:1.5), (upper body:1.5), full body, eyes, portrait, clothing, underwear, panties, bra, bikini, male, text, watermark, bad anatomy, deformed, legs, feet, extra arms, extra hands, multiple hands, four hands, six fingers, 6 fingers, extra digit, long fingers, bad hands, deformed hands, selfie, mirror, phone, cellphone, holding phone, camera, mobile phone, front view"
    },
    {
      type: 'ride_toy',
      triggers: ['sentando no consolo', 'riding toy'],
      prompt:
        'full body, nude, sitting, riding sex toy, bedroom, natural window light, realistic skin texture, no face',
      negative:
        "text, watermark, male, child, underage, bad anatomy, deformed, extra limbs, extra arms, extra hands, multiple hands"
    }
  ]
  const fixedByType = new Map(fixedPrompts.map((p) => [p.type, p]))

  let cleanPrompt = ""
  let specificNegative = ""
  let poseType = ""

  function applyPoseTemplate(nextPoseType) {
    const next = String(nextPoseType || '').trim()
    if (!next) return
    const preset = fixedByType.get(next)
    poseType = next
    if (!preset) {
      cleanPrompt = ""
      specificNegative = ""
      return
    }
    cleanPrompt = preset.prompt
    specificNegative = preset.negative
  }

  if (wantsDoggystyle) {
    applyPoseTemplate('doggystyle')
  }
  if (!poseType && wantsMetalstocks) {
    applyPoseTemplate('metalstocks')
  }
  if (!poseType && wantsShibari) {
    applyPoseTemplate('shibari')
  }

  const fixedMatch = fixedPrompts.find((fp) => {
      if (negatedTypes.has(fp.type)) return false
      // Usa regex boundary para triggers curtos também no fixedMatch
      return fp.triggers.some((t) => {
         if (t.length <= 3 || ['anal', 'anus', 'ass', 'butt'].includes(t)) {
            const re = new RegExp(`\\b${escapeRegExp(t)}\\b`, 'i')
            return re.test(combinedLower)
         }
         return combinedLower.includes(t)
      })
  })
  if (!poseType && fixedMatch) {
    applyPoseTemplate(fixedMatch.type)
  } else if (!poseType) {
      const keywords = [
        { pt: ['pelada', 'nua', 'despida', 'sem roupa', 'nuazinha'], en: 'fully nude, naked, no clothes' },
        { pt: ['molhada', 'escorrendo', 'suco', 'mel', 'umida', 'lubrificada', 'pingando'], en: 'wet, dripping, lubricated' },
        { pt: ['dedos', 'masturbando', 'tocando', 'siririca', 'dedinho'], en: 'fingering, touching, masturbating' },
        { pt: ['aberta', 'abrindo', 'esbugalhada', 'arreganhada', 'separando'], en: 'spread wide, opening, exposed' },
        { pt: ['rosa', 'rosada', 'vermelha', 'rosinha'], en: 'pink, reddish' },
        { pt: ['grande', 'enorme', 'inchada'], en: 'big, puffy' },
        { pt: ['rosto', 'cara', 'sorriso', 'olhar', 'boca', 'labios'], en: 'face, smile, looking at camera, lips' },
        { pt: ['corpo', 'inteira', 'em pe', 'corpinho'], en: 'full body, nude' },
        { pt: ['quatro', '4', 'cachorrinho', 'costas', 'empinada'], en: 'doggystyle, on all fours, nude, arched back', type: 'doggystyle' },
        { pt: ['espelho', 'reflexo'], en: 'mirror reflection, nude' },
        { pt: ['cama', 'lencol', 'deitada'], en: 'bed, sheets, lying down' },
        { pt: ['sofa', 'sala', 'sentada'], en: 'couch, living room, sitting' },
        { pt: ['banheiro', 'chuveiro', 'banho'], en: 'bathroom, shower, nude, wet skin' },
        { pt: ['coxas', 'pernas'], en: 'thighs, legs' },
        { pt: ['pes', 'pezinho'], en: 'feet, soles' },
        { pt: ['barriga', 'umbigo'], en: 'navel, tummy, belly' },
        { pt: ['joelhos', 'ajoelhada'], en: 'kneeling, on knees' },
        { pt: ['chao', 'tapete', 'piso'], en: 'floor, rug' },
        { pt: ['cozinha', 'geladeira', 'mesa'], en: 'kitchen, table' },
        { pt: ['janela', 'cortina'], en: 'window, curtains' },
        { pt: ['tatuagem', 'tattoo'], en: 'tattoo' },
        { pt: ['piercing'], en: 'piercing' },
        { pt: ['buceta', 'xoxota', 'perereca', 'larissinha', 'boceta', 'vagina'], en: 'pussy, vagina, spread legs, close-up', type: 'pussy' },
        { pt: ['bunda', 'raba', 'bumbum', 'gluteos', 'ass'], en: 'butt, ass, glutes, rear view', type: 'butt' },
        { pt: ['seios', 'peitos', 'tetas', 'mamas', 'tits'], en: 'breasts, tits, cleavage', type: 'breasts' },
        { pt: ['chupando', 'boquete', 'oral', 'boca', 'lingua', 'lambi'], en: 'sucking, mouth, tongue, blowjob', type: 'oral' },
        { pt: ['anal', 'cuzinho', 'cu'], en: 'anal, spread butt cheeks', type: 'anal' },
        { pt: ['perto', 'pertinho', 'close', 'zoom', 'detalhe'], en: 'extreme close-up, macro' }
      ]

      let detectedTags = []
      keywords.forEach((k) => {
        const hasMatch = k.pt.some((term) => combinedLower.includes(term))
        if (hasMatch) {
          if (k.type && negatedTypes.has(k.type)) return
          detectedTags.push(k.en)
        }
      })

      if (detectedTags.length > 0) {
        cleanPrompt = [...new Set(detectedTags)].join(", ")
        if (!negatedTypes.has('oral') && (cleanPrompt.includes('mouth') || cleanPrompt.includes('blowjob'))) poseType = 'oral'
        else if (!negatedTypes.has('pussy') && (cleanPrompt.includes('pussy') || cleanPrompt.includes('vagina'))) poseType = 'pussy'
        else if (!negatedTypes.has('anal') && cleanPrompt.includes('anal')) poseType = 'anal'
        else if (!negatedTypes.has('butt') && cleanPrompt.includes('butt')) poseType = 'butt'
        else if (!negatedTypes.has('breasts') && cleanPrompt.includes('breasts')) poseType = 'breasts'
        if (!disableActionOverrides && poseType === 'anal' && (wantsAnalHandsHold || wantsAnalHands) && !negatedTypes.has('anal')) {
          applyPoseTemplate(wantsAnalHandsHold ? 'anal_hands_hold' : 'anal_hands')
        }
      } else {
        cleanPrompt = stripByNegation(sanitizeForImageGen(photoTagContent), negatedTypes)
      }
    }

  if (!disableActionOverrides && poseType !== 'doggystyle') {
    if (wantsRideToy && !negatedTypes.has('pussy') && !negatedTypes.has('anal')) {
      applyPoseTemplate('ride_toy')
    } else if (wantsAnalHandsHold && !negatedTypes.has('anal')) {
      applyPoseTemplate('anal_hands_hold')
    } else if (wantsAnalHands && !negatedTypes.has('anal')) {
      applyPoseTemplate('anal_hands')
    } else if (wantsToyAnal && !negatedTypes.has('anal')) {
      applyPoseTemplate('anal_toy')
    } else if (wantsAnal && wantsFingering && !negatedTypes.has('anal')) {
      applyPoseTemplate('anal_fingers')
    } else if (wantsToyPussy && !negatedTypes.has('pussy')) {
      applyPoseTemplate('pussy_toy')
    } else if (wantsFingering && !negatedTypes.has('pussy')) {
      applyPoseTemplate(`pussy_fingers_${wantsFingersCount}`)
    } else if (wantsPussyOpen && !negatedTypes.has('pussy') && !wantsAnal && !(poseType || '').toLowerCase().startsWith('pussy_')) {
      applyPoseTemplate('pussy_open')
    }
  }

  const wantsHandsExplicit =
    wantsHandsWords || wantsHandsActionWords || wantsHandsHoldWords || wantsFingering || wantsPussyOpen || wantsAnalHands || wantsAnalHandsHold
  if (!wantsHandsExplicit && ['anal', 'butt', 'pussy', 'breasts'].includes(poseType)) {
    cleanPrompt = [cleanPrompt, 'hands out of frame', 'no hands visible', 'no fingers visible', 'no arms visible']
      .filter((p) => (p || '').toString().trim())
      .join(', ')
    const noHandsNeg = 'hands in frame, fingers visible, arms in frame, palms visible, wrists visible'
    specificNegative = specificNegative ? `${specificNegative}, ${noHandsNeg}` : noHandsNeg
  }

  if (poseType === 'doggystyle' && wantsWet) {
    cleanPrompt = `${cleanPrompt}, subtle wet sheen, damp inner thighs`
  }

  // Prevenção de conflito de pose: Se o prompt do LLM é muito detalhado e não casou com nenhum template fixo,
  // mas detectamos keywords de 'anal' e 'breasts' juntas (ex: descrição detalhada), a lógica anterior
  // pode ter escolhido 'anal' por ordem de precedência.
  // Vamos forçar a detecção correta baseada no que o usuário pediu explicitamente.
  if (!disableActionOverrides && !fixedMatch) {
      // Se o usuário pediu PEITOS explicitamente, mas o LLM gerou descrição complexa que incluiu 'anus' ou 'asshole' (alucinação ou contexto),
      // devemos priorizar o pedido do usuário.
      // Adicionado 'mostra', 'quero', 'manda' para pegar frases compostas
      const userWantsBreasts = hasAny(userLower, ['seios', 'peitos', 'tetas', 'mamas', 'tits', 'breasts', 'cleavage', 'mamilos', 'boobs', 'peitão', 'peitões'])
      const userWantsAnal = hasAny(userLower, ['anal', 'cuzinho', 'cu', 'anus', 'rosca', 'asshole', 'butthole'])
      
      // Se o usuário pediu peitos e NÃO pediu explicitamente anal, mas a pose foi resolvida como anal (devido a alucinação do LLM no prompt),
      // forçamos breasts.
      if (userWantsBreasts && !userWantsAnal && (poseType === 'anal' || poseType === 'anal_hands' || poseType === 'anal_hands_hold' || poseType === 'anal_fingers' || poseType === 'anal_toy')) {
          console.log('[resolveImagePrompt] Correção forçada: Anal -> Breasts (baseado no input do usuário)')
          applyPoseTemplate('breasts')
      }

      // Correção similar para PUSSY/DEDO
      // Usando radicais mais curtos para pegar diminutivos (bucetinha, xoxotinha)
      const userWantsPussy = hasAny(userLower, ['bucet', 'xoxot', 'perereca', 'larissinha', 'bocet', 'vagina', 'pussy', 'clitoris', 'grelo', 'cunt'])
      const userWantsFingering = hasAny(userLower, ['dedo', 'dedinho', 'finger', 'enfia', 'enfiando', 'masturb', 'tocando', 'siririca'])
      const userWantsAnalExplicit = hasAny(userLower, ['anal', 'cuzinho', 'cu', 'anus', 'rosca', 'asshole', 'butthole'])
      
      // Se detectou anal mas o usuário queria pussy (e não pediu anal explicitamente)
      if (userWantsPussy && !userWantsAnalExplicit && (poseType === 'anal' || poseType === 'anal_hands' || poseType === 'anal_hands_hold' || poseType === 'anal_fingers' || poseType === 'anal_toy')) {
         console.log('[resolveImagePrompt] Correção forçada: Anal -> Pussy (baseado no input do usuário)')
         if (wantsFingering || userWantsFingering) {
            applyPoseTemplate(`pussy_fingers_${wantsFingersCount}`)
         } else {
            applyPoseTemplate('pussy')
         }
      } else if (userWantsPussy && (userWantsFingering || wantsFingering) && (poseType === 'pussy' || poseType === '')) {
         // Correção: Se pediu dedo na buceta, mas caiu no template genérico de 'pussy' ou nenhum, força 'pussy_fingers'
         console.log('[resolveImagePrompt] Correção forçada: Pussy -> Pussy Fingers (baseado no input do usuário)')
         applyPoseTemplate(`pussy_fingers_${wantsFingersCount}`)
      }
  }

  // Reforço de segurança: Se wantsFingering é true e temos contexto de pussy, mas o poseType ainda é 'pussy' (genérico), forçamos upgrade.
  // Isso pega casos onde o fixedMatch encontrou 'pussy' e parou, e o bloco acima foi pulado por causa do check !fixedMatch (agora removido ou se a logica falhou).
  // Nota: O bloco acima estava dentro de 'if (!fixedMatch)'. Vou adicionar uma verificação extra aqui fora.
  if (wantsFingering && (poseType === 'pussy' || poseType === 'pussy_open') && !negatedTypes.has('pussy')) {
      console.log('[resolveImagePrompt] Upgrade automático: Pussy -> Pussy Fingers')
      applyPoseTemplate(`pussy_fingers_${wantsFingersCount}`)
  }

  if (poseType === 'pussy' || String(poseType || '').toLowerCase().startsWith('pussy_')) {
    const tone = inferVulvaToneDescriptor(traits)
    const lpTone = (cleanPrompt || '').toLowerCase()
    if (tone && !lpTone.includes('vulva') && !lpTone.includes('labia')) {
      cleanPrompt = [cleanPrompt, tone].filter(Boolean).join(', ')
    }

    if (wantsPussyOpen) {
      const openPhrase =
        'two hands only, fingers spreading pussy lips wide open, hands cropped at wrists, no arms visible'
      const lp = (cleanPrompt || '').toLowerCase()
      if (!lp.includes('spreading') && !lp.includes('open')) {
        cleanPrompt = [cleanPrompt, openPhrase].filter(Boolean).join(', ')
      }
      const openNeg =
        'extra arms, extra hands, multiple hands, four hands, six fingers, 6 fingers, extra digit, long fingers, bad hands, deformed hands'
      specificNegative = specificNegative ? `${specificNegative}, ${openNeg}` : openNeg
    }

    if (wantsHairy) {
      const lp = (cleanPrompt || '').toLowerCase()
      if (!lp.includes('pubic hair') && !lp.includes('hairy')) {
        cleanPrompt = [cleanPrompt, 'pubic hair'].filter(Boolean).join(', ')
      }
    } else {
      const lp = (cleanPrompt || '').toLowerCase()
      if (!lp.includes('shaved') && !lp.includes('hairless') && !lp.includes('little to no pubic hair')) {
        cleanPrompt = [cleanPrompt, 'shaved, hairless, little to no pubic hair'].filter(Boolean).join(', ')
      }
      const hairyNeg = 'bushy pubic hair, thick pubic hair, very hairy pussy'
      const anatomyNeg = 'swollen, puffy, inflamed, prolapse, exaggerated labia, oversized labia'
      const analNeg = 'anus, asshole, anal'
      const combinedNeg = [hairyNeg, anatomyNeg, analNeg].join(', ')
      specificNegative = specificNegative ? `${specificNegative}, ${combinedNeg}` : combinedNeg
    }
  }

  if (poseType === 'anal' || String(poseType || '').toLowerCase().startsWith('anal_')) {
     const analNeg = '(face:1.5), (head:1.5), (portrait:1.3), hair, eyes, nose, mouth, lips, smile, front view, selfie, mirror, phone, camera, holding phone, breasts, chest, nipples, navel, belly button, torso, looking back, looking over shoulder'
     specificNegative = specificNegative ? `${specificNegative}, ${analNeg}` : analNeg
  }

  const prefix = wantsCinematic ? "RAW cinematic photo, high quality, " : "RAW amateur photo, "
  const style = wantsCinematic
    ? "cinematic photorealistic film still, 35mm, shallow depth of field, natural skin texture, visible pores, subtle imperfections, realistic color grading, soft cinematic lighting, high dynamic range, sharp focus, subtle film grain, raw photo"
    : "grainy on-camera flash, bad indoor lighting, messy sheets background, amateur, candid, unfiltered, no beauty filter, realistic skin texture, visible pores, sweat, subtle imperfections, raw photo"

  const promptParts = [`${prefix}${subject}`, singleSubject, cleanPrompt].filter((p) => (p || '').toString().trim())
  const finalPrompt = `${promptParts.join(', ')}. ${style}`.replace(/\s{2,}/g, ' ').trim()

  const defaultNegative =
    "underwear, panties, bra, bikini, clothes, censored, censor bar, mosaic, grey bar, gray bar, blur, watermark, text, child, underage, male, deformed, " +
    "multiple people, two women, 2girls, group, extra breasts, extra nipples, duplicate body, duplicate torso, extra limbs, " +
    "misplaced nipples, nipples on butt, nipples on ass, nipples on thighs, bad anatomy, mutated, disfigured, malformed, " +
    "twisted neck, broken neck, 180-degree head, head turned backwards, exorcist head, unnatural spine, " +
    "bad eyes, deformed eyes, cross-eyed, lazy eye, wonky eyes, asymmetrical eyes, mismatched pupils, extra eyes, " +
    "extra arms, extra hands, multiple hands, four hands, six fingers, 6 fingers, extra digit, bad hands, deformed hands, distorted hands, malformed hands, extra fingers, fused fingers, missing fingers, long fingers, poorly drawn hands, " +
    "plastic skin, waxy skin, rubber skin, doll-like, porcelain, CGI, 3d render, anime, cartoon, unrealistic, uncanny valley, " +
    "over-smooth skin, airbrushed, beauty filter, over-processed, over-sharpened, glossy skin, fake"

  const negativePrompt = specificNegative ? `${specificNegative}, ${defaultNegative}` : defaultNegative

  return { prompt: finalPrompt, negative: negativePrompt, poseType }
}
