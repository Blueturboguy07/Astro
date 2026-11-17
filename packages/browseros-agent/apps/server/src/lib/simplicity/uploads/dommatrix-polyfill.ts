/**
 * A 2D DOMMatrix for pdfjs (through pdf-parse) inside the compiled server.
 *
 * pdfjs uses DOMMatrix at load time and takes it from @napi-rs/canvas when
 * the runtime has none. That native addon is not in the `bun build
 * --compile` binary, so every PDF upload failed with "ReferenceError:
 * DOMMatrix is not defined" (Astro 0.2.4 QA, F-042). Text extraction only
 * needs 2D affine math, which this class covers. It is installed only when
 * no DOMMatrix exists.
 */
type Init = number[] | undefined

class Matrix2D {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0

  constructor(init?: Init | string) {
    if (Array.isArray(init) && init.length >= 6) {
      ;[this.a, this.b, this.c, this.d, this.e, this.f] = init
    }
  }

  get is2D() {
    return true
  }

  get isIdentity() {
    return (
      this.a === 1 &&
      this.b === 0 &&
      this.c === 0 &&
      this.d === 1 &&
      this.e === 0 &&
      this.f === 0
    )
  }

  get m11() {
    return this.a
  }
  get m12() {
    return this.b
  }
  get m21() {
    return this.c
  }
  get m22() {
    return this.d
  }
  get m41() {
    return this.e
  }
  get m42() {
    return this.f
  }

  private set6(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.a = a
    this.b = b
    this.c = c
    this.d = d
    this.e = e
    this.f = f
    return this
  }

  multiplySelf(o: Partial<Matrix2D>) {
    const m = new Matrix2D([o.a ?? 1, o.b ?? 0, o.c ?? 0, o.d ?? 1, o.e ?? 0, o.f ?? 0])
    return this.set6(
      this.a * m.a + this.c * m.b,
      this.b * m.a + this.d * m.b,
      this.a * m.c + this.c * m.d,
      this.b * m.c + this.d * m.d,
      this.a * m.e + this.c * m.f + this.e,
      this.b * m.e + this.d * m.f + this.f,
    )
  }

  preMultiplySelf(o: Partial<Matrix2D>) {
    const m = new Matrix2D([o.a ?? 1, o.b ?? 0, o.c ?? 0, o.d ?? 1, o.e ?? 0, o.f ?? 0])
    return this.set6(
      m.a * this.a + m.c * this.b,
      m.b * this.a + m.d * this.b,
      m.a * this.c + m.c * this.d,
      m.b * this.c + m.d * this.d,
      m.a * this.e + m.c * this.f + m.e,
      m.b * this.e + m.d * this.f + m.f,
    )
  }

  multiply(o: Partial<Matrix2D>) {
    return this.clone().multiplySelf(o)
  }

  translateSelf(tx = 0, ty = 0) {
    return this.multiplySelf({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty })
  }

  translate(tx = 0, ty = 0) {
    return this.clone().translateSelf(tx, ty)
  }

  scaleSelf(sx = 1, sy = sx) {
    return this.multiplySelf({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 })
  }

  scale(sx = 1, sy = sx) {
    return this.clone().scaleSelf(sx, sy)
  }

  invertSelf() {
    const det = this.a * this.d - this.b * this.c
    if (det === 0) return this.set6(NaN, NaN, NaN, NaN, NaN, NaN)
    return this.set6(
      this.d / det,
      -this.b / det,
      -this.c / det,
      this.a / det,
      (this.c * this.f - this.d * this.e) / det,
      (this.b * this.e - this.a * this.f) / det,
    )
  }

  inverse() {
    return this.clone().invertSelf()
  }

  transformPoint(p: { x?: number; y?: number } = {}) {
    const x = p.x ?? 0
    const y = p.y ?? 0
    return {
      x: this.a * x + this.c * y + this.e,
      y: this.b * x + this.d * y + this.f,
      z: 0,
      w: 1,
    }
  }

  clone() {
    return new Matrix2D([this.a, this.b, this.c, this.d, this.e, this.f])
  }

  toFloat64Array() {
    return Float64Array.of(this.a, this.b, 0, 0, this.c, this.d, 0, 0, 0, 0, 1, 0, this.e, this.f, 0, 1)
  }
}

export function ensureDOMMatrix(): void {
  const g = globalThis as { DOMMatrix?: unknown }
  if (typeof g.DOMMatrix === 'undefined') g.DOMMatrix = Matrix2D
}

export { Matrix2D }
