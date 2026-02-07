import { PROFISSAO_POR_REPLY, ROUPAS_LISTA } from '../opcoes.mjs'
import { comentarioProfissao } from '../aura-comentarios.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppText, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askOccupation' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  let job = ''
  if (reply) job = PROFISSAO_POR_REPLY[reply] || ''
  if (!job) job = text
  if (!job) return false

  onboarding.set(user.id, { step: 'askClothing', data: { ...d, occupation: job } })
  const comment = comentarioProfissao(job)
  const outComment = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentOccupation', direction: 'out', type: 'text', content: comment, status: 'queued' } })
  const commentRes = await sendWhatsAppText(sendId, phone, comment)
  await prisma.onboardingMessage.update({ where: { id: outComment.id }, data: { status: commentRes.ok ? 'sent' : 'failed' } })

  const body = 'E o estilo… como você quer ver ela vestida?'
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askClothing', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await sendWhatsAppList(sendId, phone, body, ROUPAS_LISTA, 'Estilo de roupa', 'Ver opções')
  if (!result.ok) {
    const fallback = [
      { id: 'roupa_biquini', title: 'BIQUÍNI' },
      { id: 'roupa_jeans', title: 'JEANS' },
      { id: 'roupa_couro', title: 'COURO' },
    ]
    await sendWhatsAppButtons(sendId, phone, 'Selecione o estilo de roupa:', fallback)
  }
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}
