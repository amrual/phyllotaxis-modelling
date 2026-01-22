/**
 * Seeded PRNG and Gaussian noise generator.
 * 
 * Used for deterministic noise in angle placement.
 */

// =============================================================================
// Mulberry32 PRNG
// =============================================================================

/**
 * Creates a seeded PRNG using mulberry32 algorithm.
 * 
 * NOTE: The returned function has internal mutable state (seed is captured
 * and mutated in the closure). Each call advances the state deterministically.
 * To reset, create a new mulberry32(seed) instance.
 */
export function mulberry32(seed: number): () => number {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// =============================================================================
// Gaussian RNG (Box-Muller)
// =============================================================================

/**
 * Gaussian random number generator using Box-Muller transform.
 * Produces standard normal (mean=0, stddev=1) samples.
 */
export class GaussianRNG {
  private rng: () => number;
  private spare: number | null = null;

  constructor(seed: number) {
    this.rng = mulberry32(seed);
  }

  /**
   * Generate the next standard normal sample.
   */
  next(): number {
    if (this.spare !== null) {
      const val = this.spare;
      this.spare = null;
      return val;
    }
    // Clamp u to avoid log(0) - mulberry32 can return 0
    // Clamping is deterministic, preserves reproducibility
    const u = Math.max(this.rng(), 1e-12);
    const v = this.rng();
    const r = Math.sqrt(-2 * Math.log(u));
    const theta = 2 * Math.PI * v;
    this.spare = r * Math.sin(theta);
    return r * Math.cos(theta);
  }

  /**
   * Fully reset to deterministic initial state for given seed.
   * Recreates the PRNG closure and clears any cached spare value.
   */
  reset(seed: number): void {
    this.rng = mulberry32(seed);  // fresh closure with reset internal state
    this.spare = null;            // clear cached Box-Muller spare
  }
}

// =============================================================================
// Angle Wrapping
// =============================================================================

/**
 * Wrap angle to [0, 2π)
 */
export function wrapAngle(theta: number): number {
  const TWO_PI = 2 * Math.PI;
  theta = theta % TWO_PI;
  if (theta < 0) theta += TWO_PI;
  return theta;
}
