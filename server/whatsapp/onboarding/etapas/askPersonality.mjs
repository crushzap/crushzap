import { comentarioPersonalidade } from '../aura-comentarios.mjs'
import { ETNIAS_LISTA, PERSONALIDADE_POR_REPLY } from '../opcoes.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppText, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askPersonality' || (!reply && !typed)) return false

  let pers = ''
  if (reply) pers = PERSONALIDADE_POR_REPLY[reply] || ''
  if (!pers) pers = text
  if (!pers) return false

  const d = onboarding.get(user.id)?.data || {}
  const uName = (d.name || user.name || '').toString()
  onboarding.set(user.id, { step: 'askEthnicity', data: { ...(d || {}), personality: pers } })
  const comment = comentarioPersonalidade(pers)
  const outComment = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentPersonality', direction: 'out', type: 'text', content: comment, status: 'queued' } })
  const commentRes = await sendWhatsAppText(sendId, phone, comment)
  await prisma.onboardingMessage.update({ where: { id: outComment.id }, data: { status: commentRes.ok ? 'sent' : 'failed' } })

  const body = `Perfeito, ${uName}.\n\nAgora vamos desenhar a aparência dela… qual *etnia* você prefere?`
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askEthnicity', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await sendWhatsAppList(sendId, phone, body, ETNIAS_LISTA, 'Etnia', 'Ver opções')
  let metadata = undefined
  if (!result.ok) {
    const fallback = [
      { id: 'etnia_caucasian', title: 'BRANCA' },
      { id: 'etnia_afro', title: 'NEGRA' },
      { id: 'etnia_latina', title: 'LATINA' },
    ]
    await sendWhatsAppButtons(sendId, phone, 'Selecione a etnia:', fallback)
    metadata = { buttons: fallback }
  }
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed', metadata } })
  return true
}
