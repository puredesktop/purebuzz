import { formatFileSize } from './attachmentMetadata'

describe('attachment metadata', () => {
  it('formats byte counts using readable units', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(1024 * 1024 * 2)).toBe('2 MB')
  })

  it('returns no size label for unavailable or invalid data', () => {
    expect(formatFileSize(undefined)).toBeNull()
    expect(formatFileSize(Number.NaN)).toBeNull()
    expect(formatFileSize(-1)).toBeNull()
  })
})
