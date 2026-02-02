import { CABELO_POR_REPLY, CORES_CABELO_LISTA } from '../opcoes.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, sendWhatsAppButtons, sendWhatsAppList, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askHairStyle' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  let hs = ''
  if (reply) hs = CABELO_POR_REPLY[reply] || ''
  if (!hs) hs = text
  if (!hs) return false

  onboarding.set(user.id, { step: 'askHairColor', data: { ...d, hairStyle: hs } })
  const body = 'Qual cor de cabelo você prefere?'
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askHairColor', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await sendWhatsAppList(sendId, phone, body, CORES_CABELO_LISTA, 'Cor do cabelo', 'Ver opções')
  if (!result.ok) {
    const fallback = [
      { id: 'cor_preto', title: 'PRETO' },
      { id: 'cor_loiro', title: 'LOIRO' },
      { id: 'cor_castanho', title: 'CASTANHO' },
    ]
    await sendWhatsAppButtons(sendId, phone, 'Selecione a cor do cabelo:', fallback)
  }
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}

