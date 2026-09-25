import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react'
import { styled } from 'styled-components'
import { AppFrame } from '@purescience/platform-bridge/components/AppFrame'
import { EmptyState } from '@purescience/platform-ui/components/common/feedback/EmptyState'
import { usePlatformBridge } from '@purescience/platform-ui/bridge/react/usePlatformBridge'
import {
  npubOf,
  shortPubkey,
  type BuzzMessage,
  type MessageMedia,
} from './lib/buzzProtocol'
import { useBuzzChat, type ReactionEntry } from './hooks/useBuzzChat'
import { avatarColorOf, theme } from './theme'

/** Marks an element as platform chrome; typed loosely because attrs rejects data-* literals. */
const chrome = (kind: string): Record<string, string> => ({ 'data-chrome': kind })
import { useBuzzAgentTools } from './hooks/useBuzzAgentTools'
import { PairingPanel } from './components/PairingPanel'
import {
  ConversationMenu,
  type MenuItem,
} from './components/ConversationMenu'
import { firstUrlOf, renderMessageText } from './lib/messageMarkdown'
import { packInvite } from './lib/invites'
import { LinkCard } from './components/LinkCard'
import { replaceShortcodes, searchEmoji } from './lib/emoji'

/**
 * Option B in the flesh: a native PureDesktop surface over a Buzz relay.
 * The suite owns the chrome; Block's relay owns storage, fan-out and
 * membership. Everything the user does leaves as a signed Nostr event.
 */

const Layout = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  font-family: ${theme.sans};
  font-size: 14px;
  color: ${theme.ink};
  background: ${theme.white};
  -webkit-font-smoothing: antialiased;
`

/* max-width matters: a flex child's automatic minimum size tracks its
   content, so one long unbreakable string (a minted invite code) widened the
   whole pane without it. */
const Sidebar = styled.aside.attrs(chrome('sidebar'))`
  max-width: ${theme.sidebarWidth};
`

const SideTop = styled.div`
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 12px 12px;
  border-bottom: 1px solid ${theme.border};
`

const WordmarkRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const OwnAvatar = styled.div`
  width: 26px;
  height: 26px;
  border-radius: 99px;
  background: ${theme.ink};
  color: ${theme.onAccent};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
`

const SideSearch = styled.input.attrs(chrome('field'))`
  width: 100%;
  outline: none;
`

const SectionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 6px var(--pure-chrome-inset);
`

const SectionLabel = styled.span.attrs(chrome('section-label'))`
  padding: 0;
`

const PlusButton = styled.button`
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: ${theme.muted};
  font-size: 15px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: ${theme.hoverFill};
  }
`

const SideEmpty = styled.div`
  padding: 8px var(--pure-chrome-inset);
  color: ${theme.subtle};
`

const InlineForm = styled.form`
  display: flex;
  gap: 6px;
  padding: 0 6px 8px;
`

const DmPickerList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0 4px 8px;
  padding: 4px;
  border: 1px solid ${theme.border};
  border-radius: 8px;
  background: ${theme.white};
`

const SideFooter = styled.div`
  border-top: 1px solid ${theme.border};
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: ${theme.sidebar};
`

const RelayLabelRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px;
`

const RelayDot = styled.span<{ $state: string }>`
  width: 6px;
  height: 6px;
  border-radius: 99px;
  background: ${({ $state }) =>
    $state === 'ready' ? theme.online : theme.away};
`

const RelayStatusText = styled.span.attrs(chrome('meta'))`
  margin-left: auto;
`

const FooterRow = styled.div`
  display: flex;
  gap: 6px;
`

const FooterInput = styled.input.attrs(chrome('field'))`
  flex: 1;
  min-width: 0;
  outline: none;
`

const FooterButton = styled.button`
  height: var(--pure-chrome-field-height);
  padding: 0 10px;
  border: 1px solid ${theme.inputBorder};
  border-radius: 6px;
  background: ${theme.white};
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;

  &:hover {
    background: ${theme.hoverFill};
  }
`

const FooterDivider = styled.div`
  height: 1px;
  background: ${theme.border};
  margin: 2px 0;
`

const ChannelList = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 14px 0 8px;
`

/* A platform sidebar row; `data-active` marks the open conversation. */
const ChannelButton = styled.button.attrs(chrome('row'))`
  width: calc(100% - 16px); /* a button does not stretch on its own; the row owns 8px side margins */
`

const RowHash = styled.span`
  color: ${theme.faint};
  font-weight: 400;
`

const RowName = styled.span`
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const PrivateTag = styled.span.attrs(chrome('meta'))``

const UnreadPill = styled.span`
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 99px;
  background: ${theme.primary};
  color: ${theme.onAccent};
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
`

const DmInitials = styled.span`
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  border-radius: 99px;
  background: ${theme.dmAvatarBg};
  color: ${theme.dmAvatarFg};
  font-size: 9px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
`

const PresenceDot = styled.span<{ $online: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 99px;
  background: ${({ $online }) => ($online ? theme.online : theme.away)};
`

const NewChannelForm = styled.form`
  display: flex;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid ${theme.border};
`

const TextInput = styled.input.attrs(chrome('field'))`
  flex: 1;
  min-width: 0;
`

const QuietButton = styled.button`
  padding: 6px 10px;
  border: 1px solid ${theme.border};
  border-radius: 6px;
  background: transparent;
  color: ${theme.subtle};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    color: ${theme.body};
    border-color: ${theme.primary};
  }
`

/* A freshly minted code: already on the clipboard, click to copy again. The
   code truncates; the copy glyph must not, so they are separate spans. */
const MintedCode = styled.button`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 9px;
  border: 1px dashed ${theme.border};
  border-radius: 6px;
  background: transparent;
  color: ${theme.body};
  font: 500 12px/1.2 ${theme.mono};
  cursor: pointer;
  text-align: left;

  &:hover {
    border-color: ${theme.primary};
  }
`

const MintedCodeText = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Main = styled.section`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: ${theme.mainMinWidth};
  min-height: 0;
  background: ${theme.white};
`

/*
 * Everything about ONE channel lives in its header: name, who is in it,
 * adding a person, inviting someone new. The sidebar keeps only what is
 * global to the relay — joining it, and creating channels.
 */
const ChannelHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 18px 10px;
  border-bottom: 1px solid ${theme.border};
`

const PrivateChip = styled.span`
  height: 19px;
  padding: 0 7px;
  border: 1px solid ${theme.border};
  border-radius: 5px;
  font-family: ${theme.mono};
  font-size: var(--pure-chrome-label-size);
  letter-spacing: var(--pure-chrome-label-tracking);
  text-transform: uppercase;
  color: ${theme.muted};
  display: flex;
  align-items: center;
`

const HeaderSubtitle = styled.span`
  font-size: 13px;
  color: ${theme.subtle};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const HeaderSpacer = styled.span`
  flex: 1;
`

const HeaderButton = styled.button`
  flex: 0 0 auto;
  height: 28px;
  padding: 0 11px;
  border: 1px solid ${theme.border};
  border-radius: 6px;
  background: ${theme.white};
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;

  &:hover {
    background: ${theme.hoverFill};
  }
`

const MembersPop = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid ${theme.border};
  border-radius: 9px;
  background: ${theme.raised};
`

const MembersPopHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const HeaderTop = styled.div`
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
`

const ChannelTitle = styled.h2`
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: ${theme.ink};
  white-space: nowrap;
`

const SearchHeader = styled.div`
  height: 52px;
  flex: 0 0 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 18px;
  border-bottom: 1px solid ${theme.border};
`

const SearchHeadLeft = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
`

const SearchTitle = styled.span`
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const SearchCount = styled.span`
  font-size: 13px;
  color: ${theme.subtle};
  white-space: nowrap;
`

const ResultCard = styled.button`
  width: calc(100% - 36px);
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 13px 14px;
  margin: 0 18px 8px;
  border: 1px solid ${theme.border};
  border-radius: 8px;
  background: ${theme.white};
  font-family: inherit;
  cursor: pointer;

  &:hover {
    border-color: ${theme.cardHoverBorder};
    background: ${theme.raised};
  }
`

const ResultMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--pure-chrome-ui-size);
  color: ${theme.muted};

  strong {
    font-weight: 600;
    color: ${theme.ink};
  }
`

const ResultTime = styled.span.attrs(chrome('meta'))``

const ResultText = styled.div`
  font-size: 14px;
  line-height: 1.5;
  color: ${theme.secondary};
`

const NoResults = styled.div`
  padding: 60px 0;
  text-align: center;
  color: ${theme.subtle};
  font-size: 14px;
`

const EmptyChannel = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 60px 24px;
  text-align: center;
`

const EmptyTile = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 9px;
  background: ${theme.hoverFill};
  color: ${theme.faint};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
`

const EmptyTitle = styled.div`
  font-size: 17px;
  font-weight: 600;
`

const EmptyCopy = styled.div`
  max-width: 44ch;
  font-size: 14px;
  line-height: 1.6;
  color: ${theme.muted};
`

const EmptyActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 4px;
`

const JoinIdentityForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid ${theme.border};
`

const JoinIdentityHint = styled.div`
  font-size: 11px;
  color: ${theme.subtle};
`

const JoinIdentityRow = styled.div`
  display: flex;
  gap: 6px;
`

const TtlSelect = styled.select`
  padding: 5px 4px;
  border: 1px solid ${theme.border};
  border-radius: 6px;
  background: transparent;
  color: ${theme.subtle};
  font-size: 12px;
  cursor: pointer;
`

const TitleAction = styled.button`
  border: 0;
  background: transparent;
  color: ${theme.subtle};
  cursor: pointer;
  font-size: 13px;
  padding: 0 2px;

  &:hover {
    color: ${theme.body};
  }
`

const HeaderForm = styled.form`
  display: flex;
  gap: 6px;
  max-width: 52ch;
`

/* Who is here: one avatar per channel member, presence as a corner dot. */
const MemberStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
`

