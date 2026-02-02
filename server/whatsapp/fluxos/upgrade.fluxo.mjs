import { applyTrialConsumption } from '../../assinaturas/controle.mjs'
import { salvarSaidaEEnviar } from '../../dominio/mensagens/persistencia.mjs'
import { gerarUrlPublicaQrCodePix } from '../../pagamentos/pix-qrcode.mjs'

export async function handleUpgrade(ctx) {
  const { prisma, reply, typed, flow, sendId, phone, conv, user, persona, sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppImageLink, createPixPayment, maps, personaReady, state } = ctx

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
    return true
  }

  if (reply === 'upgrade_conhecer_planos' || typed.includes('conhecer planos')) {
    const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { price: 'asc' } })
    const desc = plans.length
      ? `Aqui estão os planos disponíveis:\n\n${plans.map((p) => {
          const name = (p.name || '').toUpperCase()
          const period = name.includes('SEMANAL') ? 'por semana' : 'por mês'
          const images = p.imagesPerCycle > 0 ? `• ${p.imagesPerCycle} fotos picantes inclusas` : '• Fotos compradas separadamente'
          return `*${name}* - R$${Number(p.price).toFixed(2)}\n• ${p.messagesPerCycle} mensagens ${period}\n${images}\n• até ${p.personasAllowed} Crush(es)`
        }).join('\n\n')}`
      : 'No momento não encontrei planos disponíveis.'

    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'upgrade_plans',
      content: desc,
      enviar: () => sendWhatsAppButtons(sendId, phone, desc, [
        { id: 'upgrade_assinar_agora', title: 'ASSINAR AGORA' },
        { id: 'upgrade_agora_nao', title: 'AGORA NÃO' },
      ]),
    })
    maps.upgradeFlow.set(user.id, { step: 'plans' })
    return true
  }

  if (reply === 'upgrade_assinar_agora' || (flow?.step === 'plans' && typed.includes('assinar'))) {
    const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { price: 'asc' } })
    const body = plans.length ? 'Qual plano você deseja?' : 'No momento não encontrei planos disponíveis.'
    const created = await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'upgrade_ask_plan',
      content: body,
      enviar: async () => {
        if (plans.length <= 3 && plans.length > 0) {
          return sendWhatsAppButtons(sendId, phone, body, plans.map((p) => ({ id: `upgrade_plan_${p.id}`, title: p.name.toUpperCase().slice(0, 20) })))
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
      const txt = 'Plano inválido. Tente novamente.'
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
    const intro = `Perfeito, amor. Para assinar o plano ${plan.name}, pague via PIX.\n\nVou te mandar o código em uma mensagem separada. Se precisar, clique em COPIAR PIX para eu reenviar.`
    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'upgrade_pix_intro',
      content: intro,
      enviar: () => sendWhatsAppButtons(sendId, phone, intro, [
        { id: 'upgrade_copiar_pix', title: 'COPIAR PIX' },
        { id: 'upgrade_agora_nao', title: 'AGORA NÃO' },
      ]),
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
    return true
  }

  if (personaReady && !state) {
    const trial = await applyTrialConsumption(prisma, user)
    if (!trial.allowed) {
      // Mensagens variadas e imersivas para Trial Esgotado
      const trialMessages = [
        'Ah, amor que pena que seu plano de teste acabou, logo agora que eu estava tão empolgada com nosso papo. 🥺\n\nMas amor, me ajuda a retornar para você. Clique abaixo para ver como continuar comigo! 👇',
        'Poxa vida, cortaram nosso barato! 😤 Seu período de teste acabou, bebê. Mas eu não quero parar de falar com você... Vem ser meu VIP oficial pra gente continuar? 👇',
        'Eita, o sistema travou aqui... Diz que seu tempo grátis expirou. 🚫 Não me deixa esperando, resolve isso rapidinho pra eu te dar a atenção que você merece! 👇',
        'Tava tão bom... pena que o teste acabou. 💔 Mas a gente pode continuar se você assinar agora. Prometo que vale a pena... 😈',
        'Amor, não consigo te responder... 🥺 Apareceu um aviso que você precisa ser assinante. Vem pro VIP pra eu terminar de te contar o que eu tava pensando... 👇'
      ]
      const intro = trialMessages[Math.floor(Math.random() * trialMessages.length)]

      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'trial_ended_intro',
        content: intro,
        enviar: () => sendWhatsAppButtons(sendId, phone, intro, [
          { id: 'upgrade_conhecer_planos', title: 'CONHECER PLANOS' },
          { id: 'upgrade_agora_nao', title: 'AGORA NÃO' },
        ]),
      })
      maps.upgradeFlow.set(user.id, { step: 'intro' })
      return true
    }
  }

  return false
}
