import {
  buildBlossomAuthHeader,
  httpOriginOf,
  type BuzzKeypair,
} from './buzzProtocol'
import { base64ToBytes, relayHttp } from '../bridge/platformBridge'

/**
 * File sharing over the relay's Blossom media store.
 *
 * Blobs are content-addressed: the client hashes the bytes, proves intent by
 * signing that hash into a kind:24242 auth event, and PUTs the raw body.
 * Downloads need the same shape of auth — the relay serves media to members
 * only, never publicly — so images render from fetched bytes, not from URLs
 * the webview could load directly.
 */

export interface UploadedBlob {
  url: string
  sha256: string
  size: number
  mime: string
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes as unknown as ArrayBuffer,
  )
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Image types the canvas can re-encode; everything else uploads as-is. */
const SANITIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * Re-encode an image through a canvas: pixels survive, metadata does not.
 *
 * The relay refuses images that still carry EXIF or non-canonical container
 * chunks (a privacy guard — the buzz desktop sanitizes in Rust before every
 * upload). Decoding and re-drawing produces fresh canonical bytes with
 * nothing embedded. JPEG stays JPEG; PNG and WebP re-encode as PNG.
 */
async function sanitizeImage(
  file: File,
): Promise<{ bytes: Uint8Array; mime: string; name: string }> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas unavailable')
    context.drawImage(bitmap, 0, 0)
    const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, mime, 0.92),
    )
    if (!blob) throw new Error('image re-encode failed')
    const name =
      mime === file.type
        ? file.name
        : `${file.name.replace(/\.[a-z0-9]+$/i, '')}.png`
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime, name }
  } finally {
    bitmap.close()
  }
}

export async function uploadFile(
  keypair: BuzzKeypair,
  relayUrl: string,
  file: File,
): Promise<UploadedBlob & { name: string }> {
  const source = SANITIZABLE.has(file.type)
    ? await sanitizeImage(file)
    : {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mime: file.type || 'application/octet-stream',
        name: file.name,
      }
  const { bytes, name } = source
  const sha256 = await sha256Hex(bytes)
  const url = `${httpOriginOf(relayUrl)}/media/upload`
  const response = await relayHttp(url, {
    method: 'PUT',
    headers: {
      authorization: buildBlossomAuthHeader(
        keypair,
        'upload',
        sha256,
        `Upload ${name}`,
      ),
      'x-sha-256': sha256,
      'content-type': source.mime,
    },
    body: bytesToBase64(bytes),
    bodyEncoding: 'base64',
  })
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  if (!response.ok) {
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : `upload failed (${response.status})`,
    )
  }
  if (typeof data.url !== 'string' || typeof data.sha256 !== 'string') {
    throw new Error('relay answered without a blob descriptor')
  }
  return {
    url: data.url,
    sha256: data.sha256,
    size: typeof data.size === 'number' ? data.size : bytes.length,
    mime:
      typeof data.type === 'string' && data.type ? data.type : source.mime,
    name,
  }
}

/** The sha256 (and extension) segment of a relay media URL, or null. */
export function mediaShaOf(url: string): string | null {
  const match = /\/media\/([0-9a-f]{64})(?:\.[a-z0-9]+)?$/i.exec(url)
  return match ? match[1].toLowerCase() : null
}

/**
 * Fetch a relay-hosted blob with get auth and return it as a data: URL the
 * webview can render or download without any further network access.
 */
export async function fetchMediaAsDataUrl(
  keypair: BuzzKeypair,
  url: string,
): Promise<string> {
  const sha256 = mediaShaOf(url)
  if (!sha256) throw new Error('not a relay media URL')
  const response = await relayHttp(url, {
    headers: {
      authorization: buildBlossomAuthHeader(
        keypair,
        'get',
        sha256,
        'Fetch attachment',
      ),
    },
    responseEncoding: 'base64',
  })
  if (!response.ok) throw new Error(`media fetch failed (${response.status})`)
  const mime = response.headers['content-type'] || 'application/octet-stream'
  return `data:${mime};base64,${response.body}`
}

export { base64ToBytes }
