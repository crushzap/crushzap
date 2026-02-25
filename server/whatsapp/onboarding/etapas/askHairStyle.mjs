import { CABELO_POR_REPLY, CORES_CABELO_LISTA } from '../opcoes.mjs'
import { comentarioCabeloEstilo } from '../aura-comentarios.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppText, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askHairStyle' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  let hs = ''
  if (reply) hs = CABELO_POR_REPLY[reply] || ''
  if (!hs) hs = text
  if (!hs) return false

  onboarding.set(user.id, { step: 'askHairColor', data: { ...d, hairStyle: hs } })
  const comment = comentarioCabeloEstilo(hs)
  const outComment = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentHairStyle', direction: 'out', type: 'text', content: comment, status: 'queued' } })
  const commentRes = await sendWhatsAppText(sendId, phone, comment)
  await prisma.onboardingMessage.update({ where: { id: outComment.id }, data: { status: commentRes.ok ? 'sent' : 'failed' } })

  const body = 'E a cor… qual tom você quer ver nela?'
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askHairColor', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await sendWhatsAppList(sendId, phone, body, CORES_CABELO_LISTA, 'Cor do cabelo', 'Ver opções')
  let metadata = undefined
  if (!result.ok) {
    const fallback = [
      { id: 'cor_preto', title: 'PRETO' },
      { id: 'cor_loiro', title: 'LOIRO' },
      { id: 'cor_castanho', title: 'CASTANHO' },
    ]
    await sendWhatsAppButtons(sendId, phone, 'Selecione a cor do cabelo:', fallback)
    metadata = { buttons: fallback }
  }
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed', metadata } })
  return true
}
