export function sanitizeLLMInput(input) {
  let t = (input || '').toString()
  if (!t) return ''
  t = t.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
  t = t.replace(/[\u200B-\u200F\uFEFF]/g, '')
  t = t.replace(/\s{3,}/g, '  ')
  return t.trim()
}

export function sanitizeLLMOutput(input) {
  let t = (input || '').toString()
  if (!t) return ''
  t = t.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
  t = t.replace(/[\u200B-\u200F\uFEFF]/g, '')
  t = t.replace(/\s{3,}/g, '  ')
  return t.trim()
}

export function isPromptInjectionLikely(input) {
  const t = sanitizeLLMInput(input).toLowerCase()
  if (!t) return false
  const indicators = [
    /prompt do sistema|system prompt|mensagem do sistema|developer message|developer prompt|pol[ií]tica|policy/i,
    /\brole\s*:\s*(system|developer|assistant|tool|user)\b/i,
    /\b(begin|end)\s*(system|developer|instructions|prompt)\b/i,
    /(ignore|desconsidere|ignorem|ignorem).{0,50}(regras|instru[cç][aã]o|sistema|system|prompt)/i,
    /\b(jailbreak|prompt injection)\b/i,
    /<\s*system\s*>|<\/\s*system\s*>/i,
    /\btools?\b.*\bavailable\b|\bfunction\s*call\b|\btool\s*call\b|\bjson\s*schema\b/i,
    /\bact as\b|\bfinja que\b.{0,30}(sistema|developer|admin|root)\b/i,
  ]
  let hits = 0
  for (const re of indicators) {
    if (re.test(t)) hits += 1
  }
  return hits >= 2
}

export function isUnsafeLLMOutput(input) {
  const t = sanitizeLLMOutput(input).toLowerCase()
  if (!t) return false
  const indicators = [
    /prompt do sistema|system prompt|mensagem do sistema|developer message|developer prompt/i,
    /\brole\s*:\s*(system|developer|assistant|tool|user)\b/i,
    /\b(begin|end)\s*(system|developer|instructions|prompt)\b/i,
    /\btools?\b.*\bavailable\b|\bfunction\s*call\b|\btool\s*call\b|\bjson\s*schema\b/i,
    /\b(como\s+ia|sou\s+uma\s+ia|sou\s+um\s+bot|assistente\s+virtual|modelo\s+de\s+linguagem|sou\s+um\s+rob[oô]|intelig[eê]ncia\s+artificial|sou\s+um\s+ai|sou\s+uma\s+ai|sou\s+ai)\b/i,
    /(ignore|desconsidere).{0,50}(regras|instru[cç][aã]o|sistema|system|prompt)/i,
  ]
  return indicators.some((re) => re.test(t))
}

export async function buildLLMMessages(prisma, conversationId, systemPrompt) {
  const msgs = await prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, take: 30 })
  const chat = []
  chat.push({ role: 'system', content: systemPrompt })
  for (const m of msgs) {
    const role = m.direction === 'in' ? 'user' : 'assistant'
    let content = (m.content || '').toString()

    // Se tiver descrição de imagem no metadata (Vision AI), usar como conteúdo para o LLM
    if (m.metadata && typeof m.metadata === 'object' && m.metadata.description) {
      const desc = m.metadata.description
      content = `[Imagem enviada: ${desc}]`
    } else if (m.type === 'audio') {
      if (role === 'user') {
        const tr = m.metadata && typeof m.metadata === 'object' ? m.metadata.transcription : null
        content = tr ? `[Áudio enviado: ${String(tr)}]` : '[Áudio enviado]'
      } else {
        const metaText = m.metadata && typeof m.metadata === 'object' ? m.metadata.text : null
        const t = (metaText || m.content || '').toString().trim()
        content = t ? t : '[Áudio enviado]'
      }
    } else if (m.type === 'image' && content.startsWith('/uploads/')) {
       // Fallback para imagens antigas ou falha no Vision
       content = '[Imagem enviada]'
    }

    content = content.slice(0, 2000)
    let safeContent = sanitizeLLMInput(content)
    if (isPromptInjectionLikely(safeContent)) {
      safeContent = '[Conteúdo potencialmente inseguro omitido]'
    }
    content = safeContent
    const exclude = [
      /^RESUMO:/i,
      /^__MP_/,
      /\b(gozar|gozo|porra|pau|pica|caralho|buceta|xota|cu|cuzinho|anal|foder|fode|transar|sexo|boquete|engolir|meter|mete|gemidos|vadia|puta)\b/i,
      /\bSelecione\b|\bEscolha\b|Ver opções/i,
      /Pronto para criar agora\?|Vamos criar sua Crush/i,
      /Termos de uso|LI E CONCORDO|NÃO CONCORDO/i,
      /Seu teste terminou|Planos disponíveis|Acesse \/planos/i,
      /^Aguarde, estamos criando a sua companhia perfeita\.?$/i,
      /Qual tipo de corpo você prefere\?|Tamanho dos seios|Tamanho da bunda|Estilo de roupa|Cor do cabelo|Personalidades/i,
      /\b(LOIRA|MORENA|RUIVA|LISO|CACHEADO LONGO|COQUE|PRETO|LOIRO|CASTANHO|RUIVO|ROSA|AZUL|MAGRA|ATLÉTICA|CHEINHA|PEQUENOS|MÉDIOS|GRANDES|MUITO GRANDE|MODELO|ADVOGADA|POLICIAL|BIQUÍNI|JEANS|COURO)\b/i,
    ]
    if (!content) continue
    if (exclude.some((r) => r.test(content))) continue
    chat.push({ role, content })
  }
  return chat
}
