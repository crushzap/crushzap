export async function handle(ctx) {
  const { prisma, typed, text, sendId, phone, user, persona, conv, sendWhatsAppText, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askEmail' || !typed) return false

  const d = onboarding.get(user.id)?.data || {}
  const emailText = text.trim()
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailText) && emailText.includes('@')
  if (!ok) {
    const body = 'Esse email parece inválido. Por favor, digite um email válido (ex: voce@email.com).'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askEmailInvalid', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    onboarding.set(user.id, { step: 'askEmail', data: { ...d } })
    return true
  }
  onboarding.set(user.id, { step: 'confirmEmail', data: { ...d, email: emailText } })
  const body = `Você digitou: ${emailText}. Está correto?`
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'confirmEmail', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await ctx.sendWhatsAppButtons(sendId, phone, body, [
    { id: 'email_confirmar', title: 'CONFIRMAR' },
    { id: 'email_editar', title: 'EDITAR' },
  ])
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}

