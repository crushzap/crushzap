export async function handle(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, sendWhatsAppText, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'confirmEmail' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  const emailText = (d.email || '').toString()
  const confirm = reply === 'email_confirmar' || typed === 'confirmar'
  const edit = reply === 'email_editar' || typed === 'editar'
  if (confirm && emailText) {
    try { await prisma.user.update({ where: { id: user.id }, data: { email: emailText } }) } catch {}
    onboarding.set(user.id, { step: 'askCrushNameChoice', data: { ...d } })
    const body = 'Qual o nome que você quer dar para sua Crush? Escolha uma das opções abaixo 👇'
    const outMsg = await prisma.message.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await ctx.sendWhatsAppButtons(sendId, phone, body, [
      { id: 'nome_digitar', title: 'DIGITAR NOME' },
      { id: 'nome_aleatorio', title: 'NOME ALEATÓRIO' },
    ])
    await prisma.message.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }
  if (edit) {
    onboarding.set(user.id, { step: 'askEmail', data: { ...d } })
    const body = 'Sem problemas! Digite novamente o email que você mais usa para receber informações e depois poder acessar.'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askEmail', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }
  void text
  return false
}

