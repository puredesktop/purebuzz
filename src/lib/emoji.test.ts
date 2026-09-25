import { describe, expect, it } from 'vitest'
import { EMOJI, replaceShortcodes, searchEmoji } from './emoji'

describe('emoji table', () => {
  it('holds only clean single-emoji entries with unique names', () => {
    const names = new Set<string>()
    for (const entry of EMOJI) {
      expect(entry.char).not.toContain('�')
      expect(entry.char.length).toBeLessThanOrEqual(4)
      expect(names.has(entry.name)).toBe(false)
      names.add(entry.name)
    }
  })
})

describe('searchEmoji', () => {
  it('matches names and keywords, case-insensitively', () => {
    expect(searchEmoji('FIRE').map(e => e.char)).toContain('🔥')
    expect(searchEmoji('celebrate').map(e => e.char)).toContain('🎉')
    expect(searchEmoji('')).toHaveLength(EMOJI.length)
    expect(searchEmoji('zzzzzz-none')).toHaveLength(0)
  })
})

describe('replaceShortcodes', () => {
  it('replaces complete known codes and nothing else', () => {
    expect(replaceShortcodes('ship it :rocket: :tada:')).toBe(
      'ship it 🚀 🎉',
    )
    expect(replaceShortcodes(':+1: and :-1:')).toBe('👍 and 👎')
    // Unknown code and unterminated code pass through untouched.
    expect(replaceShortcodes(':notacode: and :fire')).toBe(
      ':notacode: and :fire',
    )
    // Times like 12:30:45 must survive (digits alone match no known name).
    expect(replaceShortcodes('at 12:30:45 today')).toBe('at 12:30:45 today')
  })
})
