import type { ReactNode } from 'react'

/**
 * The slice of markdown a chat message needs: fenced code blocks, inline
 * code, **bold**, *italic*, and clickable links. Deliberately tiny and
 * element-based — content is untrusted, so nodes are constructed, never
 * injected as HTML.
 */

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/g

/** The first URL in a message body, or null — feeds the link preview card. */
export function firstUrlOf(text: string): string | null {
  URL_PATTERN.lastIndex = 0
  const match = URL_PATTERN.exec(text)
  return match ? match[0] : null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Inline pass: code spans first (their contents are literal), then URLs and emphasis. */
function renderInline(
  text: string,
  keyBase: string,
  mentionNames: string[],
): ReactNode[] {
  const nodes: ReactNode[] = []
  // Split out `code` spans; even indexes are plain text, odd are code.
  const codeSplit = text.split(/`([^`\n]+)`/)
  codeSplit.forEach((part, index) => {
    if (index % 2 === 1) {
      nodes.push(<code key={`${keyBase}-c${index}`}>{part}</code>)
      return
    }
    nodes.push(...renderEmphasis(part, `${keyBase}-t${index}`, mentionNames))
  })
  return nodes
}

function renderEmphasis(
  text: string,
  keyBase: string,
  mentionNames: string[],
): ReactNode[] {
  const nodes: ReactNode[] = []
  // Bold, then italic within the remainder; both are non-greedy and single-line.
  const boldSplit = text.split(/\*\*([^*\n]+)\*\*/)
  boldSplit.forEach((part, index) => {
    if (index % 2 === 1) {
      nodes.push(<strong key={`${keyBase}-b${index}`}>{part}</strong>)
      return
    }
    const italicSplit = part.split(/\*([^*\n]+)\*/)
    italicSplit.forEach((sub, subIndex) => {
      if (subIndex % 2 === 1) {
        nodes.push(<em key={`${keyBase}-i${index}-${subIndex}`}>{sub}</em>)
        return
      }
      nodes.push(
        ...renderLinks(sub, `${keyBase}-l${index}-${subIndex}`, mentionNames),
      )
    })
  })
  return nodes
}

function renderLinks(
  text: string,
  keyBase: string,
  mentionNames: string[],
): ReactNode[] {
  const nodes: ReactNode[] = []
  let cursor = 0
  let count = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0
    if (start > cursor)
      nodes.push(
        ...renderMentions(text.slice(cursor, start), `${keyBase}-m`, mentionNames),
      )
    const url = match[0]
    nodes.push(
      <a
        key={`${keyBase}-a${count++}`}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
      >
        {url}
      </a>,
    )
    cursor = start + url.length
  }
  if (cursor < text.length)
    nodes.push(
      ...renderMentions(text.slice(cursor), `${keyBase}-mt`, mentionNames),
    )
  return nodes
}

/** Wrap exact @Name occurrences of tagged mentions in a highlight span. */
function renderMentions(
  text: string,
  keyBase: string,
  mentionNames: string[],
): ReactNode[] {
  if (mentionNames.length === 0) return [text]
  const pattern = new RegExp(
    `(@(?:${mentionNames.map(escapeRegExp).join('|')}))`,
    'g',
  )
  const parts = text.split(pattern)
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <span key={`${keyBase}-${index}`} className="mention">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

/**
 * Render a message body: fenced blocks become <pre>, everything between is
 * inline-rendered with line breaks preserved by the container's white-space.
 */
export function renderMessageText(
  text: string,
  mentionNames: string[] = [],
): ReactNode[] {
  const nodes: ReactNode[] = []
  const fenceSplit = text.split(/```(?:[a-z0-9]*)\n?([\s\S]*?)```/)
  fenceSplit.forEach((part, index) => {
    if (index % 2 === 1) {
      nodes.push(
        <pre key={`f${index}`}>
          <code>{part.replace(/\n$/, '')}</code>
        </pre>,
      )
      return
    }
    if (part) nodes.push(...renderInline(part, `p${index}`, mentionNames))
  })
  return nodes
}
