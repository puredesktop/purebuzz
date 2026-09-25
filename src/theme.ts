/**
 * The app's design tokens — the single source for every colour, face,
 * shadow and fixed width the styled blocks read.
 *
 * Every entry resolves to a platform token (--pure-chrome-* / --platform-*),
 * so the room is lit by the shell's theme: the same layout reads in light
 * and dark without a hard-coded grey anywhere. The reskin's original hex
 * values (design_handoff_buzz_chat_reskin/README.md) are the light rendering
 * of these tokens.
 */
export const theme = {
  primary: 'var(--pure-chrome-accent)',
  primaryTint: 'var(--pure-chrome-selection)',
  onAccent: 'var(--pure-chrome-on-accent)',

  ink: 'var(--platform-colors-text)',
  body: 'var(--platform-colors-text)',
  secondary: 'var(--pure-chrome-soft)',
  muted: 'var(--pure-chrome-soft)',
  subtle: 'var(--pure-chrome-muted)',
  faint: 'var(--pure-chrome-muted)',
  faintest: 'var(--pure-chrome-muted)',
  ghost: 'var(--pure-chrome-muted)',

  white: 'var(--pure-chrome-surface)',
  sidebar: 'var(--pure-chrome-sidebar)',
  raised: 'var(--pure-chrome-paper)',
  hoverRow: 'var(--pure-chrome-well)',
  activeRow: 'var(--pure-chrome-selection)',
  hoverFill: 'var(--pure-chrome-hover)',
  hoverFillDeep: 'var(--pure-chrome-hover)',
  tile: 'var(--pure-chrome-well)',

  border: 'var(--pure-chrome-line)',
  rule: 'var(--pure-chrome-line)',
  inputBorder: 'var(--pure-chrome-line)',
  composerBorder: 'var(--pure-chrome-line)',
  cardHoverBorder: 'var(--platform-colors-border-strong)',

  dmAvatarBg: 'var(--pure-chrome-well)',
  dmAvatarFg: 'var(--pure-chrome-soft)',

  online: 'var(--platform-colors-success-text)',
  away: 'var(--platform-colors-warning-text)',

  sans: 'var(--platform-typography-font-family)',
  mono: 'var(--platform-typography-font-family-mono)',

  shadowActionBar: '0 2px 8px rgba(0, 0, 0, 0.09)',
  shadowPopover: '0 8px 24px rgba(0, 0, 0, 0.12)',
  shadowMenu: '0 10px 28px rgba(0, 0, 0, 0.16)',
  shadowComposer: '0 1px 2px rgba(0, 0, 0, 0.04)',

  sidebarWidth: 'var(--pure-chrome-sidebar-width)',
  mainMinWidth: '520px',
  threadWidth: '372px',
  assistantWidth: '400px',

  /** Deterministic avatar color for a pubkey; own key gets the primary. */
  avatarColors: ['#3B6EA5', '#57544F', '#3F8F5B', '#8A6A2F', '#7B4B94', '#2E7D82'],
} as const

export type Theme = typeof theme

export function avatarColorOf(pubkey: string, myPubkey: string): string {
  if (pubkey === myPubkey) return theme.primary
  let hash = 0
  for (let i = 0; i < pubkey.length; i += 1) {
    hash = (hash * 31 + pubkey.charCodeAt(i)) >>> 0
  }
  return theme.avatarColors[hash % theme.avatarColors.length]
}
