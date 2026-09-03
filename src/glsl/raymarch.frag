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
#define GIRIH_PUPIL_Z 11.0
#define GIRIH_PUPIL_R 0.11

vec2 kaleido2(vec2 p, float n) {
  float a = atan(p.y, p.x);
  float r = length(p);
  float wedge = 2.0 * SACRED_PI / n;
  a = mod(a + wedge * 0.5, wedge) - wedge * 0.5;
  return vec2(cos(a), sin(a)) * r;
}

float girihScroll() {
  return uTime * 0.28;
}

// Slow rigid turn of the whole girih assembly around the view axis.
float girihWorldRot() {
  return uTime * 0.07;
}

// Circular frame; sphere body is added in 3D in girihDisc.
float sdGirihSphereBadge(vec2 p, float s, float thick) {
  p /= s;
  float t = max(thick / s * 1.35, 0.02);
  return (abs(length(p) - 0.58) - t * 0.95) * s;
}

// Inward light wave: front travels from outer rim -> center, then repeats.
float girihInwardPulse(float rad) {
  float outer = 1.1;
  float period = 5.5;
  float phase = fract(uTime / period);
  float front = mix(outer, -0.05, phase);
  float band = exp(-pow((rad - front) * 10.0, 2.0)) * 0.45;
  float wash = smoothstep(front + 0.2, front - 0.02, rad) * exp(-phase * 1.8) * 0.12;
  float core = exp(-rad * rad * 14.0) * smoothstep(0.55, 1.0, phase) * 0.2;
  return band + wash + core;
}

float sdGirihRosette(vec2 p, float thick) {
  float d = 1e9;
  // Larger medallion — reaches toward the aura with open negative space.
  const float fit = 1.15;
  p /= fit;
  float r = length(p);
  vec2 ap = abs(p);
  // Polygonal frames from abs() are exact enough and seam-free (no angular fold).
  float oct = max(ap.x, ap.y);
  float dia = (ap.x + ap.y) * 0.70710678;
  float star = max(oct, dia);
  float t = thick * 0.8 / fit;

  // Outer khatam frame (octagon + diamond).
  d = min(d, abs(oct - 1.02) - t);
  d = min(d, abs(dia - 1.02) - t);

  // One inner 8-pointed star — kept inward of the badge ring.
  d = min(d, abs(star - 0.42) - t * 0.92);

  // Square chord straps — inward, clear of badge seats.
  float chordX = abs(ap.x - 0.4) - t * 0.85;
  chordX = max(chordX, ap.y - 0.4);
  float chordY = abs(ap.y - 0.4) - t * 0.85;
  chordY = max(chordY, ap.x - 0.4);
  d = min(d, min(chordX, chordY));

  // Construction rings.
  d = min(d, abs(r - 0.88) - t * 0.9);
  d = min(d, abs(r - 0.34) - t * 0.85);

  // Inner rim around the flight aperture.
  d = min(d, abs(r - 0.2) - t * 0.85);

  // Radials — stop before badge sockets.
  for (int i = 0; i < 8; i++) {
    float a = float(i) * (SACRED_PI * 0.25);
    vec2 q = p * rot2(-a);
    float strap = abs(q.y) - t * 0.85;
    strap = max(strap, 0.18 - q.x);
    strap = max(strap, q.x - 0.48);
    d = min(d, strap);
  }

  // Ring of circular frames with spheres inside.
  {
    float ringR = 0.7;
    float badgeS = 0.28;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * (SACRED_PI * 0.25);
      vec2 c = vec2(cos(a), sin(a)) * ringR;
      float socket = length(p - c) - badgeS * 0.72;
      d = max(d, -socket);
      vec2 loc = p - c;
      d = min(d, sdGirihSphereBadge(loc, badgeS, t));
    }
  }

  // Finished outer border — perfect circle only.
  d = min(d, abs(r - 1.08) - t * 1.15);

  // Soft containment — keep the rim crisp.
  d = smax(d, r - 1.12, 0.02);

  float aperture = 0.18 / fit;
  d = max(d, aperture - r);

  return d * fit;
}

