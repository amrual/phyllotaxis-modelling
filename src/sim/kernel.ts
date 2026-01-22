/**
 * Kernel implementations for the inhibition field.
 * 
 * Each kernel computes a contribution value for a given distance d.
 * The field at a candidate angle is the sum of contributions from all active primordia.
 */

import { Parser } from 'expr-eval';
import type { KernelConfig } from './config';

// =============================================================================
// Constants
// =============================================================================

/** Large finite penalty for hard-core violations (d < d0) */
export const HARD_CORE_PENALTY = 1e30;

/** Large finite penalty for custom kernel errors (NaN, Infinity, exceptions) */
export const CUSTOM_BAD_PENALTY = 1e30;

// =============================================================================
// Compiled Kernel Interface
// =============================================================================

export interface CompiledKernel {
  /** Kernel function: contribution for distance d */
  fn: (d: number) => number;
  /** True IFF kernel.type === 'hardCoreExp' */
  hasHardCore: boolean;
  /** Hard-core radius (only meaningful if hasHardCore) */
  d0: number;
}

// =============================================================================
// Expression Parser (singleton)
// =============================================================================

const exprParser = new Parser();

// =============================================================================
// Kernel Compilation
// =============================================================================

/**
 * Compile a kernel configuration into a callable function.
 * 
 * For custom kernels:
 * - Fresh scope per compile; stable shape (no adding/removing keys at runtime)
 * - Only scope.d is mutated per call - no per-call allocations
 * - Runtime safety: try/catch + NaN/Infinity check
 */
export function compileKernel(kernel: KernelConfig): CompiledKernel {
  switch (kernel.type) {
    case 'exp': {
      const { A, lambda } = kernel;
      return {
        fn: (d) => A * Math.exp(-d / lambda),
        hasHardCore: false,
        d0: 0
      };
    }

    case 'gaussian': {
      const { A, sigma } = kernel;
      const twoSigmaSq = 2 * sigma * sigma;
      return {
        fn: (d) => A * Math.exp(-(d * d) / twoSigmaSq),
        hasHardCore: false,
        d0: 0
      };
    }

    case 'softPower': {
      const { A, p, eps } = kernel;
      return {
        fn: (d) => A / (Math.pow(d, p) + eps),
        hasHardCore: false,
        d0: 0
      };
    }

    case 'hardCoreExp': {
      // hasHardCore strictly tied to this type
      const { A, lambda, d0 } = kernel;
      return {
        fn: (d) => A * Math.exp(-d / lambda),
        hasHardCore: true,
        d0
      };
    }

    case 'custom': {
      // Runtime safety: try/catch + NaN/Infinity check
      const compiled = exprParser.parse(kernel.expr);
      // Fresh scope per compile; stable shape (no adding/removing keys at runtime).
      // Only scope.d is mutated per call - no per-call allocations.
      const scope = { ...kernel.params, d: 0 };
      return {
        fn: (d) => {
          try {
            scope.d = d;  // only mutation - no object creation
            const result = compiled.evaluate(scope);
            // If result is not finite, return penalty
            if (!Number.isFinite(result)) {
              return CUSTOM_BAD_PENALTY;
            }
            return result;
          } catch {
            return CUSTOM_BAD_PENALTY;
          }
        },
        hasHardCore: false,
        d0: 0
      };
    }
  }
}

// =============================================================================
// Expression Validation
// =============================================================================

/**
 * Validate a custom expression string.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateExpression(expr: string): string | null {
  try {
    exprParser.parse(expr);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
