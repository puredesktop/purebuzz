import { useEffect, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { styled } from 'styled-components'
import { theme } from '../theme'

/**
 * The right-click menu for channels and DMs — and the same card behind the
 * channel header's ⋯, so every action here is reachable without a
 * right-click. Destructive items keep the app's arm-then-fire convention:
 * first activation rewrites the label to "… — sure?", the second fires.
 */

export interface MenuItem {
  label: string
  hint?: string
  destructive?: boolean
  /** Two-step confirmation for destructive actions. */
  confirm?: boolean
  action: () => void
}

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 40;
`

const Card = styled.div`
  position: fixed;
  width: 226px;
  border: 1px solid ${theme.border};
  border-radius: 9px;
  background: ${theme.white};
  box-shadow: ${theme.shadowMenu};
  overflow: hidden;
  z-index: 41;
`

const Head = styled.div`
  padding: 8px 12px 7px;
  border-bottom: 1px solid ${theme.rule};
`

const HeadTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${theme.ink};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const HeadSub = styled.div`
  font-size: 11.5px;
  color: ${theme.subtle};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Items = styled.div`
  padding: 5px;
`

const ItemButton = styled.button<{ $destructive?: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 30px;
  padding: 0 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  color: ${({ $destructive }) => ($destructive ? theme.primary : theme.body)};
  cursor: pointer;
  text-align: left;

  &:hover,
  &:focus-visible {
    background: ${theme.hoverFill};
    outline: none;
  }

  span:first-child {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span:last-child {
    font-family: ${theme.mono};
    font-size: 10.5px;
    color: ${theme.faintest};
  }
`

export function ConversationMenu({
  x,
  y,
  title,
  subtitle,
  items,
  onClose,
}: {
  x: number
  y: number
  title: string
  subtitle: string
  items: MenuItem[]
  onClose: () => void
}): ReactElement {
  const [arming, setArming] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      const buttons = Array.from(
        cardRef.current?.querySelectorAll('button') ?? [],
      )
      if (buttons.length === 0) return
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        buttons[(index + 1) % buttons.length]?.focus()
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        buttons[(index - 1 + buttons.length) % buttons.length]?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 236)
  const top = Math.min(y, Math.max(12, window.innerHeight - 300))

  return createPortal(
    <Backdrop
      onClick={onClose}
      onContextMenu={event => {
        event.preventDefault()
        onClose()
      }}
    >
      <Card
        ref={cardRef}
        style={{ left, top }}
        onClick={event => event.stopPropagation()}
      >
        <Head>
          <HeadTitle>{title}</HeadTitle>
          <HeadSub>{subtitle}</HeadSub>
        </Head>
        <Items>
          {items.map(item => (
            <ItemButton
              key={item.label}
              type="button"
              $destructive={item.destructive}
              onClick={() => {
                if (item.confirm && arming !== item.label) {
                  setArming(item.label)
                  return
                }
                item.action()
                onClose()
              }}
            >
              <span>
                {arming === item.label ? `${item.label} — sure?` : item.label}
              </span>
              <span>{item.hint ?? ''}</span>
            </ItemButton>
          ))}
        </Items>
      </Card>
    </Backdrop>,
    document.body,
  )
}
