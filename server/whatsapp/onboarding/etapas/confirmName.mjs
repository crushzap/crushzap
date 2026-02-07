export async function handle(ctx) {
  const { prisma, reply, typed, sendId, phone, user, persona, conv, sendWhatsAppText, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'confirmName' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  const nome = (d.name || '').toString().trim()
  const confirm = reply === 'nome_confirmar' || typed === 'confirmar' || typed === 'sim'
  const edit = reply === 'nome_editar' || typed === 'editar' || typed === 'não' || typed === 'nao'
  if (confirm && nome) {
    try { await prisma.user.update({ where: { id: user.id }, data: { name: nome } }) } catch {}
    onboarding.set(user.id, { step: 'askCrushNameChoice', data: { name: nome } })
    const body = `Perfeito, ${nome}.\n\nAgora vamos dar um nome pra sua Crush. Você prefere *escolher* o nome ou quer que eu *sugira um aleatório* agora?`
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askCrushNameChoice', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await ctx.sendWhatsAppButtons(sendId, phone, body, [
      { id: 'nome_digitar', title: 'DIGITAR NOME' },
      { id: 'nome_aleatorio', title: 'NOME ALEATÓRIO' },
    ])
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }
  if (edit) {
    onboarding.set(user.id, { step: 'askName', data: {} })
    const body = 'Sem problemas… vamos ajustar.\n\nDigite novamente apenas seu nome (ou apelido), sem frases (ex: Tayna).'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askName', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }
  return false
}
