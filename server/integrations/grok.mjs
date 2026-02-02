export async function generateWithGrok(chatMessages, options = {}) {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY
  const model = process.env.GROK_LLM_MODEL || process.env.XAI_MODEL || 'grok-4-1-fast-reasoning'
  if (!apiKey || !model) return { ok: false, content: null }

  const controller = new AbortController()
  const timeoutMs = options.timeoutMs || 60000
  const to = setTimeout(() => controller.abort(), timeoutMs)
  const useStore = typeof options.useStore === 'boolean' ? options.useStore : true
  const compact = typeof options.compact === 'boolean' ? options.compact : false
  const previousResponseId = (options.previousResponseId || '').toString().trim()
  const convCacheId = (options.convCacheId || '').toString().trim()

  const input = Array.isArray(chatMessages)
    ? (compact ? compactChat(chatMessages) : chatMessages)
    : chatMessages

  const payload = { model, input }
  if (useStore) payload.store = true
  if (previousResponseId) payload.previous_response_id = previousResponseId


  try {
    const resp = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...(convCacheId ? { 'x-grok-conv-id': convCacheId } : {}) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(to)
    if (!resp.ok) {
      let bodyText = ''
      let bodyJson = null
      try { bodyText = await resp.text() } catch {}
      try { bodyJson = bodyText ? JSON.parse(bodyText) : null } catch {}
      console.error('[xAI Responses Error]', { status: resp.status, body: bodyText })
      const code = (bodyJson?.code || '').toString()
      const err = (bodyJson?.error || bodyJson?.message || '').toString()
      const blob = `${code}\n${err}\n${bodyText}`.toLowerCase()
      const blocked = resp.status === 403 && (blob.includes('content violates usage guidelines') || blob.includes('failed check:') || blob.includes('safety_check_type_'))
      const errorMessage = err || (bodyText || '').toString().slice(0, 500) || null
      return { ok: false, content: null, responseId: null, blocked, errorCode: code || null, errorMessage }
    }
    const data = await resp.json()
    const text = extractText(data)
    const out = (text || '').toString().trim().slice(0, 1500)
    const responseId = (data?.id || '').toString().trim() || null
    return out ? { ok: true, content: out, responseId, blocked: false, errorCode: null } : { ok: false, content: null, responseId, blocked: false, errorCode: null }
  } catch (err) {
    console.error('[xAI Responses Error]', { error: (err && err.message) || 'unknown' })
    return { ok: false, content: null, responseId: null, blocked: false, errorCode: null }
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

function extractText(data) {
  try {
    const output = data?.output
    if (Array.isArray(output) && output.length) {
      const first = output[0]
      const contents = first?.content
      if (Array.isArray(contents) && contents.length) {
        for (const c of contents) {
          if (typeof c?.text === 'string') return c.text
          if (typeof c?.content === 'string') return c.content
        }
      }
    }
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
