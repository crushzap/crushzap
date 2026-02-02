import { BUNDA_POR_REPLY, PROFISSOES_LISTA } from '../opcoes.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, sendWhatsAppButtons, sendWhatsAppList, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askButtSize' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  let bs2 = ''
  if (reply) bs2 = BUNDA_POR_REPLY[reply] || ''
  if (!bs2) bs2 = text
  if (!bs2) return false

  onboarding.set(user.id, { step: 'askOccupation', data: { ...d, buttSize: bs2 } })
  const body = 'Agora escolha uma profissão para sua Crush:'
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

