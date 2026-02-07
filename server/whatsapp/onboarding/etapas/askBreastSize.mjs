import { BUNDAS_LISTA, SEIO_POR_REPLY } from '../opcoes.mjs'
import { comentarioSeios } from '../aura-comentarios.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppText, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askBreastSize' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  let bs = ''
  if (reply) bs = SEIO_POR_REPLY[reply] || ''
  if (!bs) bs = text
  if (!bs) return false

  onboarding.set(user.id, { step: 'askButtSize', data: { ...d, breastSize: bs } })
  const comment = comentarioSeios(bs)
  const outComment = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentBreastSize', direction: 'out', type: 'text', content: comment, status: 'queued' } })
  const commentRes = await sendWhatsAppText(sendId, phone, comment)
  await prisma.onboardingMessage.update({ where: { id: outComment.id }, data: { status: commentRes.ok ? 'sent' : 'failed' } })

  const body = 'E agora… qual tamanho de bunda você prefere?'
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askButtSize', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await sendWhatsAppList(sendId, phone, body, BUNDAS_LISTA, 'Tamanho da bunda', 'Ver opções')
  if (!result.ok) {
    const fallback = [
      { id: 'bunda_pequena', title: 'PEQUENA' },
      { id: 'bunda_grande', title: 'GRANDE' },
      { id: 'bunda_muito_grande', title: 'MUITO GRANDE' },
    ]
    await sendWhatsAppButtons(sendId, phone, 'Selecione o tamanho da bunda:', fallback)
  }
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}
