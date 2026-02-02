import crypto from 'node:crypto'

export function signAdminToken(payload) {
  const secret = process.env.ADMIN_JWT_SECRET || 'dev-secret'
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + Number(process.env.ADMIN_TOKEN_EXPIRES || 3600)
  const body = JSON.stringify({ ...payload, iat, exp })
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
  const token = Buffer.from(body).toString('base64url') + '.' + sig
  return token
}

export function verifyAdminToken(token) {
  try {
    const [payloadB64, sig] = token.split('.')
    if (!payloadB64 || !sig) return null
    const secret = process.env.ADMIN_JWT_SECRET || 'dev-secret'
    const body = Buffer.from(payloadB64, 'base64url').toString()
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
    if (expected !== sig) return null
    const data = JSON.parse(body)
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null
    return data
  } catch {
    return null
  }
}

export async function requireAdminAuth(req, res, next) {
  try {
    const enabled = (process.env.ADMIN_AUTH_ENABLED ?? 'true') !== 'false'
    if (!enabled) return next()
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Não autorizado' })
    const data = verifyAdminToken(token)
    if (!data || !['admin', 'superadmin'].includes(data.role)) {
      return res.status(401).json({ error: 'Não autorizado' })
    }
    req.admin = data
    next()
  } catch {
    res.status(401).json({ error: 'Não autorizado' })
  }
}

