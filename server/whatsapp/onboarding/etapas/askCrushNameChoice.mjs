export async function handle(ctx) {
  const { prisma, reply, typed, sendId, phone, user, persona, conv, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askCrushNameChoice' || (!reply && !typed)) return false

  onboarding.set(user.id, { step: 'askCrushNameChoice', data: { ...(ctx?.state?.data || {}) } })
  const body = 'Só pra eu te guiar direitinho: você quer *digitar o nome* da sua Crush ou prefere um *nome aleatório* agora?'
  const buttons = [
    { id: 'nome_digitar', title: 'DIGITAR NOME' },
    { id: 'nome_aleatorio', title: 'NOME ALEATÓRIO' },
  ]
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askCrushNameChoice', direction: 'out', type: 'text', content: body, status: 'queued', metadata: { buttons } } })
  const result = await ctx.sendWhatsAppButtons(sendId, phone, body, buttons)
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}
