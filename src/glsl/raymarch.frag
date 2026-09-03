varying vec2 vUv;

uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uRms;
uniform float uBeat;
uniform float uTime;
uniform vec2 uResolution;
uniform float uPreset;
uniform sampler2D uSpectrum;

#include ./common/sdf.glsl
#include ./common/noise.glsl

#define MAX_STEPS 72
#define MAX_DIST 52.0
#define SURF 0.002

float spectrumAt(float t) {
  return texture2D(uSpectrum, vec2(clamp(t, 0.001, 0.999), 0.5)).r;
}

#define LATTICE_CELL 3.4

mat3 rotX3(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}

mat3 rotY3(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

float mapLatticeCore(vec3 q, float cell, float thick) {
  float d = 1e9;
  vec3 h = vec3(cell * 0.5);

  d = min(d, sdCapsule(q, vec3(-h.x, 0.0, 0.0), vec3(h.x, 0.0, 0.0), thick));
  d = min(d, sdCapsule(q, vec3(0.0, -h.y, 0.0), vec3(0.0, h.y, 0.0), thick));
  d = min(d, sdCapsule(q, vec3(0.0, 0.0, -h.z), vec3(0.0, 0.0, h.z), thick));

  vec3 e = h * 0.96;
  d = min(d, sdCapsule(q, vec3(-e.x, -e.y, 0.0), vec3(e.x, e.y, 0.0), thick * 0.86));
  d = min(d, sdCapsule(q, vec3(-e.x, 0.0, -e.z), vec3(e.x, 0.0, e.z), thick * 0.86));
  d = min(d, sdCapsule(q, vec3(0.0, -e.y, -e.z), vec3(0.0, e.y, e.z), thick * 0.86));

  vec3 c = h * 0.7;
  d = min(d, sdCapsule(q, -c, c, thick * 0.72));
  d = min(d, sdCapsule(q, vec3(-c.x, -c.y, c.z), vec3(c.x, c.y, -c.z), thick * 0.72));

  d = smin(d, length(q) - thick * 2.1, thick * 0.45);
  return d;
}

float mapLattice(vec3 p) {
  float cell = LATTICE_CELL;
  float thick = 0.04 + uBass * 0.013 + uBeat * 0.007 + uRms * 0.004;

  vec3 q1 = mod(p + cell * 0.5, cell) - cell * 0.5;
  float d = mapLatticeCore(q1, cell, thick);

  float cell2 = cell * 2.0;
  vec3 q2 = mod(p + cell2 * 0.5, cell2) - cell2 * 0.5;
  d = smin(d, mapLatticeCore(q2, cell2, thick * 1.32), 0.09);

  float cell3 = cell * 0.5;
  vec3 q3 = mod(p + cell3 * 0.5, cell3) - cell3 * 0.5;
  d = smin(d, mapLatticeCore(q3, cell3, thick * 0.58) * 0.5, 0.05);

  return d * 0.45;
}

void latticeCamera(out vec3 ro, out vec3 uu, out vec3 vv, out vec3 ww) {
  float spd = 0.34 + uBass * 0.26 + uRms * 0.14;
  float t = uTime * spd;

  float yaw = t * 0.62
    + sin(t * 0.41 + uMid * 4.0) * (1.15 + uMid * 1.35)
    + cos(t * 0.27 + uHigh * 3.0) * (0.45 + uHigh * 0.65)
    + uBeat * 0.75;
  float pitch = sin(t * 0.36 + 0.8) * (0.48 + uHigh * 0.52)
    + cos(t * 0.22 + uMid * 2.5) * uMid * 0.32;
  float bank = sin(t * 0.48) * (0.42 + uBass * 0.48)
    + cos(t * 0.61 + uMid * 5.0) * uMid * 0.38
    + uBeat * 0.28;

  ro = vec3(
    sin(t * 0.19) * 6.0 + sin(t * 0.47 + uMid * 5.0) * (2.4 + uMid * 2.2),
    cos(t * 0.23) * 3.8 + sin(t * 0.31 + uHigh * 4.0) * (1.2 + uHigh * 1.4),
    t * 2.8 + cos(t * 0.17) * 5.2 + sin(t * 0.53) * 1.8
  );

  mat3 R = rotY3(yaw) * rotX3(pitch);
  ww = normalize(R * vec3(0.0, 0.0, 1.0));
  vec3 upRef = abs(dot(ww, vec3(0.0, 1.0, 0.0))) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  uu = normalize(cross(upRef, ww));
  uu = uu * cos(bank) + cross(ww, uu) * sin(bank);
  vv = cross(ww, uu);
}

vec3 latticeLocal(vec3 p) {
  float cell = LATTICE_CELL;
  return mod(p + cell * 0.5, cell) - cell * 0.5;
}

float mapPulse(vec3 p) {
  float t = uTime;
  p.xy *= rot2(t * 0.14);
  p = domainWarp(p, t, 0.32 + uMid * 0.95);
  float r = 0.52 + uBass * 0.58 + uBeat * 0.18;
  float d = 1e9;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec3 q = p;
    q.x += sin(t * (0.55 + fi * 0.21) + fi * 1.7) * (1.15 + uBass);
    q.y += cos(t * (0.48 + fi * 0.16) + fi * 2.1) * (0.85 + uMid * 0.55);
    q.z += sin(t * 0.37 + fi * 1.3) * 0.85;
    d = smin(d, sdSphere(q, r * (0.68 + 0.16 * sin(fi + t))), 0.48);
  }
  d = smin(d, sdTorus(p, vec2(1.35 + uBass * 0.45, 0.11 + uHigh * 0.09)), 0.38);
  return d;
}

