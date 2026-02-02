import { buildPersonaPrompt } from '../../../agents/prompt.mjs'
import { ROUPA_POR_REPLY } from '../opcoes.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, sendWhatsAppButtons, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askClothing' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  let cloth = ''
  if (reply) cloth = ROUPA_POR_REPLY[reply] || ''
  if (!cloth) cloth = text
  if (!cloth) return false

  const uName = (d.name || user.name || '').toString()
  const uEmail = (d.email || user.email || '').toString()
  const cName = (d.crushName || persona.name || 'Crush').toString()
  const pers = (d.personality || persona.personality || '').toString()
  const eth = (d.ethnicity || '').toString()
  const age = (d.age || '').toString()
  const hs = (d.hairStyle || '').toString()
  const hc = (d.hairColor || '').toString()
  const bt = (d.bodyType || '').toString()
  const bs = (d.breastSize || '').toString()
  const bs2 = (d.buttSize || '').toString()
  const job = (d.occupation || '').toString()
  const outfit = cloth
  const ptxt = buildPersonaPrompt({ cName, pers, eth, age, hs, hc, bt, bs, bs2, job, outfit, uName, uEmail })
  try { await prisma.persona.update({ where: { id: persona.id }, data: { prompt: ptxt } }) } catch {}
  onboarding.set(user.id, { step: 'askCommModeFinal', data: { ...d, outfit } })
  const bodyExplain = 'Último passo para finalizar sua Crush!\n\nPara deixar sua experiência perfeita, escolha como prefere receber as respostas: TEXTO, ÁUDIO ou AMBOS.'
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askCommModeFinal', direction: 'out', type: 'text', content: bodyExplain, status: 'queued' } })
  const result = await sendWhatsAppButtons(sendId, phone, 'Selecione seu estilo de comunicação:', [
    { id: 'comm_text_final', title: 'TEXTO' },
    { id: 'comm_audio_final', title: 'ÁUDIO' },
    { id: 'comm_both_final', title: 'AMBOS' },
  ])
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}
