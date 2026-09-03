import type { Texture, Vector2 } from 'three'
import { Vector2 as Vec2 } from 'three'

export type UniformValue<T> = { value: T }

export type VisualizerUniforms = {
  uBass: UniformValue<number>
  uMid: UniformValue<number>
  uHigh: UniformValue<number>
  uRms: UniformValue<number>
  uBeat: UniformValue<number>
  uTime: UniformValue<number>
  uResolution: UniformValue<Vector2>
  uPreset: UniformValue<number>
  uSpectrum: UniformValue<Texture>
  uWaveform: UniformValue<Texture>
  uDecay: UniformValue<number>
  uWarp: UniformValue<number>
  uExposure: UniformValue<number>
  uFilter: UniformValue<number>
  uScene: UniformValue<Texture | null>
  uPrev: UniformValue<Texture | null>
  uFeedback: UniformValue<Texture | null>
}

export function createUniforms(
  spectrum: Texture,
  waveform: Texture,
): VisualizerUniforms {
  return {
    uBass: { value: 0 },
    uMid: { value: 0 },
    uHigh: { value: 0 },
    uRms: { value: 0 },
    uBeat: { value: 0 },
    uTime: { value: 0 },
    uResolution: { value: new Vec2(1, 1) },
    uPreset: { value: 0 },
    uSpectrum: { value: spectrum },
    uWaveform: { value: waveform },
    uDecay: { value: 0.55 },
    uWarp: { value: 0.85 },
    uExposure: { value: 0.92 },
    uFilter: { value: 0 },
    uScene: { value: null },
    uPrev: { value: null },
    uFeedback: { value: null },
  }
}

export const PRESET_LOOK = [
  { decay: 0.55, warp: 0.85 },
  { decay: 0.38, warp: 0.12 },
  { decay: 0.44, warp: 0.45 },
  { decay: 0.5, warp: 0.62 },
  { decay: 0.3, warp: 0.1 },
] as const