float mapStorm(vec3 p) {
  float t = uTime;
  p.xy *= rot2(t * 0.08 + uMid * 0.16);
  p.z += t * 0.12;
  p += 0.16 * sin(p.yzx * 0.55 + t * 0.2);
  float g = abs(dot(sin(p * 0.62), cos(p.zxy * 0.62))) - 0.32;
  vec3 r = mod(p + 2.0, 4.0) - 2.0;
  float core = sdOctahedron(r, 0.52 + uBass * 0.16);
  return smin(g * 0.5, core, 0.22);
}

vec3 torusBounce(float fi, float bound) {
  float t = uTime;
  float kick = uBeat * 0.22 + uBass * 0.18;
  return vec3(
    sin(t * (0.72 + fi * 0.11) + fi * 1.9) * bound,
    cos(t * (0.63 + fi * 0.09) + fi * 2.4) * bound,
    sin(t * (0.68 + fi * 0.13) + fi * 3.2) * bound
  ) + vec3(
    sin(t * (2.1 + fi * 0.3) + kick) * kick * 0.35,
    cos(t * (1.8 + fi * 0.25) + kick) * kick * 0.35,
    sin(t * (2.4 + fi * 0.27) + kick) * kick * 0.35
  );
}

float mapToriOnly(vec3 p) {
  float bound = 1.72 + uRms * 0.12;
  float d = 1e9;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    vec3 pos = torusBounce(fi, bound - 0.38 - mod(fi, 3.0) * 0.06);
    vec3 q = p - pos;
    q.xy *= rot2(fi * 0.85 + uTime * (0.18 + mod(fi, 4.0) * 0.04));
    q.yz *= rot2(fi * 1.15 + uTime * (0.14 + mod(fi, 3.0) * 0.05));
    float major = 0.28 + uBass * 0.06 + mod(fi, 5.0) * 0.025;
    float minor = 0.06 + uHigh * 0.025 + mod(fi, 3.0) * 0.008;
    d = min(d, sdTorus(q, vec2(major, minor)));
  }
  return d;
}

float mapTorusCage(vec3 p) {
  float h = 2.12;
  float r = 0.034 + uBeat * 0.005;
  float d = 1e9;
  d = min(d, sdCapsule(p, vec3(-h, -h, -h), vec3(h, -h, -h), r));
  d = min(d, sdCapsule(p, vec3(-h, -h, h), vec3(h, -h, h), r));
  d = min(d, sdCapsule(p, vec3(-h, h, -h), vec3(h, h, -h), r));
  d = min(d, sdCapsule(p, vec3(-h, h, h), vec3(h, h, h), r));
  d = min(d, sdCapsule(p, vec3(-h, -h, -h), vec3(-h, h, -h), r));
  d = min(d, sdCapsule(p, vec3(h, -h, -h), vec3(h, h, -h), r));
  d = min(d, sdCapsule(p, vec3(-h, -h, h), vec3(-h, h, h), r));
  d = min(d, sdCapsule(p, vec3(h, -h, h), vec3(h, h, h), r));
  d = min(d, sdCapsule(p, vec3(-h, -h, -h), vec3(-h, -h, h), r));
  d = min(d, sdCapsule(p, vec3(h, -h, -h), vec3(h, -h, h), r));
  d = min(d, sdCapsule(p, vec3(-h, h, -h), vec3(-h, h, h), r));
  d = min(d, sdCapsule(p, vec3(h, h, -h), vec3(h, h, h), r));
  return d;
}

