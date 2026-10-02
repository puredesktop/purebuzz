/** Format a byte count compactly enough for an attachment preview. */
export function formatFileSize(bytes: number | undefined): string | null {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return null
  if (bytes < 1024) return `${Math.round(bytes)} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  const rounded = value >= 10 ? Math.round(value) : Number(value.toFixed(1))
  return `${rounded} ${units[unit]}`
}
