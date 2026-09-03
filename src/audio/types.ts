export type AudioSourceKind = 'none' | 'mic' | 'file'

export type AudioBands = {
  bass: number
  mid: number
  high: number
  rms: number
  beat: number
}

export const PRESETS = [
  { id: 0, name: 'Pulse' },
  { id: 1, name: 'Lattice' },
  { id: 2, name: 'Storm' },
  { id: 3, name: 'Torus' },
  { id: 4, name: 'Girih' },
] as const
