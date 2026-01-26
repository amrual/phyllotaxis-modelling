/**
 * Phyllotaxis Simulator V1 - Entry Point
 * 
 * Wires together all modules: simulator, UI, and renderer.
 */

import type { SimConfig } from './sim/config';
import { Simulator } from './sim/simulator';
import { UI } from './ui/ui';
import {
  setupCanvas,
  getCanvasDimensions,
  render,
  renderMetrics,
  renderFieldPlot
} from './render/render';

import './style.css';

// =============================================================================
// Application State
// =============================================================================

let simulator: Simulator;
let ui: UI;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

let isRunning = false;
let animationId: number | null = null;
let currentConfig: SimConfig;

// Field plot state
let fieldPlotDirty = true;
const FIELD_PLOT_INTERVAL = 10;
let fieldPlotCounter = 0;

// =============================================================================
// Rendering
// =============================================================================

function doRender(): void {
  render(canvas, ctx, simulator.primordia, currentConfig);

  // Metrics overlay
  if (currentConfig.render.showMetrics) {
    const metrics = simulator.computeDivergenceMetrics();
    const { width } = getCanvasDimensions(canvas);
    renderMetrics(ctx, width, metrics, simulator.primordia.length, currentConfig.totalPrimordia);
  }
}

function updateFieldPlotIfNeeded(): void {
  if (currentConfig.render.showFieldPlot && fieldPlotDirty) {
    const fieldValues = simulator.getFieldValues();
    renderFieldPlot(ui.fieldPlotCanvas, ui.fieldPlotCtx, fieldValues);
    fieldPlotDirty = false;
  }
}

// =============================================================================
// Animation Loop
// =============================================================================

function animationFrame(): void {
  if (!isRunning || simulator.isComplete()) {
    if (simulator.isComplete()) {
      isRunning = false;
      ui.setRunning(false);
      console.log('Simulation complete');
      const metrics = simulator.computeDivergenceMetrics();
      console.log(`Divergence angle (last ${metrics.count}): mean=${metrics.mean.toFixed(2)}°, stdDev=${metrics.stdDev.toFixed(2)}°`);
    }
    animationId = null;
    return;
  }

  simulator.runBatch();

  // Field plot throttle during running
  if (currentConfig.render.showFieldPlot) {
    fieldPlotCounter++;
    if (fieldPlotCounter >= FIELD_PLOT_INTERVAL) {
      fieldPlotCounter = 0;
      fieldPlotDirty = true;
      updateFieldPlotIfNeeded();
    }
  }

  doRender();
  animationId = requestAnimationFrame(animationFrame);
}

// =============================================================================
// UI Callbacks
// =============================================================================

function onApply(cfg: SimConfig): void {
  currentConfig = cfg;
  simulator.init(cfg);
  simulator.reset();
  isRunning = false;
  ui.setRunning(false);
  fieldPlotDirty = true;
  fieldPlotCounter = 0;
  updateFieldPlotIfNeeded();
  doRender();
}

function onRun(): void {
  if (simulator.isComplete()) return;
  isRunning = true;
  ui.setRunning(true);
  if (animationId === null) {
    animationId = requestAnimationFrame(animationFrame);
  }
}

function onPause(): void {
  isRunning = false;
  ui.setRunning(false);
}

function onStep(): void {
  if (simulator.isComplete()) return;
  isRunning = false;
  ui.setRunning(false);
  simulator.step();
  fieldPlotDirty = true;
  updateFieldPlotIfNeeded();
  doRender();
}

function onReset(): void {
  isRunning = false;
  ui.setRunning(false);
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  simulator.reset();
  fieldPlotDirty = true;
  fieldPlotCounter = 0;
  updateFieldPlotIfNeeded();
  doRender();
}

function onUpdateFieldPlot(): void {
  fieldPlotDirty = true;
  updateFieldPlotIfNeeded();
}

// =============================================================================
// Initialization
// =============================================================================

function main(): void {
  // Get canvas
  canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) {
    console.error('Failed to get 2D context');
    return;
  }
  ctx = maybeCtx;

  // Setup canvas
  setupCanvas(canvas, ctx);

  // Create simulator
  simulator = new Simulator();

  // Create UI
  ui = new UI({
    onApply,
    onRun,
    onPause,
    onStep,
    onReset,
    onUpdateFieldPlot
  });

  // Initialize UI and get initial config
  currentConfig = ui.init();

  // Initialize simulator with config
  simulator.init(currentConfig);
  simulator.reset();

  // Initial render
  fieldPlotDirty = true;
  updateFieldPlotIfNeeded();
  doRender();

  // Handle resize
  window.addEventListener('resize', () => {
    setupCanvas(canvas, ctx);
    doRender();
  });

  // Set initial button states
  ui.setRunning(false);
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
