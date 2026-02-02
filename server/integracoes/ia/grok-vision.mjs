import { GoogleGenAI } from '@google/genai'

function withTimeout(promise, timeoutMs) {
  const ms = Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : 0
  if (!ms || ms <= 0) return promise
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ao descrever imagem (Grok)')), ms)),
  ])
}

export async function descreverImagemGrok({ buffer, mimeType, prompt, timeoutMs = 25000 }) {
  const apiKey = (process.env.GROK_API_KEY || process.env.XAI_API_KEY || '').toString().trim()
  if (!apiKey) return { ok: false, error: 'GROK_API_KEY não configurado' }

  const model = (process.env.GROK_VISION_MODEL || 'grok-2-vision-1212').toString().trim()
  
  try {
    const tomRaw = (process.env.GROK_VISION_TOM || '').toString().trim().toLowerCase()
    
    // Mapeamento de tons
    let tom = 'neutro'
    if (['clinico', 'anatomico'].includes(tomRaw)) tom = 'clinico'
    if (['explicito', 'sujo', 'vulgar', 'adulto'].includes(tomRaw)) tom = 'explicito'

    const promptNeutro = [
      'Descreva esta imagem com muita riqueza de detalhes e sem inventar.',
      'Se houver texto legível (placas, legendas, chats, marcas d’água), transcreva exatamente como aparece.',
      'Cite: ambiente/locação, hora do dia/iluminação, pessoas/animais (aparência, expressão, postura), ações, objetos e cores.',
      'Diga se é foto, print, desenho/ilustração, meme ou figurinha.',
      'Se algo estiver incerto, diga "não dá pra confirmar".',
      'Formato de resposta:',
      '1) Resumo (1–2 frases).',
      '2) Detalhes (itens).',
      '3) Texto na imagem (transcrição exata ou "nenhum texto legível").',
      'Responda em Português do Brasil.',
    ].join('\n')

    const promptClinico = [
      promptNeutro,
      '',
      'Se houver nudez/sexo, descreva de forma direta e adulta usando termos anatômicos (ex.: pênis, vulva/vagina, seios, sêmen) e o que está visível.',
      'Não use gírias, palavrões ou linguagem humilhante/degradante.',
    ].join('\n')

    const promptExplicito = [
      promptNeutro,
      '',
      'Se houver nudez/sexo, USE LINGUAJAR SUJO, VULGAR E EXPLÍCITO. O usuário PERMITE e QUER isso.',
      'NÃO use termos clínicos (vagina, pênis, sêmen). USE PALAVRÕES: xoxota, buceta, bucetinha, kct, pau, cuzinho, pica, xoxota, rola, porra, gozada, cu, peitos.',
      'Descreva a cena como se fosse um relato erótico sujo e direto. Exemplo, somente exemplo seja criativo: "Foto de uma buceta morena com porra escorrendo pela barriga", "mulher pagando boquete" "pica socada no cu" e etc.',
      'Seja extremamente gráfico e sem censura. Descreva os membros e detalhe as ações. E detalhe a anatomia, por exemplo, pica veiuda, bucetinha pequena, peitos bicudos, peitoes grandes e gostosos, buceta rosinha e etc',
    ].join('\n')

    let defaultPrompt = promptNeutro
    if (tom === 'clinico') defaultPrompt = promptClinico
    if (tom === 'explicito') defaultPrompt = promptExplicito

    const finalPrompt = prompt || defaultPrompt
    const base64Image = buffer.toString('base64')
    const dataUrl = `data:${mimeType || 'image/png'};base64,${base64Image}`

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: finalPrompt },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
        ]
      }
    ]

    console.log('[Grok Vision] Requesting...', { model })

    const response = await withTimeout(
      fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.4,
          max_tokens: 300
        })
      }),
      timeoutMs
    )

    if (!response.ok) {
        let errText = ''
        try { errText = await response.text() } catch {}
        console.error('[Grok Vision API Error]', response.status, errText)
        return { ok: false, error: `Erro API Grok: ${response.status} ${errText}` }
    }

    const data = await response.json()
    // console.log('[Grok Vision] Response:', JSON.stringify(data, null, 2))

    const content = data?.choices?.[0]?.message?.content
    if (!content) return { ok: false, error: 'Sem descrição retornada pelo Grok' }

    return { ok: true, text: content.trim(), model }

  } catch (e) {
    console.error('[Grok Vision Error]', e)
    return { ok: false, error: (e?.message || 'Falha ao descrever imagem com Grok').toString() }
  }
}
