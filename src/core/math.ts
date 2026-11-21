/**
 * Deterministic math. `+ - * /` and `Math.sqrt` are exactly rounded by IEEE 754 in every engine,
 * but `Math.sin`, `Math.cos` and `Math.atan2` are not specified to the last bit and do differ
 * between V8, SpiderMonkey and JavaScriptCore. A replay recorded in one browser must play the same
 * in another, so the simulation uses these instead: range reduction plus polynomials, built only
 * from exactly rounded operations. Accuracy is about 1e-15, far below anything the game can feel.
 */

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

// Cody–Waite split of pi/2 for range reduction.
const PIO2_HI = 1.5707963267341256;
const PIO2_LO = 6.077100506506192e-11;

// Taylor coefficients (accurate on |r| <= pi/4 to ~1e-16).
function sinPoly(r: number): number {
  const z = r * r;
  return (
    r +
    r *
      z *
      (-1.6666666666666666e-1 +
        z *
          (8.333333333333333e-3 +
            z *
              (-1.984126984126984e-4 +
                z *
                  (2.7557319223985893e-6 +
                    z *
                      (-2.505210838544172e-8 +
                        z * (1.6059043836821613e-10 + z * -7.647163731819816e-13))))))
  );
}

function cosPoly(r: number): number {
  const z = r * r;
  return (
    1 +
    z *
      (-0.5 +
        z *
          (4.1666666666666664e-2 +
            z *
              (-1.388888888888889e-3 +
                z *
                  (2.48015873015873e-5 +
                    z *
                      (-2.755731922398589e-7 +
                        z * (2.08767569878681e-9 + z * -1.1470745597729725e-11))))))
  );
}

function reduce(x: number): [number, number] {
  const k = Math.round(x / HALF_PI);
  const r = x - k * PIO2_HI - k * PIO2_LO;
  return [r, ((k % 4) + 4) % 4];
}

export function sin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const [r, q] = reduce(x);
  switch (q) {
    case 0:
      return sinPoly(r);
    case 1:
      return cosPoly(r);
    case 2:
      return -sinPoly(r);
    default:
      return -cosPoly(r);
  }
}

export function cos(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const [r, q] = reduce(x);
  switch (q) {
    case 0:
      return cosPoly(r);
    case 1:
      return -sinPoly(r);
    case 2:
      return -cosPoly(r);
    default:
      return sinPoly(r);
  }
}

const TAN_PI_12 = 0.2679491924311227; // tan(15°)
const SQRT3 = 1.7320508075688772;
const PI_6 = 0.5235987755982988;

/** atan on [0, tan(15°)] by its series; 13 terms reach ~1e-16. */
function atanSmall(x: number): number {
  const z = x * x;
  let sum = 0;
  for (let n = 25; n >= 3; n -= 2) sum = (sum + (((n - 1) / 2) % 2 === 1 ? -1 : 1) / n) * z;
  return x + x * sum;
}

export function atan(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const negative = x < 0;
  let a = negative ? -x : x;
  let offset = 0;
  let invert = false;
  if (a > 1) {
    a = 1 / a;
    invert = true;
  }
  if (a > TAN_PI_12) {
    a = (a * SQRT3 - 1) / (a + SQRT3);
    offset = PI_6;
  }
  let r = offset + atanSmall(a);
  if (invert) r = HALF_PI - r;
  return negative ? -r : r;
}

export function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (x === 0) {
    if (y === 0) return 0;
    return y > 0 ? HALF_PI : -HALF_PI;
  }
  const a = atan(y / x);
  if (x > 0) return a;
  return y >= 0 ? a + PI : a - PI;
}

/** Angle into (-pi, pi]. */
export function wrapAngle(a: number): number {
  let r = a - TAU * Math.floor((a + PI) / TAU);
  if (r <= -PI) r += TAU;
  return r;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function sign(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}
