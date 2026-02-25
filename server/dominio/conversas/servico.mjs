import crypto from 'node:crypto'
import { gerarConsistencyPack } from '../personas/consistency-pack.mjs'

export async function ensureUserByPhone(prisma, phone) {
  const found = await prisma.user.findUnique({ where: { phone } })
  if (found) return found
  return prisma.user.create({ data: { phone, role: 'user', status: 'lead' } })
}

export async function ensureDefaultPersona(prisma, userId) {
  const lastMsg = await prisma.message.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { personaId: true }
  })
  if (lastMsg?.personaId) {
    const pLast = await prisma.persona.findUnique({ where: { id: lastMsg.personaId } })
    if (pLast) return pLast
  }

  const p = await prisma.persona.findFirst({
    where: { userId },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
  })
  if (p) return p
  const created = await prisma.persona.create({ data: { userId, name: 'Padrão', personality: 'Equilibrada', avatar: null, responseMode: 'text', voicePreset: 'padrao', voicePitch: 50, voiceSpeed: 50, prompt: 'Você é atenciosa e gentil.' } })
  try {
    const ready = await isPersonaReady(created)
    if (ready) {
      gerarConsistencyPack({ prisma, personaId: created.id }).catch(() => {})
    }
  } catch {}
  return created
}

export async function ensureConversation(prisma, userId, personaId) {
  const c = await prisma.conversation.findFirst({ where: { userId, personaId }, orderBy: { createdAt: 'desc' } })
  if (c) {
    if ((c.xaiConvCacheId || '').toString().trim()) return c
    try {
      return await prisma.conversation.update({ where: { id: c.id }, data: { xaiConvCacheId: crypto.randomUUID() } })
    } catch {
      return c
    }
  }
  return prisma.conversation.create({ data: { userId, personaId, xaiConvCacheId: crypto.randomUUID() } })
}

export async function isPersonaReady(persona) {
  const normalizedName = (persona?.name || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const nameOk = !normalizedName.startsWith('padrao')
  const prompt = (persona?.prompt || '').toString()
  const promptOk = prompt.length > 50 && /Você é uma Crush chamada|Aparência:|Estilo de roupa:/i.test(prompt)
  const personalityOk = !!(persona?.personality || '').toString().trim()
  return Boolean(nameOk && personalityOk && promptOk)
}
