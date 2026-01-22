/**
 * Canvas rendering for the Phyllotaxis Simulator.
 * DPR-aware, with support for field plot visualization.
 */

import type { SimConfig } from '../sim/config';
import type { Primordium } from '../sim/simulator';

// =============================================================================
// Canvas Setup
// =============================================================================

/**
 * Setup canvas with DPR scaling for crisp rendering.
 */
export function setupCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * Get CSS dimensions of canvas.
 */
export function getCanvasDimensions(canvas: HTMLCanvasElement): { width: number; height: number } {
  const dpr = window.devicePixelRatio || 1;
  return {
    width: canvas.width / dpr,
    height: canvas.height / dpr
  };
}

// =============================================================================
// Main Render
// =============================================================================

/**
 * Render primordia on canvas.
 */
export function render(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  primordia: Primordium[],
  cfg: SimConfig
): void {
  const { width, height } = getCanvasDimensions(canvas);

  // Clear with dark background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);

  if (primordia.length === 0) return;

  // Find max radius for scaling
  let maxRadius = cfg.R;
  for (const p of primordia) {
    if (p.r > maxRadius) maxRadius = p.r;
  }

  const scale = Math.min(width, height) * 0.45 / maxRadius;
  const cx = width / 2;
  const cy = height / 2;

  // Draw primordia colored by birth order
  for (let i = 0; i < primordia.length; i++) {
    const p = primordia[i];
    const x = cx + p.r * p.ct * scale;
    const y = cy + p.r * p.st * scale;
    const hue = (i * 360) / cfg.totalPrimordia;

    ctx.beginPath();
    ctx.arc(x, y, cfg.render.pointRadius, 0, 2 * Math.PI);
    ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
    ctx.fill();
  }

  // Draw active ring
  if (cfg.render.showRing) {
    ctx.beginPath();
    ctx.arc(cx, cy, cfg.R * scale, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// =============================================================================
// Metrics Overlay
// =============================================================================

/**
 * Render divergence metrics overlay.
 */
export function renderMetrics(
  ctx: CanvasRenderingContext2D,
  _width: number,
  metrics: { mean: number; stdDev: number; count: number },
  primordiaCount: number,
  totalPrimordia: number
): void {
  ctx.font = '12px monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';

  const lines = [
    `Primordia: ${primordiaCount} / ${totalPrimordia}`,
    `Divergence (last ${metrics.count}): ${metrics.mean.toFixed(2)}° ± ${metrics.stdDev.toFixed(2)}°`
  ];

  let y = 20;
  for (const line of lines) {
    ctx.fillText(line, 10, y);
    y += 16;
  }
}

// =============================================================================
// Field Plot
// =============================================================================

/**
 * Render field plot as a sparkline.
 */
export function renderFieldPlot(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  fieldValues: Float64Array
): void {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = rect.height;

  // Clear
  ctx.fillStyle = '#252540';
  ctx.fillRect(0, 0, width, height);

  if (fieldValues.length === 0) return;

  // Find min/max (ignore very large penalty values)
  const PENALTY_THRESHOLD = 1e20;
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let i = 0; i < fieldValues.length; i++) {
    const v = fieldValues[i];
    if (v < PENALTY_THRESHOLD) {
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
  }

  if (!isFinite(minVal) || !isFinite(maxVal) || minVal === maxVal) {
    // No valid data or flat
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillText('No field data', 10, height / 2);
    return;
  }

  const range = maxVal - minVal;
  const padding = 4;
  const plotHeight = height - 2 * padding;
  const plotWidth = width - 2 * padding;

  // Draw sparkline
  ctx.beginPath();
  ctx.strokeStyle = '#6ee7b7';
  ctx.lineWidth = 1;

  for (let i = 0; i < fieldValues.length; i++) {
    const x = padding + (i / (fieldValues.length - 1)) * plotWidth;
    let v = fieldValues[i];
    // Clamp penalty values to max for display
    if (v >= PENALTY_THRESHOLD) v = maxVal;
    const y = padding + plotHeight - ((v - minVal) / range) * plotHeight;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Labels
  ctx.font = '9px monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillText(`min: ${minVal.toFixed(2)}`, padding, height - 2);
  ctx.fillText(`max: ${maxVal.toFixed(2)}`, width - 60, height - 2);
}
