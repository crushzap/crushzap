import { NOMES_SUGERIDOS, PERSONALIDADES_FALLBACK_BOTOES, PERSONALIDADES_LISTA } from '../onboarding/opcoes.mjs'
import { comentarioNomeCrushAsync } from '../onboarding/aura-comentarios.mjs'
import { rotearEtapaOnboarding } from '../onboarding/roteador.mjs'

export async function handleOnboarding(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, state, personaReady, sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppList, maps } = ctx
  const onboarding = maps.onboarding
  const reminders = maps.onboardingReminders

  const clearReminders = () => {
    const entry = reminders.get(user.id)
    if (entry?.timers?.length) {
      entry.timers.forEach((t) => clearTimeout(t))
    }
    reminders.delete(user.id)
  }

  const scheduleReminders = () => {
    clearReminders()
    const delays = [60 * 60 * 1000, 24 * 60 * 60 * 1000, 72 * 60 * 60 * 1000]
    const texts = [
      'Oi! Quer criar sua Crush agora? Posso te ajudar rapidinho.',
      'Passando pra lembrar: sua Crush ainda pode ser criada em poucos passos. Quer continuar?',
      'Último lembrete por aqui. Se quiser criar sua Crush, é só me chamar.'
    ]
    const timers = delays.map((delay, idx) => setTimeout(async () => {
      try {
        if (onboarding.get(user.id)) return
        const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { termsAccepted: true } })
        if (fresh?.termsAccepted) return
        const body = texts[idx] || texts[0]
        const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'reminder_followup', direction: 'out', type: 'text', content: body, status: 'queued' } })
        const result = await sendWhatsAppButtons(sendId, phone, body, [
          { id: 'retomar_onboarding', title: 'RETOMAR' },
          { id: 'lembrar_nao', title: 'AGORA NÃO' },
        ])
        await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
      } catch {}
    }, delay))
    reminders.set(user.id, { timers, createdAt: Date.now() })
  }

  const wantsAuto =
    !personaReady &&
    !state &&
    (reply === 'criar_automatico' ||
      reply === 'criar_aleatorio' ||
      typed === 'criar automatico' ||
      typed === 'criar automaticamente' ||
      typed === 'criar automática' ||
      typed === 'criar automático' ||
      typed === 'criar automatica' ||
      typed === 'gerar automatico' ||
      typed === 'gerar automaticamente' ||
      typed === 'automatico' ||
      typed === 'automatica' ||
      typed === 'automático' ||
      typed === 'automática')
  if (wantsAuto) {
    clearReminders()
    onboarding.set(user.id, { step: 'askName', data: { auto: true } })
    const body = 'Perfeito, vou criar sua Crush automaticamente.\n\nAntes, como você quer que ela te chame? Pode ser seu nome ou apelido.\n\nDigite aqui embaixo 👇'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askName', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }

  if (reply === 'vamos_sim' || typed === 'vamos sim') {
    if (personaReady || state) return true
    clearReminders()
    onboarding.set(user.id, { step: 'askName', data: {} })
    const startComment = 'Aí sim… vem comigo. A gente vai criar uma Crush com a sua cara.'
    const outStart = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentStart', direction: 'out', type: 'text', content: startComment, status: 'queued' } })
    const startRes = await sendWhatsAppText(sendId, phone, startComment)
    await prisma.onboardingMessage.update({ where: { id: outStart.id }, data: { status: startRes.ok ? 'sent' : 'failed' } })

    const body = 'Perfeito… vamos começar.\n\nComo você quer que a sua Crush te chame? Pode ser seu nome, um apelido, do jeitinho que você gosta.\n\nDigite aqui embaixo 👇'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askName', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }

  if (reply === 'agora_nao' || typed === 'agora nao') {
    if (personaReady || state) return true
    clearReminders()
    const body = 'Sem problemas! Quando quiser é só me chamar. Quer que eu te lembre mais tarde?'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'reminder', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppButtons(sendId, phone, body, [
      { id: 'lembrar_sim', title: 'QUERO' },
      { id: 'lembrar_nao', title: 'AGORA NÃO' },
    ])
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }

  if (reply === 'como_funciona' || typed === 'como funciona') {
    if (personaReady || state) return true
    clearReminders()
    const body = 'CrushZap cria uma companhia virtual personalizada para você. Você escolhe estilo, nome e como prefere receber respostas (texto/áudio). Conversa pelo WhatsApp a qualquer hora.'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'explain', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppButtons(sendId, phone, 'Pronto para criar agora?', [
      { id: 'vamos_sim', title: 'CRIAR AGORA' },
      { id: 'agora_nao', title: 'DEPOIS' },
    ])
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }

  if (reply === 'lembrar_sim') {
    if (personaReady) return true
    scheduleReminders()
    const body = 'Combinado. Vou te lembrar em alguns momentos.'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'reminder_confirm', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }

  if (reply === 'lembrar_nao') {
    clearReminders()
    const body = 'Tudo bem. Quando quiser, é só me chamar.'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'reminder_decline', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }

  if (reply === 'retomar_onboarding' || typed === 'retomar' || typed === 'continuar' || typed === 'voltar') {
    if (personaReady) return true
    clearReminders()
    onboarding.set(user.id, { step: 'askName', data: {} })
    const startComment = 'Perfeito, vamos retomar.'
    const outStart = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentResume', direction: 'out', type: 'text', content: startComment, status: 'queued' } })
    const startRes = await sendWhatsAppText(sendId, phone, startComment)
    await prisma.onboardingMessage.update({ where: { id: outStart.id }, data: { status: startRes.ok ? 'sent' : 'failed' } })

    const body = 'Como você quer que a sua Crush te chame? Pode ser seu nome, um apelido, do jeitinho que você gosta.\n\nDigite aqui embaixo 👇'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askName', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }

  const t = text.trim().toLowerCase()
  const isGreeting = !!t && (
    t === 'oi' || t === 'olá' || t === 'ola' ||
    t.includes('oi crush') ||
    t.includes('quer namorar comigo') ||
    t.includes('quer ser minha crush')
  )
  const total = await prisma.message.count({ where: { conversationId: conv.id } })

  if (!personaReady && !state && !reply && (isGreeting || (total <= 1 && typed))) {
    const welcome = 'Oi, seja *bem-vindo* ao CrushZap 💜\n' +
      '\n' +
      'Eu sou a Aura.\n' +
      '\n' +
      'Aqui você cria sua *Crush perfeita* em poucos passos e conversa 24h.\n' +
      '\n' +
      'Se preferir, posso criar tudo automaticamente. É só responder *criar automaticamente*.\n' +
      '\n' +
      'Vamos começar?'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'welcome', direction: 'out', type: 'text', content: welcome, status: 'queued' } })
    console.log('[WhatsApp Send] start', { to: phone, phoneNumberId: sendId })
    const result = await sendWhatsAppButtons(sendId, phone, welcome, [
      { id: 'vamos_sim', title: 'VAMOS SIM' },
      { id: 'agora_nao', title: 'AGORA NÃO' },
      { id: 'como_funciona', title: 'COMO FUNCIONA' },
    ])
    console.log('[WhatsApp Send] result', { ok: result.ok, status: result.ok ? 200 : undefined })
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }

  if (reply === 'nome_digitar' || typed === 'digitar nome') {
    onboarding.set(user.id, { step: 'askCrushNameInput', data: { ...(state?.data || {}) } })
    const comment = 'Amo quando você escolhe o nome com intenção… isso deixa tudo mais especial.'
    const outComment = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentCrushNameChoice', direction: 'out', type: 'text', content: comment, status: 'queued' } })
    const commentRes = await sendWhatsAppText(sendId, phone, comment)
    await prisma.onboardingMessage.update({ where: { id: outComment.id }, data: { status: commentRes.ok ? 'sent' : 'failed' } })

    const body = 'Me conta: qual vai ser o nome dela? Digite do jeitinho que você quer que eu chame. 👇'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askCrushNameInput', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }

  if (reply === 'nome_aleatorio' || typed === 'nome aleatorio' || typed === 'nome aleatório') {
    const chosen = NOMES_SUGERIDOS[Math.floor(Math.random() * NOMES_SUGERIDOS.length)]
    try { await prisma.persona.update({ where: { id: persona.id }, data: { name: chosen } }) } catch {}
    onboarding.set(user.id, { step: 'askPersonality', data: { ...(state?.data || {}), crushName: chosen } })
    const comment = await comentarioNomeCrushAsync(chosen)
    const outComment = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentCrushName', direction: 'out', type: 'text', content: comment, status: 'queued' } })
    const commentRes = await sendWhatsAppText(sendId, phone, comment)
    await prisma.onboardingMessage.update({ where: { id: outComment.id }, data: { status: commentRes.ok ? 'sent' : 'failed' } })

    const body = 'Agora vamos dar vida a ela.\n\nQue *personalidade* combina mais com a sua Crush?'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askPersonality', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppList(sendId, phone, body, PERSONALIDADES_LISTA, 'Personalidades', 'Ver opções')
    if (!result.ok) {
      await sendWhatsAppButtons(sendId, phone, 'Selecione a personalidade:', PERSONALIDADES_FALLBACK_BOTOES)
    }
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }
  return rotearEtapaOnboarding(ctx)
}