float mapTorusPreset(vec3 p) {
  float dT = mapToriOnly(p);
  float dC = mapTorusCage(p);
  return min(dT, dC) * 0.5;
}

#define SACRED_PI 3.14159265
#define GIRIH_Z 2.4

vec2 kaleido2(vec2 p, float n) {
  float a = atan(p.y, p.x);
  float r = length(p);
  float wedge = 2.0 * SACRED_PI / n;
  a = mod(a + wedge * 0.5, wedge) - wedge * 0.5;
  return vec2(cos(a), sin(a)) * r;
}

float sdGirihRosette(vec2 p, float thick) {
  float d = 1e9;
  vec2 ap = abs(p);

  // Dense 8-fold girih: frames, stars, and interlocking arcs near the hub.
  d = min(d, abs(max(ap.x, ap.y) - 1.05) - thick);
  d = min(d, abs(ap.x + ap.y - 1.12) - thick);
  d = min(d, abs(ap.x - ap.y) - thick * 0.95);
  d = min(d, abs(ap.x - 0.62) - thick * 0.92);
  d = min(d, abs(ap.y - 0.62) - thick * 0.92);
  d = min(d, abs(length(p) - 0.95) - thick * 0.9);
  d = min(d, abs(length(p) - 0.62) - thick * 0.88);
  d = min(d, abs(length(p) - 0.34) - thick * 0.85);
  d = min(d, abs(length(p) - 0.14) - thick * 0.8);
  d = min(d, abs(length(p - vec2(0.62, 0.0)) - 0.34) - thick * 0.82);
  d = min(d, abs(length(p - vec2(0.34, 0.0)) - 0.34) - thick * 0.8);
  d = min(d, length(p) - thick * 1.35);

  return d;
}

float girihDisc(vec3 q, float thick, float slab) {
  q.xy = kaleido2(q.xy, 8.0);
  float lines = sdGirihRosette(q.xy, thick);
  // Bound to a disc so side copies don't dilute the centered tunnel.
  float disc = length(q.xy) - 1.18;
  lines = max(lines, disc);
  lines = max(lines, abs(q.z) - slab);
  return lines;
}

float girihScroll() {
  return uTime * 0.55;
}

float mapSacred(vec3 p) {
  float scroll = girihScroll();
  // World scrolls toward the camera; camera stays on the tunnel axis.
  p.z += scroll;

  float qz = mod(p.z + GIRIH_Z * 0.5, GIRIH_Z) - GIRIH_Z * 0.5;
  vec3 q = vec3(p.xy, qz);

  float spin = scroll * 0.11 + sin(scroll * 0.15) * (0.05 + uMid * 0.06);
  q.xy *= rot2(spin);

  float thick = 0.028 + uHigh * 0.01 + uRms * 0.006;
  float slab = 0.07 + uBass * 0.012;
  float d = girihDisc(q, thick, slab);

  // Outer tunnel ring keeps the periphery filled while you fly the hub.
  float ring = abs(length(p.xy) - 1.35) - (0.045 + uMid * 0.02);
  d = min(d, ring);

  return d * 0.55;
}

void sacredCamera(out vec3 ro, out vec3 uu, out vec3 vv, out vec3 ww) {
  // Locked to the medallion center; geometry scrolls past along +Z.
  ro = vec3(0.0, 0.0, 0.0);
  ww = vec3(0.0, 0.0, 1.0);
  uu = vec3(1.0, 0.0, 0.0);
  vv = vec3(0.0, 1.0, 0.0);
}

float map(vec3 p) {
  if (uPreset < 0.5) return mapPulse(p);
  if (uPreset < 1.5) return mapLattice(p);
  if (uPreset < 2.5) return mapStorm(p);
  if (uPreset < 3.5) return mapTorusPreset(p);
  return mapSacred(p);
}

