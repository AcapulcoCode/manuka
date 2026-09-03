varying vec2 vUv;

uniform sampler2D uScene;
uniform sampler2D uPrev;
uniform sampler2D uWaveform;
uniform float uDecay;
uniform float uWarp;
uniform float uBass;
uniform float uMid;
uniform float uRms;
uniform float uBeat;
uniform float uTime;
uniform float uPreset;

void main() {
  vec2 uv = vUv;
  float lattice = step(0.5, uPreset) * step(uPreset, 1.49);
  float torus = step(2.5, uPreset) * step(uPreset, 3.49);
  float sacred = step(3.5, uPreset);
  float wave = lattice > 0.5 || sacred > 0.5
    ? texture2D(uWaveform, vec2(fract(uTime * 0.35), 0.5)).r - 0.5
    : texture2D(uWaveform, vec2(uv.x, 0.5)).r - 0.5;

  float warpAmt = uWarp;
  float decay = clamp(uDecay, 0.0, 0.72);
  float cap = 1.15;
  if (uPreset < 0.5) {
    warpAmt *= 0.85;
    decay = mix(decay, 0.52, 0.4);
  } else if (uPreset < 1.5) {
    warpAmt *= 0.08;
    decay = mix(decay, 0.36, 0.45);
    cap = 0.95;
  } else if (uPreset < 2.5) {
    warpAmt *= 0.28;
    decay = mix(decay, 0.42, 0.4);
    cap = 1.05;
  } else if (uPreset < 3.5) {
    warpAmt *= 0.55;
    decay = mix(decay, 0.48, 0.4);
    cap = 1.08;
  } else {
    warpAmt *= 0.22;
    decay = mix(decay, 0.44, 0.4);
    cap = 1.0;
  }

  vec2 centered = uv - 0.5;
  float ang = (uMid * 0.014 + uBeat * 0.01) * warpAmt;
  if (uPreset >= 0.5 && uPreset < 1.5) {
    ang = (uMid * 0.008 + uBeat * 0.012) * warpAmt + sin(uTime * 0.07) * 0.002;
  } else if (uPreset >= 2.5 && uPreset < 3.5) {
    ang = 0.0;
  } else if (sacred > 0.5) {
    ang = sin(uTime * 0.04) * warpAmt * 0.0015;
  }
  float ca = cos(ang);
  float sa = sin(ang);
  centered = mat2(ca, -sa, sa, ca) * centered;
  uv = centered + 0.5;
  if (lattice > 0.5) {
    uv += vec2(wave, wave * 0.35) * warpAmt * (0.006 + uMid * 0.01);
  } else if (torus > 0.5) {
    uv += vec2(wave, sin(uv.y * 12.0 + uTime) * 0.25) * warpAmt * (0.007 + uMid * 0.012);
  } else if (sacred > 0.5) {
    uv += vec2(wave, wave * 0.35) * warpAmt * 0.002;
  } else {
    uv += vec2(wave, sin(uv.x * 18.0 + uTime) * 0.45) * warpAmt * (0.008 + uMid * 0.014);
  }
  if (sacred > 0.5) {
    uv += vec2(uRms * 0.0003, 0.0);
  } else {
    uv += vec2(uBass * 0.0016, 0.0);
  }
  float zoom = 0.0045;
  if (uPreset < 0.5 || (uPreset >= 2.5 && uPreset < 3.5)) {
    zoom += uBeat * 0.005;
  }
  uv = (uv - 0.5) * (1.0 - zoom) + 0.5;

  vec3 scene = texture2D(uScene, vUv).rgb;
  vec3 prev = texture2D(uPrev, uv).rgb;
  float inBounds = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  prev *= inBounds;

  vec3 col = mix(scene, prev, decay);
  col = min(col, vec3(cap));

  gl_FragColor = vec4(col, 1.0);
}
