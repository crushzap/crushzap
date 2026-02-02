import { BUNDAS_LISTA, SEIO_POR_REPLY } from '../opcoes.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, sendWhatsAppButtons, sendWhatsAppList, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askBreastSize' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  let bs = ''
  if (reply) bs = SEIO_POR_REPLY[reply] || ''
  if (!bs) bs = text
  if (!bs) return false

  onboarding.set(user.id, { step: 'askButtSize', data: { ...d, breastSize: bs } })
  const body = 'Agora me diga o tamanho da bunda que você prefere.'
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

