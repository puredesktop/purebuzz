import { describe, expect, it } from 'vitest'
import { isValidElement } from 'react'
import { renderMessageText } from './messageMarkdown'

function types(nodes: ReturnType<typeof renderMessageText>): string[] {
  return nodes.map(node =>
    isValidElement(node) ? String(node.type) : typeof node,
  )
}

describe('renderMessageText', () => {
  it('linkifies URLs and leaves surrounding text alone', () => {
    const nodes = renderMessageText('see https://example.com/x?q=1 now')
    expect(types(nodes)).toEqual(['string', 'a', 'string'])
    const anchor = nodes[1] as React.ReactElement<{ href: string; rel: string }>
    expect(anchor.props.href).toBe('https://example.com/x?q=1')
    expect(anchor.props.rel).toContain('noreferrer')
  })

  it('renders bold, italic, and inline code', () => {
    expect(types(renderMessageText('**b** and *i* and `c`'))).toEqual([
      'strong',
      'string',
      'em',
      'string',
      'code',
    ])
  })

  it('renders fenced blocks literally — no emphasis inside', () => {
    const nodes = renderMessageText('before\n```js\nconst x = "**not bold**"\n```\nafter')
    expect(types(nodes)).toContain('pre')
    const pre = nodes.find(
      node => isValidElement(node) && node.type === 'pre',
    ) as React.ReactElement<{ children: React.ReactElement<{ children: string }> }>
    expect(pre.props.children.props.children).toBe('const x = "**not bold**"')
  })

  it('never emits raw HTML from content', () => {
    const nodes = renderMessageText('<img src=x onerror=alert(1)>')
    expect(types(nodes)).toEqual(['string'])
  })
})
