import { ORIENTACAO_SEXUAL_POR_REPLY, PROFISSOES_LISTA } from '../opcoes.mjs'
import { comentarioOrientacaoSexual } from '../aura-comentarios.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppText, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askSexualPreference' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  let pref = ''
  if (reply) pref = ORIENTACAO_SEXUAL_POR_REPLY[reply] || ''
  if (!pref) {
    const t = (typed || '').toString().trim().toLowerCase()
    if (t.includes('hetero curios') || t.includes('hétero curios')) pref = 'Hétero curiosa'
    else if (t.includes('hetero') || t.includes('hétero')) pref = 'Hétero'
    else if (t.includes('bi')) pref = 'Bissexual'
    else if (t.includes('homo')) pref = 'Homossexual'
    else if (t.includes('pan')) pref = 'Pansexual'
    else if (t.includes('assex')) pref = 'Assexual'
  }
  if (!pref) pref = (text || '').toString().trim()
  if (!pref) return false

  onboarding.set(user.id, { step: 'askOccupation', data: { ...d, sexualPreference: pref } })

  const comment = comentarioOrientacaoSexual(pref)
  const outComment = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentSexualPreference', direction: 'out', type: 'text', content: comment, status: 'queued' } })
  const commentRes = await sendWhatsAppText(sendId, phone, comment)
  await prisma.onboardingMessage.update({ where: { id: outComment.id }, data: { status: commentRes.ok ? 'sent' : 'failed' } })

  const body = 'Agora eu quero dar uma vida real pra ela.\n\nQual profissão você quer que a sua Crush tenha?'
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askOccupation', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await sendWhatsAppList(sendId, phone, body, PROFISSOES_LISTA, 'Profissão', 'Ver opções')
  let metadata = undefined
  if (!result.ok) {
    const fallback = [
      { id: 'profissao_modelo', title: 'MODELO' },
      { id: 'profissao_advogada', title: 'ADVOGADA' },
      { id: 'profissao_policial', title: 'POLICIAL' },
    ]
    await sendWhatsAppButtons(sendId, phone, 'Selecione a profissão:', fallback)
    metadata = { buttons: fallback }
  }
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed', metadata } })
  return true
}
