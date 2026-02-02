import { PROFISSAO_POR_REPLY, ROUPAS_LISTA } from '../opcoes.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, sendWhatsAppButtons, sendWhatsAppList, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askOccupation' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  let job = ''
  if (reply) job = PROFISSAO_POR_REPLY[reply] || ''
  if (!job) job = text
  if (!job) return false

  onboarding.set(user.id, { step: 'askClothing', data: { ...d, occupation: job } })
  const body = 'E o estilo de roupa? Escolha uma opção:'
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

