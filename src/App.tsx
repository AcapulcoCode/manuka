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
        onFile={(file) => {
          void pipelineRef.current
            ?.loadFile(file)
            .then(() => {
              setHud((h) => ({
                ...h,
                source: 'file',
                playing: true,
                fileName: file.name,
                error: null,
              }))
            })
            .catch(() => {
              setHud((h) => ({
                ...h,
                error: 'Could not play that file',
              }))
            })
        }}
        onPause={() => {
          void pipelineRef.current?.togglePause().then(() => {
            const playing = pipelineRef.current?.playing ?? false
            setHud((h) => ({ ...h, playing }))
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