const AddPersonButton = styled.button`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px dashed ${theme.border};
  background: transparent;
  color: ${theme.subtle};
  font: 600 14px/1 ${theme.sans};
  cursor: pointer;

  &:hover {
    color: ${theme.body};
    border-color: ${theme.primary};
  }
`

const MemberAvatar = styled.span<{ $online: boolean; $armed?: boolean }>`
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: ${({ $armed }) => ($armed ? `2px solid ${theme.primary}` : '0')};
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${theme.hoverFill};
  color: ${({ $armed }) => ($armed ? theme.primary : theme.body)};
  font: 600 11px/1 ${theme.sans};
  text-transform: uppercase;
  opacity: ${({ $online }) => ($online ? 1 : 0.55)};

  &::after {
    content: '';
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 2px solid ${theme.white};
    background: ${({ $online }) => ($online ? theme.online : theme.ghost)};
  }
`

const NamePrompt = styled.div`
  padding: 6px 20px;
  border-bottom: 1px solid ${theme.border};
  background: ${theme.sidebar};
  color: ${theme.subtle};
  font-size: 12px;
`

const LoadOlder = styled.button`
  align-self: center;
  padding: 4px 12px;
  border: 1px solid ${theme.border};
  border-radius: 12px;
  background: transparent;
  color: ${theme.subtle};
  font-size: 12px;
  cursor: pointer;

  &:hover {
    color: ${theme.body};
    border-color: ${theme.primary};
  }
`

const MessageScroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
`

const MessageRow = styled.div<{ $mentioned?: boolean }>`
  position: relative;
  display: flex;
  gap: 10px;
  padding: 9px 18px 9px 12px;
  background: ${({ $mentioned }) =>
    $mentioned ? 'color-mix(in oklab, var(--pure-chrome-accent) 6%, transparent)' : 'transparent'};
  box-shadow: ${({ $mentioned }) =>
    $mentioned ? `inset 2px 0 0 ${theme.primary}` : 'none'};

  &:hover {
    background: ${theme.hoverRow};
  }

  .msg-actions {
    display: none;
  }

  &:hover .msg-actions {
    display: flex;
  }
`

const Gutter = styled.div`
  width: 32px;
  flex: 0 0 32px;
  display: flex;
  justify-content: center;
`

const Avatar = styled.div<{ $bg: string }>`
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: ${({ $bg }) => $bg};
  color: #ffffff; /* fixed saturated tile, readable in both themes */
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
`

const GutterStamp = styled.div.attrs(chrome('meta'))`
  padding-top: 3px;
  visibility: hidden;

  ${MessageRow}:hover & {
    visibility: visible;
  }
`

const MessageBody = styled.div`
  flex: 1;
  min-width: 0;
`

const ActionBar = styled.div`
  position: absolute;
  top: -12px;
  right: 18px;
  align-items: center;
  gap: 1px;
  padding: 2px;
  border: 1px solid ${theme.border};
  border-radius: 8px;
  background: ${theme.white};
  box-shadow: ${theme.shadowActionBar};
  z-index: 2;
`

const ActionIcon = styled.button`
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 5px;
  background: transparent;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: ${theme.hoverFill};
  }
`

const ActionText = styled.button`
  height: 26px;
  padding: 0 9px;
  border: none;
  border-radius: 5px;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: ${theme.secondary};
  cursor: pointer;

  &:hover {
    background: ${theme.hoverFill};
  }
`

const ActionDivider = styled.div`
  width: 1px;
  height: 16px;
  background: ${theme.border};
  margin: 0 2px;
`

const DateDivider = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px 10px;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: ${theme.rule};
  }
`

const DateDividerLabel = styled.span.attrs(chrome('meta'))``


const MessageMeta = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
  font-size: 14px;
  font-weight: 600;
  color: ${theme.ink};
`

const MetaTime = styled.span.attrs(chrome('meta'))``


const ReplyRef = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  padding-left: 9px;
  border-left: 2px solid ${theme.border};
  font-size: 12.5px;
  color: ${theme.subtle};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60ch;

  strong {
    font-weight: 600;
    color: ${theme.muted};
  }
`

const MessageText = styled.div`
  font-size: 14.5px;
  line-height: 1.58;
  color: ${theme.body};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  text-wrap: pretty;

  a {
    color: ${theme.primary};
  }

  code {
    padding: 1px 4px;
    border-radius: 4px;
    background: ${theme.hoverFill};
    font: 500 12px/1.4 ${theme.mono};
  }

  pre {
    margin: 4px 0;
    padding: 8px 10px;
    border-radius: 6px;
    background: ${theme.hoverFill};
    overflow-x: auto;
    white-space: pre;

    code {
      padding: 0;
      background: transparent;
    }
  }

  .mention {
    color: ${theme.primary};
    background: ${theme.primaryTint};
    border-radius: 4px;
    padding: 0 3px;
    font-weight: 500;
  }
`


const Lightbox = styled.div`
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(26, 25, 24, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;

  img {
    max-width: 92vw;
    max-height: 92vh;
    border-radius: 8px;
    box-shadow: ${theme.shadowMenu};
  }
`

const AttachmentImage = styled.img`
  cursor: zoom-in;

  display: block;
  max-width: min(420px, 100%);
  max-height: 320px;
  border-radius: 8px;
  margin-top: 4px;
`

const AttachmentFile = styled.a`
  display: inline-block;
  margin-top: 4px;
  padding: 6px 10px;
  border: 1px solid ${theme.border};
  border-radius: 6px;
  color: ${theme.body};
  font-size: 13px;
  text-decoration: none;

  &:hover {
    border-color: ${theme.primary};
  }
`

const HiddenFileInput = styled.input`
  display: none;
`

/* A staged attachment: visible, named, removable — sends with the message. */
const PendingAttachment = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 22ch;
  padding: 6px 9px;
  border: 1px dashed ${theme.border};
  border-radius: 6px;
  color: ${theme.body};
  font-size: 12px;
  white-space: nowrap;
`

const PendingName = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
`

const PendingRemove = styled.button`
  border: 0;
  background: transparent;
  color: ${theme.subtle};
  cursor: pointer;
  font-size: 12px;
  padding: 0 2px;

  &:hover {
    color: ${theme.body};
  }
`

const AttachmentNote = styled.div`
  margin-top: 4px;
  font-size: 12px;
  color: ${theme.subtle};
`

const ComposerWrap = styled.div`
  flex: 0 0 auto;
  padding: 0 18px 16px;
`

const ReplyBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid ${theme.border};
  border-bottom: none;
  border-radius: 9px 9px 0 0;
  background: ${theme.raised};
  font-size: 12.5px;
  color: ${theme.muted};

  strong {
    color: ${theme.primary};
    font-weight: 600;
    white-space: nowrap;
  }
`

const ReplyBannerSnippet = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const ComposerBox = styled.div<{ $joined: boolean }>`
  position: relative;
  border: 1px solid ${theme.composerBorder};
  border-radius: ${({ $joined }) => ($joined ? '0 0 9px 9px' : '9px')};
  background: ${theme.white};
  box-shadow: ${theme.shadowComposer};
`

const ComposerTextarea = styled.textarea`
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  padding: 12px 14px 4px;
  font-size: 14.5px;
  line-height: 1.55;
  font-family: inherit;
  color: ${theme.body};
  resize: none;

  &::placeholder {
    color: ${theme.faint};
  }
`

const MentionPop = styled.div`
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  width: 290px;
  border: 1px solid ${theme.border};
  border-radius: 9px;
  background: ${theme.white};
  box-shadow: ${theme.shadowPopover};
  padding: 6px;
  z-index: 5;
`

const MentionPopLabel = styled.div.attrs(chrome('section-label'))`
  padding: 6px 8px;
`

const MentionRow = styled.button<{ $active: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  height: 32px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  background: ${({ $active }) => ($active ? theme.hoverFill : 'transparent')};

  &:hover {
    background: ${theme.hoverFill};
  }
`

const ComposerToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 9px;
`

const ToolbarButton = styled.button.attrs(chrome('toolbar-control'))`
  padding: 0 10px;
  color: ${theme.secondary};
`

const ToolbarSpacer = styled.div`
  flex: 1;
  min-width: 8px;
`

const ComposerHint = styled.span.attrs(chrome('meta'))`
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
`

const SendButton = styled.button`
  flex: 0 0 auto;
  height: var(--pure-chrome-control-height);
  padding: 0 16px;
  border: none;
  border-radius: 6px;
  background: ${theme.primary};
  color: ${theme.onAccent};
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`

const StagedFile = styled.div`
  display: flex;
  align-items: center;
  gap: 11px;
  margin: 10px 10px 0;
  padding: 9px 11px;
  border: 1px solid ${theme.border};
  border-radius: 7px;
  background: ${theme.raised};
`

const FileExtTile = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: ${theme.tile};
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${theme.mono};
  font-size: 9px;
  color: ${theme.muted};
`

const StagedFileName = styled.div`
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const StagedFileMeta = styled.div.attrs(chrome('meta'))`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
`

const RestoreRow = styled.form`
  display: flex;
  gap: 6px;
  padding: 8px 14px;
  border-top: 1px solid ${theme.border};
  background: ${theme.sidebar};
`

const StatusBar = styled.footer`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  border-top: 1px solid ${theme.border};
  background: var(--pure-chrome-bar);
  font: 500 var(--pure-chrome-meta-size) / 1.4 ${theme.mono};
  color: ${theme.subtle};
`

/* The relay is an address, not a settings page: it lives in the sidebar
   footer — mono, committed on the Connect button, not per keystroke. */
const RelayInput = styled.input.attrs(chrome('field'))`
  flex: 1;
  min-width: 0;
  outline: none;
  font-family: ${theme.mono};
`

const IdentityForm = styled.form`
  display: flex;
  align-items: baseline;
  gap: 4px;
`

/* Your name is editable in place, like the relay address: type it, Enter
   publishes a kind:0 profile the relay broadcasts to everyone. */
const IdentityInput = styled.input`
  width: 14ch;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: ${theme.body};
  font: inherit;

  &::placeholder {
    color: ${theme.subtle};
  }

  &:hover,
  &:focus {
    border-color: ${theme.border};
    background: ${theme.white};
  }
