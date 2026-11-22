/**
 * GLSL for the 3D renderer. One lit program does everything on screen, switched by `uMode`;
 * a second, tiny one writes the sun's depth map for shadows.
 */

/** How a draw call is shaded. */
export const MODE = {
  /** Vertex colour, lit. Cars, carts, kerbs. */
  solid: 0,
  /** Texture times light. The asphalt and the corral sign. */
  textured: 1,
  /** Vertex colour, lit, cut out by the wire-mesh texture's alpha. */
  wire: 2,
  /** Texture as it is, no light. Labels. */
  label: 3,
  /** Vertex colour as it is, with `uAlpha`. The replay path, rings, rain. */
  flat: 4,
  /** Black, with the texture's alpha times `uAlpha`. Soft contact shadows. */
  blob: 5,
} as const;

export const VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNrm;
layout(location = 2) in vec4 aCol;
layout(location = 3) in vec2 aUv;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform mat4 uLightVP;
out vec3 vWorld;
out vec3 vNrm;
out vec4 vCol;
out vec2 vUv;
out vec3 vLight;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vec3 n = normalize(mat3(uModel) * aNrm);
  vWorld = w.xyz;
  vNrm = n;
  vCol = aCol;
  vUv = aUv;
  // Offset along the normal so surfaces don't shadow themselves.
  vec4 l = uLightVP * vec4(w.xyz + n * 0.05, 1.0);
  vLight = l.xyz * 0.5 + 0.5;
  gl_Position = uViewProj * w;
}`;

export const FRAG = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vWorld;
in vec3 vNrm;
in vec4 vCol;
in vec2 vUv;
in vec3 vLight;
uniform int uMode;
uniform sampler2D uTex;
uniform sampler2DShadow uShadow;
uniform vec3 uEye;
uniform vec3 uSun;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uBounceCol;
uniform float uShadowK;
uniform float uShadowTexel;
uniform float uAlpha;
uniform vec2 uView;
out vec4 o;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

float sunlight() {
  if (vLight.x < 0.0 || vLight.x > 1.0 || vLight.y < 0.0 || vLight.y > 1.0 || vLight.z > 1.0) return 1.0;
  float s = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      s += texture(uShadow, vec3(vLight.xy + vec2(float(x), float(y)) * uShadowTexel * 1.4, vLight.z - 0.0012));
    }
  }
  return mix(1.0, s / 9.0, uShadowK);
}

void main() {
  if (uMode == 3) { o = texture(uTex, vUv); o.a *= uAlpha; return; }
  if (uMode == 4) { o = vec4(vCol.rgb, uAlpha); return; }
  if (uMode == 5) { o = vec4(0.0, 0.0, 0.0, texture(uTex, vUv).a * uAlpha); return; }

  vec3 base = toLinear(vCol.rgb);
  float gloss = vCol.a;
  float alpha = 1.0;
  if (uMode == 1) base *= toLinear(texture(uTex, vUv).rgb);
  if (uMode == 2) {
    alpha = min(1.0, texture(uTex, vUv).a * 1.7);
    if (alpha < 0.02) discard;
  }

  vec3 V = normalize(uEye - vWorld);
  vec3 N = normalize(vNrm);
  if (dot(N, V) < 0.0) N = -N;
  float lit = sunlight();
  float ndl = max(dot(N, uSun), 0.0);

  // Sky from above, a little warmth bounced up from the ground.
  vec3 ambient = mix(uBounceCol, uSkyCol, N.z * 0.5 + 0.5);
  vec3 col = base * (ambient + uSunCol * ndl * lit);

  // Shine: the sun's highlight and a strip of sky, stronger at grazing angles.
  vec3 R = reflect(-V, N);
  vec3 H = normalize(uSun + V);
  float spec = pow(max(dot(N, H), 0.0), mix(12.0, 160.0, gloss)) * gloss * lit * ndl;
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 sky = mix(vec3(0.75, 0.8, 0.85), uSkyCol * 1.9, clamp(R.z, 0.0, 1.0));
  if (R.z < 0.0) sky = uBounceCol * 0.5;
  col += uSunCol * spec * 1.4 + sky * gloss * (fres * 0.9 + 0.05 * pow(max(R.z, 0.0), 2.0));

  // Shoulder so white cars in the sun don't clip, then back to sRGB.
  vec3 over = max(col - 0.6, 0.0);
  col = min(col, 0.6) + over / (1.0 + over * 2.5);
  col = pow(col, vec3(1.0 / 2.2));

  // A soft vignette, like a lens.
  vec2 q = gl_FragCoord.xy / uView - 0.5;
  col *= 1.0 - dot(q, q) * 0.55;
  o = vec4(col, alpha);
}`;

export const DEPTH_VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 3) in vec2 aUv;
uniform mat4 uModel;
uniform mat4 uLightVP;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = uLightVP * uModel * vec4(aPos, 1.0);
}`;

export const DEPTH_FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
uniform int uMode;
void main() {
  // Wire panels cast a shadow only where there's wire.
  if (uMode == 2 && texture(uTex, vUv).a < 0.3) discard;
}`;
