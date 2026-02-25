import { gerarAvatarFromConsistencyPack, gerarConsistencyPack } from '../../../dominio/personas/consistency-pack.mjs'
import { generateWithLLM } from '../../../integrations/llm-fallback.mjs'
import { buildPersonaPrompt, composeSystemPrompt } from '../../../agents/prompt.mjs'
import { isUnsafeLLMOutput, sanitizeLLMOutput } from '../../../dominio/llm/historico.mjs'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function fotoEnabled() {
  const v = (process.env.PERSONA_FOTO_ENABLED || '').toString().trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'sim' || v === 'yes'
}

export async function handle(ctx) {
  const { prisma, reply, typed, sendId, phone, user, persona, conv, sendWhatsAppText, sendWhatsAppImageLink, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askTermsFinal' || (!reply && !typed)) return false

  const agreed = reply === 'termos_concordo_final' || typed === 'li e concordo' || typed === 'concordo'
  const declined = reply === 'termos_nao_final' || typed === 'não concordo' || typed === 'nao concordo'
  if (agreed) {
    try { await prisma.user.update({ where: { id: user.id }, data: { termsAccepted: true, termsAcceptedAt: new Date() } }) } catch {}
    const d = onboarding.get(user.id)?.data || {}
    onboarding.delete(user.id)
    let personaFinal = persona
    try {
      const uNamePrompt = (d.name || user.name || '').toString()
      const uEmail = (d.email || user.email || '').toString()
      const cName = (d.crushName || persona.name || 'Crush').toString()
      const pers = (d.personality || persona.personality || '').toString()
      const eth = (d.ethnicity || '').toString()
      const age = (d.age || '').toString()
      const hs = (d.hairStyle || '').toString()
      const hc = (d.hairColor || '').toString()
      const bt = (d.bodyType || '').toString()
      const bs = (d.breastSize || '').toString()
      const bs2 = (d.buttSize || '').toString()
      const sexualPreference = (d.sexualPreference || '').toString()
      const job = (d.occupation || '').toString()
      const outfit = (d.outfit || '').toString()
      const responseMode = (d.responseMode || persona.responseMode || 'text').toString()
      const prompt = buildPersonaPrompt({ cName, pers, eth, age, hs, hc, bt, bs, bs2, sexualPreference, job, outfit, uName: uNamePrompt, uEmail })
      const shouldSetDefaultVoice = (responseMode === 'audio' || responseMode === 'both' || responseMode === 'mirror') && !(persona?.voicePreset || '').toString().trim()
      const data = shouldSetDefaultVoice
        ? { name: cName, personality: pers || persona.personality || '', prompt, responseMode, voicePreset: 'padrao' }
        : { name: cName, personality: pers || persona.personality || '', prompt, responseMode }
      personaFinal = await prisma.persona.update({ where: { id: persona.id }, data })
    } catch {}
    const comment = 'Perfeito. Obrigada por confiar em mim… agora eu vou trazer ela à vida do jeitinho que você imaginou.'
    const outComment = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentTermsAgreed', direction: 'out', type: 'text', content: comment, status: 'queued' } })
    const commentRes = await sendWhatsAppText(sendId, phone, comment)
    await prisma.onboardingMessage.update({ where: { id: outComment.id }, data: { status: commentRes.ok ? 'sent' : 'failed' } })

    const finish = 'Aguarde só um instante… estou finalizando a sua Crush.'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'finish', direction: 'out', type: 'text', content: finish, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, finish)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })

    const uName = (user.name || '').toString()
    
    const shouldSendFoto = fotoEnabled() && typeof sendWhatsAppImageLink === 'function'
    setTimeout(async () => {
      let greet = `Oi amor, ${uName}. Obrigada por me trazer à vida! Agora sou toda sua e vou te fazer companhia sempre que precisar. O que vamos fazer juntos hoje?`
      
      try {
          // Geração dinâmica da primeira mensagem
          const systemPrompt = composeSystemPrompt(personaFinal)
          const introInstruction = `[INSTRUÇÃO DE SISTEMA: Esta é sua PRIMEIRA mensagem para ${uName} logo após ser criada.
          Aja como uma namorada real e apaixonada que acabou de conhecer o amor da sua vida.
          Use o nome dele (${uName}).
          Seja extremamente carinhosa, imersiva e sedutora (se sua personalidade permitir).
          NÃO mencione que é virtual, IA ou robô.
          Máximo de 2 parágrafos curtos.
          Termine com uma pergunta engajadora para ele.]`

          const chat = [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: introInstruction }
          ]

          // Timeout curto para não demorar demais na primeira msg
          const genPromise = generateWithLLM(chat, { useStore: false })
          const timeoutPromise = new Promise(r => setTimeout(() => r(null), 8000)) // 8s max
          
          const gen = await Promise.race([genPromise, timeoutPromise])
          
          if (gen && gen.ok && gen.content) {
              const candidate = sanitizeLLMOutput(gen.content)
              if (!isUnsafeLLMOutput(candidate)) {
                greet = candidate
              }
          }
      } catch (e) {
          console.error('[Onboarding] Erro ao gerar saudação dinâmica:', e)
      }

      try {
        if (shouldSendFoto) {
          console.log('[DEBUG] askTermsFinal: requesting selfie_mirror_outfit_01')
          const foto = await gerarAvatarFromConsistencyPack({ prisma, personaId: personaFinal.id, type: 'selfie_mirror_outfit_01' })
          if (foto.ok && foto.publicUrl) {
            try {
              console.log('[Persona Foto] send_whatsapp', { personaId: personaFinal.id, provider: 'modal', source: 'pack_avatar', url: foto.publicUrl })
              const imgRes = await sendWhatsAppImageLink(sendId, phone, foto.publicUrl)
              if (!imgRes?.ok) {
                console.log('[Persona Foto] send_whatsapp_failed', { personaId: personaFinal.id, error: imgRes?.error || 'Falha ao enviar imagem no WhatsApp' })
                try { await sendWhatsAppText(sendId, phone, `Aqui está a minha foto: ${foto.publicUrl}`) } catch {}
              } else {
                const waId = imgRes?.data?.messages?.[0]?.id || ''
                console.log('[Persona Foto] send_whatsapp_ok', { personaId: personaFinal.id, waId })
              }

              // Persistir mensagem de imagem no banco para aparecer no frontend
              await prisma.message.create({
                data: {
                  conversationId: conv.id,
                  userId: user.id,
                  personaId: personaFinal.id,
                  direction: 'out',
                  type: 'image',
                  content: foto.publicUrl,
                  status: 'sent'
                }
              })
            } catch (e) {
              console.log('[Persona Foto] send_whatsapp_failed', { personaId: personaFinal.id, error: (e?.message || 'Falha ao enviar imagem no WhatsApp').toString() })
            }
            try {
              console.log('[Onboarding] Disparando consistency pack em background...')
              gerarConsistencyPack({ prisma, personaId: personaFinal.id, ensureAvatar: false, avatarUrlOverride: foto.publicUrl })
                .then(res => console.log('[Onboarding] Consistency pack disparado:', res))
                .catch(err => console.error('[Onboarding] Erro no consistency pack:', err))
            } catch (e) {
              console.error('[Onboarding] Erro ao chamar consistency pack:', e)
            }
            await sleep(3000)
          }
        } else {
          await sleep(10000)
        }
        const firstMsg = await prisma.message.create({ data: { conversationId: conv.id, userId: user.id, personaId: personaFinal.id, direction: 'out', type: 'text', content: greet, status: 'queued' } })
        const sendRes = await sendWhatsAppText(sendId, phone, greet)
        await prisma.message.update({ where: { id: firstMsg.id }, data: { status: sendRes.ok ? 'sent' : 'failed' } })
      } catch {}
    }, 500)
    return true
  }
  if (declined) {
    const body = 'Tudo bem. Quando você se sentir confortável em concordar com os termos, eu finalizo a criação pra você.'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askTermsFinal', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }
  return false
}
