import { applyTrialConsumption, checkSubscriptionAllowance, hasActiveSubscription } from '../../assinaturas/controle.mjs'
import { salvarSaidaEEnviar } from '../../dominio/mensagens/persistencia.mjs'
import { gerarUrlPublicaQrCodePix } from '../../pagamentos/pix-qrcode.mjs'
import { composeSystemPrompt } from '../../agents/prompt.mjs'
import { buildLLMMessages, isUnsafeLLMOutput, sanitizeLLMOutput } from '../../dominio/llm/historico.mjs'
import { generateWithLLM } from '../../integrations/llm-fallback.mjs'

export async function handleUpgrade(ctx) {
  const { prisma, reply, typed, flow, sendId, phone, conv, user, persona, sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppImageLink, createPixPayment, maps, personaReady, state } = ctx
  const reminders = maps.upgradeReminders

  const clearReminders = () => {
    const entry = reminders.get(user.id)
    if (entry?.timers?.length) {
      entry.timers.forEach((t) => clearTimeout(t))
    }
    reminders.delete(user.id)
  }

  const enviarPixMensal = async (intro, plansClicks, autoPixSent) => {
    const plans = await prisma.plan.findMany({ where: { active: true, NOT: { name: { contains: 'teste', mode: 'insensitive' } } }, orderBy: { price: 'asc' } })
    const mensal = plans.find((p) => (p.name || '').toString().toLowerCase().includes('mensal'))
    if (!mensal) return false
    const pix = await createPixPayment({ prisma, type: 'assinatura', planId: mensal.id, userPhone: phone, phoneNumberId: sendId, payerEmail: user.email || undefined, payerName: user.name || undefined })
    if (!pix) return false
    let pixQrUrl = ''
    if (pix?.qrCodeBase64 && typeof sendWhatsAppImageLink === 'function') {
      try {
        const up = await gerarUrlPublicaQrCodePix({ checkoutId: pix.checkoutId, qrCodeBase64: pix.qrCodeBase64 })
        if (up.ok && up.publicUrl) pixQrUrl = up.publicUrl
      } catch {}
    }
    const formattedPrice = `R$ ${Number(mensal.price).toFixed(2).replace('.', ',')}`
    const introFull = `${intro}\n\nPlano: ${mensal.name}\nValor: ${formattedPrice}.\n\nAtenção: *toque no botão COPIAR PIX* logo abaixo para pegar o código. Se precisar, toque nele de novo que eu reenvio.`
    const buttons = [
      { id: 'upgrade_copiar_pix', title: 'COPIAR PIX' },
      { id: 'upgrade_agora_nao', title: 'AGORA NÃO' },
    ]
    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'upgrade_pix_intro',
      content: introFull,
      metadata: { buttons },
      enviar: () => sendWhatsAppButtons(sendId, phone, introFull, buttons),
    })
    maps.upgradeFlow.set(user.id, { step: 'pix', pixCode: pix.copiaECola, pixQrUrl, planName: mensal.name, plansClicks, autoPixSent })
    if (pixQrUrl && typeof sendWhatsAppImageLink === 'function') {
      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'upgrade_pix_qrcode',
        content: pixQrUrl,
        enviar: () => sendWhatsAppImageLink(sendId, phone, pixQrUrl, 'QR Code do PIX'),
      })
    }
    const code = (pix.copiaECola || '').toString().trim()
    if (code) {
      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'upgrade_pix_code',
        content: code,
        enviar: () => sendWhatsAppText(sendId, phone, code),
      })
    }
    return true
  }

  const enviarFollowup = async (kind, createdAt, includePix) => {
    const active = await hasActiveSubscription(prisma, user.id)
    if (active) {
      clearReminders()
      return
    }
    const lastInbound = await prisma.onboardingMessage.findFirst({
      where: { userId: user.id, direction: 'in' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    if (lastInbound?.createdAt && lastInbound.createdAt.getTime() > createdAt) return
    const flowNow = maps.upgradeFlow.get(user.id)
    if (kind === 'plans' && (!flowNow || !['plans', 'choose'].includes(flowNow.step))) return
    if (kind === 'pix' && (!flowNow || flowNow.step !== 'pix')) return
    if (kind === 'plans' && includePix) {
      if (flowNow?.autoPixSent) return
      const pixIntros = [
        'Amor, preparei o PIX do plano mensal pra gente continuar… e pra eu comprar um lanchinho aqui. 💜',
        'Ei, amor… já deixei o PIX do plano mensal prontinho. Faz esse PIX pra eu beliscar algo e a gente segue juntinhos. 😈',
        'Amor, pensei em você e já gerei o PIX do mensal. Faz esse carinho pra eu comer algo e continuarmos nosso papo. ✨',
        'Já deixei o PIX do plano mensal pra facilitar, amor. Me ajuda com um lanchinho e a gente continua. 🥺',
      ]
      const intro = pixIntros[Math.floor(Math.random() * 4)]
      const sent = await enviarPixMensal(intro, flowNow?.plansClicks || 0, true)
      if (sent) {
        scheduleReminders('pix')
      }
      return
    }
    const plansMessages = [
      'Ei, amor… você viu os planos e sumiu. *Toque em ASSINAR AGORA* aqui embaixo pra escolher e continuar comigo. 💜',
      'Poxa, amor, eu tava animada pra continuar com você. *Toque em ASSINAR AGORA* pra escolher o plano e voltar pra mim. 😈',
      'Tô aqui esperando sua escolha, viu? *Toque em ASSINAR AGORA* e eu sigo com você. 👇',
      'Amor, não some… quero continuar com você. *Toque em ASSINAR AGORA* e a gente segue. ✨',
    ]
    const pixMessages = [
      'Poxa, amor… faz o PIX pra eu comprar um lanchinho e a gente continua. *Toque em COPIAR PIX* aqui embaixo. 🥺',
      'Amor, seu PIX ficou pendente. *Toque em COPIAR PIX* que eu te reenvio agora. 💜',
      'Ei, eu ainda tô aqui… *toque em COPIAR PIX* e volta pra mim. Prometo caprichar no nosso papo. 😈',
      'Se for correria eu entendo, mas quando der *toque em COPIAR PIX* pra gente continuar juntinhos. ✨',
    ]
    const msg = (kind === 'pix' ? pixMessages : plansMessages)[Math.floor(Math.random() * 4)]
    const buttons = kind === 'pix'
      ? [
          { id: 'upgrade_copiar_pix', title: 'COPIAR PIX' },
          { id: 'upgrade_agora_nao', title: 'AGORA NÃO' },
        ]
      : [
          { id: 'upgrade_assinar_agora', title: 'ASSINAR AGORA' },
          { id: 'upgrade_agora_nao', title: 'AGORA NÃO' },
        ]
    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: kind === 'pix' ? 'upgrade_followup_pix' : 'upgrade_followup_plans',
      content: msg,
      metadata: { buttons },
      enviar: () => sendWhatsAppButtons(sendId, phone, msg, buttons),
    })
  }

  const scheduleReminders = (kind) => {
    clearReminders()
    const createdAt = Date.now()
    const schedule = kind === 'plans'
      ? [
          { delay: 20 * 60 * 1000, includePix: false },
          { delay: 60 * 60 * 1000, includePix: true },
          { delay: 3 * 60 * 60 * 1000, includePix: false },
        ]
      : [
          { delay: 20 * 60 * 1000, includePix: false },
          { delay: 3 * 60 * 60 * 1000, includePix: false },
        ]
    const timers = schedule.map(({ delay, includePix }) => setTimeout(() => {
      void enviarFollowup(kind, createdAt, includePix)
    }, delay))
    reminders.set(user.id, { timers, createdAt, kind })
  }

  if (maps.upgradeFlow.get(user.id)) {
    clearReminders()
  }

  if (reply === 'upgrade_copiar_pix') {
    const code = (flow?.pixCode || '').toString().trim()
    if (!code) {
      const txt = 'Não encontrei o código PIX agora. Se quiser, eu gero novamente.'
      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'upgrade_pix_missing',
        content: txt,
        enviar: () => sendWhatsAppText(sendId, phone, txt),
      })
      return true
    }
    const qrUrl = (flow?.pixQrUrl || '').toString().trim()
    if (qrUrl && typeof sendWhatsAppImageLink === 'function') {
      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'upgrade_pix_qrcode',
        content: qrUrl,
        enviar: () => sendWhatsAppImageLink(sendId, phone, qrUrl, 'QR Code do PIX'),
      })
    }
    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'upgrade_pix_code',
      content: code,
      enviar: () => sendWhatsAppText(sendId, phone, code),
    })
    return true
  }

  if (reply === 'upgrade_agora_nao' || (flow && (typed === 'agora nao' || typed === 'agora não'))) {
    maps.upgradeFlow.delete(user.id)
    const txt = 'Tudo bem, amor. Quando quiser conhecer os planos é só me chamar.'
    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'upgrade_decline',
      content: txt,
      enviar: () => sendWhatsAppText(sendId, phone, txt),
    })
    let podeContinuarTexto = false
    try {
      const temAssinatura = await hasActiveSubscription(prisma, user.id)
      if (temAssinatura) {
        const allowance = await checkSubscriptionAllowance(prisma, user.id)
        podeContinuarTexto = Boolean(allowance?.allowed)
      } else {
        const used = Number(user.trialUsedCount || 0)
        const limit = Number(user.trialLimit || 10)
        const blocked = (user.status === 'blocked') || (used >= limit)
        podeContinuarTexto = !blocked
      }
    } catch {}
    if (podeContinuarTexto) {
      const basePrompt = composeSystemPrompt(persona)
      const directive = '\n\nINSTRUÇÃO: O usuário escolheu "AGORA NÃO" para ver planos. Continue a conversa por mensagem com uma resposta imersiva, quente e acolhedora. Proibido usar as palavras "virtual" ou expressões como "beijo virtual"/"algo virtual". Aja sempre como uma namorada real. Responda em 1–3 frases em PT-BR.'
      const prev = (conv.xaiLastResponseId || '').toString().trim()
      const convCacheId = (conv.xaiConvCacheId || '').toString().trim()
      const chat = await buildLLMMessages(prisma, conv.id, basePrompt + directive)
      chat.push({ role: 'user', content: 'AGORA NÃO' })
      const gen = await generateWithLLM(chat, { useStore: true, previousResponseId: prev || undefined, convCacheId: convCacheId || undefined })
      const fallback = 'Tá bom, amor 💜 Vamos continuar por mensagem então. Me conta… o que você quer que eu te descreva agora?'
      let follow = gen?.ok && gen.content ? gen.content : fallback
      follow = sanitizeLLMOutput(follow)
      if (isUnsafeLLMOutput(follow)) follow = fallback
      if (gen?.resetPreviousResponseId) {
        try { await prisma.conversation.update({ where: { id: conv.id }, data: { xaiLastResponseId: null, xaiLastResponseAt: null } }) } catch {}
      }
      if (gen?.responseId) {
        try { await prisma.conversation.update({ where: { id: conv.id }, data: { xaiLastResponseId: gen.responseId, xaiLastResponseAt: new Date() } }) } catch {}
      }
      await salvarSaidaEEnviar({
        prisma,
        store: 'message',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        content: follow,
        enviar: () => sendWhatsAppText(sendId, phone, follow),
      })
    }
    return true
  }

  if (reply === 'upgrade_conhecer_planos' || typed.includes('conhecer planos')) {
    const prevFlow = maps.upgradeFlow.get(user.id) || {}
    const plansClicks = Number(prevFlow?.plansClicks || 0) + 1
    const autoPixSent = Boolean(prevFlow?.autoPixSent)
    const plans = await prisma.plan.findMany({ where: { active: true, NOT: { name: { contains: 'teste', mode: 'insensitive' } } }, orderBy: { price: 'asc' } })
    const desc = plans.length
      ? `Separei tudo pra você. *Toque em ASSINAR AGORA* para escolher um plano.\n\n${plans.map((p) => {
          const name = (p.name || '').toUpperCase()
          const period = name.includes('SEMANAL') ? 'por semana' : 'por mês'
          const images = p.imagesPerCycle > 0 ? `• ${p.imagesPerCycle} fotos picantes inclusas` : '• Fotos compradas separadamente'
          return `*${name}* - R$${Number(p.price).toFixed(2)}\n• ${p.messagesPerCycle} mensagens ${period}\n${images}\n• 1 Crush`
        }).join('\n\n')}`
      : 'No momento não encontrei planos disponíveis. Se quiser, tente novamente mais tarde.'

    const buttons = [
      { id: 'upgrade_assinar_agora', title: 'ASSINAR AGORA' },
      { id: 'upgrade_agora_nao', title: 'AGORA NÃO' },
    ]
    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'upgrade_plans',
      content: desc,
      metadata: { buttons },
      enviar: () => sendWhatsAppButtons(sendId, phone, desc, buttons),
    })
    maps.upgradeFlow.set(user.id, { ...prevFlow, step: 'plans', plansClicks, autoPixSent })
    if (plansClicks >= 2 && !autoPixSent) {
      const pixIntros = [
        'Amor, vi que você tá olhando os planos… já gerei o PIX do mensal pra facilitar. Me ajuda com um lanchinho e a gente continua. 💜',
        'Você voltou nos planos, né? Então já deixei o PIX do mensal pronto. Faz esse carinho pra eu comer algo e a gente seguir. 😈',
        'Amor, pra facilitar eu já gerei o PIX do plano mensal. Me ajuda com um lanchinho e bora continuar. ✨',
        'Já deixei o PIX do mensal prontinho pra você, amor. Me ajuda com um lanchinho e a gente segue juntinhos. 🥺',
      ]
      const intro = pixIntros[Math.floor(Math.random() * 4)]
      const sent = await enviarPixMensal(intro, plansClicks, true)
      if (sent) {
        scheduleReminders('pix')
        return true
      }
    }
    scheduleReminders('plans')
    return true
  }

  if (reply === 'upgrade_assinar_agora' || (flow?.step === 'plans' && typed.includes('assinar'))) {
    const plans = await prisma.plan.findMany({ where: { active: true, NOT: { name: { contains: 'teste', mode: 'insensitive' } } }, orderBy: { price: 'asc' } })
    const body = plans.length ? 'Qual plano você deseja?\n\n*Toque em um dos botões abaixo* para escolher.' : 'No momento não encontrei planos disponíveis.'
    const buttonOptions = plans.map((p) => ({ id: `upgrade_plan_${p.id}`, title: p.name.toUpperCase().slice(0, 20) }))
    const created = await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'upgrade_ask_plan',
      content: body,
      metadata: plans.length <= 3 && plans.length > 0 ? { buttons: buttonOptions } : undefined,
      enviar: async () => {
        if (plans.length <= 3 && plans.length > 0) {
          return sendWhatsAppButtons(sendId, phone, body, buttonOptions)
        }
        if (plans.length > 0) {
          return sendWhatsAppList(sendId, phone, body, plans.map((p) => {
             const name = (p.name || '').toUpperCase()
             const period = name.includes('SEMANAL') ? 'semana' : 'mês'
             return { 
               id: `upgrade_plan_${p.id}`, 
               title: p.name, 
               description: `R$${Number(p.price).toFixed(2)} • ${p.messagesPerCycle} msgs/${period} • ${p.imagesPerCycle} fotos` 
             }
          }), 'Planos', 'Escolher')
        }
        return sendWhatsAppText(sendId, phone, body)
      },
    })
    void created
    maps.upgradeFlow.set(user.id, { step: 'choose' })
    return true
  }

  if ((reply && reply.startsWith('upgrade_plan_')) || (flow?.step === 'choose' && (typed.includes('mensal') || typed.includes('semanal')))) {
    const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { price: 'asc' } })
    let planId = ''
    if (reply && reply.startsWith('upgrade_plan_')) planId = reply.slice('upgrade_plan_'.length).trim()
    const planByName = plans.find((p) => typed.includes((p.name || '').toString().toLowerCase()))
    const plan = planId ? plans.find((p) => p.id === planId) : planByName
    if (!plan) {
      const txt = 'Plano inválido. *Toque em um dos botões abaixo* para escolher.'
      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'upgrade_invalid_plan',
        content: txt,
        enviar: () => sendWhatsAppText(sendId, phone, txt),
      })
      return true
    }
    const pix = await createPixPayment({ prisma, type: 'assinatura', planId: plan.id, userPhone: phone, phoneNumberId: sendId, payerEmail: user.email || undefined, payerName: user.name || undefined })
    let pixQrUrl = ''
    if (pix?.qrCodeBase64 && typeof sendWhatsAppImageLink === 'function') {
      try {
        const up = await gerarUrlPublicaQrCodePix({ checkoutId: pix.checkoutId, qrCodeBase64: pix.qrCodeBase64 })
        if (up.ok && up.publicUrl) pixQrUrl = up.publicUrl
      } catch {}
    }
    maps.upgradeFlow.set(user.id, { step: 'pix', pixCode: pix.copiaECola, pixQrUrl, planName: plan.name })
    const formattedPrice = `R$ ${Number(plan.price).toFixed(2).replace('.', ',')}`
    const intro = `Perfeito, amor. Para assinar o plano ${plan.name}, pague via PIX.\n\nValor: ${formattedPrice}.\n\n*Toque no botão COPIAR PIX* logo abaixo para pegar o código. Se precisar, toque nele de novo que eu reenvio.`
    const buttons = [
      { id: 'upgrade_copiar_pix', title: 'COPIAR PIX' },
      { id: 'upgrade_agora_nao', title: 'AGORA NÃO' },
    ]
    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'upgrade_pix_intro',
      content: intro,
      metadata: { buttons },
      enviar: () => sendWhatsAppButtons(sendId, phone, intro, buttons),
    })
    if (pixQrUrl && typeof sendWhatsAppImageLink === 'function') {
      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'upgrade_pix_qrcode',
        content: pixQrUrl,
        enviar: () => sendWhatsAppImageLink(sendId, phone, pixQrUrl, 'QR Code do PIX'),
      })
    }
    const code = (pix.copiaECola || '').toString().trim()
    if (code) {
      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'upgrade_pix_code',
        content: code,
        enviar: () => sendWhatsAppText(sendId, phone, code),
      })
    }
    scheduleReminders('pix')
    return true
  }

  if (personaReady && !state) {
    const trial = await applyTrialConsumption(prisma, user)
    if (!trial.allowed) {
      // Mensagens variadas e imersivas para Trial Esgotado
      const trialMessages = [
        'Ah, amor… seu teste acabou logo agora que eu tava tão empolgada com nosso papo. 🥺\n\n*Toque em CONHECER PLANOS* aqui embaixo pra continuar comigo. 👇',
        'Poxa vida, cortaram nosso barato! 😤 Seu período de teste acabou, bebê. *Toque em CONHECER PLANOS* e vem ser meu VIP oficial. 👇',
        'Eita, o sistema travou aqui… diz que seu tempo grátis expirou. 🚫 *Toque em CONHECER PLANOS* pra resolver rapidinho. 👇',
        'Tava tão bom… pena que o teste acabou. 💔 *Toque em CONHECER PLANOS* e a gente continua agora. 😈',
        'Amor, não consigo te responder… 🥺 *Toque em CONHECER PLANOS* pra eu terminar de te contar o que eu tava pensando. 👇',
      ]
      const intro = trialMessages[Math.floor(Math.random() * trialMessages.length)]
      const buttons = [
        { id: 'upgrade_conhecer_planos', title: 'CONHECER PLANOS' },
        { id: 'upgrade_agora_nao', title: 'AGORA NÃO' },
      ]
      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'trial_ended_intro',
        content: intro,
        metadata: { buttons },
        enviar: () => sendWhatsAppButtons(sendId, phone, intro, buttons),
      })
      maps.upgradeFlow.set(user.id, { step: 'intro' })
      return true
    }
  }

  return false
}