`

/* The pubkey is the identity an operator adds server-side, so it must be
   copyable in full — a truncated display form dead-ends at buzz-admin. */
const KeyChip = styled.button`
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: ${theme.subtle};
  font: inherit;
  cursor: pointer;

  &:hover,
  &:focus {
    border-color: ${theme.border};
    background: ${theme.white};
    color: ${theme.body};
  }
`

function CopyKeyChip({ publicKey }: { publicKey: string }): ReactElement {
  const [copied, setCopied] = useState(false)
  const npub = publicKey ? npubOf(publicKey) : ''
  return (
    <KeyChip
      type="button"
      title={npub ? `Copy your public key\n${npub}` : 'Key not loaded yet'}
      onClick={() => {
        if (!npub) return
        void navigator.clipboard?.writeText(npub).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? 'key copied ✓' : `key ${shortPubkey(publicKey)} ⧉`}
    </KeyChip>
  )
}

/*
 * An identity that was never written down is a real cost, and the user can
 * only weigh it if they can see it. Warning-coloured rather than red: the app
 * works, it is the persistence that does not.
 */
const KeyWarning = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid ${theme.away};
  border-radius: 6px;
  background: ${theme.primaryTint};
  color: ${theme.body};
  font-size: 12px;
  line-height: 1.45;
`

const KeyWarningTitle = styled.strong`
  flex: none;
  font-weight: 600;
`

const TypingLine = styled.div`
  padding: 0 20px 2px;
  font-size: 12px;
  font-style: italic;
  color: ${theme.subtle};
`

const StatusDot = styled.span<{ $ready: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $ready }) => ($ready ? theme.online : theme.away)};
`

/** "Ada Lovelace" → AL, "adam" → ad, no name → first two pubkey chars. */
function initialsOf(name: string, pubkey: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`
  if (words.length === 1) return words[0].slice(0, 2)
  return pubkey.slice(0, 2)
}

/**
 * One attachment, fetched with auth and rendered from a data: URL — the relay
 * serves media to members only, so the webview can never load it by URL.
 */
function Attachment({
  media,
  label,
  resolveMedia,
  onView,
}: {
  media: MessageMedia
  label: string
  resolveMedia: (url: string) => Promise<string>
  onView: (dataUrl: string, label: string) => void
}): ReactElement {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    resolveMedia(media.url)
      .then(url => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [media.url, resolveMedia])

  if (failed) return <AttachmentNote>attachment unavailable</AttachmentNote>
  if (!dataUrl) return <AttachmentNote>loading {label}…</AttachmentNote>
  if (media.mime.startsWith('image/')) {
    return (
      <AttachmentImage
        src={dataUrl}
        alt={label}
        title="Click to view full size"
        onClick={() => onView(dataUrl, label)}
      />
    )
  }
  return (
    <AttachmentFile href={dataUrl} download={label}>
      📄 {label}
    </AttachmentFile>
  )
}

/** The markdown image line the sender embeds; used to label the attachment. */
function attachmentLabel(text: string, url: string): string {
  const match = new RegExp(
    `!\\[([^\\]]*)\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
  ).exec(text)
  return match?.[1] || url.split('/').pop() || 'file'
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉'] as const

/* The reaction picker sits above the composer: one predictable place, no
   clipping inside the scrolling timeline. */
const PickerPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 16px 6px;
  padding: 8px;
  border: 1px solid ${theme.border};
  border-radius: 8px;
  background: ${theme.sidebar};
`

const PickerHead = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
`

const PickerGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  max-height: 132px;
  overflow-y: auto;

  button {
    border: 0;
    background: transparent;
    font-size: 19px;
    line-height: 1;
    padding: 4px;
    border-radius: 6px;
    cursor: pointer;

    &:hover {
      background: ${theme.hoverFill};
    }
  }
`

function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void
  onClose: () => void
}): ReactElement {
  const [query, setQuery] = useState('')
  const results = searchEmoji(query)
  return (
    <PickerPanel>
      <PickerHead>
        <TextInput
          autoFocus
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape') onClose()
            if (event.key === 'Enter' && results.length > 0) {
              event.preventDefault()
              onPick(results[0].char)
            }
          }}
          placeholder="Search emoji… (Enter picks the first)"
          aria-label="Search emoji"
        />
        <QuietButton type="button" onClick={onClose} aria-label="Close picker">
          ✕
        </QuietButton>
      </PickerHead>
      <PickerGrid>
        {results.map(entry => (
          <button
            key={entry.name}
            type="button"
            title={`:${entry.name}:`}
            onClick={() => onPick(entry.char)}
          >
            {entry.char}
          </button>
        ))}
      </PickerGrid>
    </PickerPanel>
  )
}

const ReactionRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 3px;
`

const ReactionChip = styled.button<{ $mine: boolean }>`
  display: flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  border-radius: 99px;
  cursor: pointer;
  font-family: inherit;
  border: 1px solid ${({ $mine }) => ($mine ? theme.primary : theme.border)};
  background: ${({ $mine }) => ($mine ? theme.primaryTint : theme.white)};
  color: ${theme.secondary};
  font-size: 12px;

  &:hover {
    border-color: ${theme.cardHoverBorder};
  }
`

const ReactionCount = styled.span`
  font-family: ${theme.mono};
  font-size: 11px;
`

/* Quick-add reactions reveal on row hover, Slack-style. */
const QuickReactions = styled.span`
  display: none;
  gap: 2px;

  button {
    border: 0;
    background: transparent;
    cursor: pointer;
    font-size: 13px;
    padding: 0 2px;
    opacity: 0.6;

    &:hover {
      opacity: 1;
    }
  }

  ${MessageRow}:hover & {
    display: inline-flex;
  }
`

function MessageView({
  message,
  authorName,
  resolveMedia,
  reactions,
  onReact,
  onOpenPicker,
  editedText,
  linkPreview,
  onEdit,
  onDelete,
  onReply,
  replyContext,
  deleteArmed,
  nameFor,
  myPubkey,
  grouped,
  onPersonMenu,
  onViewImage,
}: {
  message: BuzzMessage
  authorName: string
  resolveMedia: (url: string) => Promise<string>
  reactions: Record<string, ReactionEntry[]>
  onReact: (emoji: string) => void
  onOpenPicker: () => void
  editedText: string | null
  linkPreview: boolean
  onEdit: () => void
  onDelete: () => void
  onReply: () => void
  replyContext: { author: string; snippet: string } | null
  deleteArmed: boolean
  nameFor: (pubkey: string) => string
  myPubkey: string
  /** Follow-up from the same author moments later: no avatar, no name line. */
  grouped: boolean
  onPersonMenu: (pubkey: string, event: React.MouseEvent) => void
  onViewImage: (dataUrl: string, label: string) => void
}): ReactElement {
  const time = new Date(message.createdAt * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
  // Attachments render as media; their markdown lines drop from the text.
  // An edit replaces the body wholesale (media stays from the original).
  const text = message.media
    .reduce(
      (body, media) =>
        body.replace(
          new RegExp(
            `!\\[[^\\]]*\\]\\(${media.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
          ),
          '',
        ),
      editedText ?? message.text,
    )
    .trim()
  return (
    <MessageRow $mentioned={message.mentions.includes(myPubkey)}>
      <Gutter>
        {grouped ? (
          <GutterStamp>{time}</GutterStamp>
        ) : (
          <Avatar
            $bg={avatarColorOf(message.pubkey, myPubkey)}
            onContextMenu={event => onPersonMenu(message.pubkey, event)}
          >
            {initialsOf(authorName, message.pubkey)}
          </Avatar>
        )}
      </Gutter>
      <MessageBody>
        {!grouped && (
          <MessageMeta>
            <span
              onContextMenu={event => onPersonMenu(message.pubkey, event)}
            >
              {authorName}
            </span>
            <MetaTime>{time}</MetaTime>
            {editedText !== null && <MetaTime>edited</MetaTime>}
          </MessageMeta>
        )}
        {grouped && editedText !== null && <MetaTime>edited</MetaTime>}
        {replyContext && (
          <ReplyRef>
            <strong>{replyContext.author}</strong> {replyContext.snippet}
          </ReplyRef>
        )}
        {text && (
          <MessageText>
            {renderMessageText(text, message.mentions.map(nameFor))}
          </MessageText>
        )}
        {linkPreview &&
          text &&
          (() => {
            const url = firstUrlOf(text)
            return url ? <LinkCard url={url} /> : null
          })()}
        {message.media.map(media => (
          <Attachment
            key={media.url}
            media={media}
            label={attachmentLabel(message.text, media.url)}
            resolveMedia={resolveMedia}
            onView={onViewImage}
          />
        ))}
        {Object.keys(reactions).length > 0 && (
          <ReactionRow>
            {Object.entries(reactions).map(([emoji, entries]) => {
              const mine = entries.some(entry => entry.pubkey === myPubkey)
              return (
                <ReactionChip
                  key={emoji}
                  type="button"
                  $mine={mine}
                  title={`${entries
                    .map(entry => nameFor(entry.pubkey))
                    .join(', ')}${mine ? ' — click to remove yours' : ''}`}
                  onClick={() => onReact(emoji)}
                >
                  <span>{emoji}</span>
                  <ReactionCount>{entries.length}</ReactionCount>
                </ReactionChip>
              )
            })}
          </ReactionRow>
        )}
      </MessageBody>
      <ActionBar className="msg-actions">
        {QUICK_EMOJIS.map(emoji => (
          <ActionIcon
            key={emoji}
            type="button"
            title={`React with ${emoji}`}
            onClick={() => onReact(emoji)}
          >
            {emoji}
          </ActionIcon>
        ))}
        <ActionIcon
          type="button"
          title="React with any emoji…"
          onClick={onOpenPicker}
        >
          ➕
        </ActionIcon>
        <ActionDivider />
        <ActionText type="button" onClick={onReply}>
          Reply
        </ActionText>
        {message.pubkey === myPubkey && (
          <>
            <ActionText type="button" title="Edit message" onClick={onEdit}>
              Edit
            </ActionText>
            <ActionText
              type="button"
              title={
                deleteArmed
                  ? 'Click again to delete for everyone'
                  : 'Delete message'
              }
              onClick={onDelete}
            >
              {deleteArmed ? 'sure?' : 'Delete'}
            </ActionText>
          </>
        )}
      </ActionBar>
    </MessageRow>
  )
}

