/**
 * The little bit of linear algebra the 3D renderer needs. Matrices are 4x4, column-major
 * (`m[col * 4 + row]`), as WebGL wants them. Pure: no DOM, no GL.
 */

export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];

export function mat4(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** out = a * b (apply b first). `out` may not alias a or b. */
export function mul(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r]! * b[c * 4]! +
        a[4 + r]! * b[c * 4 + 1]! +
        a[8 + r]! * b[c * 4 + 2]! +
        a[12 + r]! * b[c * 4 + 3]!;
    }
  }
  return out;
}

/** A perspective projection looking down -z in view space. */
export function perspective(
  out: Mat4,
  fovY: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function ortho(
  out: Mat4,
  l: number,
  r: number,
  b: number,
  t: number,
  n: number,
  f: number,
): Mat4 {
  out.fill(0);
  out[0] = 2 / (r - l);
  out[5] = 2 / (t - b);
  out[10] = -2 / (f - n);
  out[12] = -(r + l) / (r - l);
  out[13] = -(t + b) / (t - b);
  out[14] = -(f + n) / (f - n);
  out[15] = 1;
  return out;
}

/**
 * World to view, from an eye and an orthonormal basis: `right` is screen right, `up` is screen
 * up, `fwd` is where the camera looks. The lot's axes are x right, y down the screen, z up
 * (left-handed), so this matrix mirrors; nothing here depends on winding.
 */
export function viewFromBasis(out: Mat4, eye: Vec3, right: Vec3, up: Vec3, fwd: Vec3): Mat4 {
  out[0] = right[0];
  out[4] = right[1];
  out[8] = right[2];
  out[12] = -(right[0] * eye[0] + right[1] * eye[1] + right[2] * eye[2]);
  out[1] = up[0];
  out[5] = up[1];
  out[9] = up[2];
  out[13] = -(up[0] * eye[0] + up[1] * eye[1] + up[2] * eye[2]);
  out[2] = -fwd[0];
  out[6] = -fwd[1];
  out[10] = -fwd[2];
  out[14] = fwd[0] * eye[0] + fwd[1] * eye[1] + fwd[2] * eye[2];
  out[3] = 0;
  out[7] = 0;
  out[11] = 0;
  out[15] = 1;
  return out;
}

/** Model matrix for something standing on the lot: heading `a` about z, then moved to x, y, z. */
export function modelZ(out: Mat4, x: number, y: number, z: number, a: number, scale = 1): Mat4 {
  const c = Math.cos(a) * scale;
  const s = Math.sin(a) * scale;
  out.fill(0);
  out[0] = c;
  out[1] = s;
  out[4] = -s;
  out[5] = c;
  out[10] = scale;
  out[12] = x;
  out[13] = y;
  out[14] = z;
  out[15] = 1;
  return out;
}

/** Transforms a point; writes x, y, z, w into `out`. */
export function transformPoint(
  m: Mat4,
  x: number,
  y: number,
  z: number,
  out: Float32Array | number[],
): void {
  out[0] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
  out[1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
  out[2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
  out[3] = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function normalize(v: Vec3): Vec3 {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
