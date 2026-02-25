import { NOMES_SUGERIDOS, PERSONALIDADES_FALLBACK_BOTOES, PERSONALIDADES_LISTA, ETNIAS_LISTA, CABELOS_LISTA, CORES_CABELO_LISTA, CORPOS_LISTA, SEIOS_LISTA, BUNDAS_LISTA, ORIENTACOES_SEXUAIS_LISTA, PROFISSOES_LISTA, ROUPAS_LISTA } from '../onboarding/opcoes.mjs'
import { comentarioNomeCrushAsync } from '../onboarding/aura-comentarios.mjs'
import { rotearEtapaOnboarding } from '../onboarding/roteador.mjs'
import { buildPersonaPrompt, composeSystemPrompt } from '../../agents/prompt.mjs'
import { generateWithLLM } from '../../integrations/llm-fallback.mjs'
import { isUnsafeLLMOutput, sanitizeLLMOutput } from '../../dominio/llm/historico.mjs'
import { gerarAvatarFromConsistencyPack } from '../../dominio/personas/consistency-pack.mjs'

export async function handleOnboarding(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, state, personaReady, sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppImageLink, maps } = ctx
  const onboarding = maps.onboarding
  const reminders = maps.onboardingReminders

  const clearReminders = () => {
    const entry = reminders.get(user.id)
    if (entry?.timers?.length) {
      entry.timers.forEach((t) => clearTimeout(t))
    }
    reminders.delete(user.id)
  }

  const etapasPendentes = [
    'welcome',
    'askName',
    'confirmName',
    'askEmail',
    'confirmEmail',
    'askCrushNameChoice',
    'askCrushNameInput',
    'askPersonality',
    'askEthnicity',
    'askAge',
    'askHairStyle',
    'askHairColor',
    'askBodyType',
    'askBreastSize',
    'askButtSize',
    'askSexualPreference',
    'askOccupation',
    'askClothing',
    'askCommModeFinal',
    'askTermsFinal',
  ]

  const etapaRotulo = {
    welcome: 'Boas-vindas',
    askName: 'Seu nome',
    confirmName: 'Confirmação do seu nome',
    askEmail: 'Seu e-mail',
    confirmEmail: 'Confirmação do seu e-mail',
    askCrushNameChoice: 'Nome da Crush',
    askCrushNameInput: 'Nome da Crush',
    askPersonality: 'Personalidade',
    askEthnicity: 'Etnia',
    askAge: 'Idade',
    askHairStyle: 'Cabelo',
    askHairColor: 'Cor do cabelo',
    askBodyType: 'Corpo',
    askBreastSize: 'Seios',
    askButtSize: 'Bumbum',
    askSexualPreference: 'Orientação sexual',
    askOccupation: 'Profissão',
    askClothing: 'Roupa',
    askCommModeFinal: 'Modo de resposta',
    askTermsFinal: 'Termos de uso',
  }

  const getUltimaInteracao = async () => {
    const lastInbound = await prisma.onboardingMessage.findFirst({
      where: { userId: user.id, direction: 'in' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    if (lastInbound?.createdAt) return new Date(lastInbound.createdAt).getTime()
    const lastOutbound = await prisma.onboardingMessage.findFirst({
      where: { userId: user.id, direction: 'out', step: { in: etapasPendentes } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    if (lastOutbound?.createdAt) return new Date(lastOutbound.createdAt).getTime()
    return 0
  }

  const enviarFollowup = async (delay) => {
    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { termsAccepted: true } })
    if (fresh?.termsAccepted) return
    const lastInteractionAt = await getUltimaInteracao()
    if (!lastInteractionAt) return
    if ((Date.now() - lastInteractionAt) < delay) return
    const pending = await prisma.onboardingMessage.findFirst({
      where: { userId: user.id, direction: 'out', step: { in: etapasPendentes } },
      orderBy: { createdAt: 'desc' },
      select: { step: true, content: true },
    })
    if (!pending?.content) return
    const rotulo = etapaRotulo[pending.step] || 'Onboarding'
    const body = `Você parou na etapa *${rotulo}*. Vamos continuar?\n\n${pending.content}`
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'followup_onboarding', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  }

  const scheduleReminders = () => {
    clearReminders()
    const delays = [10 * 60 * 1000, 60 * 60 * 1000]
    const timers = delays.map((delay) => setTimeout(async () => {
      try {
        await enviarFollowup(delay)
      } catch {}
    }, delay))
    reminders.set(user.id, { timers, createdAt: Date.now() })
  }

  const pick = (list) => (Array.isArray(list) && list.length ? list[Math.floor(Math.random() * list.length)] : null)
  const pickTitle = (list, fallback) => {
    const item = pick(list)
    if (item === null || item === undefined) return (fallback || '').toString()
    if (typeof item === 'string' || typeof item === 'number') return item.toString()
    return (item?.title || fallback || '').toString()
  }
  const fotoEnabled = () => {
    const v = (process.env.PERSONA_FOTO_ENABLED || '').toString().trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'sim' || v === 'yes'
  }

  const iniciarAuto = async () => {
    clearReminders()
    onboarding.delete(user.id)
    const crushName = pickTitle(NOMES_SUGERIDOS, 'Crush')
    const personality = pickTitle(PERSONALIDADES_LISTA, 'Apaixonada')
    const ethnicity = pickTitle(ETNIAS_LISTA, 'Latina')
    const hairStyle = pickTitle(CABELOS_LISTA, 'Liso')
    const hairColor = pickTitle(CORES_CABELO_LISTA, 'Castanho')
    const bodyType = pickTitle(CORPOS_LISTA, 'Cheinha')
    const breastSize = pickTitle(SEIOS_LISTA, 'Médios')
    const buttSize = pickTitle(BUNDAS_LISTA, 'Média')
    const sexualPreference = pickTitle(ORIENTACOES_SEXUAIS_LISTA, 'Hétero')
    const occupation = pickTitle(PROFISSOES_LISTA, 'Modelo')
    const outfit = pickTitle(ROUPAS_LISTA, 'Jeans')
    const ages = [19, 21, 23, 25, 27, 29]
    const age = ages[Math.floor(Math.random() * ages.length)]
    const userName = (user.name || 'amor').toString()
    const userEmail = (user.email || '').toString()
    const prompt = buildPersonaPrompt({
      cName: crushName,
      pers: personality,
      eth: ethnicity,
      age,
      hs: hairStyle,
      hc: hairColor,
      bt: bodyType,
      bs: breastSize,
      bs2: buttSize,
      sexualPreference,
      job: occupation,
      outfit,
      uName: userName,
      uEmail: userEmail,
    })
    const personaAtualizada = {
      ...persona,
      name: crushName,
      personality,
      prompt,
      responseMode: 'text',
      voicePreset: 'padrao',
      voicePitch: 50,
      voiceSpeed: 50,
    }
    try {
      await prisma.persona.update({
        where: { id: persona.id },
        data: {
          name: crushName,
          personality,
          prompt,
          responseMode: 'text',
          voicePreset: 'padrao',
          voicePitch: 50,
          voiceSpeed: 50,
        },
      })
    } catch {}
    try {
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { personaId: persona.id, xaiLastResponseId: null, xaiLastResponseAt: null, xaiConvCacheId: null },
      })
    } catch {}
    if (fotoEnabled() && typeof sendWhatsAppImageLink === 'function') {
      try {
        const foto = await gerarAvatarFromConsistencyPack({ prisma, personaId: persona.id, type: 'selfie_mirror_outfit_01' })
        if (foto?.ok && foto.publicUrl) {
          const imgMsg = await prisma.message.create({
            data: {
              conversationId: conv.id,
              userId: user.id,
              personaId: persona.id,
              direction: 'out',
              type: 'image',
              content: foto.publicUrl,
              status: 'queued',
            },
          })
          const imgRes = await sendWhatsAppImageLink(sendId, phone, foto.publicUrl)
          await prisma.message.update({ where: { id: imgMsg.id }, data: { status: imgRes?.ok ? 'sent' : 'failed' } })
          if (!imgRes?.ok) {
            try { await sendWhatsAppText(sendId, phone, `Aqui está a minha foto: ${foto.publicUrl}`) } catch {}
          }
        }
      } catch {}
    }
    let greet = `Oi amor, ${userName}. Eu tava te esperando… agora sou toda sua. O que a gente faz primeiro?`
    try {
      const systemPrompt = composeSystemPrompt(personaAtualizada)
      const introInstruction = `[INSTRUÇÃO DE SISTEMA: Esta é sua PRIMEIRA mensagem para ${userName} logo após ser criada.
Aja como uma namorada real e apaixonada que acabou de conhecer o amor da sua vida.
Use o nome dele (${userName}).
Seja extremamente carinhosa, imersiva e sedutora (se sua personalidade permitir).
NÃO mencione que é virtual, IA ou robô.
Máximo de 2 parágrafos curtos.
Termine com uma pergunta engajadora para ele.]`
      const chat = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: introInstruction },
      ]
      const genPromise = generateWithLLM(chat, { useStore: false })
      const timeoutPromise = new Promise((r) => setTimeout(() => r(null), 8000))
      const gen = await Promise.race([genPromise, timeoutPromise])
      if (gen && gen.ok && gen.content) {
        const candidate = sanitizeLLMOutput(gen.content)
        if (!isUnsafeLLMOutput(candidate)) {
          greet = candidate
        }
      }
    } catch {}
    const firstMsg = await prisma.message.create({
      data: {
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        direction: 'out',
        type: 'text',
        content: greet,
        status: 'queued',
      },
    })
    const sendRes = await sendWhatsAppText(sendId, phone, greet)
    await prisma.message.update({ where: { id: firstMsg.id }, data: { status: sendRes?.ok ? 'sent' : 'failed' } })
    return true
  }

  const wantsAuto =
    !personaReady &&
    (reply === 'criar_automatico' ||
      reply === 'criar_aleatorio' ||
      reply === 'quero_conversar' ||
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
      typed === 'automática' ||
      typed === 'quero conversar')
  if (wantsAuto) {
    return iniciarAuto()
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
    scheduleReminders()
    return true
  }

  if (reply === 'agora_nao' || typed === 'agora nao') {
    if (personaReady || state) return true
    clearReminders()
    const body = 'Sem problemas! Quando quiser é só me chamar. Quer que eu te lembre mais tarde?'
    const buttons = [
      { id: 'lembrar_sim', title: 'QUERO' },
      { id: 'lembrar_nao', title: 'AGORA NÃO' },
    ]
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'reminder', direction: 'out', type: 'text', content: body, status: 'queued', metadata: { buttons } } })
    const result = await sendWhatsAppButtons(sendId, phone, body, buttons)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    scheduleReminders()
    return true
  }

  if (reply === 'como_funciona' || typed === 'como funciona') {
    if (personaReady || state) return true
    clearReminders()
    const body = 'CrushZap cria uma companhia virtual personalizada para você. Você escolhe estilo, nome e como prefere receber respostas (texto/áudio). Conversa pelo WhatsApp a qualquer hora.'
    const buttons = [
      { id: 'vamos_sim', title: 'CRIAR AGORA' },
      { id: 'agora_nao', title: 'DEPOIS' },
    ]
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'explain', direction: 'out', type: 'text', content: body, status: 'queued', metadata: { buttons } } })
    const result = await sendWhatsAppButtons(sendId, phone, 'Pronto para criar agora?', buttons)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    scheduleReminders()
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
    scheduleReminders()
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
      'Se preferir, posso criar tudo automaticamente. É só tocar em *QUERO CONVERSAR*.\n' +
      '\n' +
      'Vamos começar?'
    const buttons = [
      { id: 'vamos_sim', title: 'VAMOS SIM' },
      { id: 'quero_conversar', title: 'QUERO CONVERSAR' },
      { id: 'como_funciona', title: 'COMO FUNCIONA' },
    ]
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'welcome', direction: 'out', type: 'text', content: welcome, status: 'queued', metadata: { buttons } } })
    console.log('[WhatsApp Send] start', { to: phone, phoneNumberId: sendId })
    const result = await sendWhatsAppButtons(sendId, phone, welcome, buttons)
    console.log('[WhatsApp Send] result', { ok: result.ok, status: result.ok ? 200 : undefined })
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    scheduleReminders()
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
    scheduleReminders()
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
    let metadata = undefined
    if (!result.ok) {
      await sendWhatsAppButtons(sendId, phone, 'Selecione a personalidade:', PERSONALIDADES_FALLBACK_BOTOES)
      metadata = { buttons: PERSONALIDADES_FALLBACK_BOTOES }
    }
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed', metadata } })
    scheduleReminders()
    return true
  }
  const handled = await rotearEtapaOnboarding(ctx)
  if (handled) {
    scheduleReminders()
    return true
  }

  if (!personaReady && state && !reply && typed) {
    const current = onboarding.get(user.id) || state
    const attempts = Number(current?.textAttempts || 0) + 1
    if (attempts >= 3) {
      return iniciarAuto()
    }
    onboarding.set(user.id, { step: current.step, data: current.data || {}, textAttempts: attempts })
  }
  return false
}
