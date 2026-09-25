import { describe, expect, it } from 'vitest'
import { hostAndPath } from './linkPreview'
import { firstUrlOf } from './messageMarkdown'

describe('firstUrlOf', () => {
  it('finds the first URL and only complete ones', () => {
    expect(firstUrlOf('see https://a.example/x and https://b.example')).toBe(
      'https://a.example/x',
    )
    expect(firstUrlOf('no links here')).toBeNull()
    // Repeated calls must not be broken by the shared sticky regex.
    expect(firstUrlOf('again https://c.example')).toBe('https://c.example')
  })
})

describe('hostAndPath', () => {
  it('splits URLs and hides bare roots', () => {
    expect(hostAndPath('https://docs.example.io/retention')).toEqual({
      host: 'docs.example.io',
      path: '/retention',
    })
    expect(hostAndPath('https://example.io/')).toEqual({
      host: 'example.io',
      path: '',
    })
  })
})
