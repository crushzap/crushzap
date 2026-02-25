import { CORPO_POR_REPLY, SEIOS_LISTA } from '../opcoes.mjs'
import { comentarioCorpo } from '../aura-comentarios.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppText, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askBodyType' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  let bt = ''
  if (reply) bt = CORPO_POR_REPLY[reply] || ''
  if (!bt) bt = text
  if (!bt) return false

  onboarding.set(user.id, { step: 'askBreastSize', data: { ...d, bodyType: bt } })
  const comment = comentarioCorpo(bt)
  const outComment = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentBodyType', direction: 'out', type: 'text', content: comment, status: 'queued' } })
  const commentRes = await sendWhatsAppText(sendId, phone, comment)
  await prisma.onboardingMessage.update({ where: { id: outComment.id }, data: { status: commentRes.ok ? 'sent' : 'failed' } })

  const body = 'E agora, só pra fechar o desenho… qual tamanho de seios você prefere?'
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askBreastSize', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await sendWhatsAppList(sendId, phone, body, SEIOS_LISTA, 'Tamanho dos seios', 'Ver opções')
  let metadata = undefined
  if (!result.ok) {
    const fallback = [
      { id: 'seios_pequenos', title: 'PEQUENOS' },
      { id: 'seios_medios', title: 'MÉDIOS' },
      { id: 'seios_grandes', title: 'GRANDES' },
    ]
    await sendWhatsAppButtons(sendId, phone, 'Selecione o tamanho dos seios:', fallback)
    metadata = { buttons: fallback }
  }
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed', metadata } })
  return true
}