float girihDisc(vec3 q, float thick, float slab) {
  // Rosette already encodes 8-fold symmetry — do not kaleido-fold (causes seams).
  float lines = sdGirihRosette(q.xy, thick);
  float disc = length(q.xy) - 1.42;
  lines = smax(lines, disc, 0.025);
  lines = max(lines, abs(q.z) - slab);

  // True spheres seated in the circular frames (3D).
  {
    const float fit = 1.15;
    float ringR = 0.7 * fit;
    float sphR = 0.28 * fit * 0.34;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * (SACRED_PI * 0.25);
      vec3 c = vec3(cos(a) * ringR, sin(a) * ringR, 0.0);
      lines = min(lines, length(q - c) - sphR);
    }
  }
  return lines;
}

// Dense small mandala — the fixed "pupil" at infinity (camera space).
float sdGirihPupilMandala(vec2 p, float thick) {
  float d = 1e9;
  float r = length(p);
  vec2 ap = abs(p);
  float oct = max(ap.x, ap.y);
  float dia = (ap.x + ap.y) * 0.70710678;
  float star = max(oct, dia);
  float t = thick;

  d = min(d, abs(r - 1.0) - t * 1.15);
  d = min(d, abs(r - 0.78) - t * 0.95);
  d = min(d, abs(r - 0.55) - t * 0.9);
  d = min(d, abs(r - 0.34) - t * 0.85);
  d = min(d, abs(r - 0.18) - t * 0.8);
  d = min(d, abs(star - 0.88) - t * 0.95);
  d = min(d, abs(star - 0.58) - t * 0.88);
  d = min(d, abs(oct - 0.92) - t * 0.88);
  d = min(d, abs(dia - 0.92) - t * 0.88);

  for (int i = 0; i < 8; i++) {
    float a = float(i) * (SACRED_PI * 0.25);
    vec2 q = p * rot2(-a);
    float strap = abs(q.y) - t * 0.72;
    strap = max(strap, 0.1 - q.x);
    strap = max(strap, q.x - 0.98);
    d = min(d, strap);
  }

  // Solid core — the pupil iris center.
  d = min(d, r - 0.09);
  d = smax(d, r - 1.04, 0.018);
  return d;
}

// Locked to the camera: fixed depth, never scrolls closer or grows.
float girihPupil(vec3 p) {
  float scale = GIRIH_PUPIL_R;
  float thick = 0.016;
  // Rotation comes from girihWorldRot() applied in mapSacred.
  vec2 q = p.xy;
  float lines = sdGirihPupilMandala(q / scale, thick / scale) * scale;
  float disc = length(q) - scale;
  lines = smax(lines, disc, 0.012);
  lines = max(lines, abs(p.z - GIRIH_PUPIL_Z) - 0.03);
  return lines;
}

// One 8-fold sector per Z cell so the next medallion continues the motif
// instead of reprinting the same stamp (the usual "reset" read).
float girihSpin(float zWorld) {
  float scroll = girihScroll();
  // Continuous twist only — no per-cell snaps or sin ease.
  return scroll * 0.12;
}

// Volumetric shafts through the tunnel aperture (8-fold girih alignment).
float girihGodRays(vec3 ro, vec3 rd, float maxT) {
  float scroll = girihScroll();
  float spin = girihSpin(ro.z + scroll) + girihWorldRot();
  float rays = 0.0;
  float lim = min(max(maxT, 4.0), 16.0);
  for (int i = 0; i < 16; i++) {
    float fi = (float(i) + 0.5) / 16.0;
    float t = fi * lim;
    vec3 sp = ro + rd * t;
    float rad = length(sp.xy);
    float core = exp(-rad * rad * 7.5);
    float ang = atan(sp.y, sp.x) - spin * 0.65;
    float spokes = pow(0.5 + 0.5 * cos(ang * 8.0), 4.0);
    float dust = 0.65 + 0.35 * sin(sp.z * 2.2 + scroll * 2.8 + ang * 3.0);
    float depth = exp(-t * 0.055);
    rays += core * mix(0.2, 1.0, spokes) * dust * depth;
  }
  return rays * 0.035;
}

float mapSacred(vec3 p) {
  // Entire structure turns slowly as one piece.
  p.xy *= rot2(-girihWorldRot());

  // Pupil stays in camera space — fixed size/distance forever.
  float dPupil = girihPupil(p);

  float scroll = girihScroll();
  // World scrolls toward the camera; camera stays on the tunnel axis.
  p.z += scroll;

  float zWorld = p.z;
  float qz = mod(zWorld + GIRIH_Z * 0.5, GIRIH_Z) - GIRIH_Z * 0.5;
  vec3 q = vec3(p.xy, qz);
  q.xy *= rot2(girihSpin(zWorld));

  float thick = 0.02;
  float slab = 0.065;
  float d = girihDisc(q, thick, slab);

  return min(d * 0.62, dPupil * 0.62);
}

