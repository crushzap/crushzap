import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveImagePrompt } from './resolve-image-prompt.mjs'

test('prioriza "de quatro" mesmo se a tag vier com breasts', () => {
  const out = resolveImagePrompt(
    'manda uma foto de quatro cinematic foto real',
    'close-up of large breasts, nude',
    'adult woman, latina'
  )

  assert.equal(out.poseType, 'doggystyle')
  assert.match(out.prompt, /doggystyle/i)
  assert.match(out.prompt, /RAW cinematic photo/i)
  assert.doesNotMatch(out.prompt, /\bbreasts\b/i)
})

test('prioriza "de 4" mesmo se a tag vier com pussy close-up', () => {
  const out = resolveImagePrompt(
    'manda uma foto de 4 molhadinha',
    'close-up of soaked wet pussy with fingers spreading lips, adult woman',
    'adult woman, latina'
  )

  assert.equal(out.poseType, 'doggystyle')
  assert.match(out.prompt, /on all fours|doggystyle|from behind/i)
  assert.doesNotMatch(out.prompt, /macro lens|frame filled/i)
})

test('doggystyle não injeta anal por keyword', () => {
  const out = resolveImagePrompt(
    'manda uma foto de 4 molhadinha',
    'rear view wet pussy close-up, adult woman bent over bed',
    'adult woman, latina'
  )

  assert.equal(out.poseType, 'doggystyle')
  assert.doesNotMatch(out.prompt, /\banal\b/i)
})

test('prioriza metalstocks quando usuário pede algema de metal', () => {
  const out = resolveImagePrompt(
    'manda uma foto sua com algema de metal',
    'adult woman wrists handcuffed behind back with metal handcuffs',
    'adult woman, latina'
  )

  assert.equal(out.poseType, 'metalstocks')
  assert.match(out.prompt, /\bmetalstocks\b/i)
  assert.doesNotMatch(out.prompt, /\bframe filled\b/i)
})

test('prioriza shibari quando usuário pede shibari/cordas', () => {
  const out = resolveImagePrompt(
    'quero uma foto amarrada em shibari',
    'rope bondage, nude, adult woman',
    'adult woman, latina'
  )

  assert.equal(out.poseType, 'shibari')
  assert.match(out.prompt, /\bshibari\b/i)
})

test('negação do usuário bloqueia termos indesejados vindos da tag', () => {
  const out = resolveImagePrompt(
    'nao quero bunda, manda outra pose',
    'close-up of butt, nude',
    'adult woman, brunette'
  )

  assert.notEqual(out.poseType, 'butt')
  assert.doesNotMatch(out.prompt, /\b(butt|ass|bunda|raba|bumbum)\b/i)
})

test('mantém estilo amador quando não há pedido de cinematic', () => {
  const out = resolveImagePrompt(
    'manda uma foto',
    'selfie of an adult woman, nude',
    'adult woman'
  )

  assert.match(out.prompt, /RAW amateur photo/i)
})

test('injeta traits uma vez e reforça 1 personagem', () => {
  const out = resolveImagePrompt(
    'manda uma foto',
    'close-up of large breasts, nude',
    'adult woman, latina, blue hair'
  )

  assert.match(out.prompt, /adult woman, latina, blue hair/i)
  assert.match(out.prompt, /\bsolo\b/i)
  assert.match(out.prompt, /\bno other people\b/i)
  assert.equal(out.prompt.match(/adult woman, latina, blue hair/gi)?.length || 0, 1)
})
