export async function generateWithOpenAI(chatMessages, options = {}) {
  const apiKey = (process.env.OPENAI_API_KEY || '').toString().trim()
  const model = (process.env.OPENAI_LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini').toString().trim()
  if (!apiKey || !model) return { ok: false, content: null, provider: 'openai' }

  const controller = new AbortController()
  const timeoutMs = options.timeoutMs || 60000
  const to = setTimeout(() => controller.abort(), timeoutMs)
  const useStore = typeof options.useStore === 'boolean' ? options.useStore : true
  const compact = typeof options.compact === 'boolean' ? options.compact : false
  const previousResponseId = normalizeOpenAIResponseId(options.previousResponseId)

  const input = Array.isArray(chatMessages)
    ? normalizeInputMessages(compact ? compactChat(chatMessages) : chatMessages)
    : chatMessages

  const payload = { model, input }
  if (useStore) payload.store = true
  if (previousResponseId) payload.previous_response_id = previousResponseId

  try {
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(to)
    if (!resp.ok) {
      let bodyText = ''
      let bodyJson = null
      try { bodyText = await resp.text() } catch {}
      try { bodyJson = bodyText ? JSON.parse(bodyText) : null } catch {}
      console.error('[OpenAI Responses Error]', { status: resp.status, body: bodyText })
      const code = (bodyJson?.error?.code || bodyJson?.code || '').toString()
      const err = (bodyJson?.error?.message || bodyJson?.error || bodyJson?.message || '').toString()
      const blob = `${code}\n${err}\n${bodyText}`.toLowerCase()
      const blocked = resp.status === 403 || blob.includes('content_policy') || blob.includes('safety') || blob.includes('policy')
      const errorMessage = err || (bodyText || '').toString().slice(0, 500) || null
      return { ok: false, content: null, responseId: null, blocked, errorCode: code || null, errorMessage, provider: 'openai' }
    }
    const data = await resp.json()
    const text = extractText(data)
    const out = (text || '').toString().trim().slice(0, 1500)
    const responseId = (data?.id || '').toString().trim() || null
    return out ? { ok: true, content: out, responseId, blocked: false, errorCode: null, provider: 'openai' } : { ok: false, content: null, responseId, blocked: false, errorCode: null, provider: 'openai' }
  } catch (err) {
    console.error('[OpenAI Responses Error]', { error: (err && err.message) || 'unknown' })
    return { ok: false, content: null, responseId: null, blocked: false, errorCode: null, provider: 'openai' }
  } finally {
    clearTimeout(to)
  }
}

function compactChat(chat) {
  try {
    const arr = Array.isArray(chat) ? chat.slice() : []
    const system = arr.find((m) => (m?.role || '') === 'system')
    const lastUser = arr.slice().reverse().find((m) => (m?.role || '') === 'user')
    const out = []
    if (system) out.push(system)
    if (lastUser) out.push(lastUser)
    return out.length ? out : arr.slice(-2)
  } catch {
    return Array.isArray(chat) ? chat.slice(-2) : chat
  }
}

function normalizeInputMessages(messages) {
  if (!Array.isArray(messages)) return messages
  return messages.map((m) => {
    const role = (m?.role || 'user').toString()
    const content = normalizeContentParts(m?.content, role)
    return { role, content }
  })
}

function normalizeContentParts(content, role) {
  const kind = role === 'assistant' ? 'output_text' : 'input_text'
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        if (typeof p?.text === 'string') return { type: p.type || kind, text: p.text }
        if (typeof p?.content === 'string') return { type: p.type || kind, text: p.content }
        if (typeof p === 'string') return { type: kind, text: p }
        return null
      })
      .filter(Boolean)
    return parts.length ? parts : [{ type: kind, text: '' }]
  }
  if (typeof content === 'string') return [{ type: kind, text: content }]
  if (content && typeof content.text === 'string') return [{ type: kind, text: content.text }]
  return [{ type: kind, text: '' }]
}

function extractText(data) {
  try {
    const output = data?.output
    if (Array.isArray(output) && output.length) {
      for (const item of output) {
        const contents = item?.content
        if (Array.isArray(contents) && contents.length) {
          for (const c of contents) {
            if (typeof c?.text === 'string') return c.text
            if (typeof c?.content === 'string') return c.content
            if (typeof c?.output_text === 'string') return c.output_text
          }
        }
      }
    }
    if (typeof data?.output_text === 'string') return data.output_text
    if (typeof data?.content === 'string') return data.content
    if (typeof data?.message?.content === 'string') return data.message.content
    const choices = data?.choices
    if (Array.isArray(choices) && choices.length) {
      const mc = choices[0]?.message?.content
      if (typeof mc === 'string') return mc
    }
    return ''
  } catch {
    return ''
  }
}

function normalizeOpenAIResponseId(value) {
  const raw = (value || '').toString().trim()
  if (!raw) return ''
  return raw.startsWith('resp') ? raw : ''
}