// Soft far-field girih shell — glow only, not a hard surface.
float girihAura(vec3 p) {
  p.xy *= rot2(-girihWorldRot());
  float scroll = girihScroll();
  p.z += scroll;
  vec2 w = p.xy * rot2(-scroll * 0.1);
  float rad = length(w);
  vec2 aw = abs(w);
  float oct = max(aw.x, aw.y);
  float dia = (aw.x + aw.y) * 0.70710678;

  float shell = abs(rad - 1.95) - 0.12;
  float outer = abs(oct - 1.72) - 0.05;
  float diamond = abs(dia - 1.72) - 0.045;
  float star = abs(max(oct, dia) - 1.55) - 0.04;
  star = max(star, abs(rad - 1.95) - 0.28);

  float straps = 1e9;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * (SACRED_PI * 0.25);
    vec2 q = w * rot2(-a);
    float rib = abs(q.y) - 0.035;
    rib = max(rib, abs(rad - 1.95) - 0.22);
    straps = min(straps, rib);
  }

  return min(shell, min(outer, min(diamond, min(star, straps))));
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

vec3 clampSacredHue(vec3 c) {
  // Keep hue, soft-limit luminance so the medallion never flashes chalk-white.
  float lum = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  c *= min(lum, 0.58) / lum;
  float peak = max(c.r, max(c.g, c.b));
  if (peak > 0.72) c *= 0.72 / peak;
  return max(c, vec3(0.0));
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
  // Warm girih hues with narrower amplitude — peaks stay amber, not white.
  return clampSacredHue(iqPalette(
    t,
    vec3(0.42, 0.34, 0.28),
    vec3(0.28, 0.24, 0.20),
    vec3(1.00, 0.90, 0.72),
    vec3(0.78 + uBass * 0.1, 0.52 + uMid * 0.18, 0.14 + uHigh * 0.14)
  ));
}

