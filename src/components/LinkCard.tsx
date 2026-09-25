import { useEffect, useState, type ReactElement } from 'react'
import { styled } from 'styled-components'
import { theme } from '../theme'
import {
  fetchLinkPreview,
  hostAndPath,
  type LinkPreviewState,
} from '../lib/linkPreview'

/**
 * The link preview card: a 4px primary bar, host line, title, description,
 * optional og:image thumbnail. Three states — pending (host line only, no
 * shimmer), loaded, failed (host + path, no thumbnail) — and the whole card
 * is one anchor.
 */

const Card = styled.a`
  display: flex;
  margin-top: 9px;
  max-width: 460px;
  border: 1px solid ${theme.border};
  border-radius: 9px;
  overflow: hidden;
  background: ${theme.white};
  text-decoration: none;
  color: inherit;

  &:hover {
    border-color: ${theme.cardHoverBorder};
    text-decoration: none;
  }
`

const Bar = styled.div`
  width: 4px;
  flex: 0 0 4px;
  background: ${theme.primary};
`

const Body = styled.div`
  flex: 1;
  min-width: 0;
  padding: 11px 13px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const HostLine = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: ${theme.mono};
  font-size: 10.5px;
  color: ${theme.subtle};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Favicon = styled.span`
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  border-radius: 3px;
  background: ${theme.tile};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  color: ${theme.muted};
  text-transform: uppercase;
`

const Title = styled.div`
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  color: ${theme.ink};
`

const Description = styled.div`
  font-size: 12.5px;
  line-height: 1.5;
  color: ${theme.muted};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`

const Thumb = styled.div<{ $src: string }>`
  width: 104px;
  flex: 0 0 104px;
  border-left: 1px solid ${theme.rule};
  background-image: url('${({ $src }) => $src}');
  background-size: cover;
  background-position: center;
`

export function LinkCard({ url }: { url: string }): ReactElement | null {
  const [state, setState] = useState<LinkPreviewState | 'pending'>('pending')

  useEffect(() => {
    let cancelled = false
    setState('pending')
    void fetchLinkPreview(url).then(result => {
      if (!cancelled) setState(result)
    })
    return () => {
      cancelled = true
    }
  }, [url])

  const { host, path } = hostAndPath(url)
  const mark = host.replace(/^www\./, '').charAt(0)

  return (
    <Card href={url} target="_blank" rel="noreferrer noopener">
      <Bar />
      <Body>
        <HostLine>
          <Favicon>{mark}</Favicon>
          {state !== 'pending' && state !== 'failed' && state.siteName
            ? state.siteName
            : host}
          {(state === 'failed' || state === 'pending') && path}
        </HostLine>
        {state !== 'pending' && state !== 'failed' && (
          <>
            <Title>{state.title}</Title>
            {state.description && (
              <Description>{state.description}</Description>
            )}
          </>
        )}
      </Body>
      {state !== 'pending' && state !== 'failed' && state.image && (
        <Thumb $src={state.image} />
      )}
    </Card>
  )
}
