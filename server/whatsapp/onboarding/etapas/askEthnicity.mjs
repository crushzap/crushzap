import { ETNIA_POR_REPLY } from '../opcoes.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, sendId, phone, user, persona, conv, sendWhatsAppText, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askEthnicity' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  let eth = ''
  if (reply) eth = ETNIA_POR_REPLY[reply] || ''
  if (!eth) {
    const t = typed.toLowerCase()
    if (t.includes('caucasian') || t.includes('caucasiana')) eth = 'Branca'
    else if (t.includes('afro') || t.includes('negra')) eth = 'Negra'
    else if (t.includes('latina')) eth = 'Latina'
    else if (t.includes('asian') || t.includes('asiática') || t.includes('asiatica')) eth = 'Asiática'
    else if (t.includes('arab') || t.includes('árabe') || t.includes('arabe')) eth = 'Árabe'
    else if (t.includes('slavic') || t.includes('eslava')) eth = 'Eslava'
  }
  if (!eth) return false

  onboarding.set(user.id, { step: 'askAge', data: { ...d, ethnicity: eth } })
  const body = 'Perfeito! Agora me diga a idade que você quer que ela tenha.\n\nDigite um número acima de 18+'
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askAge', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await sendWhatsAppText(sendId, phone, body)
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}

