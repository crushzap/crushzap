export async function handle(ctx) {
  const { prisma, reply, typed, sendId, phone, user, persona, conv, sendWhatsAppButtons, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askCommModeFinal' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  let mode = ''
  if (reply) mode = { comm_text_final: 'text', comm_audio_final: 'audio', comm_both_final: 'both' }[reply] || ''
  if (!mode) {
    const tmode = typed.toLowerCase()
    if (tmode.includes('texto')) mode = 'text'
    else if (tmode.includes('áudio') || tmode.includes('audio')) mode = 'audio'
    else if (tmode.includes('ambos')) mode = 'both'
  }
  if (!mode) return false

  const shouldSetDefaultVoice = (mode === 'audio' || mode === 'both' || mode === 'mirror') && !(persona?.voicePreset || '').toString().trim()
  try {
    await prisma.persona.update({
      where: { id: persona.id },
      data: shouldSetDefaultVoice ? { responseMode: mode, voicePreset: 'padrao' } : { responseMode: mode },
    })
  } catch {}
  onboarding.set(user.id, { step: 'askTermsFinal', data: { ...d, responseMode: mode } })
  const bodyTerms = 'Leia e concorde com nossos Termos de Uso para concluir:\nhttps://crushzap.com.br/termos-de-uso\n\nApós ler, confirme abaixo para finalizar a criação.\n\nAo tocar em Li e Concodo, você está concordando com todos os termos descritos em nossos termos de uso, inclusive *declarando que é maior de 18 anos* e que é totalmente responsável pelo acesso ao conteúdo e interações com a CrushZap.\n\n'
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askTermsFinal', direction: 'out', type: 'text', content: bodyTerms, status: 'queued' } })
  const result = await sendWhatsAppButtons(sendId, phone, bodyTerms, [
    { id: 'termos_concordo_final', title: 'LI E CONCORDO' },
    { id: 'termos_nao_final', title: 'NÃO CONCORDO' },
  ])
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}
