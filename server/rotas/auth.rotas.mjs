import express from 'express'
import bcrypt from 'bcryptjs'
import { signAdminToken } from '../infra/auth-admin.mjs'

export function createAuthRouter({ prisma }) {
  const router = express.Router()

  router.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {}
      if (!email || !password) return res.status(400).json({ error: 'Credenciais inválidas' })
      const inputEmail = email.toString().trim()
      const inputPassword = password.toString()
      const user = await prisma.user.findUnique({ where: { email: inputEmail } })
      const hasHash = Boolean(user?.passwordHash)
      const ok = hasHash ? await bcrypt.compare(inputPassword, user.passwordHash) : false
      const isRoleOk = user && ['admin', 'superadmin'].includes(user.role)
      if (!ok || !isRoleOk) {
        const envEmail = (process.env.SUPERADMIN_EMAIL || '').toString().trim()
        const envPassword = (process.env.SUPERADMIN_PASSWORD || '').toString().trim()
        const matchEnv = envEmail && envPassword
          && envEmail.toLowerCase() === inputEmail.toLowerCase()
          && envPassword === inputPassword
        if (!matchEnv) return res.status(401).json({ error: 'Não autorizado' })
        const passwordHash = bcrypt.hashSync(envPassword, 10)
        const name = (process.env.SUPERADMIN_NAME || '').toString().trim() || null
        const phone = (process.env.SUPERADMIN_PHONE || '').toString().trim() || '00000000000'
        const admin = await prisma.user.upsert({
          where: { email: envEmail },
          update: { name, role: 'superadmin', status: 'active', passwordHash },
          create: {
            name,
            email: envEmail,
            phone,
            role: 'superadmin',
            status: 'active',
            trialLimit: Number(process.env.TRIAL_LIMIT_PER_ACCOUNT ?? 10),
            passwordHash,
          },
        })
        const token = signAdminToken({ id: admin.id, role: admin.role, email: admin.email })
        return res.json({ token })
      }
      const token = signAdminToken({ id: user.id, role: user.role, email: user.email })
      res.json({ token })
    } catch {
      res.status(500).json({ error: 'Falha no login' })
    }
  })

  return router
}
