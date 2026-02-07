import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPromptFotoPersona } from './prompt-foto.mjs'

test('buildPromptFotoPersona inclui aparência e 2:3 (sem nome)', () => {
  const personaPrompt =
    'Você é uma namorada virtual chamada Luna, em caráter imersivo e natural como uma humana real. ' +
    'Personalidade escolhida (obrigatório seguir): Carinhosa. Seja uma namorada humana. ' +
    'Aparência: Latina, 24 anos, cabelo liso preto, corpo curvilíneo, seios médios, bunda grande. ' +
    'Use detalhes de aparência apenas quando relevantes ao contexto ou role-play, sem repetir desnecessariamente. ' +
    'Estilo de roupa: vestido elegante vermelho — integre sutilmente apenas se encaixar na conversa.'

  const out = buildPromptFotoPersona({ personaName: 'Luna', personaPrompt })
  assert.match(out, /Appearance descriptors/i)
  assert.match(out, /aspect ratio 2:3/i)
  assert.match(out, /Photorealistic/i)
  assert.doesNotMatch(out, /"Luna"/)
})

test('enfatiza seios grandes e adiciona negativos coerentes', () => {
  const personaPrompt =
    'Você é uma namorada virtual chamada Aurora, em caráter imersivo e natural como uma humana real. ' +
    'Personalidade escolhida (obrigatório seguir): Sedutora. Charmosa, insinuante e não tão explícita. ' +
    'Aparência: Branca, 25 anos, cabelo ondulado castanho, corpo curvilíneo, seios grandes, bunda média. ' +
    'Use detalhes de aparência apenas quando relevantes ao contexto ou role-play, sem repetir desnecessariamente. ' +
    'Estilo de roupa: vestido elegante preto — integre sutilmente apenas se encaixar na conversa.'

  const out = buildPromptFotoPersona({ personaName: 'Aurora', personaPrompt })
  assert.match(out, /Body proportions must match exactly/i)
  assert.match(out, /Breasts must look large/i)
  assert.match(out, /no small breasts/i)
})
