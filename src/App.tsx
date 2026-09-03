import { useEffect, useRef, useState } from 'react'
import { Overlay } from './ui/Overlay.tsx'
import { DebugGui } from './ui/DebugGui.ts'
import { Pipeline } from './webgl/Pipeline.ts'
import type { AudioSourceKind } from './audio/types.ts'

type HudState = {
  source: AudioSourceKind
  playing: boolean
  preset: number
  filter: number
  fileName: string | null
  error: string | null
}

const INITIAL_HUD: HudState = {
  source: 'none',
  playing: false,
  preset: 0,
  filter: 0,
  fileName: null,
  error: null,
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pipelineRef = useRef<Pipeline | null>(null)
  const [hud, setHud] = useState<HudState>(INITIAL_HUD)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const pipeline = new Pipeline(canvas)
    pipelineRef.current = pipeline
    pipeline.start()
    const gui = new DebugGui(pipeline)
    return () => {
      gui.dispose()
      pipeline.dispose()
      pipelineRef.current = null
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} className="viz" />
      <Overlay
        source={hud.source}
        playing={hud.playing}
        preset={hud.preset}
        filter={hud.filter}
        fileName={hud.fileName}
        error={hud.error}
        onMic={() => {
          void pipelineRef.current
            ?.startMic()
            .then(() => {
              setHud((h) => ({
                ...h,
                source: 'mic',
                playing: true,
                fileName: null,
                error: null,
              }))
            })
            .catch(() => {
              setHud((h) => ({
                ...h,
                error: 'Microphone permission denied',
              }))
            })
        }}
        onPrepareFile={() => {
          void pipelineRef.current?.unlockAudio()
        }}
        onFile={(file) => {
          void pipelineRef.current
            ?.loadFile(file)
            .then(() => {
              const playing = pipelineRef.current?.playing ?? false
              setHud((h) => ({
                ...h,
                source: 'file',
                playing,
                fileName: file.name,
                error: playing ? null : 'Loaded — press Play to start',
              }))
            })
            .catch((err: unknown) => {
              const message =
                err instanceof Error && err.message
                  ? err.message
                  : 'Could not play that file'
              setHud((h) => ({
                ...h,
                error: message,
              }))
            })
        }}
        onPause={() => {
          void pipelineRef.current
            ?.togglePause()
            .then(() => {
              const playing = pipelineRef.current?.playing ?? false
              setHud((h) => ({ ...h, playing, error: null }))
            })
            .catch(() => {
              setHud((h) => ({
                ...h,
                error: 'Playback was blocked — click Play again',
              }))
            })
        }}
        onPreset={(id) => {
          pipelineRef.current?.setPreset(id)
          setHud((h) => ({ ...h, preset: id }))
        }}
        onFilter={(id) => {
          pipelineRef.current?.setFilter(id)
          setHud((h) => ({ ...h, filter: id }))
        }}
      />
    </>
  )
}
