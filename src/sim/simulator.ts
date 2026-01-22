/**
 * Phyllotaxis Simulator Core
 * 
 * Encapsulates simulation state and provides step/batch methods.
 * Preserves all MVP performance optimizations.
 */

import type { SimConfig } from './config';
import { compileKernel, HARD_CORE_PENALTY, type CompiledKernel } from './kernel';
import { GaussianRNG, wrapAngle } from './prng';

// =============================================================================
// Types
// =============================================================================

export interface Primordium {
  r: number;      // radial distance (changes each step via drift)
  theta: number;  // angle in radians (immutable after creation)
  ct: number;     // cos(theta) - cached at creation
  st: number;     // sin(theta) - cached at creation
}

// =============================================================================
// Simulator Class
// =============================================================================

export class Simulator {
  // Configuration
  private cfg!: SimConfig;

  // Primordia state
  public primordia: Primordium[] = [];

  // Compiled kernel
  private kernel!: CompiledKernel;

  // Precomputed candidate angles (ONCE at init)
  private candidateCos!: Float64Array;
  private candidateSin!: Float64Array;

  // Pre-allocated active arrays (reused every step)
  private activeXs!: Float64Array;
  private activeYs!: Float64Array;
  private activeCount: number = 0;

  // Active set tracking (suffix optimization)
  private firstActiveIndex: number = 0;

  // Overflow warning (one-time)
  private warnedOverflow: boolean = false;

  // Gaussian RNG for noise
  private gaussianRng: GaussianRNG = new GaussianRNG(12345);

  // =============================================================================
  // Initialization
  // =============================================================================

  /**
   * Initialize simulator with configuration.
   * Allocates arrays and compiles kernel.
   */
  init(cfg: SimConfig): void {
    this.cfg = cfg;

    // Compile kernel
    this.kernel = compileKernel(cfg.kernel);

    // Precompute candidate angle trig (ONCE)
    this.candidateCos = new Float64Array(cfg.angleSamples);
    this.candidateSin = new Float64Array(cfg.angleSamples);
    const step = (2 * Math.PI) / cfg.angleSamples;
    for (let i = 0; i < cfg.angleSamples; i++) {
      const theta = i * step;
      this.candidateCos[i] = Math.cos(theta);
      this.candidateSin[i] = Math.sin(theta);
    }

    // Pre-allocate active arrays
    this.activeXs = new Float64Array(cfg.totalPrimordia);
    this.activeYs = new Float64Array(cfg.totalPrimordia);

    // Initialize PRNG
    this.gaussianRng.reset(cfg.noise.seed);
  }

  /**
   * Reset simulation state (clear primordia, add first one).
   */
  reset(): void {
    this.primordia = [];
    this.firstActiveIndex = 0;
    this.warnedOverflow = false;
    this.activeCount = 0;

    // Reset PRNG
    this.gaussianRng.reset(this.cfg.noise.seed);

    // Add first primordium at theta=0
    this.addPrimordium(0);
  }

  // =============================================================================
  // Simulation Step
  // =============================================================================

  /**
   * Perform one simulation step:
   * 1. Drift all primordia outward
   * 2. Advance firstActiveIndex
   * 3. Build active arrays
   * 4. Find minimum field angle
   * 5. Apply noise (if enabled)
   * 6. Add new primordium
   */
  step(): void {
    if (this.primordia.length >= this.cfg.totalPrimordia) {
      return;
    }

    this.driftAllPrimordia();
    this.advanceFirstActiveIndex();
    this.buildActiveArrays();
    let thetaStar = this.findMinimumFieldAngle();

    // Apply noise if enabled
    if (this.cfg.noise.enabled) {
      const noiseRad = this.gaussianRng.next() * (this.cfg.noise.sigmaThetaDeg * Math.PI / 180);
      thetaStar = wrapAngle(thetaStar + noiseRad);
    }

    this.addPrimordium(thetaStar);
  }

  /**
   * Run a batch of steps.
   */
  runBatch(): number {
    const batchEnd = Math.min(this.primordia.length + this.cfg.batchSize, this.cfg.totalPrimordia);
    let stepsRun = 0;
    while (this.primordia.length < batchEnd) {
      this.step();
      stepsRun++;
    }
    return stepsRun;
  }

  /**
   * Check if simulation is complete.
   */
  isComplete(): boolean {
    return this.primordia.length >= this.cfg.totalPrimordia;
  }

  // =============================================================================
  // Internal Methods
  // =============================================================================

  private driftAllPrimordia(): void {
    const drift = this.cfg.v * this.cfg.dt;
    for (const p of this.primordia) {
      p.r += drift;
    }
  }

  /**
   * Advance firstActiveIndex to skip primordia that have drifted beyond maxR.
   * 
   * Maintains invariant: all i < firstActiveIndex have r > maxR (inactive).
   * Because r is strictly decreasing with index (older = larger r, given
   * all start at identical R), the active set is the suffix primordia[firstActiveIndex..].
   */
  private advanceFirstActiveIndex(): void {
    while (
      this.firstActiveIndex < this.primordia.length &&
      this.primordia[this.firstActiveIndex].r > this.cfg.maxR
    ) {
      this.firstActiveIndex++;
    }
  }

