import { bridgeFetch } from '../bridge/platformBridge'

/**
 * Open Graph unfurling for link cards.
 *
 * The fetch happens in the Electron main process (bridgeFetch) — a renderer
 * fetch of arbitrary sites dies on CORS. That also makes the privacy shape
 * explicit: unfurling is reader-side, so THIS machine touches the linked
 * host. The linkPreviews setting exists for exactly that reason, and DMs
 * default to off.
 *
 * Cache lives in localStorage keyed by URL: successes for a week, failures
 * for a day (a dead link must not refetch on every render). One in-flight
 * request per URL, shared by every card that asks.
 */

export interface LinkMeta {
  host: string
  path: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
}

export type LinkPreviewState = LinkMeta | 'failed'

const CACHE_PREFIX = 'purebuzz:linkpreview:'
const SUCCESS_TTL_MS = 7 * 24 * 3600_000
const FAILURE_TTL_MS = 24 * 3600_000
const MAX_HTML_BYTES = 512 * 1024

const inFlight = new Map<string, Promise<LinkPreviewState>>()

function hostAndPath(url: string): { host: string; path: string } {
  try {
    const parsed = new URL(url)
    return {
      host: parsed.host,
      path: parsed.pathname === '/' ? '' : parsed.pathname,
    }
  } catch {
    return { host: url, path: '' }
  }
}

function readCache(url: string): LinkPreviewState | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + url)
    if (!raw) return null
    const entry = JSON.parse(raw) as {
      state: LinkPreviewState
      fetchedAt: number
    }
    const ttl = entry.state === 'failed' ? FAILURE_TTL_MS : SUCCESS_TTL_MS
    if (Date.now() - entry.fetchedAt > ttl) return null
    return entry.state
  } catch {
    return null
  }
}

function writeCache(url: string, state: LinkPreviewState): void {
  try {
    window.localStorage.setItem(
      CACHE_PREFIX + url,
      JSON.stringify({ state, fetchedAt: Date.now() }),
    )
  } catch {
    // Quota or private mode — previews just refetch next session.
  }
}

function metaContent(doc: Document, property: string): string | null {
  const byProperty = doc.querySelector(`meta[property="${property}"]`)
  const byName = doc.querySelector(`meta[name="${property}"]`)
  const value =
    byProperty?.getAttribute('content') ?? byName?.getAttribute('content')
  return value?.trim() || null
}

async function unfurl(url: string): Promise<LinkPreviewState> {
  const { host, path } = hostAndPath(url)
  try {
    const response = await bridgeFetch(url, {
      headers: { accept: 'text/html' },
    })
    if (!response.ok) return 'failed'
    const html = response.body.slice(0, MAX_HTML_BYTES)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const title =
      metaContent(doc, 'og:title') ??
      doc.querySelector('title')?.textContent?.trim() ??
      null
    if (!title) return 'failed'
    const image = metaContent(doc, 'og:image')
    return {
      host,
      path,
      title,
      description: metaContent(doc, 'og:description'),
      // Resolve protocol-relative and relative image URLs against the page.
      image: image ? new URL(image, url).toString() : null,
      siteName: metaContent(doc, 'og:site_name'),
    }
  } catch {
    return 'failed'
  }
}

export function fetchLinkPreview(url: string): Promise<LinkPreviewState> {
  const cached = readCache(url)
  if (cached) return Promise.resolve(cached)
  let pending = inFlight.get(url)
  if (!pending) {
    pending = unfurl(url).then(state => {
      writeCache(url, state)
      inFlight.delete(url)
      return state
    })
    inFlight.set(url, pending)
  }
  return pending
}

export { hostAndPath }
