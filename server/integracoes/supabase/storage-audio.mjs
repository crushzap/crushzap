import { uploadImagemPublicaSupabase } from './cliente.mjs';
import { randomUUID } from 'crypto';

const BUCKET_CONFIG = process.env.SUPABASE_BUCKET_AUDIOS || 'audios';
const parts = BUCKET_CONFIG.split('/');
const BUCKET_NAME = parts[0];
const BASE_FOLDER = parts.slice(1).join('/');

function inferExtFromContentType(contentType) {
  const ct = (contentType || '').toString().toLowerCase().split(';')[0].trim()
  if (ct.includes('audio/ogg')) return 'ogg'
  if (ct.includes('audio/mpeg') || ct.includes('audio/mp3')) return 'mp3'
  if (ct.includes('audio/wav')) return 'wav'
  return 'ogg'
}

export async function uploadAudio({ buffer, contentType }) {
  const ext = inferExtFromContentType(contentType)
  const filename = `${randomUUID()}.${ext}`;
  const path = BASE_FOLDER ? `${BASE_FOLDER}/${filename}` : filename;

  const result = await uploadImagemPublicaSupabase({
    bucketName: BUCKET_NAME,
    path,
    bytes: buffer,
    contentType: contentType || (ext === 'mp3' ? 'audio/mpeg' : ext === 'wav' ? 'audio/wav' : 'audio/ogg'),
    upsert: false,
  })

  if (!result.ok) {
    throw new Error(`[StorageAudio] Falha no upload: ${result.error}`);
  }

  return result.publicUrl;
}
