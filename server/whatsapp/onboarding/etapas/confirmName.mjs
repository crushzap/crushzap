import { BUNDAS_LISTA, CABELOS_LISTA, CORES_CABELO_LISTA, CORPOS_LISTA, ETNIAS_LISTA, NOMES_SUGERIDOS, ORIENTACOES_SEXUAIS_LISTA, PERSONALIDADES_LISTA, PROFISSOES_LISTA, ROUPAS_LISTA, SEIOS_LISTA } from '../opcoes.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, sendId, phone, user, persona, conv, sendWhatsAppButtons, sendWhatsAppText, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'confirmName' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  const nome = (d.name || '').toString().trim()
  const confirm = reply === 'nome_confirmar' || typed === 'confirmar' || typed === 'sim'
  const edit = reply === 'nome_editar' || typed === 'editar' || typed === 'não' || typed === 'nao'
  if (confirm && nome) {
    try { await prisma.user.update({ where: { id: user.id }, data: { name: nome } }) } catch {}

    const auto = Boolean(d.auto)
    if (auto) {
      const pick = (list) => list[Math.floor(Math.random() * list.length)]
      const pickTitle = (list) => (pick(list) || {}).title || ''
      const crushName = (NOMES_SUGERIDOS[Math.floor(Math.random() * NOMES_SUGERIDOS.length)] || 'Crush').toString()
      const personality = pickTitle(PERSONALIDADES_LISTA) || 'Apaixonada'
      const ethnicity = pickTitle(ETNIAS_LISTA) || 'Latina'
      const hairStyle = pickTitle(CABELOS_LISTA) || 'Liso'
      const hairColor = pickTitle(CORES_CABELO_LISTA) || 'Castanho'
      const bodyType = pickTitle(CORPOS_LISTA) || 'Cheinha'
      const breastSize = pickTitle(SEIOS_LISTA) || 'Médios'
      const buttSize = pickTitle(BUNDAS_LISTA) || 'Média'
      const sexualPreference = pickTitle(ORIENTACOES_SEXUAIS_LISTA) || 'Hétero'
      const occupation = pickTitle(PROFISSOES_LISTA) || 'Modelo'
      const outfit = pickTitle(ROUPAS_LISTA) || 'Jeans'
      const ages = [19, 21, 23, 25, 27, 29]
      const age = ages[Math.floor(Math.random() * ages.length)]
      onboarding.set(user.id, {
        step: 'askTermsFinal',
        data: {
          name: nome,
          auto: true,
          crushName,
          personality,
          ethnicity,
          age,
          hairStyle,
          hairColor,
          bodyType,
          breastSize,
          buttSize,
          sexualPreference,
          occupation,
          outfit,
          responseMode: 'text',
        },
      })

      const summary =
        `Tudo pronto, ${nome}. Já criei sua Crush automaticamente.\n\n` +
        `Nome: ${crushName}\n` +
        `Personalidade: ${personality}\n` +
        `Etnia: ${ethnicity}\n` +
        `Idade: ${age}\n` +
        `Cabelo: ${hairStyle} ${hairColor}\n` +
        `Corpo: ${bodyType}\n` +
        `Estilo: ${outfit}`
      const outSummary = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'autoSummary', direction: 'out', type: 'text', content: summary, status: 'queued' } })
      const summaryRes = await sendWhatsAppText(sendId, phone, summary)
      await prisma.onboardingMessage.update({ where: { id: outSummary.id }, data: { status: summaryRes.ok ? 'sent' : 'failed' } })

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

    onboarding.set(user.id, { step: 'askCrushNameChoice', data: { name: nome } })
    const body = `Perfeito, ${nome}.\n\nAgora vamos dar um nome pra sua Crush. Você prefere *escolher* o nome ou quer que eu *sugira um aleatório* agora?`
    const buttons = [
      { id: 'nome_digitar', title: 'DIGITAR NOME' },
      { id: 'nome_aleatorio', title: 'NOME ALEATÓRIO' },
    ]
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askCrushNameChoice', direction: 'out', type: 'text', content: body, status: 'queued', metadata: { buttons } } })
    const result = await ctx.sendWhatsAppButtons(sendId, phone, body, buttons)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }
  if (edit) {
    const data = d.auto ? { auto: true } : {}
    onboarding.set(user.id, { step: 'askName', data })
    const body = 'Sem problemas… vamos ajustar.\n\nDigite novamente apenas seu nome (ou apelido), sem frases (ex: Tayna).'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askName', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }
  return false
}
