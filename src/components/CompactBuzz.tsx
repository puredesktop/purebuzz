import { useEffect, useState } from 'react'
import type { BuzzChannel, BuzzMessage } from '../lib/buzzProtocol'
import type { BuzzChatState } from '../hooks/useBuzzChat'

/** How many latest messages show at a glance, and in one conversation. */
const GLANCE = 8
const CONVERSATION = 12

const nameOf = (channel: BuzzChannel | undefined, chat: Pick<BuzzChatState, 'publicKey' | 'nameFor'>): string => {
  if (!channel) return 'A conversation'
  if (channel.type !== 'dm') return `#${channel.name}`
  const others = channel.participants.filter(person => person !== chat.publicKey).map(person => chat.nameFor(person))
  return others.join(', ') || 'Just you'
}
const whenOf = (seconds: number, now = new Date()): string => {
  const at = new Date(seconds * 1000)
  return at.toDateString() === now.toDateString()
    ? at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : at.toLocaleDateString([], { day: 'numeric', month: 'short' })
}
const wordsOf = (message: BuzzMessage): string => message.text.trim() || (message.media.length ? 'Sent a file' : 'No words')

function Message({ message, chat, place }: { message: BuzzMessage; chat: BuzzChatState; place?: string }): React.ReactElement {
  return (
    <li className="buzz-held-message">
      <div>
        <b>{chat.nameFor(message.pubkey)}</b>
        {place ? <span>{place}</span> : null}
        <time>{whenOf(message.createdAt)}</time>
      </div>
      <p>{wordsOf(message)}</p>
    </li>
  )
}

/**
 * Buzz beside a conversation: what is unread, and the latest messages. The whole app is behind this, still connected and
 * answering its agent. Looking here marks nothing read, joins nothing and sends nothing; the host's Full app is where to
 * reply. See useBuzzChat for what else a second copy leaves alone.
 */
export function CompactBuzz({ chat }: { chat: BuzzChatState }): React.ReactElement {
  const [open, setOpen] = useState<string | null>(null)
  const [messages, setMessages] = useState<BuzzMessage[] | null>(null)
  const channelOf = (id: string) => chat.channels.find(channel => channel.id === id)
  const { fetchMessages } = chat
  useEffect(() => {
    setMessages(null)
    if (!open) return undefined
    let live = true
    void fetchMessages(open, CONVERSATION).then(found => { if (live) setMessages(found) }).catch(() => { if (live) setMessages([]) })
    return () => { live = false }
  }, [open, fetchMessages])

  const unread = Object.entries(chat.unread).sort(([, a], [, b]) => b - a)
  const total = unread.reduce((sum, [, count]) => sum + count, 0)
  if (chat.noIdentity) return <div className="buzz-held"><p className="buzz-held-note">Open Buzz in the full app to set it up. Messages show here after that.</p></div>
  if (open) {
    return (
      <div className="buzz-held">
        <header className="buzz-held-facts">
          <button type="button" onClick={() => setOpen(null)}>← Back</button>
          <span>{nameOf(channelOf(open), chat)}</span>
        </header>
        {messages === null ? <p className="buzz-held-note">Reading…</p> : messages.length ? <ul>{messages.map(message => <Message key={message.id} message={message} chat={chat} />)}</ul> : <p className="buzz-held-note">Nothing here yet.</p>}
      </div>
    )
  }
  return (
    <div className="buzz-held">
      <header className="buzz-held-facts">
        <span>{total ? `${total} unread in ${unread.length} ${unread.length === 1 ? 'conversation' : 'conversations'}` : 'Nothing unread'}</span>
        {chat.status === 'ready' ? null : <small role="status">{chat.statusDetail || (chat.status === 'connecting' || chat.status === 'authenticating' ? 'Connecting…' : 'Not connected to the relay')}</small>}
      </header>
      {unread.length ? (
        <section>
          <h2>Unread</h2>
          <ul>
            {unread.map(([id, count]) => (
              <li key={id}>
                <button type="button" className="buzz-held-row" onClick={() => setOpen(id)}>
                  <span>{nameOf(channelOf(id), chat)}</span>
                  <b>{count}</b>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h2>Latest</h2>
        {chat.recent.length ? <ul>{chat.recent.slice(0, GLANCE).map(message => <Message key={message.id} message={message} chat={chat} {...(channelOf(message.channelId)?.type === 'dm' ? {} : { place: nameOf(channelOf(message.channelId), chat) })} />)}</ul> : <p className="buzz-held-note">No messages in the past week.</p>}
      </section>
    </div>
  )
}
