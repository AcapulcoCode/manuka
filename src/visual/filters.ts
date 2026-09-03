export const FILTERS = [
  { id: 0, name: 'Standard' },
  { id: 1, name: 'Clean' },
  { id: 2, name: 'Neon' },
  { id: 3, name: 'VHS' },
  { id: 4, name: 'Mono' },
  { id: 5, name: 'CRT' },
  { id: 6, name: 'Film' },
] as const

export type FilterId = (typeof FILTERS)[number]['id']

export const FILTER_COUNT = FILTERS.length

export function clampFilterId(id: number): FilterId {
  const clamped = Math.max(0, Math.min(FILTER_COUNT - 1, Math.round(id)))
  return clamped as FilterId
}
