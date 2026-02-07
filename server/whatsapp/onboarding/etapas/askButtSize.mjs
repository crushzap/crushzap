import { BUNDA_POR_REPLY, PROFISSOES_LISTA } from '../opcoes.mjs'
import { comentarioBunda } from '../aura-comentarios.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppText, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askButtSize' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  let bs2 = ''
  if (reply) bs2 = BUNDA_POR_REPLY[reply] || ''
  if (!bs2) bs2 = text
  if (!bs2) return false

  onboarding.set(user.id, { step: 'askOccupation', data: { ...d, buttSize: bs2 } })
  const comment = comentarioBunda(bs2)
  const outComment = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentButtSize', direction: 'out', type: 'text', content: comment, status: 'queued' } })
  const commentRes = await sendWhatsAppText(sendId, phone, comment)
  await prisma.onboardingMessage.update({ where: { id: outComment.id }, data: { status: commentRes.ok ? 'sent' : 'failed' } })

  const body = 'Agora eu quero dar uma vida real pra ela.\n\nQual profissão você quer que a sua Crush tenha?'
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askOccupation', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await sendWhatsAppList(sendId, phone, body, PROFISSOES_LISTA, 'Profissão', 'Ver opções')
  if (!result.ok) {
    const fallback = [
      { id: 'profissao_modelo', title: 'MODELO' },
      { id: 'profissao_advogada', title: 'ADVOGADA' },
      { id: 'profissao_policial', title: 'POLICIAL' },
    ]
    await sendWhatsAppButtons(sendId, phone, 'Selecione a profissão:', fallback)
  }
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}
