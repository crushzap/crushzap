import { generateWithGrok } from './grok.mjs'
import { generateWithOpenAI } from './openai.mjs'

export async function generateWithLLM(chatMessages, options = {}) {
  const primary = await generateWithGrok(chatMessages, options)
  const prevId = (options?.previousResponseId || '').toString().trim()
  if (primary?.errorCode === 'response_not_found' && prevId) {
    const retry = await generateWithGrok(chatMessages, { ...options, previousResponseId: undefined })
    if (retry?.ok || retry?.blocked) return { ...retry, resetPreviousResponseId: true }
    const fallbackMessages = Array.isArray(options?.fallbackChatMessages) && options.fallbackChatMessages.length
      ? options.fallbackChatMessages
      : chatMessages
    const fallback = await generateWithOpenAI(fallbackMessages, options)
    if (fallback?.ok) return { ...fallback, resetPreviousResponseId: true }
    return { ...(retry || primary), errorCode: 'response_not_found', resetPreviousResponseId: true }
  }
  if (primary?.ok || primary?.blocked) return primary
  const fallbackMessages = Array.isArray(options?.fallbackChatMessages) && options.fallbackChatMessages.length
    ? options.fallbackChatMessages
    : chatMessages
  const fallback = await generateWithOpenAI(fallbackMessages, options)
  return fallback?.ok ? fallback : (primary || fallback)
}
