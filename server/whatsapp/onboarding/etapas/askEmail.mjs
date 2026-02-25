export async function handle(ctx) {
  const { prisma, typed, sendId, phone, user, persona, conv, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askEmail' || !typed) return false

  const d = onboarding.get(user.id)?.data || {}
  onboarding.set(user.id, { step: 'askCrushNameChoice', data: { ...d } })
  const body = 'Perfeito. Vamos seguir.\n\nAgora vamos dar um nome pra sua Crush. Você prefere escolher o nome ou quer que eu sugira um aleatório agora?'
  const buttons = [
    { id: 'nome_digitar', title: 'DIGITAR NOME' },
    { id: 'nome_aleatorio', title: 'NOME ALEATÓRIO' },
  ]
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askCrushNameChoice', direction: 'out', type: 'text', content: body, status: 'queued', metadata: { buttons } } })
  const result = await ctx.sendWhatsAppButtons(sendId, phone, body, buttons)
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}
