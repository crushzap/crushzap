import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { createPixPayment, processMercadoPagoWebhook } from './pagamentos/mercadoPago.mjs'
import { startSubscriptionExpiryJob } from './assinaturas/controle.mjs'
import { createAdminRouter } from './rotas/admin.rotas.mjs'
import { createPagamentosRouter } from './rotas/pagamentos.rotas.mjs'
import { createWhatsAppRouter } from './rotas/whatsapp.rotas.mjs'
import { createAuthRouter } from './rotas/auth.rotas.mjs'
import { createCoreRouter } from './rotas/core.rotas.mjs'
import { createConversasRouter } from './rotas/conversas.rotas.mjs'
import { ensureConversation as ensureConversationBase, ensureDefaultPersona as ensureDefaultPersonaBase, ensureUserByPhone as ensureUserByPhoneBase } from './dominio/conversas/servico.mjs'

dotenv.config({ override: process.env.NODE_ENV !== 'production' })
const app = express()
const prisma = new PrismaClient()

const ensureUserByPhone = (phone) => ensureUserByPhoneBase(prisma, phone)
const ensureDefaultPersona = (userId) => ensureDefaultPersonaBase(prisma, userId)
const ensureConversation = (userId, personaId) => ensureConversationBase(prisma, userId, personaId)

app.use(cors({ origin: true }))
app.use(express.json())

// Logger básico para acompanhar chamadas ao webhook do WhatsApp
app.use('/api/whatsapp/webhook', (req, _res, next) => {
  try {
    console.log('[HTTP]', req.method, req.originalUrl)
  } catch {}
  next()
})
app.use(createCoreRouter())
app.use(createAuthRouter({ prisma }))
app.use(createAdminRouter({ prisma }))
app.use(createPagamentosRouter({ prisma, createPixPayment, processMercadoPagoWebhook, ensureUserByPhone, ensureDefaultPersona, ensureConversation }))
app.use(createWhatsAppRouter({ prisma }))
app.use(createConversasRouter({ prisma }))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`[CrushZap API] Servindo em http://localhost:${PORT}`)
})

const retentionDays = Number(process.env.MESSAGE_RETENTION_DAYS || 60)
setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    await prisma.message.deleteMany({ where: { createdAt: { lt: cutoff } } })
  } catch {}
}, 6 * 60 * 60 * 1000)

startSubscriptionExpiryJob(prisma)
