import { useEffect, useState } from 'react'
import { bridge } from '@purescience/platform-ui/bridge/client'
import { PLATFORM_BRIDGE_METHODS } from '@purescience/platform-ui/bridge/methods'

/** A shell that never answers must not leave the whole app unable to start. */
const ANSWER_WAIT_MS = 3_000

export interface CopyRole {
  /** Has the shell said where this copy is? Nothing that runs on its own starts until it has. */
  known: boolean
  /** Held in a page: the compact view. Beside a room in split view it is the whole app. */
  compact: boolean
  /** A second running copy: held in a page, or nested in a room, which stays true when a room's Full app grows it. */
  second: boolean
}

const heldIn = (app: unknown): boolean => (app as { heldInRoom?: unknown } | null)?.heldInRoom === true

/** Where this copy runs. Everything held hangs off this one answer, asked for once and told of every change after. */
export function useCopyRole(): CopyRole {
  const nested = window.parent !== window.top
  const alone = window.parent === window
  const [role, setRole] = useState<CopyRole>({ known: alone, compact: false, second: nested })
  useEffect(() => {
    if (alone) return
    let disposed = false
    let told = false
    const answer = (app: unknown): void => {
      if (disposed) return
      const compact = heldIn(app)
      setRole(now => ({ known: true, compact, second: nested || now.second || compact }))
    }
    const receive = (event: MessageEvent): void => {
      if (event.source !== window.parent || event.data?.type !== 'pure:adjacent-app') return
      told = true
      answer(event.data.app)
    }
    window.addEventListener('message', receive)
    // Not on a late answer: the timer only stands in for one that never comes, and an answer after it still counts.
    const timer = window.setTimeout(() => { if (!told) answer(null) }, ANSWER_WAIT_MS)
    void bridge.call(PLATFORM_BRIDGE_METHODS.WORKSPACE_ADJACENT_APP).then(
      app => { if (!told) { told = true; answer(app) } },
      () => { if (!told) { told = true; answer(null) } },
    )
    return () => {
      disposed = true
      window.clearTimeout(timer)
      window.removeEventListener('message', receive)
    }
  }, [nested, alone])
  return role
}
