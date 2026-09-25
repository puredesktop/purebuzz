import { useEffect, useRef, useState, type ReactElement } from 'react'
import { styled } from 'styled-components'
import QRCode from 'qrcode'
import {
  PairingSourceSession,
  resolvePairingRelay,
  type PairingPhase,
} from '../lib/pairing'
import { httpOriginOf } from '../lib/buzzProtocol'
import type { BuzzChatState } from '../hooks/useBuzzChat'

/**
 * "Connect your phone": the NIP-AB source flow the Buzz mobile app expects.
 * QR up, phone scans, both screens show six digits, Confirm sends the
 * identity. The transfer is end-to-end encrypted between ephemeral keys;
 * the SAS comparison is the man-in-the-middle defense, so the copy around
 * it is deliberate and explicit.
 */

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border-top: 1px solid var(--platform-colors-border);
  background: var(--platform-colors-surface);
  text-align: center;
`

const QrImage = styled.img`
  width: 220px;
  height: 220px;
  border-radius: 8px;
  background: white;
  padding: 8px;
`

const SasCode = styled.div`
  font: 700 34px/1.2 var(--platform-typography-font-family-mono);
  letter-spacing: 0.2em;
  color: var(--platform-colors-text);
`

const Hint = styled.div`
  max-width: 46ch;
  font-size: 12px;
  color: var(--platform-colors-text-muted);
`

const Row = styled.div`
  display: flex;
  gap: 8px;
`

const Action = styled.button<{ $primary?: boolean }>`
  padding: 7px 14px;
  border-radius: 6px;
  border: 1px solid
    ${({ $primary }) =>
      $primary ? 'var(--pure-chrome-accent)' : 'var(--platform-colors-border)'};
  background: ${({ $primary }) =>
    $primary ? 'var(--pure-chrome-accent)' : 'transparent'};
  color: ${({ $primary }) => ($primary ? 'white' : 'var(--platform-colors-text)')};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
`

export function PairingPanel({
  chat,
  onClose,
}: {
  chat: BuzzChatState
  onClose: () => void
}): ReactElement {
  const [phase, setPhase] = useState<PairingPhase | { phase: 'starting' }>({
    phase: 'starting',
  })
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const sessionRef = useRef<PairingSourceSession | null>(null)

  useEffect(() => {
    let cancelled = false
    const nsec = chat.exportIdentity()
    if (!nsec) {
      setPhase({ phase: 'error', message: 'identity not loaded yet' })
      return undefined
    }
    void resolvePairingRelay(chat.relayUrl).then(pairingRelayUrl => {
      if (cancelled) return
      const session = new PairingSourceSession({
        pairingRelayUrl,
        payload: JSON.stringify({
          relayUrl: httpOriginOf(chat.relayUrl),
          pubkey: chat.publicKey,
          nsec,
        }),
        onPhase: next => {
          setPhase(next)
          if (next.phase === 'qr') {
            void QRCode.toDataURL(next.uri, { margin: 1, width: 440 }).then(
              url => setQrDataUrl(url),
            )
          }
        },
      })
      sessionRef.current = session
      session.start()
    })
    return () => {
      cancelled = true
      sessionRef.current?.close()
      sessionRef.current = null
    }
    // The session binds the identity at open; reopening the panel re-keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Panel>
      {phase.phase === 'starting' && <Hint>Preparing pairing…</Hint>}
      {phase.phase === 'qr' && (
        <>
          {qrDataUrl && <QrImage src={qrDataUrl} alt="Pairing QR code" />}
          <Hint>
            In the Buzz mobile app, choose “Scan QR code” and point it here.
            The code is valid for about two minutes.
          </Hint>
        </>
      )}
      {phase.phase === 'sas' && (
        <>
          <Hint>
            You are about to transfer your identity to the phone. Continue
            ONLY if your phone shows exactly these six digits:
          </Hint>
          <SasCode>{phase.code}</SasCode>
          <Row>
            <Action
              $primary
              type="button"
              onClick={() => void sessionRef.current?.confirm()}
            >
              The digits match — transfer
            </Action>
            <Action type="button" onClick={() => sessionRef.current?.deny()}>
              They differ — abort
            </Action>
          </Row>
        </>
      )}
      {phase.phase === 'transferring' && <Hint>Transferring identity…</Hint>}
      {phase.phase === 'done' && (
        <>
          <Hint>
            ✅ Paired. Your phone now holds this identity and is connected to
            the relay — same channels, same key.
          </Hint>
          <Action type="button" onClick={onClose}>
            Close
          </Action>
        </>
      )}
      {phase.phase === 'error' && (
        <>
          <Hint>⚠️ {phase.message}</Hint>
          <Action type="button" onClick={onClose}>
            Close
          </Action>
        </>
      )}
      {phase.phase !== 'done' && phase.phase !== 'error' && (
        <Action type="button" onClick={onClose}>
          Cancel
        </Action>
      )}
    </Panel>
  )
}
