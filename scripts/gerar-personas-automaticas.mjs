import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { buildPersonaPrompt, composeSystemPrompt } from '../server/agents/prompt.mjs'
import { generateWithLLM } from '../server/integrations/llm-fallback.mjs'
import { sendWhatsAppImageLink, sendWhatsAppText } from '../server/integracoes/whatsapp/cliente.mjs'
import { ensureConversation, isPersonaReady } from '../server/dominio/conversas/servico.mjs'
import { gerarAvatarFromConsistencyPack } from '../server/dominio/personas/consistency-pack.mjs'
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

let prisma

function pick(list) {
  return Array.isArray(list) && list.length ? list[Math.floor(Math.random() * list.length)] : null
}

function pickTitle(list, fallback) {
  const item = pick(list)
  if (item === null || item === undefined) return (fallback || '').toString()
  if (typeof item === 'string' || typeof item === 'number') return item.toString()
  return (item?.title || fallback || '').toString()
}

function normalizePersonaName(name) {
  return (name || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function parseDbInfo(url) {
  try {
    const u = new URL(url)
    const dbName = (u.pathname || '').replace('/', '')
    const ssl = u.searchParams.get('sslmode') || ''
    return { host: u.hostname, port: u.port || '5432', dbName, ssl }
  } catch {
    return { host: '', port: '', dbName: '', ssl: '' }
  }
}

function resolveDbUrl() {
  const scriptUrl = (process.env.POSTGRES_URL_SCRIPT || '').toString().trim()
  const envUrl = (process.env.POSTGRES_URL || '').toString().trim()
  return scriptUrl || envUrl || ''
}

function ensureSslMode(dbUrl) {
  try {
    const u = new URL(dbUrl)
    if (u.searchParams.get('sslmode')) return dbUrl
    u.searchParams.set('sslmode', 'require')
    return u.toString()
  } catch {
    return dbUrl
  }
}

function fotoEnabled() {
  const v = (process.env.PERSONA_FOTO_ENABLED || '').toString().trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'sim' || v === 'yes'
}

async function resolvePhoneNumberId() {
  const envId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').toString().trim()
  if (envId) return envId
  try {
    const cfg = await prisma.whatsappConfig.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      select: { phoneNumberId: true },
    })
    return (cfg?.phoneNumberId || '').toString().trim() || null
  } catch (e) {
    console.warn('Não consegui buscar whatsappConfig no banco, vou seguir sem phoneNumberId do banco.', (e?.message || '').toString())
    return null
  }
}

async function resolveConversationForPersona(userId, personaId) {
  const existing = await prisma.conversation.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
  if (existing) {
    if (existing.personaId !== personaId) {
      try {
        await prisma.conversation.update({
          where: { id: existing.id },
          data: { personaId, xaiLastResponseId: null, xaiLastResponseAt: null, xaiConvCacheId: null },
        })
      } catch {}
    }
    return ensureConversation(prisma, userId, personaId)
  }
  return ensureConversation(prisma, userId, personaId)
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

  const conv = await resolveConversationForPersona(user.id, persona.id)

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
    const gen = await generateWithLLM(chat, { useStore: false, timeoutMs: 25000 })
    if (gen?.ok && gen?.content) {
      greet = gen.content.toString().trim()
    }
  } catch {}

  if (fotoEnabled()) {
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
        let imgStatus = 'failed'
        if (phoneNumberId) {
          const imgRes = await sendWhatsAppImageLink(phoneNumberId, user.phone, foto.publicUrl)
          imgStatus = imgRes?.ok ? 'sent' : 'failed'
          if (!imgRes?.ok) {
            try { await sendWhatsAppText(phoneNumberId, user.phone, `Aqui está a minha foto: ${foto.publicUrl}`) } catch {}
          }
        }
        await prisma.message.update({ where: { id: imgMsg.id }, data: { status: imgStatus } })
      }
    } catch {}
  }

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
  const dbUrl = resolveDbUrl()
  if (!dbUrl) {
    console.error('POSTGRES_URL não configurado. Defina POSTGRES_URL ou POSTGRES_URL_SCRIPT no .env.')
    process.exit(1)
  }
  const info = parseDbInfo(dbUrl)
  console.log(`Conectando no banco ${info.host}:${info.port}/${info.dbName}${info.ssl ? ` (sslmode=${info.ssl})` : ''}`)
  const tryConnect = async (url) => {
    prisma = new PrismaClient({ datasources: { db: { url } } })
    await prisma.$connect()
    return url
  }
  let connectedUrl = ''
  try {
    connectedUrl = await tryConnect(dbUrl)
  } catch (e) {
    const retryUrl = ensureSslMode(dbUrl)
    if (retryUrl !== dbUrl) {
      const retryInfo = parseDbInfo(retryUrl)
      console.log(`Retry com SSL no banco ${retryInfo.host}:${retryInfo.port}/${retryInfo.dbName} (sslmode=require)`)
      try {
        connectedUrl = await tryConnect(retryUrl)
      } catch (e2) {
        console.error('Falha ao conectar no banco. Verifique POSTGRES_URL e acesso ao servidor.', (e2?.message || e?.message || '').toString())
        process.exit(1)
      }
    } else {
      console.error('Falha ao conectar no banco. Verifique POSTGRES_URL e acesso ao servidor.', (e?.message || '').toString())
      process.exit(1)
    }
  }
  if (connectedUrl) {
    const cInfo = parseDbInfo(connectedUrl)
    console.log(`Conexão ok ${cInfo.host}:${cInfo.port}/${cInfo.dbName}${cInfo.ssl ? ` (sslmode=${cInfo.ssl})` : ''}`)
  }
  const phoneNumberId = await resolvePhoneNumberId()
  const allUsers = await prisma.user.findMany({
    where: {
      role: { not: 'superadmin' },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      termsAccepted: true,
      personas: {
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, name: true, personality: true, prompt: true },
      },
    },
  })

  const users = allUsers.filter((u) => {
    if (!u.personas || u.personas.length === 0) return true
    const hasPadrao = u.personas.some((p) => normalizePersonaName(p?.name).startsWith('padrao'))
    if (hasPadrao) return true
    const ready = u.personas.some((p) => isPersonaReady(p))
    return !ready
  })

  console.log(`Usuários sem persona pronta: ${users.length}`)

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
