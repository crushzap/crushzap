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
