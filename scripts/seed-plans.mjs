import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
    console.log('Abortado: este script não deve rodar em produção.')
    process.exit(1)
  }

  console.log('Atualizando planos (modo dev)...')

  const plans = [
    {
      name: 'Semanal',
      price: 0.10,
      messagesPerCycle: 100,
    personasAllowed: 1,
    audioEnabled: true,
    imagesPerCycle: 3,
    active: true,
  },
  {
    name: 'Mensal',
    price: 0.19,
    messagesPerCycle: 500,
    personasAllowed: 3,
    audioEnabled: true,
    imagesPerCycle: 15,
    active: true,
    }
  ]

  for (const p of plans) {
    const existing = await prisma.plan.findUnique({ where: { name: p.name } })
    if (!existing) {
      await prisma.plan.create({ data: p })
      console.log(`Plano criado: ${p.name} (R$${Number(p.price).toFixed(2)})`)
    } else {
      await prisma.plan.update({ 
        where: { name: p.name }, 
        data: { 
          price: p.price,
          imagesPerCycle: p.imagesPerCycle,
          messagesPerCycle: p.messagesPerCycle,
          personasAllowed: p.personasAllowed,
          audioEnabled: p.audioEnabled
        } 
      })
      console.log(`Plano atualizado: ${p.name} (R$${Number(p.price).toFixed(2)})`)
    }
  }

  console.log('Planos atualizados com sucesso.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
