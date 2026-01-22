/**
 * Configuration validation.
 */

import type { SimConfig } from './config';
import { validateExpression } from './kernel';

// =============================================================================
// Validation Result
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];   // blocking errors
  warnings: string[]; // non-blocking warnings (shown in UI, allow apply)
}

// =============================================================================
// Validate Configuration
// =============================================================================

export function validateConfig(cfg: SimConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Simulation params
  if (cfg.R <= 0) errors.push('R must be > 0');
  if (cfg.angleSamples < 36) errors.push('angleSamples must be >= 36');
  if (cfg.totalPrimordia < 2) errors.push('totalPrimordia must be >= 2');
  if (cfg.batchSize < 1) errors.push('batchSize must be >= 1');
  if (cfg.maxR <= cfg.R) errors.push('maxR must be > R');
  if (cfg.v <= 0) errors.push('v must be > 0');
  if (cfg.dt <= 0) errors.push('dt must be > 0');

  // Kernel params (based on type)
  const k = cfg.kernel;
  switch (k.type) {
    case 'exp':
      if (k.lambda <= 0) errors.push('lambda must be > 0');
      if (!isFinite(k.A)) errors.push('A must be finite');
      break;

    case 'gaussian':
      if (k.sigma <= 0) errors.push('sigma must be > 0');
      if (!isFinite(k.A)) errors.push('A must be finite');
      break;

    case 'softPower':
      if (k.p <= 0) errors.push('p must be > 0');
      if (k.eps < 0) errors.push('eps must be >= 0');
      if (!isFinite(k.A)) errors.push('A must be finite');
      break;

    case 'hardCoreExp':
      if (k.lambda <= 0) errors.push('lambda must be > 0');
      if (k.d0 < 0) errors.push('d0 must be >= 0');
      if (!isFinite(k.A)) errors.push('A must be finite');
      // Warning (not error) for unusually large d0
      if (k.d0 >= cfg.R) {
        warnings.push(`d0 (${k.d0}) >= R (${cfg.R}): may invalidate many/all candidate angles`);
      }
      break;

    case 'custom': {
      const exprError = validateExpression(k.expr);
      if (exprError) {
        errors.push(`Invalid expression: ${exprError}`);
      }
      // Validate custom params
      if (k.params.lambda <= 0) errors.push('lambda must be > 0');
      if (k.params.sigma <= 0) errors.push('sigma must be > 0');
      if (k.params.p <= 0) errors.push('p must be > 0');
      if (k.params.eps < 0) errors.push('eps must be >= 0');
      if (k.params.d0 < 0) errors.push('d0 must be >= 0');
      break;
    }
  }

  // Noise params
  if (cfg.noise.enabled) {
    if (cfg.noise.sigmaThetaDeg < 0) errors.push('noise sigma must be >= 0');
  }

  // Render params
  if (cfg.render.pointRadius <= 0) errors.push('pointRadius must be > 0');

  return { valid: errors.length === 0, errors, warnings };
}
