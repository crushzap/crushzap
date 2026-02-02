import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'

dotenv.config({ override: true })

const prisma = new PrismaClient()

async function main() {
  const name = process.env.SUPERADMIN_NAME
  const email = process.env.SUPERADMIN_EMAIL
  const password = process.env.SUPERADMIN_PASSWORD

  if (!name || !email || !password) {
    console.error('SUPERADMIN_NAME, SUPERADMIN_EMAIL e SUPERADMIN_PASSWORD são obrigatórios')
    process.exit(1)
  }

  const passwordHash = bcrypt.hashSync(password, 10)

  await prisma.user.upsert({
    where: { email },
    update: { name, role: 'superadmin', status: 'active', passwordHash },
    create: {
      name,
      email,
      phone: '00000000000',
      role: 'superadmin',
      status: 'active',
      trialLimit: Number(process.env.TRIAL_LIMIT_PER_ACCOUNT ?? 10),
      passwordHash,
    },
  })

  console.log('Superadmin configurado:', email)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