export function App(): ReactElement {
  const { error: bridgeError } = usePlatformBridge()
  const chat = useBuzzChat()
  useBuzzAgentTools(chat)
  const [draft, setDraft] = useState('')
  const [newChannel, setNewChannel] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [mintedCode, setMintedCode] = useState<string | null>(null)
  const [addingPerson, setAddingPerson] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [inviteTtl, setInviteTtl] = useState(259_200)
  const [joinCode, setJoinCode] = useState<string | null>(null)
  const [sidebarQuery, setSidebarQuery] = useState('')
  const [creatingChannel, setCreatingChannel] = useState(false)
  const [dmPicker, setDmPicker] = useState(false)
  const [relayDraft, setRelayDraft] = useState('')
  const [relayDirty, setRelayDirty] = useState(false)
  const [menu, setMenu] = useState<{
    conversationId: string
    x: number
    y: number
  } | null>(null)
  const [showMembers, setShowMembers] = useState(false)
  const [profilePeek, setProfilePeek] = useState<string | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  const mentionCandidates =
    mentionQuery !== null && chat.activeChannelId
      ? (chat.channelMembers[chat.activeChannelId] ?? [])
          .filter(member => member.pubkey !== chat.publicKey)
          .map(member => ({
            pubkey: member.pubkey,
            name: chat.nameFor(member.pubkey),
          }))
          .filter(person => !person.name.includes('…'))
          .filter(person =>
            person.name.toLowerCase().startsWith(mentionQuery.toLowerCase()),
          )
          .slice(0, 6)
      : []

  const insertMention = (name: string): void => {
    const input = draftInputRef.current
    const caret = input?.selectionStart ?? draft.length
    const before = draft.slice(0, caret)
    const at = before.lastIndexOf('@')
    if (at < 0) return
    const next = `${draft.slice(0, at)}@${name} ${draft.slice(caret)}`
    setDraft(next)
    setMentionQuery(null)
    window.setTimeout(() => {
      input?.focus()
      const pos = at + name.length + 2
      input?.setSelectionRange(pos, pos)
    }, 0)
  }

  const [lightbox, setLightbox] = useState<{
    src: string
    alt: string
  } | null>(null)

  useEffect(() => {
    if (!lightbox) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  const [personMenu, setPersonMenu] = useState<{
    pubkey: string
    x: number
    y: number
  } | null>(null)

  // The relay field mirrors the committed URL until the user edits it.
  useEffect(() => {
    setRelayDraft(chat.relayUrl)
    setRelayDirty(false)
  }, [chat.relayUrl])
  const [pairing, setPairing] = useState(false)
  const [mintedExpiry, setMintedExpiry] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [picker, setPicker] = useState<
    { kind: 'react'; messageId: string } | { kind: 'compose' } | null
  >(null)
  const draftInputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Stick to the bottom like a chat should — but never yank the view while
  // the user is reading scrollback.
  const nearBottomRef = useRef(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [backupArmed, setBackupArmed] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [searching, setSearching] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [removingMember, setRemovingMember] = useState<string | null>(null)
  const [replying, setReplying] = useState<{
    id: string
    rootId: string
    author: string
  } | null>(null)
  const [searchResults, setSearchResults] = useState<{
    query: string
    found: BuzzMessage[]
  } | null>(null)

  const activeChannel = chat.channels.find(
    channel => channel.id === chat.activeChannelId,
  )

  useEffect(() => {
    nearBottomRef.current = true
  }, [chat.activeChannelId])

  useEffect(() => {
    const el = scrollRef.current
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight
  }, [chat.messages])

  const onLoadOlder = (): void => {
    const el = scrollRef.current
    const heightBefore = el?.scrollHeight ?? 0
    const topBefore = el?.scrollTop ?? 0
    setLoadingOlder(true)
    void chat.loadOlder().then(() => {
      setLoadingOlder(false)
      // Keep the reader anchored on the message they were looking at.
      requestAnimationFrame(() => {
        const node = scrollRef.current
        if (node) node.scrollTop = node.scrollHeight - heightBefore + topBefore
      })
    })
  }

  const rooms = chat.channels.filter(channel => channel.type === 'channel')
  const dms = chat.channels.filter(
    channel => channel.type === 'dm' && !chat.hiddenDms.has(channel.id),
  )

  useEffect(() => {
    if (!showMembers) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setShowMembers(false)
        setAddingPerson(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showMembers])

  const messagePerson = (pubkey: string): void => {
    const existing = chat.channels.find(
      channel =>
        channel.type === 'dm' && channel.participants.includes(pubkey),
    )
    if (existing) {
      chat.selectChannel(existing.id)
      return
    }
    void chat.openDm(npubOf(pubkey)).then(error => {
      setSendError(error)
      if (error) return
      // Discovery brings the fresh channel within a refresh; select it then.
      window.setTimeout(() => {
        const created = chat.channels.find(
          channel =>
            channel.type === 'dm' && channel.participants.includes(pubkey),
        )
        if (created) chat.selectChannel(created.id)
      }, 1500)
    })
  }

  const knownPeople = (() => {
    const pubkeys = new Set<string>(Object.keys(chat.names))
    for (const roster of Object.values(chat.channelMembers)) {
      for (const member of roster) pubkeys.add(member.pubkey)
    }
    pubkeys.delete(chat.publicKey)
    return [...pubkeys]
      .map(pubkey => ({ pubkey, name: chat.nameFor(pubkey) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  })()

  const openRowMenu = (
    conversationId: string,
    event: React.MouseEvent,
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ conversationId, x: event.clientX, y: event.clientY })
  }

  const menuChannel = menu
    ? chat.channels.find(channel => channel.id === menu.conversationId)
    : undefined

  const menuItems: MenuItem[] = !menuChannel
    ? []
    : menuChannel.type === 'dm'
      ? (() => {
          const other = menuChannel.participants.find(
            pubkey => pubkey !== chat.publicKey,
          )
          return [
            {
              label: 'Open',
              hint: '↵',
              action: () => chat.selectChannel(menuChannel.id),
            },
            {
              label: 'View profile',
              action: () => {
                if (!other) return
                setProfilePeek(
                  `${chat.nameFor(other)}${
                    chat.emails[other] ? ` <${chat.emails[other]}>` : ''
                  } · ${npubOf(other)}`,
                )
              },
            },
            {
              label: 'Mark as read',
              action: () => chat.markRead(menuChannel.id),
            },
            {
              label: chat.muted.has(menuChannel.id)
                ? 'Unmute conversation'
                : 'Mute conversation',
              action: () => chat.toggleMute(menuChannel.id),
            },
            {
              label: 'Copy public key',
              action: () => {
                if (other) void navigator.clipboard?.writeText(npubOf(other))
              },
            },
            {
              label: 'Close conversation',
              destructive: true,
              confirm: true,
              action: () => chat.hideDm(menuChannel.id),
            },
          ]
        })()
      : [
          {
            label: 'Open',
            hint: '↵',
            action: () => chat.selectChannel(menuChannel.id),
          },
          {
            label: 'Members',
            action: () => {
              chat.selectChannel(menuChannel.id)
              setShowMembers(true)
            },
          },
          {
            label: 'Invite people…',
            action: () => {
              chat.selectChannel(menuChannel.id)
              window.setTimeout(onMintInvite, 50)
            },
          },
          {
            label: 'Mark as read',
            action: () => chat.markRead(menuChannel.id),
          },
          {
            label: chat.muted.has(menuChannel.id)
              ? 'Unmute channel'
              : 'Mute channel',
            action: () => chat.toggleMute(menuChannel.id),
          },
          {
            label: 'Rename channel',
            action: () => {
              chat.selectChannel(menuChannel.id)
              setRenaming(true)
            },
          },
          ...(menuChannel.visibility === 'open'
            ? [
                {
                  label: 'Make private',
                  action: () => {
                    void chat
                      .makeChannelPrivate(menuChannel.id)
                      .then(error => setSendError(error))
                  },
                },
              ]
            : []),
          {
            label: 'Copy channel key',
            hint: '⌘C',
            action: () => {
              void navigator.clipboard?.writeText(menuChannel.id)
            },
          },
          {
            label: 'Leave channel',
            destructive: true,
            confirm: true,
            action: () => {
              void chat
                .leaveChannel(menuChannel.id)
                .then(error => setSendError(error))
            },
          },
          {
            label: 'Delete channel',
            destructive: true,
            confirm: true,
            action: () => {
              void chat
                .deleteChannel(menuChannel.id)
                .then(error => setSendError(error))
            },
          },
        ]

  const visibleMessages = (searchResults?.found ?? chat.messages).filter(
    message => !chat.deleted[message.id],
  )

  const typingNames = chat.activeChannelId
    ? Object.keys(chat.typers[chat.activeChannelId] ?? {}).map(chat.nameFor)
    : []

  // The invite chip and the add-person form both speak about ONE channel;
  // switching channels must not carry them along.
  // Half-typed messages survive channel switches: stash the leaving
  // channel's draft, load the arriving one's.
  const draftsRef = useRef<Record<string, string>>({})
  const prevChannelRef = useRef<string | null>(null)
  useEffect(() => {
    const previous = prevChannelRef.current
    prevChannelRef.current = chat.activeChannelId
    if (previous) draftsRef.current[previous] = draft
    setDraft(
      chat.activeChannelId
        ? (draftsRef.current[chat.activeChannelId] ?? '')
        : '',
    )
    setMintedCode(null)
    setAddingPerson(false)
    setPendingFile(null)
    setPicker(null)
    setEditing(null)
    setSearchResults(null)
    setRenaming(false)
    setRemovingMember(null)
    setMenu(null)
    setShowMembers(false)
    setReplying(null)
  }, [chat.activeChannelId])

  if (bridgeError) {
    return (
      <AppFrame>
        <EmptyState
          tone="error"
          title="Bridge unavailable"
          message={bridgeError.message}
        />
      </AppFrame>
    )
  }

  const onSend = (event: FormEvent): void => {
    event.preventDefault()
    const text = draft
    if (editing) {
      const target = editing
      void chat.sendEdit(target, text).then(error => {
        setSendError(error)
        if (!error) {
          setEditing(null)
          setDraft('')
        }
      })
      return
    }
    if (pendingFile) {
      // The attachment waits for Send; upload happens now, as one message
      // with the typed text. Draft and chip only clear on success.
      const file = pendingFile
      setUploading(true)
      void chat.sendFile(file, text).then(error => {
        setUploading(false)
        setSendError(error)
        if (!error) {
          setPendingFile(null)
          setDraft('')
        }
      })
      return
    }
    const replyTo = replying
      ? { parentId: replying.id, rootId: replying.rootId }
      : undefined
    if (chat.activeChannelId) delete draftsRef.current[chat.activeChannelId]
    // Every roster member whose @Name appears verbatim gets a mention tag.
    const mentions = (
      chat.activeChannelId
        ? (chat.channelMembers[chat.activeChannelId] ?? [])
        : []
    )
      .map(member => ({
        pubkey: member.pubkey,
        name: chat.nameFor(member.pubkey),
      }))
      .filter(
        person =>
          !person.name.includes('…') && text.includes(`@${person.name}`),
      )
      .map(person => person.pubkey)
    setDraft('')
    setReplying(null)
    setMentionQuery(null)
    void chat
      .sendMessage(text, replyTo, mentions)
      .then(error => setSendError(error))
  }

  const onCreateChannel = (event: FormEvent): void => {
    event.preventDefault()
    const name = newChannel
    setNewChannel('')
    // Private-only by policy: an open channel would let ANY relay member
    // wander in — and their words into everything the agent reads. Private
    // means every member of every channel was explicitly vouched for.
    void chat
      .createChannel(name, 'private')
      .then(error => setSendError(error))
  }

  const onMintInvite = (): void => {
    void chat
      .createInvite(inviteTtl)
      .then(invite => {
        setMintedExpiry(invite.expiresAt || null)
        // One string configures everything on the other side: the packed
        // token carries the relay and the claim code. (Channels stay
        // private-only, so no channel rides along — the second step is
        // adding their key via Members once they appear.)
        const packed = packInvite({ relay: chat.relayUrl, code: invite.code })
        setMintedCode(packed)
        void navigator.clipboard?.writeText(packed)
      })
      .catch((error: unknown) =>
        setSendError(
          error instanceof Error ? error.message : 'invite mint failed',
        ),
      )
  }

  return (
    <AppFrame>
      <Layout>
        <Sidebar>
          <SideTop>
            <WordmarkRow>
              <SideSearch
              value={sidebarQuery}
              onChange={event => setSidebarQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  const query = sidebarQuery.trim()
                  if (!query) return
                  setSearching(true)
                  void chat
                    .searchAll(query)
                    .then(found => {
                      setSearching(false)
                      setSearchResults({ query, found })
                    })
                    .catch(() => {
                      setSearching(false)
                      setSendError('search failed')
                    })
                }
                if (event.key === 'Escape') {
                  setSidebarQuery('')
                  setSearchResults(null)
                }
              }}
              placeholder="Search messages and people"
              aria-label="Search all conversations"
              spellCheck={false}
              />
              <OwnAvatar
                title={`${chat.displayName || 'you'} · ${shortPubkey(chat.publicKey)}`}
              >
                {initialsOf(chat.displayName, chat.publicKey)}
              </OwnAvatar>
            </WordmarkRow>
          </SideTop>
          <ChannelList>
            <SectionRow>
              <SectionLabel>Channels</SectionLabel>
              <PlusButton
                type="button"
                title="Create a private channel"
                onClick={() => setCreatingChannel(current => !current)}
              >
                +
              </PlusButton>
            </SectionRow>
            {creatingChannel && (
              <InlineForm
                onSubmit={event => {
                  onCreateChannel(event)
                  setCreatingChannel(false)
                }}
                title="Channels are private: every member is added explicitly by someone already inside."
              >
                <TextInput
                  value={newChannel}
                  onChange={event => setNewChannel(event.target.value)}
                  placeholder="New channel… 🔒"
                  aria-label="New channel name"
                  autoFocus
                />
                <QuietButton type="submit">Create</QuietButton>
              </InlineForm>
            )}
            {rooms.length === 0 && !creatingChannel ? (
              <SideEmpty>No channels yet — create one with +.</SideEmpty>
            ) : (
              rooms.map(channel => (
                <ChannelButton
                  key={channel.id}
                  type="button"
                  data-active={channel.id === chat.activeChannelId ? '' : undefined}
                  onClick={() => chat.selectChannel(channel.id)}
                  onContextMenu={event => openRowMenu(channel.id, event)}
                >
                  <RowHash>#</RowHash>
                  <RowName>{channel.name}</RowName>
                  {channel.visibility === 'private' &&
                    !chat.unread[channel.id] && <PrivateTag>private</PrivateTag>}
                  {(chat.unread[channel.id] ?? 0) > 0 && (
                    <UnreadPill>{chat.unread[channel.id]}</UnreadPill>
                  )}
                </ChannelButton>
              ))
            )}
            <SectionRow style={{ marginTop: 18 }}>
              <SectionLabel>Direct messages</SectionLabel>
              <PlusButton
                type="button"
                title="Message someone"
                onClick={() => setDmPicker(current => !current)}
              >
                +
              </PlusButton>
            </SectionRow>
            {dmPicker && (
              <DmPickerList>
                {knownPeople.length === 0 && (
                  <SideEmpty>
                    Nobody else here yet — invite someone first.
                  </SideEmpty>
                )}
                {knownPeople.map(person => (
                  <MentionRow
                    key={person.pubkey}
                    type="button"
                    $active={false}
                    onClick={() => {
                      setDmPicker(false)
                      messagePerson(person.pubkey)
                    }}
                  >
                    <DmInitials>
                      {initialsOf(
                        person.name.includes('…') ? '' : person.name,
                        person.pubkey,
                      )}
                    </DmInitials>
                    <RowName>{person.name}</RowName>
                    <PresenceDot
                      $online={chat.presence[person.pubkey] === true}
                    />
                  </MentionRow>
                ))}
              </DmPickerList>
            )}
            {dms.map(channel => {
              const others = channel.participants.filter(
                pubkey => pubkey !== chat.publicKey,
              )
              const label =
                others.length > 0
                  ? others.map(chat.nameFor).join(', ')
                  : 'just you'
              const online =
                others.length > 0 && chat.presence[others[0]] === true
              return (
                <ChannelButton
                  key={channel.id}
                  type="button"
                  data-active={channel.id === chat.activeChannelId ? '' : undefined}
                  onClick={() => chat.selectChannel(channel.id)}
                  onContextMenu={event => openRowMenu(channel.id, event)}
                >
                  <DmInitials>
                    {initialsOf(
                      label === 'just you' ? '' : label,
                      others[0] ?? channel.id,
                    )}
                  </DmInitials>
                  <RowName>{label}</RowName>
                  <PresenceDot $online={online} />
                  {(chat.unread[channel.id] ?? 0) > 0 && (
                    <UnreadPill>{chat.unread[channel.id]}</UnreadPill>
                  )}
                </ChannelButton>
              )
            })}
          </ChannelList>
          <SideFooter>
            <RelayLabelRow>
              <RelayDot $state={relayDirty ? 'dirty' : chat.status} />
              <SectionLabel>Relay</SectionLabel>
              <RelayStatusText>
                {relayDirty ? 'not connected' : chat.status === 'ready' ? 'connected' : chat.status}
              </RelayStatusText>
            </RelayLabelRow>
            <FooterRow>
              <RelayInput
                value={relayDraft}
                onChange={event => {
                  setRelayDraft(event.target.value)
                  setRelayDirty(event.target.value.trim() !== chat.relayUrl)
                }}
                placeholder="wss://…"
                aria-label="Relay URL"
                spellCheck={false}
              />
              <FooterButton
                type="button"
                onClick={() => {
                  chat.setRelayUrl(relayDraft)
                  setRelayDirty(false)
                }}
              >
                {relayDirty ? 'Connect' : 'Reconnect'}
              </FooterButton>
            </FooterRow>
            <FooterDivider />
            <FooterRow
              as="form"
              onSubmit={(event: React.FormEvent) => {
                event.preventDefault()
                const input = (
                  event.target as HTMLFormElement
                ).elements.namedItem('dmkey') as HTMLInputElement
                const value = input.value
                if (!value.trim()) return
                void chat.openDm(value).then(error => {
                  setSendError(error)
                  if (!error) input.value = ''
                })
              }}
            >
              <FooterInput
                name="dmkey"
                placeholder="DM by name or key…"
                aria-label="Open a direct message by name or key"
                spellCheck={false}
              />
              <FooterButton type="submit">DM</FooterButton>
            </FooterRow>
            {joinCode === null ? (
              <FooterRow
                as="form"
                onSubmit={(event: React.FormEvent) => {
                  event.preventDefault()
                  const input = (
                    event.target as HTMLFormElement
                  ).elements.namedItem('invite') as HTMLInputElement
                  const code = input.value.trim()
                  if (!code) return
                  input.value = ''
                  setJoinCode(code)
                }}
              >
                <RelayInput
                  name="invite"
                  placeholder="Invite code…"
                  aria-label="Invite code"
                  spellCheck={false}
                />
                <FooterButton type="submit">Join</FooterButton>
              </FooterRow>
            ) : (
              <JoinIdentityForm
                onSubmit={event => {
                  event.preventDefault()
                  const form = event.target as HTMLFormElement
                  const name = (
                    form.elements.namedItem('joinname') as HTMLInputElement
                  ).value.trim()
                  const email = (
                    form.elements.namedItem('joinemail') as HTMLInputElement
                  ).value.trim()
                  if (!name || !email.includes('@')) {
                    setSendError('a name and a valid email are needed to join')
                    return
                  }
                  const code = joinCode
                  setJoinCode(null)
                  void chat
                    .joinWithInvite(code, { name, email })
                    .then(error => setSendError(error))
                }}
              >
                <JoinIdentityHint>
                  Introduce yourself — the person who invited you sees this:
                </JoinIdentityHint>
                <FooterInput
                  name="joinname"
                  placeholder="Your name…"
                  aria-label="Your name"
                  autoFocus
                  spellCheck={false}
                />
                <FooterInput
                  name="joinemail"
                  type="email"
                  placeholder="Your email…"
                  aria-label="Your email"
                  spellCheck={false}
                />
                <JoinIdentityRow>
                  <FooterButton type="submit">Join</FooterButton>
                  <FooterButton type="button" onClick={() => setJoinCode(null)}>
                    Cancel
                  </FooterButton>
                </JoinIdentityRow>
              </JoinIdentityForm>
            )}
          </SideFooter>
        </Sidebar>
        <Main>
          {profilePeek && (
            <NamePrompt>
              {profilePeek}{' '}
              <QuietButton type="button" onClick={() => setProfilePeek(null)}>
                ✕
              </QuietButton>
            </NamePrompt>
          )}
          {chat.joinPrompts.map(prompt => {
            const channel = chat.channels.find(
              entry => entry.id === prompt.channelId,
            )
            return (
              <NamePrompt key={prompt.pubkey}>
                🔑 {chat.nameFor(prompt.pubkey)}
                {chat.emails[prompt.pubkey]
                  ? ` <${chat.emails[prompt.pubkey]}>`
                  : ''}{' '}
                just joined the relay — add them to #
                {channel?.name ?? 'the channel'}?{' '}
                <QuietButton
                  type="button"
                  onClick={() => {
                    void chat
                      .resolveJoinPrompt(prompt.pubkey, true)
                      .then(error => setSendError(error))
                  }}
                >
                  Add
                </QuietButton>{' '}
                <QuietButton
                  type="button"
                  onClick={() => {
                    void chat.resolveJoinPrompt(prompt.pubkey, false)
                  }}
                >
                  Not now
                </QuietButton>
              </NamePrompt>
            )
          })}
          {chat.status === 'ready' && !chat.displayName && (
            <NamePrompt>
              Set your name in the bottom-right field — right now people see
              you as {shortPubkey(chat.publicKey)}.
            </NamePrompt>
          )}
          {chat.activeChannelId ? (
            <>
              <ChannelHeader>
                <HeaderTop>
                  <ChannelTitle>
                    {activeChannel?.type === 'dm'
                      ? `@ ${activeChannel.participants
                          .filter(pubkey => pubkey !== chat.publicKey)
                          .map(chat.nameFor)
                          .join(', ')}`
                      : `# ${activeChannel?.name ?? chat.activeChannelId}`}
                  </ChannelTitle>
                  {activeChannel?.visibility === 'private' &&
                    activeChannel.type !== 'dm' && (
                      <PrivateChip>private</PrivateChip>
                    )}
                  <HeaderSubtitle>
                    {activeChannel?.type === 'dm'
                      ? 'direct message'
                      : `${
                          (chat.channelMembers[chat.activeChannelId] ?? [])
                            .length
                        } members${
                          activeChannel?.about ? ` · ${activeChannel.about}` : ''
                        }`}
                  </HeaderSubtitle>
                  <HeaderSpacer />
                  <HeaderButton
                    type="button"
                    onClick={() => setShowMembers(current => !current)}
                  >
                    Members
                  </HeaderButton>
                  {activeChannel?.type !== 'dm' && (
                    <>
                      <TtlSelect
                        value={inviteTtl}
                        aria-label="Invite validity"
                        title="How long a minted invite stays claimable"
                        onChange={event =>
                          setInviteTtl(Number(event.target.value))
                        }
                      >
                        <option value={3600}>1 hour</option>
                        <option value={86_400}>1 day</option>
                        <option value={259_200}>3 days</option>
                        <option value={604_800}>1 week</option>
                        <option value={2_592_000}>30 days</option>
                      </TtlSelect>
                      <HeaderButton type="button" onClick={onMintInvite}>
                        {mintedCode ? 'New invite' : 'Invite'}
                      </HeaderButton>
                    </>
                  )}
                  <HeaderButton
                    type="button"
                    aria-label="Conversation menu"
                    onClick={event => {
                      if (!chat.activeChannelId) return
                      const rect = (
                        event.target as HTMLElement
                      ).getBoundingClientRect()
                      setMenu({
                        conversationId: chat.activeChannelId,
                        x: rect.right - 226,
                        y: rect.bottom + 6,
                      })
                    }}
                  >
                    ⋯
                  </HeaderButton>
                </HeaderTop>
                {showMembers && (
                  <MembersPop>
                    <MembersPopHead>
                      <SectionLabel>
                        Members ·{' '}
                        {(chat.channelMembers[chat.activeChannelId] ?? [])
                          .length}
                      </SectionLabel>
                      <PendingRemove
                        type="button"
                        aria-label="Close members"
                        onClick={() => {
                          setShowMembers(false)
                          setAddingPerson(false)
                        }}
                      >
                        ✕
                      </PendingRemove>
                    </MembersPopHead>
                  <MemberStrip>
                    {(chat.channelMembers[chat.activeChannelId] ?? []).map(
                      member => {
                        const name = chat.nameFor(member.pubkey)
                        const online = chat.presence[member.pubkey] === true
                        const armed = removingMember === member.pubkey
                        const isSelf = member.pubkey === chat.publicKey
                        return (
                          <MemberAvatar
                            key={member.pubkey}
                            as="button"
                            type="button"
                            onContextMenu={(event: React.MouseEvent) => {
                              event.preventDefault()
                              setPersonMenu({
                                pubkey: member.pubkey,
                                x: event.clientX,
                                y: event.clientY,
                              })
                            }}
                            $online={online}
                            $armed={armed}
                            title={
                              isSelf
                                ? `${name} (you) · ${member.role}`
                                : armed
                                  ? `Remove ${name} from this channel? Click again.`
                                  : `${name}${
                                      chat.emails[member.pubkey]
                                        ? ` <${chat.emails[member.pubkey]}>`
                                        : ''
                                    } · ${member.role} · ${
                                      online ? 'online' : 'offline'
                                    } — click to remove (owners/admins)`
                            }
                            onClick={() => {
                              if (isSelf || !chat.activeChannelId) return
                              if (!armed) {
                                setRemovingMember(member.pubkey)
                                window.setTimeout(
                                  () =>
                                    setRemovingMember(current =>
                                      current === member.pubkey
                                        ? null
                                        : current,
                                    ),
                                  4000,
                                )
                                return
                              }
                              setRemovingMember(null)
                              void chat
                                .removeFromChannel(
                                  chat.activeChannelId,
                                  member.pubkey,
                                )
                                .then(error => setSendError(error))
                            }}
                          >
                            {armed ? '✕' : initialsOf(name, member.pubkey)}
                          </MemberAvatar>
                        )
                      },
                    )}
                    {activeChannel?.type !== 'dm' && (
                    <AddPersonButton
                      type="button"
                      title={
                        activeChannel?.visibility === 'private'
                          ? 'Add a person by their key — the only way into a private channel'
                          : 'Add someone already on the relay by their key — newcomers just need the invite'
                      }
                      onClick={() => setAddingPerson(current => !current)}
                    >
                      +
                    </AddPersonButton>
                    )}
                  </MemberStrip>
                {addingPerson && (
                  <HeaderForm
                    onSubmit={event => {
                      event.preventDefault()
                      const input = (
                        event.target as HTMLFormElement
                      ).elements.namedItem('member') as HTMLInputElement
                      const value = input.value
                      if (!value.trim() || !chat.activeChannelId) return
                      void chat
                        .addToChannel(chat.activeChannelId, value)
                        .then(error => {
                          setSendError(error)
                          if (!error) {
                            input.value = ''
                            setAddingPerson(false)
                          }
                        })
                    }}
                  >
                    <TextInput
                      name="member"
                      placeholder={`key of the person to add to #${
                        activeChannel?.name ?? 'channel'
                      }…`}
                      aria-label="Add person to this channel"
                      spellCheck={false}
                    />
                    <QuietButton type="submit">Add</QuietButton>
                  </HeaderForm>
                )}
                  </MembersPop>
                )}
                {renaming && (
                  <HeaderForm
                    onSubmit={event => {
                      event.preventDefault()
                      const input = (
                        event.target as HTMLFormElement
                      ).elements.namedItem('newname') as HTMLInputElement
                      const value = input.value.trim()
                      if (!value || !chat.activeChannelId) return
                      void chat
                        .renameChannel(chat.activeChannelId, value)
                        .then(error => {
                          setSendError(error)
                          if (!error) setRenaming(false)
                        })
                    }}
                  >
                    <TextInput
                      name="newname"
                      defaultValue={activeChannel?.name ?? ''}
                      aria-label="New channel name"
                      autoFocus
                      spellCheck={false}
                    />
                    <QuietButton type="submit">Rename</QuietButton>
                  </HeaderForm>
                )}
                {mintedCode && (
                  <HeaderForm as="div">
                    <MintedCode
                      type="button"
                      title={`Copied to clipboard — single use${
                        mintedExpiry
                          ? `, valid until ${new Date(
                              mintedExpiry * 1000,
                            ).toLocaleString()}`
                          : ''
                      }.\n${mintedCode}\nClick to copy again.`}
                      onClick={() => {
                        void navigator.clipboard?.writeText(mintedCode)
                        setInviteCopied(true)
                        window.setTimeout(() => setInviteCopied(false), 1500)
                      }}
                    >
                      <MintedCodeText>
                        {inviteCopied ? 'invite copied ✓' : mintedCode}
                      </MintedCodeText>
                      <span aria-hidden>⧉</span>
                    </MintedCode>
                  </HeaderForm>
                )}
              </ChannelHeader>
              {searchResults && (
                <SearchHeader>
                  <SearchHeadLeft>
                    <SearchTitle>
                      Results for “{searchResults.query}”
                    </SearchTitle>
                    <SearchCount>
                      {searching
                        ? 'searching…'
                        : `${searchResults.found.length} message${
                            searchResults.found.length === 1 ? '' : 's'
                          }`}
                    </SearchCount>
                  </SearchHeadLeft>
                  <HeaderButton
                    type="button"
                    onClick={() => {
                      setSearchResults(null)
                      setSidebarQuery('')
                    }}
                  >
                    Clear
                  </HeaderButton>
                </SearchHeader>
              )}
              <MessageScroll
                ref={scrollRef}
                onScroll={event => {
                  const el = event.currentTarget
                  nearBottomRef.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 100
                }}
              >
                {!searchResults && chat.hasOlder && (
                  <LoadOlder
                    type="button"
                    disabled={loadingOlder}
                    onClick={onLoadOlder}
                  >
                    {loadingOlder ? 'Loading…' : 'Load older messages'}
                  </LoadOlder>
                )}
                {searchResults &&
                  !searching &&
                  visibleMessages.length === 0 && (
                    <NoResults>
                      Nothing matched. Try a shorter phrase, or a person’s
                      name.
                    </NoResults>
                  )}
                {!searchResults &&
                  visibleMessages.length === 0 &&
                  activeChannel && (
                    <EmptyChannel>
                      <EmptyTile>
                        {activeChannel.type === 'dm' ? '@' : '#'}
                      </EmptyTile>
                      <EmptyTitle>
                        {activeChannel.type === 'dm'
                          ? 'No messages yet'
                          : `# ${activeChannel.name} is empty`}
                      </EmptyTitle>
                      <EmptyCopy>
                        {activeChannel.type === 'dm'
                          ? 'Say hello — everything here is end-to-relay between the two of you.'
                          : 'Add the people who need to be here — private channels only ever contain members somebody added explicitly.'}
                      </EmptyCopy>
                      {activeChannel.type !== 'dm' && (
                        <EmptyActions>
                          <SendButton
                            type="button"
                            onClick={() => {
                              setShowMembers(true)
                              setAddingPerson(true)
                            }}
                          >
                            Add people
                          </SendButton>
                          <HeaderButton
                            type="button"
                            onClick={() => setRenaming(true)}
                          >
                            Rename
                          </HeaderButton>
                        </EmptyActions>
                      )}
                    </EmptyChannel>
                  )}
                {visibleMessages.map((message, index, visible) => {
                    const previous = index > 0 ? visible[index - 1] : null
                    const grouped =
                      !searchResults &&
                      previous !== null &&
                      previous.pubkey === message.pubkey &&
                      message.createdAt - previous.createdAt < 300 &&
                      !message.parentId
                    const dayOf = (at: number): string =>
                      new Date(at * 1000).toDateString()
                    const showDivider =
                      !searchResults &&
                      (previous === null ||
                        dayOf(previous.createdAt) !== dayOf(message.createdAt))
                    const dividerLabel = (): string => {
                      const day = dayOf(message.createdAt)
                      if (day === new Date().toDateString()) return 'Today'
                      if (
                        day ===
                        new Date(Date.now() - 86_400_000).toDateString()
                      )
                        return 'Yesterday'
                      return new Date(message.createdAt * 1000)
                        .toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                    }
                    if (searchResults) {
                      const where = chat.channels.find(
                        channel => channel.id === message.channelId,
                      )
                      return (
                        <ResultCard
                          key={message.id}
                          type="button"
                          onClick={() => {
                            setSearchResults(null)
                            setSidebarQuery('')
                            chat.selectChannel(message.channelId)
                          }}
                        >
                          <ResultMeta>
                            <strong>
                              {where?.type === 'dm'
                                ? where.participants
                                    .filter(pk => pk !== chat.publicKey)
                                    .map(chat.nameFor)
                                    .join(', ') || 'DM'
                                : `# ${where?.name ?? message.channelId}`}
                            </strong>
                            <span>{chat.nameFor(message.pubkey)}</span>
                            <ResultTime>
                              {new Date(
                                message.createdAt * 1000,
                              ).toLocaleString()}
                            </ResultTime>
                          </ResultMeta>
                          <ResultText>{message.text}</ResultText>
                        </ResultCard>
                      )
                    }
                    return (
                      <div key={message.id}>
                        {showDivider && (
                          <DateDivider>
                            <DateDividerLabel>
                              {dividerLabel()}
                            </DateDividerLabel>
                          </DateDivider>
                        )}
                        <MessageView
                      message={message}
                      authorName={chat.nameFor(message.pubkey)}
                      resolveMedia={chat.resolveMedia}
                      reactions={chat.reactions[message.id] ?? {}}
                      onReact={emoji => {
                        void chat
                          .sendReaction(message.id, emoji)
                          .then(error => setSendError(error))
                      }}
                      editedText={chat.edits[message.id]?.text ?? null}
                      linkPreview={
                        chat.linkPreviews === 'all' ||
                        (chat.linkPreviews === 'channels' &&
                          activeChannel?.type !== 'dm')
                      }
                      onReply={() => {
                        setReplying({
                          id: message.id,
                          rootId: message.rootId ?? message.id,
                          author: chat.nameFor(message.pubkey),
                        })
                        draftInputRef.current?.focus()
                      }}
                      replyContext={
                        message.parentId
                          ? (() => {
                              const parent = chat.messages.find(
                                entry => entry.id === message.parentId,
                              )
                              if (!parent)
                                return {
                                  author: 'earlier message',
                                  snippet: '…',
                                }
                              return {
                                author: chat.nameFor(parent.pubkey),
                                snippet: (
                                  chat.edits[parent.id]?.text ?? parent.text
                                ).slice(0, 80),
                              }
                            })()
                          : null
                      }
                      onEdit={() => {
                        setEditing(message.id)
                        setDraft(chat.edits[message.id]?.text ?? message.text)
                        draftInputRef.current?.focus()
                      }}
                      deleteArmed={confirmingDelete === message.id}
                      onDelete={() => {
                        // The iframe sandbox has no allow-modals: confirm()
                        // silently returns false. Two clicks arm-then-fire.
                        if (confirmingDelete !== message.id) {
                          setConfirmingDelete(message.id)
                          window.setTimeout(
                            () =>
                              setConfirmingDelete(current =>
                                current === message.id ? null : current,
                              ),
                            4000,
                          )
                          return
                        }
                        setConfirmingDelete(null)
                        void chat
                          .sendDelete(message.id)
                          .then(error => setSendError(error))
                      }}
                      nameFor={chat.nameFor}
                      myPubkey={chat.publicKey}
                      onOpenPicker={() =>
                        setPicker({ kind: 'react', messageId: message.id })
                      }
                      grouped={grouped}
                      onPersonMenu={(pubkey, event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setPersonMenu({
                          pubkey,
                          x: event.clientX,
                          y: event.clientY,
                        })
                      }}
                      onViewImage={(dataUrl, label) =>
                        setLightbox({ src: dataUrl, alt: label })
                      }
                    />
                      </div>
                    )
                  })}
              </MessageScroll>
              {picker && (
                <EmojiPicker
                  onPick={emoji => {
                    const target = picker
                    setPicker(null)
                    if (target.kind === 'react') {
                      void chat
                        .sendReaction(target.messageId, emoji)
                        .then(error => setSendError(error))
                      return
                    }
                    // Compose: insert at the cursor and hand focus back.
                    const input = draftInputRef.current
                    const at = input?.selectionStart ?? draft.length
                    setDraft(
                      `${draft.slice(0, at)}${emoji}${draft.slice(at)}`,
                    )
                    window.setTimeout(() => {
                      input?.focus()
                      const caret = at + emoji.length
                      input?.setSelectionRange(caret, caret)
                    }, 0)
                  }}
                  onClose={() => setPicker(null)}
                />
              )}
              {editing && (
                <TypingLine>
                  Editing a message — Esc cancels, Send saves.
                </TypingLine>
              )}
              {replying && !editing && (
                <TypingLine>
                  Replying to {replying.author} — Esc cancels.
                </TypingLine>
              )}
              {typingNames.length > 0 && (
                <TypingLine>
                  {typingNames.join(', ')}{' '}
                  {typingNames.length === 1 ? 'is' : 'are'} typing…
                </TypingLine>
              )}
              <ComposerWrap>
                {replying && !editing && (
                  <ReplyBanner>
                    <strong>Replying to {replying.author}</strong>
                    <ReplyBannerSnippet>
                      Esc cancels — the reply references their message.
                    </ReplyBannerSnippet>
                    <PendingRemove
                      type="button"
                      aria-label="Cancel reply"
                      onClick={() => setReplying(null)}
                    >
                      ×
                    </PendingRemove>
                  </ReplyBanner>
                )}
                <ComposerBox as="form" onSubmit={onSend} $joined={!!replying && !editing}>
                  {mentionQuery !== null && mentionCandidates.length > 0 && (
                    <MentionPop>
                      <MentionPopLabel>
                        People in{' '}
                        {activeChannel?.type === 'dm'
                          ? 'this conversation'
                          : `#${activeChannel?.name ?? 'channel'}`}
                      </MentionPopLabel>
                      {mentionCandidates.map((person, index) => (
                        <MentionRow
                          key={person.pubkey}
                          type="button"
                          $active={index === mentionIndex}
                          onClick={() => insertMention(person.name)}
                        >
                          <Avatar
                            $bg={avatarColorOf(person.pubkey, chat.publicKey)}
                          >
                            {initialsOf(person.name, person.pubkey)}
                          </Avatar>
                          <span>{person.name}</span>
                        </MentionRow>
                      ))}
                    </MentionPop>
                  )}
                  {pendingFile && (
                    <StagedFile>
                      <FileExtTile>
                        {(pendingFile.name.split('.').pop() ?? 'file')
                          .slice(0, 4)
                          .toUpperCase()}
                      </FileExtTile>
                      <StagedFileName>{pendingFile.name}</StagedFileName>
                      <StagedFileMeta>
                        {Math.max(1, Math.round(pendingFile.size / 1024))} KB ·
                        sends with the message
                      </StagedFileMeta>
                      <PendingRemove
                        type="button"
                        aria-label="Remove attachment"
                        onClick={() => setPendingFile(null)}
                      >
                        ×
                      </PendingRemove>
                    </StagedFile>
                  )}
                  <ComposerTextarea
                    ref={draftInputRef}
                    value={draft}
                    rows={2}
                    onChange={event => {
                      // :fire: becomes 🔥 the moment the closing colon lands.
                      setDraft(replaceShortcodes(event.target.value))
                      if (event.target.value) chat.notifyTyping()
                      // A trailing "@word" before the caret opens the people
                      // popover; anything else closes it.
                      const caret = event.target.selectionStart ?? 0
                      const before = event.target.value.slice(0, caret)
                      const match = /(?:^|\s)@([\w-]*)$/.exec(before)
                      setMentionQuery(match ? match[1] : null)
                      setMentionIndex(0)
                    }}
                    onPaste={event => {
                      const file = Array.from(
                        event.clipboardData?.files ?? [],
                      ).find(entry => entry.type.startsWith('image/'))
                      if (file) {
                        event.preventDefault()
                        setPendingFile(
                          new File(
                            [file],
                            file.name || `pasted-${Date.now()}.png`,
                            { type: file.type },
                          ),
                        )
                      }
                    }}
                    onKeyDown={event => {
                      if (mentionQuery !== null && mentionCandidates.length > 0) {
                        if (event.key === 'ArrowDown') {
                          event.preventDefault()
                          setMentionIndex(
                            current =>
                              (current + 1) % mentionCandidates.length,
                          )
                          return
                        }
                        if (event.key === 'ArrowUp') {
                          event.preventDefault()
                          setMentionIndex(
                            current =>
                              (current - 1 + mentionCandidates.length) %
                              mentionCandidates.length,
                          )
                          return
                        }
                        if (event.key === 'Enter' || event.key === 'Tab') {
                          event.preventDefault()
                          insertMention(
                            mentionCandidates[mentionIndex]?.name ?? '',
                          )
                          return
                        }
                        if (event.key === 'Escape') {
                          setMentionQuery(null)
                          return
                        }
                      }
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        onSend(event as unknown as FormEvent)
                        return
                      }
                      if (event.key === 'Escape' && editing) {
                        setEditing(null)
                        setDraft('')
                      } else if (event.key === 'Escape' && replying) {
                        setReplying(null)
                      }
                    }}
                    placeholder={
                      pendingFile
                        ? 'Add a caption…'
                        : activeChannel?.type === 'dm'
                          ? `Message ${
                              activeChannel.participants
                                .filter(pubkey => pubkey !== chat.publicKey)
                                .map(chat.nameFor)
                                .join(', ') || 'them'
                            }…`
                          : `Message #${activeChannel?.name ?? 'channel'}…`
                    }
                    aria-label="Message"
                  />
                  <ComposerToolbar>
                    <ToolbarButton
                      type="button"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Attach
                    </ToolbarButton>
                    <HiddenFileInput
                      ref={fileInputRef}
                      type="file"
                      aria-label="Attach a file"
                      onChange={event => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (file) setPendingFile(file)
                      }}
                    />
                    <ToolbarButton
                      type="button"
                      onClick={() =>
                        setPicker(current =>
                          current?.kind === 'compose'
                            ? null
                            : { kind: 'compose' },
                        )
                      }
                    >
                      Emoji
                    </ToolbarButton>
                    <ToolbarSpacer />
                    <ComposerHint>
                      Enter sends · Shift+Enter new line
                    </ComposerHint>
                    <SendButton type="submit" disabled={uploading}>
                      {uploading ? 'Sending…' : editing ? 'Save' : 'Send'}
                    </SendButton>
                  </ComposerToolbar>
                </ComposerBox>
              </ComposerWrap>
            </>
          ) : (
            <EmptyState
              title="Buzz"
              message={
                chat.status === 'ready'
                  ? 'Pick a channel, or create one.'
                  : `Relay: ${chat.status}${
                      chat.statusDetail ? ` — ${chat.statusDetail}` : ''
                    }`
              }
            />
          )}
          {chat.keyStorage.kind === 'session-only' && (
            <KeyWarning role="status">
              <KeyWarningTitle>Identity not saved.</KeyWarningTitle>
              <span>
                {chat.keyStorage.reason} It is held for this session only —
                quitting loses this identity and the channels it has joined.
                Nothing was written to disk unencrypted.
              </span>
            </KeyWarning>
          )}
          {chat.keyStorage.kind === 'unencrypted-dev' && (
            <KeyWarning role="status">
              <KeyWarningTitle>Dev mode: key unprotected.</KeyWarningTitle>
              <span>
                Running outside PureDesktop, so the identity key is in this
                browser&rsquo;s localStorage in the clear. Anything that can
                read this origin can sign as you. Use the desktop app for a
                key the OS keystore protects.
              </span>
            </KeyWarning>
          )}
          {pairing && (
            <PairingPanel chat={chat} onClose={() => setPairing(false)} />
          )}
          {restoring && (
            <RestoreRow
              onSubmit={event => {
                event.preventDefault()
                const input = (
                  event.target as HTMLFormElement
                ).elements.namedItem('secret') as HTMLInputElement
                const value = input.value
                if (!value.trim()) return
                void chat.importIdentity(value).then(error => {
                  setSendError(error)
                  if (!error) setRestoring(false)
                })
                input.value = ''
              }}
            >
              <TextInput
                name="secret"
                type="password"
                placeholder="Paste an nsec (or hex secret) — REPLACES this device's identity…"
                aria-label="Secret key to restore"
                autoFocus
                spellCheck={false}
              />
              <QuietButton type="submit">Restore</QuietButton>
              <QuietButton type="button" onClick={() => setRestoring(false)}>
                Cancel
              </QuietButton>
            </RestoreRow>
          )}
          <StatusBar>
            <StatusDot $ready={chat.status === 'ready'} />
            {chat.status}
            {sendError ? ` · ${sendError}` : ''}
            <IdentityForm
              onSubmit={event => {
                event.preventDefault()
                const input = (event.target as HTMLFormElement).elements.namedItem(
                  'name',
                ) as HTMLInputElement
                void chat.setDisplayName(input.value).then(error => {
                  if (error) setSendError(error)
                })
                input.blur()
              }}
            >
              you are{' '}
              <IdentityInput
                name="name"
                key={chat.displayName || chat.publicKey}
                defaultValue={chat.displayName}
                placeholder={shortPubkey(chat.publicKey)}
                aria-label="Your display name"
                spellCheck={false}
              />
            </IdentityForm>
            <CopyKeyChip publicKey={chat.publicKey} />
            <KeyChip
              type="button"
              title={
                backupArmed
                  ? 'Click again to copy your SECRET key. Anyone holding it IS you — paste it straight into a password manager.'
                  : 'Back up this identity: copies your SECRET key (nsec) after a second click.'
              }
              onClick={() => {
                if (!backupArmed) {
                  setBackupArmed(true)
                  window.setTimeout(() => setBackupArmed(false), 4000)
                  return
                }
                setBackupArmed(false)
                const nsec = chat.exportIdentity()
                if (nsec) void navigator.clipboard?.writeText(nsec)
              }}
            >
              {backupArmed ? 'copy secret?' : 'backup'}
            </KeyChip>
            <KeyChip
              type="button"
              title="Restore an identity from a backed-up nsec — replaces this device's current identity."
              onClick={() => setRestoring(current => !current)}
            >
              restore
            </KeyChip>
            <KeyChip
              type="button"
              title="Connect the Buzz mobile app: scan a QR code, compare six digits, and your identity transfers to the phone."
              onClick={() => setPairing(current => !current)}
            >
              📱 pair
            </KeyChip>
          </StatusBar>
        </Main>
        {lightbox && (
          <Lightbox onClick={() => setLightbox(null)}>
            <img src={lightbox.src} alt={lightbox.alt} />
          </Lightbox>
        )}
        {personMenu && (
          <ConversationMenu
            x={personMenu.x}
            y={personMenu.y}
            title={chat.nameFor(personMenu.pubkey)}
            subtitle={shortPubkey(personMenu.pubkey)}
            items={
              personMenu.pubkey === chat.publicKey
                ? [
                    {
                      label: 'Copy your public key',
                      action: () => {
                        void navigator.clipboard?.writeText(
                          npubOf(personMenu.pubkey),
                        )
                      },
                    },
                  ]
                : [
                    {
                      label: 'Message directly',
                      action: () => messagePerson(personMenu.pubkey),
                    },
                    {
                      label: 'View profile',
                      action: () =>
                        setProfilePeek(
                          `${chat.nameFor(personMenu.pubkey)}${
                            chat.emails[personMenu.pubkey]
                              ? ` <${chat.emails[personMenu.pubkey]}>`
                              : ''
                          } · ${npubOf(personMenu.pubkey)}`,
                        ),
                    },
                    {
                      label: 'Copy public key',
                      action: () => {
                        void navigator.clipboard?.writeText(
                          npubOf(personMenu.pubkey),
                        )
                      },
                    },
                  ]
            }
            onClose={() => setPersonMenu(null)}
          />
        )}
        {menu && menuChannel && (
          <ConversationMenu
            x={menu.x}
            y={menu.y}
            title={
              menuChannel.type === 'dm'
                ? menuChannel.participants
                    .filter(pubkey => pubkey !== chat.publicKey)
                    .map(chat.nameFor)
                    .join(', ') || 'Direct message'
                : `# ${menuChannel.name}`
            }
            subtitle={
              menuChannel.type === 'dm'
                ? 'direct message'
                : `${
                    (chat.channelMembers[menuChannel.id] ?? []).length
                  } members · ${menuChannel.visibility}`
            }
            items={menuItems}
            onClose={() => setMenu(null)}
          />
        )}
      </Layout>
    </AppFrame>
  )
}
