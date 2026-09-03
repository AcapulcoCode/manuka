import { useRef } from 'react'
import { PRESETS, type AudioSourceKind } from '../audio/types.ts'
import { FILTERS } from '../visual/filters.ts'

export type OverlayProps = {
  source: AudioSourceKind
  playing: boolean
  preset: number
  filter: number
  fileName: string | null
  error: string | null
  onMic: () => void
  onFile: (file: File) => void
  onPause: () => void
  onPreset: (id: number) => void
  onFilter: (id: number) => void
}

export function Overlay({
  source,
  playing,
  preset,
  filter,
  fileName,
  error,
  onMic,
  onFile,
  onPause,
  onPreset,
  onFilter,
}: OverlayProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="overlay">
      <div className="overlay-top">
        <div className="brand">
          <h1 className="brand-title">Manuka</h1>
          <p className="brand-sub">Audio-reactive raymarcher</p>
        </div>
        {error ? <div className="overlay-error">{error}</div> : null}
      </div>

      <div className="overlay-bottom">
        <div className="hud-cluster">
          <button
            type="button"
            className="hud-btn"
            aria-pressed={source === 'mic'}
            onClick={onMic}
          >
            Mic
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => fileRef.current?.click()}
          >
            Load file
          </button>
          <button
            type="button"
            className="hud-btn"
            disabled={source === 'none'}
            aria-pressed={!playing && source !== 'none'}
            onClick={onPause}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <input
            ref={fileRef}
            className="hud-file"
            type="file"
            accept="audio/*"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFile(file)
              e.target.value = ''
            }}
          />
        </div>
        <div className="hud-cluster">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="hud-pill"
              aria-pressed={preset === p.id}
              onClick={() => onPreset(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="hud-cluster hud-cluster--filters">
          <span className="hud-label">Look</span>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="hud-pill hud-pill--filter"
              aria-pressed={filter === f.id}
              onClick={() => onFilter(f.id)}
            >
              {f.name}
            </button>
          ))}
        </div>
        <div className="file-hint">
          {source === 'file' && fileName
            ? fileName
            : source === 'mic'
              ? 'Live microphone'
              : 'Idle — connect mic or a track'}
        </div>
      </div>
    </div>
  )
}
