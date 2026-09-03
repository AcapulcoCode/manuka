varying vec2 vUv;

uniform sampler2D uFeedback;
uniform float uExposure;
uniform float uHigh;
uniform float uBass;
uniform float uBeat;
uniform float uPreset;
uniform float uFilter;
uniform float uTime;
uniform vec2 uResolution;

vec3 aces(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float filterWeight(float id) {
  return 1.0 - step(0.5, abs(uFilter - id));
}

vec3 sampleFeedback(vec2 uv, vec2 c, float caAmt) {
  vec3 col;
  col.r = texture2D(uFeedback, uv + c * caAmt).r;
  col.g = texture2D(uFeedback, uv).g;
  col.b = texture2D(uFeedback, uv - c * caAmt).b;
  return col;
}

vec3 gatherBloom(vec2 uv, float thresh, float radius) {
  vec3 bloom = vec3(0.0);
  vec2 px = vec2(2.6 / max(uResolution.x, 1.0), 2.6 / max(uResolution.y, 1.0));
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec2 o = vec2(cos(a), sin(a)) * px * radius;
    vec3 s = texture2D(uFeedback, uv + o).rgb;
    bloom += max(s - vec3(thresh), 0.0);
  }
  return bloom * 0.125;
}

void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float storm = step(1.5, uPreset) * step(uPreset, 2.49);
  float lattice = step(0.5, uPreset) * step(uPreset, 1.49);
  float torus = step(2.5, uPreset) * step(uPreset, 3.49);
  float sacred = step(3.5, uPreset);

  float wClean = filterWeight(1.0);
  float wNeon = filterWeight(2.0);
  float wVhs = filterWeight(3.0);
  float wMono = filterWeight(4.0);
  float wCrt = filterWeight(5.0);
  float wFilm = filterWeight(6.0);

  float caAmt = (0.0024 + uHigh * 0.0065 + uBeat * 0.0022)
    * mix(1.0, 0.35, storm)
    * mix(1.0, 0.55, lattice)
    * mix(1.0, 0.75, torus)
    * mix(1.0, 0.65, sacred);
  caAmt *= mix(1.0, 0.08, wClean);
  caAmt *= mix(1.0, 2.4, wNeon);

  vec2 sampleUv = uv;
  sampleUv.x += sin(uv.y * 720.0 + uTime * 8.0) * 0.0028 * wVhs;
  sampleUv.y += sin(uv.x * 540.0 + uTime * 5.5) * 0.0008 * wVhs;

  vec3 col = sampleFeedback(sampleUv, c, caAmt);

  float thresh = mix(0.82, 0.95, storm);
  thresh = mix(thresh, 0.86, lattice);
  thresh -= 0.14 * wNeon;
  thresh += 0.07 * wClean;

  float bloomRadius = 3.0 + uBass * 2.2;
  bloomRadius *= mix(1.0, 0.72, wClean);
  bloomRadius *= mix(1.0, 1.65, wNeon);
  bloomRadius *= mix(1.0, 1.28, wFilm);
  bloomRadius = mix(bloomRadius, 3.2, sacred);

  vec3 bloom = gatherBloom(sampleUv, thresh, bloomRadius);

  float bloomAmt = mix(0.45 + uBass * 0.28, 0.32 + uBass * 0.18, storm);
  bloomAmt *= mix(1.0, 0.18, wClean);
  bloomAmt *= mix(1.0, 2.45, wNeon);
  bloomAmt *= mix(1.0, 1.45, wFilm);
  bloomAmt = mix(bloomAmt, 0.38, sacred);

  col += bloom * bloomAmt;
  col += bloom * lattice * (0.04 + uBass * 0.05) * mix(1.0, 0.15, wClean);

  // Sacred: light god-ray streak from the bright core (screen-space assist).
  if (sacred > 0.5) {
    vec3 shafts = vec3(0.0);
    float clen = length(c) + 1e-4;
    for (int i = 1; i <= 8; i++) {
      float fi = float(i) / 8.0;
      vec2 suv = 0.5 + c * (1.0 - fi * 0.42);
      vec3 s = texture2D(uFeedback, suv).rgb;
      shafts += max(s - vec3(0.48), 0.0) * (1.0 - fi);
    }
    float spoke = pow(0.5 + 0.5 * cos(atan(c.y, c.x) * 8.0 - uTime * 0.07), 3.0);
    col += (shafts * 0.025) * (0.45 + spoke * 0.55) * 0.5;
  }

  col *= uExposure * mix(1.0, 1.05, storm) * mix(1.0, 0.96, lattice) * mix(1.0, 1.02, torus) * mix(1.0, 1.04, sacred);
  col *= mix(1.0, 1.08, wNeon);
  col *= mix(1.0, 0.94, wClean);
  col = aces(col);

  float vig = 1.0 - dot(c, c) * mix(mix(1.18, 1.12, storm), 0.92, lattice);
  vig *= mix(1.0, 1.28, wClean);
  vig *= mix(1.0, 0.88, wNeon);
  col *= clamp(vig, 0.0, 1.0);

  // Clean: crisp contrast punch
  vec3 cleanCol = (col - 0.5) * 1.18 + 0.5;
  col = mix(col, cleanCol, wClean);

  // Neon: saturation boost
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, mix(vec3(lum), col, 1.85), wNeon);

  // VHS: channel bleed, scanlines, noise, tracking band
  vec2 vhsUv = sampleUv;
  vec3 vhsCol;
  vhsCol.r = texture2D(uFeedback, vhsUv + vec2(0.006, 0.001)).r;
  vhsCol.g = texture2D(uFeedback, vhsUv + vec2(0.0, -0.0005)).g;
  vhsCol.b = texture2D(uFeedback, vhsUv - vec2(0.006, 0.001)).b;
  vhsCol = aces(vhsCol * uExposure * 1.04);
  float scanVhs = 0.72 + 0.28 * sin(uv.y * max(uResolution.y, 1.0) * 2.1);
  vhsCol *= scanVhs;
  float tracking = smoothstep(0.02, 0.0, abs(fract(uv.y * 3.0 + uTime * 0.35) - 0.5));
  vhsCol = mix(vhsCol, vhsCol * vec3(1.12, 0.92, 1.08), tracking * 0.45);
  vhsCol += (hash21(uv * uResolution + uTime * 60.0) - 0.5) * 0.11;
  vhsCol *= 0.96 + 0.04 * sin(uTime * 24.0 + uv.y * 40.0);
  col = mix(col, vhsCol, wVhs);

  // Mono: high-contrast grayscale
  float gray = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 monoCol = vec3(pow(clamp(gray * 1.32 - 0.12, 0.0, 1.0), 0.82));
  col = mix(col, monoCol, wMono);

  // CRT: barrel distortion, scanlines, phosphor tint, edge darken
  vec2 crtC = uv - 0.5;
  float crtR2 = dot(crtC, crtC);
  vec2 crtUv = crtC * (1.0 + crtR2 * 0.22) + 0.5;
  vec3 crtCol = texture2D(uFeedback, crtUv).rgb;
  crtCol = aces(crtCol * uExposure);
  float scanCrt = 0.74 + 0.26 * sin(crtUv.y * max(uResolution.y, 1.0) * 3.0);
  crtCol *= scanCrt;
  crtCol = mix(crtCol, crtCol * vec3(0.72, 1.0, 0.78), 0.62);
  crtCol *= 1.0 - crtR2 * 0.55;
  crtCol += (hash21(crtUv * uResolution + uTime * 18.0) - 0.5) * 0.025;
  col = mix(col, crtCol, wCrt);

  // Film: warm shadows, grain, soft halation
  vec3 filmCol = col;
  filmCol = mix(filmCol * vec3(1.12, 0.94, 0.82), filmCol, smoothstep(0.0, 0.62, lum));
  filmCol += bloom * 0.34;
  filmCol += (hash21(uv * uResolution * 2.2 + uTime * 14.0) - 0.5) * 0.075;
  filmCol = mix(filmCol, filmCol * vec3(1.06, 1.0, 0.94), 0.35);
  col = mix(col, filmCol, wFilm);

  col = min(col, vec3(1.0));
  gl_FragColor = vec4(col, 1.0);
}
