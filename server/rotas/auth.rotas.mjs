import express from 'express'
import bcrypt from 'bcryptjs'
import { signAdminToken } from '../infra/auth-admin.mjs'

export function createAuthRouter({ prisma }) {
  const router = express.Router()

  router.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {}
      if (!email || !password) return res.status(400).json({ error: 'Credenciais inválidas' })
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user || !user.passwordHash) return res.status(401).json({ error: 'Não autorizado' })
      const ok = await bcrypt.compare(password.toString(), user.passwordHash)
      if (!ok || !['admin', 'superadmin'].includes(user.role)) return res.status(401).json({ error: 'Não autorizado' })
      const token = signAdminToken({ id: user.id, role: user.role, email: user.email })
      res.json({ token })
    } catch {
      res.status(500).json({ error: 'Falha no login' })
    }
  })

  return router
}

