// Seeded pseudo-random numbers for the figures that simulate paths in the
// browser (fig.doeblin-fourier, fig.position-as-time, fig.visits,
// fig.below-four). Deterministic per seed, identical in every browser and
// under Node (32-bit integer arithmetic only), so a figure's default seed
// always draws the same picture and the unit tests can pin it.
//
//   uniform: mulberry32 (32-bit state), values in (0, 1);
//   normal:  Marsaglia--Tsang ziggurat (128 layers) on top of it -- exact
//            standard normal, about six times faster than Box--Muller,
//            which keeps a 40 000-path Monte Carlo within a few seconds.
// `subSeed(seed, i)` gives an independent stream per path or per attempt,
// so a figure can regenerate path i of a sample directly.

const ZR = 3.442619855899;
const KN = new Int32Array(128);
const WN = new Float64Array(128);
const FN = new Float64Array(128);
(function zigguratTables() {
  const m1 = 2147483648.0;
  const vn = 9.91256303526217e-3;
  let dn = ZR;
  let tn = dn;
  const q = vn / Math.exp(-0.5 * dn * dn);
  KN[0] = Math.floor((dn / q) * m1);
  KN[1] = 0;
  WN[0] = q / m1;
  WN[127] = dn / m1;
  FN[0] = 1.0;
  FN[127] = Math.exp(-0.5 * dn * dn);
  for (let i = 126; i >= 1; i -= 1) {
    dn = Math.sqrt(-2.0 * Math.log(vn / dn + Math.exp(-0.5 * dn * dn)));
    KN[i + 1] = Math.floor((dn / tn) * m1);
    tn = dn;
    FN[i] = Math.exp(-0.5 * dn * dn);
    WN[i] = dn / m1;
  }
}());

/** An integer hash of (seed, index): the seed of stream `index`. */
export function subSeed(seed, index) {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul((index | 0) + 0x7f4a7c15, 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) | 0;
}

export class Rng {
  constructor(seed) { this.a = seed | 0; }

  /** Next 32-bit unsigned integer (mulberry32). */
  u32() {
    this.a = (this.a + 0x6d2b79f5) | 0;
    const a = this.a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Uniform on the open interval (0, 1). */
  uniform() { return (this.u32() + 0.5) / 4294967296; }

  /** Standard normal (ziggurat). */
  normal() {
    for (;;) {
      const hz = this.u32() | 0;
      const iz = hz & 127;
      if (Math.abs(hz) < KN[iz]) return hz * WN[iz];
      let x = hz * WN[iz];
      if (iz === 0) {
        let y;
        do {
          x = -Math.log(this.uniform()) / ZR;
          y = -Math.log(this.uniform());
        } while (y + y < x * x);
        return hz > 0 ? ZR + x : -ZR - x;
      }
      if (FN[iz] + this.uniform() * (FN[iz - 1] - FN[iz]) < Math.exp(-0.5 * x * x)) return x;
    }
  }
}

/** A fresh random seed for "New sample" (not reproducible on purpose). */
export function freshSeed() {
  return 1 + Math.floor(Math.random() * 999999);
}
