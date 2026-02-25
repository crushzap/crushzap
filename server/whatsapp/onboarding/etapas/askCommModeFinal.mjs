import { comentarioModoResposta } from '../aura-comentarios.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, sendId, phone, user, persona, conv, sendWhatsAppButtons, sendWhatsAppText, maps } = ctx
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

  onboarding.set(user.id, { step: 'askTermsFinal', data: { ...d, responseMode: mode } })
  const comment = comentarioModoResposta(mode)
  const outComment = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentCommMode', direction: 'out', type: 'text', content: comment, status: 'queued' } })
  const commentRes = await sendWhatsAppText(sendId, phone, comment)
  await prisma.onboardingMessage.update({ where: { id: outComment.id }, data: { status: commentRes.ok ? 'sent' : 'failed' } })

  const bodyTerms = 'Tá tudo pronto. Só falta um último “sim”.\n\nLeia e concorde com nossos Termos de Uso:\nhttps://crushzap.com.br/termos-de-uso\n\nAo tocar em *LI E CONCORDO*, você confirma que leu os termos, *declara que é maior de 18 anos* e assume total responsabilidade pelo acesso ao conteúdo e interações com o CrushZap.'
  const buttons = [
    { id: 'termos_concordo_final', title: 'LI E CONCORDO' },
    { id: 'termos_nao_final', title: 'NÃO CONCORDO' },
  ]
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askTermsFinal', direction: 'out', type: 'text', content: bodyTerms, status: 'queued', metadata: { buttons } } })
  const result = await sendWhatsAppButtons(sendId, phone, bodyTerms, buttons)
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}
