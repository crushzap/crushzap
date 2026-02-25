import { checkSubscriptionAllowance, hasActiveSubscription } from '../../assinaturas/controle.mjs'
import { salvarSaidaEEnviar } from '../../dominio/mensagens/persistencia.mjs'
import { gerarUrlPublicaQrCodePix } from '../../pagamentos/pix-qrcode.mjs'
import { composeSystemPrompt } from '../../agents/prompt.mjs'
import { buildLLMMessages, isUnsafeLLMOutput, sanitizeLLMOutput } from '../../dominio/llm/historico.mjs'
import { generateWithLLM } from '../../integrations/llm-fallback.mjs'

export async function handleBilling(ctx) {
  const { prisma, reply, typed, billing, sendId, phone, conv, user, persona, sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppImageLink, createPixPayment, maps, personaReady, state } = ctx
  const reminders = maps.billingReminders

  const clearReminders = () => {
    const entry = reminders.get(user.id)
    if (entry?.timers?.length) {
      entry.timers.forEach((t) => clearTimeout(t))
    }
    reminders.delete(user.id)
  }

  const enviarFollowup = async (createdAt) => {
    const lastInbound = await prisma.onboardingMessage.findFirst({
      where: { userId: user.id, direction: 'in' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    if (lastInbound?.createdAt && lastInbound.createdAt.getTime() > createdAt) return
    const flowNow = maps.billingFlow.get(user.id)
    if (!flowNow || flowNow.step !== 'pix') return
    const pixMessages = [
      'Poxa, amor… cadê seu PIX? Eu tava animada pra continuar com você. Clica em COPIAR PIX e volta pra mim. 🥺',
      'Ei, amor, seu PIX ficou pendente. Se precisar, eu reenvio agora. 💜',
      'Não me deixa esperando… faz o PIX e a gente continua juntinhos. 😈',
      'Se tiver na correria eu entendo, mas quando der faz o PIX pra eu te mimar e a gente seguir conversando. ✨',
    ]
    const msg = pixMessages[Math.floor(Math.random() * 4)]
    const buttons = [
      { id: 'billing_copiar_pix', title: 'COPIAR PIX' },
      { id: 'billing_agora_nao', title: 'AGORA NÃO' },
    ]
    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'billing_followup_pix',
      content: msg,
      metadata: { buttons },
      enviar: () => sendWhatsAppButtons(sendId, phone, msg, buttons),
    })
  }

  const scheduleReminders = () => {
    clearReminders()
    const createdAt = Date.now()
    const delays = [20 * 60 * 1000, 3 * 60 * 60 * 1000]
    const timers = delays.map((delay) => setTimeout(() => {
      void enviarFollowup(createdAt)
    }, delay))
    reminders.set(user.id, { timers, createdAt })
  }

  if (maps.billingFlow.get(user.id)) {
    clearReminders()
  }

  if (reply === 'billing_copiar_pix') {
    const code = (billing?.pixCode || '').toString().trim()
    if (!code) {
      const txt = 'Não encontrei o código PIX agora. Se quiser, eu gero novamente.'
      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'billing_pix_missing',
        content: txt,
        enviar: () => sendWhatsAppText(sendId, phone, txt),
      })
      return true
    }
    const qrUrl = (billing?.pixQrUrl || '').toString().trim()
    if (qrUrl && typeof sendWhatsAppImageLink === 'function') {
      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'billing_pix_qrcode',
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
      step: 'billing_pix_code',
      content: code,
      enviar: () => sendWhatsAppText(sendId, phone, code),
    })
    return true
  }

  if (reply === 'billing_agora_nao' || (billing && (typed === 'agora nao' || typed === 'agora não'))) {
    maps.billingFlow.delete(user.id)
    const txt = 'Tudo bem, amor. Quando quiser, eu te ajudo a renovar.'
    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'billing_decline',
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
      const directive = '\n\nINSTRUÇÃO: O usuário escolheu "AGORA NÃO" para renovar/assinar. Continue a conversa por mensagem com uma resposta imersiva, quente e acolhedora. Proibido usar as palavras "virtual" ou expressões como "beijo virtual"/"algo virtual". Aja sempre como uma namorada real. Responda em 1–3 frases em PT-BR.'
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

  if (reply === 'billing_pacote_fotos' || (typed.includes('comprar') && (typed.includes('foto') || typed.includes('pacote')))) {
    const txt = "Quantas fotos você quer, amor? Escolhe aqui 👇"
    const buttons = [
      { id: 'billing_pacote_5', title: '5 FOTOS - R$0,05' },
      { id: 'billing_pacote_15', title: '15 FOTOS - R$0,10' },
      { id: 'billing_pacote_30', title: '30 FOTOS - R$0,15' }
    ]
    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'billing_pacote_choose',
      content: txt,
      metadata: { buttons },
      enviar: () => sendWhatsAppButtons(sendId, phone, txt, buttons)
    })
    return true
  }

  if (reply === 'billing_renovar_mensal' || reply === 'billing_renovar_semanal' || reply === 'billing_upgrade_mensal' || reply === 'billing_creditos_100' || reply === 'billing_pacote_5' || reply === 'billing_pacote_15' || reply === 'billing_pacote_30') {
    const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { price: 'asc' } })
    const semanal = plans.find((p) => (p.name || '').toString().toLowerCase().includes('semanal'))
    const mensal = plans.find((p) => (p.name || '').toString().toLowerCase().includes('mensal'))

    let pix = null
    let label = ''
    let action = ''
    if (reply === 'billing_renovar_mensal' || reply === 'billing_upgrade_mensal') {
      if (!mensal) {
        const txt = 'Não encontrei o plano mensal disponível agora.'
        await salvarSaidaEEnviar({
          prisma,
          store: 'onboarding',
          conversationId: conv.id,
          userId: user.id,
          personaId: persona.id,
          step: 'billing_plan_missing',
          content: txt,
          enviar: () => sendWhatsAppText(sendId, phone, txt),
        })
        return true
      }
      action = reply === 'billing_upgrade_mensal' ? 'upgrade_mensal' : 'renovacao_mensal'
      pix = await createPixPayment({ prisma, type: 'assinatura', planId: mensal.id, action, userPhone: phone, phoneNumberId: sendId, payerEmail: user.email || undefined, payerName: user.name || undefined })
      label = reply === 'billing_upgrade_mensal' ? 'Upgrade para Mensal' : 'Renovação Mensal'
    } else if (reply === 'billing_renovar_semanal') {
      if (!semanal) {
        const txt = 'Não encontrei o plano semanal disponível agora.'
        await salvarSaidaEEnviar({
          prisma,
          store: 'onboarding',
          conversationId: conv.id,
          userId: user.id,
          personaId: persona.id,
          step: 'billing_plan_missing',
          content: txt,
          enviar: () => sendWhatsAppText(sendId, phone, txt),
        })
        return true
      }
      action = 'renovacao_semanal'
      pix = await createPixPayment({ prisma, type: 'assinatura', planId: semanal.id, action, userPhone: phone, phoneNumberId: sendId, payerEmail: user.email || undefined, payerName: user.name || undefined })
      label = 'Renovação Semanal'
    } else if (reply === 'billing_pacote_5' || reply === 'billing_pacote_15' || reply === 'billing_pacote_30') {
      let amount = 0
      let count = 0
      if (reply === 'billing_pacote_5') { amount = 4.9; count = 5; action = 'pacote_fotos_5'; }
      if (reply === 'billing_pacote_15') { amount = 12.9; count = 15; action = 'pacote_fotos_15'; }
      if (reply === 'billing_pacote_30') { amount = 19.9; count = 30; action = 'pacote_fotos_30'; }
      
      pix = await createPixPayment({ prisma, type: 'avulso', amount, action, userPhone: phone, phoneNumberId: sendId, payerEmail: user.email || undefined, payerName: user.name || undefined })
      label = `Pacote ${count} Fotos`
    } else if (reply === 'billing_creditos_100') {
      const amount = Number(process.env.AVULSO_100_PRECO || 0) || Number(semanal?.price || 0) || 0
      if (!amount || amount <= 0) {
        const txt = 'Não consegui calcular o valor do avulso agora. Tente novamente em instantes.'
        await salvarSaidaEEnviar({
          prisma,
          store: 'onboarding',
          conversationId: conv.id,
          userId: user.id,
          personaId: persona.id,
          step: 'billing_amount_missing',
          content: txt,
          enviar: () => sendWhatsAppText(sendId, phone, txt),
        })
        return true
      }
      pix = await createPixPayment({ prisma, type: 'avulso', amount, action: 'creditos_100', credits: 100, userPhone: phone, phoneNumberId: sendId, payerEmail: user.email || undefined, payerName: user.name || undefined })
      label = 'Créditos avulsos (+100 mensagens)'
    }

    if (!pix) {
      const txt = 'Não consegui gerar o PIX agora. Tente novamente em instantes.'
      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'billing_pix_error',
        content: txt,
        enviar: () => sendWhatsAppText(sendId, phone, txt),
      })
      return true
    }
    let pixQrUrl = ''
    if (pix?.qrCodeBase64 && typeof sendWhatsAppImageLink === 'function') {
      try {
        const up = await gerarUrlPublicaQrCodePix({ checkoutId: pix.checkoutId, qrCodeBase64: pix.qrCodeBase64 })
        if (up.ok && up.publicUrl) pixQrUrl = up.publicUrl
      } catch {}
    }
    maps.billingFlow.set(user.id, { step: 'pix', pixCode: pix.copiaECola, pixQrUrl, label })
    const formatPrice = (value) => `R$ ${Number(value).toFixed(2).replace('.', ',')}`
    const precoSemanal = formatPrice(semanal?.price || 0)
    const precoMensal = formatPrice(mensal?.price || 0)
    const intro =
      action === 'renovacao_semanal'
        ? (
            'Perfeito, amor 😍\n\n' +
            `Esse PIX é só pra *renovar seu plano semanal por +7 dias* e liberar mais *100 mensagens* pra gente não ficar longe.\n\nValor: *${precoSemanal}*.\n\n` +
            'Vou te mandar o código em uma mensagem separada. Se precisar, clique em *COPIAR PIX* pra eu reenviar. 👇'
          )
        : action === 'renovacao_mensal'
          ? (
              'Perfeito, amor 😍\n\n' +
              `Esse PIX é só pra *renovar seu plano mensal por +30 dias* e liberar mais *500 mensagens* pra gente continuar juntinhos.\n\nValor: *${precoMensal}*.\n\n` +
              'Vou te mandar o código em uma mensagem separada. Se precisar, clique em *COPIAR PIX* pra eu reenviar. 👇'
            )
          : action === 'upgrade_mensal'
            ? (
                'Ai amor… assim eu me apaixono 😍✨\n\n' +
                `Esse PIX é pra fazer seu *upgrade pro plano mensal* e liberar *+30 dias* com *500 mensagens* pra gente viver muita coisa juntos.\n\nValor: *${precoMensal}*.\n\n` +
                'Vou te mandar o código em uma mensagem separada. Se precisar, clique em *COPIAR PIX* pra eu reenviar. 👇'
              )
            : `Perfeito, amor. Para ${label.toLowerCase()}, pague via PIX.\n\n*Toque no botão COPIAR PIX* aqui embaixo para pegar o código. Se precisar, toque nele de novo que eu reenvio.`

    const buttons = [
      { id: 'billing_copiar_pix', title: 'COPIAR PIX' },
      { id: 'billing_agora_nao', title: 'AGORA NÃO' },
    ]
    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'billing_pix_intro',
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
        step: 'billing_pix_qrcode',
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
        step: 'billing_pix_code',
        content: code,
        enviar: () => sendWhatsAppText(sendId, phone, code),
      })
    }
    scheduleReminders()
    return true
  }

  if (personaReady && !state) {
    const activeSub = await hasActiveSubscription(prisma, user.id)
    if (user.status === 'active' && !activeSub) {
      const last = await prisma.subscription.findFirst({ where: { userId: user.id }, orderBy: { currentPeriodEnd: 'desc' }, include: { plan: true } })
      const planName = (last?.plan?.name || '').toString()
      if (planName) {
        const lower = planName.toLowerCase()
      const txt = `Seu plano ${planName} venceu. *Toque em um dos botões abaixo* para continuar:`
        const buttons = lower.includes('semanal')
          ? [
              { id: 'billing_renovar_semanal', title: 'RENOVAR +7 DIAS' },
              { id: 'billing_upgrade_mensal', title: 'UPGRADE MENSAL' },
              { id: 'billing_agora_nao', title: 'AGORA NÃO' },
            ]
          : [
              { id: 'billing_renovar_mensal', title: 'RENOVAR AGORA' },
              { id: 'billing_agora_nao', title: 'AGORA NÃO' },
            ]
        await salvarSaidaEEnviar({
          prisma,
          store: 'onboarding',
          conversationId: conv.id,
          userId: user.id,
          personaId: persona.id,
          step: 'plan_expired',
          content: txt,
          metadata: { buttons },
          enviar: () => sendWhatsAppButtons(sendId, phone, txt, buttons),
        })
        maps.billingFlow.set(user.id, { step: 'expired', planName })
        return true
      }
    }

    const allowance = await checkSubscriptionAllowance(prisma, user.id)
    if (allowance.sub && !allowance.allowed) {
      const planName = (allowance.sub?.plan?.name || '').toString()
      const lower = planName.toLowerCase()
      const usage = typeof allowance.used === 'number' && typeof allowance.limit === 'number' && allowance.limit > 0 ? ` (${allowance.used}/${allowance.limit})` : ''
      
      const limitMessages = [
        `Amor, é uma pena que *você atingiu seu limite de mensagens* comigo 🥺💜\n\n*Preciso de você*. *Toque em um dos botões abaixo* pra renovar e continuar nossas conversas. ✨\n\nPlano: ${planName}${usage}`,
        `Vida, você fala bastante hein? Adoro! 😍 Seu limite do plano ${planName} esgotou hoje. *Toque em um dos botões abaixo* pra recarregar ou renovar e não me deixar no vácuo. 👇`,
        `Eita amor, travou aqui! 🚫 Atingimos o teto do seu plano ${planName}. *Toque em um dos botões abaixo* e dá um up pra gente conversar à vontade. 😈👇`,
        `Poxa, logo agora que tava ficando bom… seu saldo de mensagens acabou. 😤 *Toque em um dos botões abaixo* e renova pra eu te contar o resto.\n\nPlano: ${planName}${usage}`,
        `Amor, o sistema disse que você já gastou todas as mensagens do plano ${planName}. 🥺 *Toque em um dos botões abaixo* pra resolver e continuar comigo. 👇`,
      ]
      const txt = limitMessages[Math.floor(Math.random() * limitMessages.length)]

      const buttons = lower.includes('semanal')
        ? [
            { id: 'billing_renovar_semanal', title: 'RENOVAR +7 DIAS' },
            { id: 'billing_upgrade_mensal', title: 'UPGRADE MENSAL' },
            { id: 'billing_agora_nao', title: 'AGORA NÃO' },
          ]
        : [
            { id: 'billing_renovar_mensal', title: 'RENOVAR AGORA' },
            { id: 'billing_creditos_100', title: '+100 MENSAGENS' },
            { id: 'billing_agora_nao', title: 'AGORA NÃO' },
          ]
      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'plan_limit_reached',
        content: txt,
        metadata: { buttons },
        enviar: () => sendWhatsAppButtons(sendId, phone, txt, buttons),
      })
      maps.billingFlow.set(user.id, { step: 'limit', planName })
      return true
    }
  }

  return false
}