  /**
   * Build dense arrays of Cartesian coordinates for active primordia.
   */
  private buildActiveArrays(): void {
    this.activeCount = 0;
    for (let i = this.firstActiveIndex; i < this.primordia.length; i++) {
      // Safety guard: prevent overflow
      if (this.activeCount >= this.activeXs.length) {
        if (!this.warnedOverflow) {
          console.warn('buildActiveArrays: active array overflow, truncating.');
          this.warnedOverflow = true;
        }
        break;
      }
      const p = this.primordia[i];
      this.activeXs[this.activeCount] = p.r * p.ct;
      this.activeYs[this.activeCount] = p.r * p.st;
      this.activeCount++;
    }
  }

  /**
   * Find the angle θ* on the active ring that minimizes the inhibition field.
   * Uses parabolic refinement for sub-sample precision.
   */
  private findMinimumFieldAngle(): number {
    const { R, angleSamples } = this.cfg;
    const { fn: kernelFn, hasHardCore, d0: hardCoreD0 } = this.kernel;

    // fieldAtIndex: assumes 0 <= i < angleSamples (no modulo overhead)
    const fieldAtIndex = (i: number): number => {
      const cx = R * this.candidateCos[i];
      const cy = R * this.candidateSin[i];
      let sum = 0;
      for (let j = 0; j < this.activeCount; j++) {
        const dx = cx - this.activeXs[j];
        const dy = cy - this.activeYs[j];
        const d = Math.sqrt(dx * dx + dy * dy);

        // Hard-core check: early exit
        if (hasHardCore && d < hardCoreD0) {
          return HARD_CORE_PENALTY;
        }

        sum += kernelFn(d);
      }
      return sum;
    };

    // Single pass to find discrete minimum index
    let minVal = Infinity;
    let iMin = 0;
    for (let i = 0; i < angleSamples; i++) {
      const f = fieldAtIndex(i);
      if (f < minVal) {
        minVal = f;
        iMin = i;
      }
    }

    // Parabolic refinement: compute neighbor indices with branch-based wrap
    const iL = (iMin === 0) ? angleSamples - 1 : iMin - 1;
    const iR = (iMin === angleSamples - 1) ? 0 : iMin + 1;

    const f0 = fieldAtIndex(iL);
    const f1 = minVal;
    const f2 = fieldAtIndex(iR);

    const denom = 2 * (f0 - 2 * f1 + f2);
    let refinedIndex: number = iMin;

    if (Math.abs(denom) > 1e-12) {
      const offset = (f0 - f2) / denom;
      // Clamp offset to [-0.5, 0.5]: stabilizes refinement
      refinedIndex = iMin + Math.max(-0.5, Math.min(0.5, offset));
    }

    // Convert to angle
    const angleStep = (2 * Math.PI) / angleSamples;
    let theta = refinedIndex * angleStep;
    if (theta < 0) theta += 2 * Math.PI;
    if (theta >= 2 * Math.PI) theta -= 2 * Math.PI;

    return theta;
  }

  private addPrimordium(theta: number): void {
    this.primordia.push({
      r: this.cfg.R,
      theta,
      ct: Math.cos(theta),
      st: Math.sin(theta)
    });
  }

  // =============================================================================
  // Field Values (for plot)
  // =============================================================================

  /**
   * Compute field values at all candidate angles.
   * Used for field plot visualization.
   */
  getFieldValues(): Float64Array {
    const { R, angleSamples } = this.cfg;
    const { fn: kernelFn, hasHardCore, d0: hardCoreD0 } = this.kernel;
    const values = new Float64Array(angleSamples);

    for (let i = 0; i < angleSamples; i++) {
      const cx = R * this.candidateCos[i];
      const cy = R * this.candidateSin[i];
      let sum = 0;
      for (let j = 0; j < this.activeCount; j++) {
        const dx = cx - this.activeXs[j];
        const dy = cy - this.activeYs[j];
        const d = Math.sqrt(dx * dx + dy * dy);

        if (hasHardCore && d < hardCoreD0) {
          sum = HARD_CORE_PENALTY;
          break;
        }

        sum += kernelFn(d);
      }
      values[i] = sum;
    }

    return values;
  }

  // =============================================================================
  // Divergence Metrics
  // =============================================================================

  /**
   * Compute divergence angle statistics for the last N primordia.
   */
  computeDivergenceMetrics(N: number = 200): { mean: number; stdDev: number; count: number } {
    const startIdx = Math.max(1, this.primordia.length - N);
    const deltas: number[] = [];

    for (let i = startIdx; i < this.primordia.length; i++) {
      let delta = this.primordia[i].theta - this.primordia[i - 1].theta;
      // Wrap to [0, 2π)
      delta = ((delta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      deltas.push(delta * 180 / Math.PI); // degrees
    }

    if (deltas.length === 0) {
      return { mean: 0, stdDev: 0, count: 0 };
    }

    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const variance = deltas.reduce((a, d) => a + (d - mean) ** 2, 0) / deltas.length;
    const stdDev = Math.sqrt(variance);

    return { mean, stdDev, count: deltas.length };
  }
}
