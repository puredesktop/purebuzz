import { npubOf } from './buzzProtocol'

/**
 * Tags for the shell's agent activity layer (AgentActivityLayer, mounted by AppFrame). An element whose
 * `data-agent-ref` holds a ref a tool call names (an argument value, plain or as `key:value`, or an id in a read's
 * answer) is marked while the agent reads or writes it. Refs are space-separated, so a value with a space in it
 * (a two-word display name) cannot be one. Markup only: nothing here changes behaviour.
 */
export type AgentRefProps = { 'data-agent-ref': string; 'data-agent-label'?: string }

/** Refs for one item: each value plain, and as `key:value` for each key the tools use for it. */
function refsFor(values: Array<[key: string, value: string | undefined]>): string[] {
  const refs: string[] = []
  for (const [key, value] of values) {
    if (!value || /\s/.test(value)) continue
    refs.push(value, `${key}:${value}`)
  }
  return refs
}

function props(refs: string[], label?: string): AgentRefProps {
  const out: AgentRefProps = { 'data-agent-ref': [...new Set(refs)].join(' ') }
  if (label) out['data-agent-label'] = label
  return out
}

/** A channel: `channelId` in every channel tool, `id` in listChannels / getBuzzContext answers. */
const channelRefList = (id: string): string[] => refsFor([['channelId', id], ['id', id]])

/** A person: sendDirectMessage `to` and latestMessages/listMedia `from` take a display name, an npub or hex. */
function personRefList(pubkey: string, name?: string): string[] {
  let npub: string | undefined
  try {
    npub = npubOf(pubkey)
  } catch {
    npub = undefined
  }
  return [npub, pubkey, name].flatMap(value => refsFor([['to', value], ['from', value]]))
}

export const channelRefs = (id: string, name: string): AgentRefProps => props(channelRefList(id), name)

/** A direct-message row: the channel, and the people in it (so messaging them by name or npub marks it). */
export const dmRefs = (id: string, label: string, people: Array<{ pubkey: string; name: string }>): AgentRefProps =>
  props([...channelRefList(id), ...people.flatMap(person => personRefList(person.pubkey, person.name))], label)

export const personRefs = (pubkey: string, name: string): AgentRefProps => props(personRefList(pubkey, name), name)

/** A message: its event id, as readMessages / searchMessages / latestMessages answers give it (`id`). */
export const messageRefs = (id: string, authorName: string): AgentRefProps =>
  props(refsFor([['id', id]]), `Message from ${authorName}`)
