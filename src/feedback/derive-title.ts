function normalizeDescription(description: string): string {
  return description.trim().replace(/\s+/g, ' ')
}

export function deriveTitleFromDescription(description: string, maxLength = 100): string {
  const normalized = normalizeDescription(description)
  if (normalized.length <= maxLength) {
    return normalized
  }

  const candidate = normalized.slice(0, maxLength)
  const lastSpace = candidate.lastIndexOf(' ')
  if (lastSpace >= Math.floor(maxLength * 0.6)) {
    return candidate.slice(0, lastSpace).trimEnd()
  }

  return candidate.trimEnd()
}