// Soft fluid color wash expanding from center — background only, music-tinted.
vec3 girihFluidWave(vec2 uv) {
  float r = length(uv);
  float ang = atan(uv.y, uv.x);
  float music = uBass * 0.3 + uMid * 0.45 + uHigh * 0.35 + uBeat * 0.12;
  float t = uTime * (0.2 + uMid * 0.06) + music * 0.2;

  // Past mid-edges (~1.0) and into corners (~1.4+) so rings leave the frame.
  float reach = 1.55;

  // Gentle fluid distortion so rings feel liquid, not geometric.
  float warp = vnoise(vec3(uv * 1.5, t * 0.3)) * (0.1 + uMid * 0.04)
    + vnoise(vec3(uv * 2.8 + vec2(ang * 0.12, 0.0), t * 0.45 + uHigh * 0.35)) * 0.05;
  float rr = r + warp;

  float wave = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float phase = fract(t * (0.17 + fi * 0.035) + fi * 0.24 + uBass * 0.05);
    float front = phase * reach;
    float band = exp(-pow((rr - front) * 3.4, 2.0));
    float trail = smoothstep(front + 0.08, front - 0.55, rr)
      * (1.0 - phase) * 0.28;
    wave += (band + trail) * (0.55 - fi * 0.08);
  }

  float wash = exp(-rr * 0.7) * (0.18 + 0.06 * sin(t * 0.65 + music));
  float swirl = 0.5 + 0.5 * sin(ang * 3.0 + t * 0.35 + rr * 1.6 + uHigh * 1.1);
  float field = wave * 0.55 + wash * 0.22 + swirl * wash * 0.12;

  // Music drives hue; keep it a whisper over black.
  float hueT = t * 0.12 + music * 0.55 + rr * 0.28 + ang * 0.05 + uHigh * 0.2;
  vec3 tint = clampSacredHue(palForPreset(hueT));
  float opacity = clamp(field * 0.16, 0.0, 0.18);
  vec3 deep = vec3(0.008, 0.009, 0.016);
  return mix(deep, tint, opacity);
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
      lattice > 0.5 ? 0.022 : (torus > 0.5 ? 0.024 : (sacred > 0.5 ? 0.014 : 0.018))
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
      float mandala = exp(-mapSacred(p) * 14.0);
      float auraDist = girihAura(p);
      float aura = exp(-abs(auraDist) * 5.5) * (0.4 + 0.35 * exp(-max(auraDist, 0.0) * 3.0));
      float veil = smoothstep(1.25, 1.8, length(p.xy)) * smoothstep(2.4, 1.9, length(p.xy));
      float depth = exp(-tMarch * 0.012);
      // Audio shifts hue via audioPal only — intensities stay fixed.
      haze += audioPal * mandala * 0.03 * depth;
      haze += audioPal * aura * 0.05 * depth;
      haze += audioPal * veil * 0.01 * depth;
      haze += audioPal * girihInwardPulse(length(p.xy)) * 0.04 * depth;
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
  vec3 bgWave = vec3(0.0);

  if (lattice > 0.5) {
    float neb = fbm(vec3(uv * 2.6 + uTime * 0.03, uTime * 0.07));
    col = audioPal * (0.018 + neb * neb * (0.02 + uMid * 0.025));
    col += haze * (0.28 + uRms * 0.1);
  } else if (torus > 0.5) {
    float cage = exp(-abs(length(p - ro) - 4.5) * 0.35);
    col = audioPal * (0.015 + cage * 0.012);
    col += palForPreset(bg + uMid * 0.2) * bg * 0.04;
  } else if (sacred > 0.5) {
    bgWave = girihFluidWave(uv);
    float kbg = fbm(vec3(kaleido2(uv * 1.8, 8.0), uTime * 0.04));
    col = bgWave;
    col += audioPal * kbg * kbg * 0.006;
    col += haze * 0.1;
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
      float zWorld = p.z + scroll;
      vec2 qg = p.xy * rot2(girihSpin(zWorld));
      float rad = length(qg);
      float pulse = girihInwardPulse(rad);
      float pupilHit = smoothstep(0.08, 0.0, abs(p.z - GIRIH_PUPIL_Z))
        * smoothstep(GIRIH_PUPIL_R * 1.15, 0.0, length(p.xy));
      // Color reacts to audio; lighting levels do not.
      albedo = palForPreset(
        rad * 0.2 + uTime * 0.05 + uMid * 0.35 + uHigh * 0.25 + pulse * 0.12
          + pupilHit * 0.4
      );
      float emit = 0.26 + pulse * 0.14 + pupilHit * 0.32;
      vec3 surf = albedo * (0.16 + diff * 0.48 + emit)
        + fres * audioPal * (0.28 + pulse * 0.1 + pupilHit * 0.16)
        + specu * vec3(0.92, 0.72, 0.42) * 0.1;
      surf += audioPal * pulse * 0.1;
      surf += audioPal * pupilHit * 0.12;
      surf = clampSacredHue(surf);
      // Wave + haze stay behind the medallion; fog only reveals them in the distance.
      col = mix(col, surf, fog);
      col *= mix(1.0, 0.92, fog);
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
  if (sacred > 0.5) glowGain = 0.2;
  col += palForPreset(uTime * 0.08 + length(uv)) * glow * glowGain;
  if (sacred <= 0.5) {
    col += palForPreset(length(uv) + uTime * 0.1) * uRms * 0.03;
  }
  if (lattice > 0.5 && hit < 0.5) {
    col += audioPal * exp(-tMarch * 0.028) * (0.04 + uRms * 0.06 + uMid * 0.04);
  }
  if (torus > 0.5 && hit < 0.5) {
    col += audioPal * glow * (0.14 + uRms * 0.12 + uBass * 0.1);
  }
  if (sacred > 0.5) {
    float rayLen = hit > 0.5 ? tMarch : 14.0;
    float rays = girihGodRays(ro, rd, rayLen);
    float aperture = exp(-dot(uv, uv) * 3.2);
    col += audioPal * rays * 0.28;
    col += audioPal * rays * aperture * 0.1;
    // Screen-space inward pulse toward center.
    float uvPulse = girihInwardPulse(length(uv) * 2.2);
    col += audioPal * uvPulse * 0.08;
    col += audioPal * aperture * uvPulse * 0.1;
    // Soft screen-space pupil glow — tight so a dark ring remains around it.
    float pupilGlow = exp(-dot(uv, uv) * 110.0);
    col += audioPal * pupilGlow * 0.07;
    if (hit < 0.5) {
      col += audioPal * glow * 0.05;
    }
    col = clampSacredHue(col);
  }
  col = min(col, vec3(storm > 0.5 ? 1.15 : (torus > 0.5 ? 1.08 : (sacred > 0.5 ? 0.85 : mix(1.35, 0.92, lattice)))));

  gl_FragColor = vec4(col, 1.0);
}
