import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { buildPersonaPrompt, composeSystemPrompt } from '../server/agents/prompt.mjs'
import { generateWithGrok } from '../server/integrations/grok.mjs'
import { sendWhatsAppText } from '../server/integracoes/whatsapp/cliente.mjs'
import { ensureConversation } from '../server/dominio/conversas/servico.mjs'
import {
  NOMES_SUGERIDOS,
  PERSONALIDADES_LISTA,
  ETNIAS_LISTA,
  CABELOS_LISTA,
  CORES_CABELO_LISTA,
  CORPOS_LISTA,
  SEIOS_LISTA,
  BUNDAS_LISTA,
  ORIENTACOES_SEXUAIS_LISTA,
  PROFISSOES_LISTA,
  ROUPAS_LISTA,
} from '../server/whatsapp/onboarding/opcoes.mjs'

dotenv.config({ override: true })

const prisma = new PrismaClient()

function pick(list) {
  return Array.isArray(list) && list.length ? list[Math.floor(Math.random() * list.length)] : null
}

function pickTitle(list, fallback) {
  const item = pick(list)
  return (item?.title || fallback || '').toString()
}

async function resolvePhoneNumberId() {
  const envId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').toString().trim()
  if (envId) return envId
  const cfg = await prisma.whatsappConfig.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'desc' },
    select: { phoneNumberId: true },
  })
  return (cfg?.phoneNumberId || '').toString().trim() || null
}

async function gerarPersonaParaUsuario(user, phoneNumberId) {
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

  const persona = await prisma.persona.create({
    data: {
      userId: user.id,
      name: crushName,
      personality,
      avatar: null,
      responseMode: 'text',
      voicePreset: 'padrao',
      voicePitch: 50,
      voiceSpeed: 50,
      prompt,
    },
  })

  const conv = await ensureConversation(prisma, user.id, persona.id)

  let greet = `Oi amor, ${userName}. Eu tava te esperando… agora sou toda sua. O que a gente faz primeiro?`
  try {
    const systemPrompt = composeSystemPrompt(persona)
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
    const gen = await generateWithGrok(chat, { useStore: false, timeoutMs: 25000 })
    if (gen?.ok && gen?.content) {
      greet = gen.content.toString().trim()
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

  let status = 'failed'
  if (phoneNumberId) {
    const sendRes = await sendWhatsAppText(phoneNumberId, user.phone, greet)
    status = sendRes?.ok ? 'sent' : 'failed'
  }
  await prisma.message.update({ where: { id: firstMsg.id }, data: { status } })

  return { personaId: persona.id, conversationId: conv.id, status }
}

async function main() {
  const phoneNumberId = await resolvePhoneNumberId()
  const users = await prisma.user.findMany({
    where: {
      role: { not: 'superadmin' },
      personas: { none: {} },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true, phone: true },
  })

  console.log(`Usuários sem persona: ${users.length}`)

  for (const user of users) {
    console.log(`Gerando persona para ${user.id} (${user.phone})`)
    try {
      const res = await gerarPersonaParaUsuario(user, phoneNumberId)
      console.log(`OK persona ${res.personaId} | conversa ${res.conversationId} | envio ${res.status}`)
    } catch (e) {
      console.error('Falha ao gerar persona', { userId: user.id, error: (e?.message || 'erro desconhecido').toString() })
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
