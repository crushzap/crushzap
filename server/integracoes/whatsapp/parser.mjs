export function extractWhatsAppMessages(body) {
  const entries = body?.entry || []
  const out = []
  for (const e of entries) {
    const changes = e?.changes || []
    for (const ch of changes) {
      const val = ch?.value || {}
      const msgs = val?.messages || []
      const contacts = val?.contacts || []
      const metaPhoneId = val?.metadata?.phone_number_id?.toString()
      for (const m of msgs) {
        const contact = contacts.find(() => true) || {}
        const id = (m?.id || '').toString()
        const from = m?.from || contact?.wa_id || ''
        const type = m?.type || 'text'
        let text = m?.text?.body || ''
        let mediaId = ''
        let mimeType = ''
        
        if (type === 'audio') {
          text = '[Áudio]'
          mediaId = m?.audio?.id
          mimeType = m?.audio?.mime_type
        }
        else if (type === 'image') {
          text = m?.image?.caption || '[Imagem]'
          mediaId = m?.image?.id
          mimeType = m?.image?.mime_type
        }
        else if (type === 'video') {
          text = m?.video?.caption || '[Vídeo]'
          mediaId = m?.video?.id
          mimeType = m?.video?.mime_type
        }
        else if (type === 'sticker') {
          text = '[Figurinha]'
          mediaId = m?.sticker?.id
          mimeType = m?.sticker?.mime_type
        }
        else if (type === 'document') {
          text = m?.document?.caption || m?.document?.filename || '[Documento]'
          mediaId = m?.document?.id
          mimeType = m?.document?.mime_type
        }

        let replyId = ''
        let replyTitle = ''
        if (type === 'button') {
          replyId = (m?.button?.payload || '').toString()
          replyTitle = (m?.button?.text || '').toString()
          if (!text) text = replyTitle
        } else if (type === 'interactive') {
          const br = m?.interactive?.button_reply || m?.interactive?.list_reply || {}
          replyId = (br?.id || '').toString()
          replyTitle = (br?.title || '').toString()
          if (!text) text = replyTitle
        }

        if (!text && type !== 'text') {
           text = `[Conteúdo: ${type}]`
        }

        out.push({ id, from, type, text, phoneNumberId: metaPhoneId, replyId, replyTitle, mediaId, mimeType })
      }
    }
  }
  return out
}

export function extractWhatsAppStatuses(body) {
  const entries = body?.entry || []
  const out = []
  for (const e of entries) {
    const changes = e?.changes || []
    for (const ch of changes) {
      const val = ch?.value || {}
      const statuses = val?.statuses || []
      const metaPhoneId = val?.metadata?.phone_number_id?.toString()
      for (const s of statuses) {
        out.push({
          id: (s?.id || '').toString(),
          status: (s?.status || '').toString(),
          timestamp: s?.timestamp ? Number(s.timestamp) : null,
          recipientId: (s?.recipient_id || '').toString(),
          errors: Array.isArray(s?.errors) ? s.errors : [],
          phoneNumberId: metaPhoneId,
        })
      }
    }
  }
  return out
}
