/**
 * Configuration types and presets for the Phyllotaxis Simulator.
 */

// =============================================================================
// Kernel Configuration (discriminated union)
// =============================================================================

export type KernelConfig =
  | { type: 'exp'; A: number; lambda: number }
  | { type: 'gaussian'; A: number; sigma: number }
  | { type: 'softPower'; A: number; p: number; eps: number }
  | { type: 'hardCoreExp'; A: number; lambda: number; d0: number }
  | { type: 'custom'; expr: string; params: CustomKernelParams };

export interface CustomKernelParams {
  A: number;
  lambda: number;
  sigma: number;
  p: number;
  eps: number;
  d0: number;
}

// =============================================================================
// Simulation Configuration
// =============================================================================

export interface SimConfig {
  // Simulation geometry
  R: number;              // active ring radius
  v: number;              // radial drift per step
  dt: number;             // step size
  maxR: number;           // ignore primordia beyond this

  // Sampling
  angleSamples: number;   // candidate angles (0..2π)
  totalPrimordia: number;
  batchSize: number;

  // Kernel (discriminated union - all kernel params here)
  kernel: KernelConfig;

  // Noise (optional)
  noise: {
    enabled: boolean;
    sigmaThetaDeg: number;  // std dev in degrees
    seed: number;           // PRNG seed for determinism
  };

  // Render options
  render: {
    showRing: boolean;
    showMetrics: boolean;
    showFieldPlot: boolean;
    pointRadius: number;
    scaleByDistance: boolean;  // Scale point size by distance from center (natural growth)
  };
}

// =============================================================================
// Default Configuration (Fibonacci-friendly)
// =============================================================================

export function defaultConfig(): SimConfig {
  return {
    R: 1.0,
    v: 0.02,
    dt: 1.0,
    maxR: 3.0,
    angleSamples: 720,
    totalPrimordia: 1000,
    batchSize: 30,
    kernel: {
      type: 'exp',
      A: 1.0,
      lambda: 0.18
    },
    noise: {
      enabled: true,
      sigmaThetaDeg: 0.1,
      seed: 12345
    },
    render: {
      showRing: true,
      showMetrics: true,
      showFieldPlot: false,
      pointRadius: 5.0,
      scaleByDistance: true
    }
  };
}

// =============================================================================
// Default Custom Kernel Params
// =============================================================================

export function defaultCustomParams(): CustomKernelParams {
  return {
    A: 1.0,
    lambda: 0.18,
    sigma: 0.15,
    p: 2.0,
    eps: 0.01,
    d0: 0.05
  };
}

// =============================================================================
// Presets
// =============================================================================

export interface Preset {
  name: string;
  description: string;
  config: SimConfig;
  isStressTest?: boolean;
}

export const PRESETS: Preset[] = [
  {
    name: 'Fibonacci (default)',
    description: 'Classic MVP behavior with exponential kernel',
    config: defaultConfig()
  },
  {
    name: 'Tight inhibition',
    description: 'Denser packing with smaller lambda',
    config: {
      ...defaultConfig(),
      totalPrimordia: 800,
      kernel: { type: 'exp', A: 1.0, lambda: 0.12 }
    }
  },
  {
    name: 'Loose inhibition',
    description: 'Sparser pattern with larger lambda',
    config: {
      ...defaultConfig(),
      kernel: { type: 'exp', A: 1.0, lambda: 0.28 }
    }
  },
  {
    name: 'Gaussian kernel',
    description: 'Smoother falloff using Gaussian',
    config: {
      ...defaultConfig(),
      kernel: { type: 'gaussian', A: 1.0, sigma: 0.15 }
    }
  },
  {
    name: 'Hard-core',
    description: 'Exclusion zone around primordia',
    config: {
      ...defaultConfig(),
      kernel: { type: 'hardCoreExp', A: 1.0, lambda: 0.18, d0: 0.05 }
    }
  },
  {
    name: 'Stress test (10000)',
    description: 'Performance test with many primordia - may cause slowdown',
    config: {
      ...defaultConfig(),
      totalPrimordia: 10000,
      batchSize: 100
    },
    isStressTest: true
  }
];

// =============================================================================
// Deep Clone Helper
// =============================================================================

export function cloneConfig(cfg: SimConfig): SimConfig {
  return JSON.parse(JSON.stringify(cfg));
}