vec3 calcNormal(vec3 p) {
  float e = 0.002;
  float d0 = map(p);
  return normalize(vec3(
    map(p + vec3(e, 0.0, 0.0)) - d0,
    map(p + vec3(0.0, e, 0.0)) - d0,
    map(p + vec3(0.0, 0.0, e)) - d0
  ));
}

vec3 palForPreset(float t) {
  if (uPreset < 0.5) {
    return iqPalette(
      t,
      vec3(0.50, 0.42, 0.55),
      vec3(0.50, 0.45, 0.50),
      vec3(1.00, 1.00, 1.00),
      vec3(0.00, 0.33, 0.67) + uHigh * 0.18
    );
  }
  if (uPreset < 1.5) {
    return iqPalette(
      t,
      vec3(0.50, 0.44, 0.52),
      vec3(0.55, 0.42, 0.48),
      vec3(1.00, 0.95, 1.05),
      vec3(0.02 + uBass * 0.28, 0.20 + uMid * 0.32, 0.42 + uHigh * 0.38)
    );
  }
  if (uPreset < 2.5) {
    return iqPalette(
      t,
      vec3(0.50, 0.36, 0.58),
      vec3(0.42, 0.34, 0.40),
      vec3(1.00, 0.85, 0.95),
      vec3(0.06, 0.35, 0.58)
    );
  }
  if (uPreset < 3.5) {
    return iqPalette(
      t,
      vec3(0.50, 0.46, 0.54),
      vec3(0.52, 0.48, 0.50),
      vec3(1.00, 0.98, 1.02),
      vec3(0.12 + uBass * 0.32, 0.28 + uMid * 0.38, 0.55 + uHigh * 0.42)
    );
  }
  return iqPalette(
    t,
    vec3(0.52, 0.46, 0.38),
    vec3(0.48, 0.40, 0.36),
    vec3(1.00, 0.92, 0.78),
    vec3(0.82 + uBass * 0.12, 0.58 + uMid * 0.22, 0.12 + uHigh * 0.18)
  );
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float lattice = step(0.5, uPreset) * step(uPreset, 1.49);
  float storm = step(1.5, uPreset) * step(uPreset, 2.49);
  float torus = step(2.5, uPreset) * step(uPreset, 3.49);
  float sacred = step(3.5, uPreset);
  float spec = lattice > 0.5 || sacred > 0.5
    ? spectrumAt(fract(uTime * 0.11 + uMid * 0.35 + uBeat * 0.15) * 0.82 + 0.09)
    : spectrumAt(abs(uv.x) * 0.55 + 0.08);

  vec3 ro;
  vec3 ta;
  vec3 uu;
  vec3 vv;
  vec3 ww;
  float foc = 1.32;

  if (uPreset < 0.5) {
    float az = uTime * 0.16;
    float rad = 3.15 - uBass * 0.75;
    ro = vec3(sin(az) * rad, 0.35 + sin(uTime * 0.2) * 0.15, cos(az) * rad);
    ta = vec3(0.0, 0.05, 0.0);
    ww = normalize(ta - ro);
    uu = normalize(cross(vec3(0.0, 1.0, 0.0), ww));
    vv = cross(ww, uu);
  } else if (uPreset < 1.5) {
    latticeCamera(ro, uu, vv, ww);
    ta = ro + ww * 4.0;
    foc = 1.05;
  } else if (uPreset < 2.5) {
    ro = vec3(0.3, 0.22, -2.0 + uBass * 0.25);
    ta = vec3(0.0, 0.0, 0.0);
    ww = normalize(ta - ro);
    uu = normalize(cross(vec3(0.0, 1.0, 0.0), ww));
    vv = cross(ww, uu);
  } else if (uPreset < 3.5) {
    ro = vec3(0.0, 0.15, 5.6 - uBass * 0.35);
    ta = vec3(0.0, 0.0, 0.0);
    ww = normalize(ta - ro);
    uu = normalize(cross(vec3(0.0, 1.0, 0.0), ww));
    vv = cross(ww, uu);
    foc = 1.18;
  } else {
    sacredCamera(ro, uu, vv, ww);
    ta = ro + ww * 3.5;
    foc = 1.25;
  }

  vec3 rd = normalize(uv.x * uu + uv.y * vv + foc * ww);
  vec3 audioPal = palForPreset(
    uTime * 0.07 + uBass * 0.4 + uMid * 0.25 + uHigh * 0.55 + spec * 0.35
  );
  if (uPreset < 0.5 || storm > 0.5 || torus > 0.5) {
    rd.xy *= 1.0 - uBeat * 0.035;
  } else if (sacred <= 0.5) {
    rd.xy *= 1.0 - uBeat * 0.025;
  }

  float tMarch = 0.0;
  float glow = 0.0;
  float hit = 0.0;
  vec3 haze = vec3(0.0);
  vec3 p = ro;
  for (int i = 0; i < MAX_STEPS; i++) {
    p = ro + rd * tMarch;
    float d = map(p);
    glow += exp(-abs(d) * 10.0) * (
      lattice > 0.5 ? 0.022 : (torus > 0.5 ? 0.024 : (sacred > 0.5 ? 0.026 : 0.018))
    );
    if (lattice > 0.5) {
      vec3 ql = latticeLocal(p);
      float structGlow = exp(-dot(ql, ql) * 0.06);
      float dust = vnoise(p * 0.35 + vec3(uTime * 0.09, uTime * 0.04, 0.0));
      dust = smoothstep(0.38, 0.84, dust);
      float depth = exp(-tMarch * 0.018);
      haze += audioPal * structGlow * (0.018 + dust * 0.028) * depth;
    } else if (torus > 0.5) {
      float innerGlow = exp(-mapToriOnly(p) * 14.0);
      haze += audioPal * innerGlow * (0.04 + uRms * 0.06) * exp(-tMarch * 0.012);
    } else if (sacred > 0.5) {
      float mandala = exp(-mapSacred(p) * 9.0);
      haze += audioPal * mandala * (0.05 + uMid * 0.06) * exp(-tMarch * 0.012);
    }
    if (d < SURF) {
      hit = 1.0;
      break;
    }
    if (tMarch > MAX_DIST) break;
    tMarch += d;
  }

  vec3 col = vec3(0.012, 0.014, 0.03);
  float bg = fbm(vec3(uv * 2.1, uTime * 0.05));

  if (lattice > 0.5) {
    float neb = fbm(vec3(uv * 2.6 + uTime * 0.03, uTime * 0.07));
    col = audioPal * (0.018 + neb * neb * (0.02 + uMid * 0.025));
    col += haze * (0.28 + uRms * 0.1);
  } else if (torus > 0.5) {
    float cage = exp(-abs(length(p - ro) - 4.5) * 0.35);
    col = audioPal * (0.015 + cage * 0.012);
    col += palForPreset(bg + uMid * 0.2) * bg * 0.04;
  } else if (sacred > 0.5) {
    float kbg = fbm(vec3(kaleido2(uv * 1.8, 8.0), uTime * 0.04));
    col = audioPal * (0.018 + kbg * kbg * (0.028 + uMid * 0.03));
    col += haze * (0.26 + uRms * 0.1);
  } else {
    col += palForPreset(bg + uHigh * 0.28 + spec * 0.22) * (0.05 + uHigh * 0.08) * bg;
  }

  if (hit > 0.5) {
    vec3 n = calcNormal(p);
    vec3 l = normalize(vec3(0.42, 0.82, -0.28));
    float diff = clamp(dot(n, l), 0.0, 1.0);
    float specu = pow(clamp(dot(reflect(-l, n), -rd), 0.0, 1.0), 28.0);
    float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
    float fog = exp(-tMarch * tMarch * 0.011);
    vec3 albedo = palForPreset(tMarch * 0.07 + uTime * 0.05 + n.y * 0.32 + uHigh);
    if (lattice > 0.5) {
      fog = exp(-tMarch * 0.009);
      vec3 ql = latticeLocal(p);
      albedo = palForPreset(
        length(ql) * 0.09 + length(p) * 0.015 + uTime * 0.05 + uBass * 0.45 + uHigh * 0.55 + spec * 0.3
      );
      vec3 lFwd = ww;
      float dFwd = clamp(dot(n, lFwd), 0.0, 1.0);
      float wrap = 0.5 + 0.5 * clamp(dot(n, -rd), 0.0, 1.0);
      float emit = 0.14 + uBass * 0.22 + uBeat * 0.1 + uRms * 0.12 + uMid * 0.08;
      col = albedo * (0.28 + dFwd * 0.32 + wrap * 0.28 + emit)
        + fres * audioPal * (0.22 + uMid * 0.18 + uHigh * 0.14);
      col = mix(col, audioPal * 0.1, 1.0 - fog);
      col *= mix(1.0, 0.84, fog);
    } else if (storm > 0.5) {
      vec3 l2 = normalize(vec3(-0.5, 0.35, 0.7));
      float diff2 = clamp(dot(n, l2), 0.0, 1.0);
      float wrap = 0.5 + 0.5 * clamp(dot(n, -rd), 0.0, 1.0);
      float fill = 0.48 + diff * 0.42 + diff2 * 0.32 + wrap * 0.35;
      col = albedo * fill + fres * albedo * 0.85;
      col *= fog;
    } else if (torus > 0.5) {
      albedo = palForPreset(tMarch * 0.08 + uTime * 0.06 + length(p) * 0.12 + uMid * 0.4 + uHigh * 0.35);
      float onTorus = 1.0 - step(0.003, mapTorusCage(p) - mapToriOnly(p));
      float glass = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 2.5);
      float emit = mix(0.05 + glass * 0.18, 0.28 + uBass * 0.42 + uBeat * 0.22 + uMid * 0.18, onTorus);
      col = albedo * (mix(0.1 + diff * 0.35, 0.2 + diff * 0.65, onTorus) + emit)
        + fres * audioPal * mix(0.2, 0.42 + uHigh * 0.35, onTorus)
        + specu * vec3(1.0, 0.98, 0.95) * mix(0.08, 0.22 + uHigh * 0.28, onTorus);
      col = mix(col, audioPal * 0.05, 1.0 - fog);
      col *= fog;
    } else if (sacred > 0.5) {
      fog = exp(-tMarch * 0.01);
      float scroll = girihScroll();
      vec3 qg = vec3(p.xy, mod(p.z + scroll + GIRIH_Z * 0.5, GIRIH_Z) - GIRIH_Z * 0.5);
      qg.xy *= rot2(scroll * 0.11);
      qg.xy = kaleido2(qg.xy, 8.0);
      albedo = palForPreset(
        length(qg.xy) * 0.2 + uTime * 0.05 + uMid * 0.35 + uHigh * 0.25
      );
      float emit = 0.22 + uBass * 0.3 + uBeat * 0.14 + uMid * 0.18;
      col = albedo * (0.18 + diff * 0.55 + emit)
        + fres * audioPal * (0.36 + uHigh * 0.28)
        + specu * vec3(1.0, 0.94, 0.72) * (0.18 + uHigh * 0.22);
      col = mix(col, audioPal * 0.07, 1.0 - fog);
      col *= mix(1.0, 0.86, fog);
    } else {
      col = albedo * (0.12 + diff * 0.72)
        + specu * vec3(1.0, 0.96, 0.9) * (0.22 + uHigh * 0.28)
        + fres * palForPreset(uTime * 0.1) * (0.22 + uMid * 0.35);
      col *= fog;
      col *= 0.72 + 0.28 * n.y;
    }
  }

  float glowGain = 0.28 + uBass * 0.35;
  if (storm > 0.5) glowGain = 0.22 + uBass * 0.28;
  if (lattice > 0.5) glowGain = 0.18 + uBass * 0.2 + uBeat * 0.1 + uMid * 0.08;
  if (torus > 0.5) glowGain = 0.34 + uBass * 0.38 + uBeat * 0.16 + uMid * 0.12;
  if (sacred > 0.5) glowGain = 0.3 + uBass * 0.34 + uBeat * 0.14 + uMid * 0.18 + uHigh * 0.1;
  col += palForPreset(uTime * 0.08 + length(uv)) * glow * glowGain;
  col += palForPreset(length(uv) + uTime * 0.1) * uRms * 0.03;
  if (lattice > 0.5 && hit < 0.5) {
    col += audioPal * exp(-tMarch * 0.028) * (0.04 + uRms * 0.06 + uMid * 0.04);
  }
  if (torus > 0.5 && hit < 0.5) {
    col += audioPal * glow * (0.14 + uRms * 0.12 + uBass * 0.1);
  }
  if (sacred > 0.5 && hit < 0.5) {
    col += audioPal * glow * (0.12 + uRms * 0.14 + uMid * 0.08);
  }
  col = min(col, vec3(storm > 0.5 ? 1.15 : (torus > 0.5 ? 1.08 : (sacred > 0.5 ? 1.05 : mix(1.35, 0.92, lattice)))));

  gl_FragColor = vec4(col, 1.0);
}
