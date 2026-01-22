/**
 * UI module for the Phyllotaxis Simulator.
 * Creates sidebar controls, handles bindings, import/export.
 */

import {
  type SimConfig,
  type KernelConfig,
  defaultConfig,
  cloneConfig,
  PRESETS
} from '../sim/config';
import { validateConfig, type ValidationResult } from '../sim/validation';
import { validateExpression } from '../sim/kernel';

// =============================================================================
// Types
// =============================================================================

export interface UICallbacks {
  onApply: (cfg: SimConfig) => void;
  onRun: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onUpdateFieldPlot: () => void;
}

// =============================================================================
// URL Hash Encoding (Unicode-safe)
// =============================================================================

function encodeConfigToHash(cfg: SimConfig): string {
  const json = JSON.stringify(cfg);
  return btoa(encodeURIComponent(json));
}

function decodeConfigFromHash(hash: string): SimConfig | null {
  try {
    const json = decodeURIComponent(atob(hash));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// =============================================================================
// UI Class
// =============================================================================

export class UI {
  private callbacks: UICallbacks;
  private currentConfig: SimConfig;

  // DOM elements
  private sidebar!: HTMLElement;
  private validationDiv!: HTMLElement;

  // Control buttons
  private runBtn!: HTMLButtonElement;
  private pauseBtn!: HTMLButtonElement;
  private stepBtn!: HTMLButtonElement;
  private resetBtn!: HTMLButtonElement;
  private applyBtn!: HTMLButtonElement;

  // Preset dropdown
  private presetSelect!: HTMLSelectElement;

  // Simulation params
  private inputR!: HTMLInputElement;
  private inputV!: HTMLInputElement;
  private inputDt!: HTMLInputElement;
  private inputMaxR!: HTMLInputElement;
  private inputAngleSamples!: HTMLInputElement;
  private inputTotalPrimordia!: HTMLInputElement;
  private inputBatchSize!: HTMLInputElement;

  // Kernel
  private kernelTypeSelect!: HTMLSelectElement;
  private kernelParamsDiv!: HTMLElement;
  private inputKernelA!: HTMLInputElement;
  private inputKernelLambda!: HTMLInputElement;
  private inputKernelSigma!: HTMLInputElement;
  private inputKernelP!: HTMLInputElement;
  private inputKernelEps!: HTMLInputElement;
  private inputKernelD0!: HTMLInputElement;
  private customExprTextarea!: HTMLTextAreaElement;
  private customExprValidation!: HTMLElement;

  // Noise
  private noiseEnabledCheckbox!: HTMLInputElement;
  private inputNoiseSigma!: HTMLInputElement;
  private inputNoiseSeed!: HTMLInputElement;

  // Render
  private showRingCheckbox!: HTMLInputElement;
  private showMetricsCheckbox!: HTMLInputElement;
  private showFieldPlotCheckbox!: HTMLInputElement;
  private inputPointRadius!: HTMLInputElement;
  private updateFieldPlotBtn!: HTMLButtonElement;

  // Field plot canvas
  public fieldPlotCanvas!: HTMLCanvasElement;
  public fieldPlotCtx!: CanvasRenderingContext2D;

  constructor(callbacks: UICallbacks) {
    this.callbacks = callbacks;
    this.currentConfig = defaultConfig();
  }

  // =============================================================================
  // Initialization
  // =============================================================================

  init(): SimConfig {
    this.createSidebar();
    this.bindEvents();

    // Check for URL hash config
    const hash = window.location.hash.slice(1);
    if (hash) {
      const cfg = decodeConfigFromHash(hash);
      if (cfg) {
        const result = validateConfig(cfg);
        if (result.valid) {
          this.currentConfig = cfg;
          this.populateUIFromConfig(cfg);
          return cfg;
        }
      }
    }

    // Use default config
    this.populateUIFromConfig(this.currentConfig);
    return cloneConfig(this.currentConfig);
  }

  // =============================================================================
  // Sidebar Creation
  // =============================================================================

  private createSidebar(): void {
    this.sidebar = document.getElementById('sidebar')!;
    this.sidebar.innerHTML = `
      <div class="ui-section">
        <div class="ui-row buttons">
          <button id="btn-run" class="btn primary">Run</button>
          <button id="btn-pause" class="btn">Pause</button>
          <button id="btn-step" class="btn">Step</button>
          <button id="btn-reset" class="btn">Reset</button>
        </div>
        <button id="btn-apply" class="btn apply-btn">Apply</button>
      </div>

      <div class="ui-section">
        <label class="ui-label">Preset</label>
        <select id="preset-select" class="ui-select"></select>
      </div>

      <div class="ui-section">
        <div class="ui-section-title">Simulation</div>
        <div class="ui-row">
          <label>R</label>
          <input type="number" id="input-R" step="0.1" min="0.1">
        </div>
        <div class="ui-row">
          <label>v</label>
          <input type="number" id="input-v" step="0.001" min="0.001">
        </div>
        <div class="ui-row">
          <label>dt</label>
          <input type="number" id="input-dt" step="0.1" min="0.1">
        </div>
        <div class="ui-row">
          <label>maxR</label>
          <input type="number" id="input-maxR" step="0.1" min="0.1">
        </div>
        <div class="ui-row">
          <label>angleSamples</label>
          <input type="number" id="input-angleSamples" step="1" min="36">
        </div>
        <div class="ui-row">
          <label>totalPrimordia</label>
          <input type="number" id="input-totalPrimordia" step="100" min="2">
        </div>
        <div class="ui-row">
          <label>batchSize</label>
          <input type="number" id="input-batchSize" step="1" min="1">
        </div>
      </div>

      <div class="ui-section">
        <div class="ui-section-title">Kernel</div>
        <div class="ui-row">
          <label>Type</label>
          <select id="kernel-type-select" class="ui-select">
            <option value="exp">Exponential</option>
            <option value="gaussian">Gaussian</option>
            <option value="softPower">Soft Power</option>
            <option value="hardCoreExp">Hard-Core Exp</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div id="kernel-params"></div>
      </div>

      <div class="ui-section">
        <div class="ui-section-title">Noise</div>
        <div class="ui-row checkbox-row">
          <input type="checkbox" id="noise-enabled">
          <label for="noise-enabled">Enable noise</label>
        </div>
        <div class="ui-row">
          <label>σ (deg)</label>
          <input type="number" id="input-noise-sigma" step="0.5" min="0">
        </div>
        <div class="ui-row">
          <label>Seed</label>
          <input type="number" id="input-noise-seed" step="1">
        </div>
      </div>

      <div class="ui-section">
        <div class="ui-section-title">Render</div>
        <div class="ui-row checkbox-row">
          <input type="checkbox" id="show-ring">
          <label for="show-ring">Show ring</label>
        </div>
        <div class="ui-row checkbox-row">
          <input type="checkbox" id="show-metrics">
          <label for="show-metrics">Show metrics</label>
        </div>
        <div class="ui-row checkbox-row">
          <input type="checkbox" id="show-field-plot">
          <label for="show-field-plot">Field plot</label>
        </div>
        <div class="ui-row">
          <label>Point radius</label>
          <input type="number" id="input-point-radius" step="0.5" min="0.5">
        </div>
        <button id="btn-update-field-plot" class="btn btn-small">Update Field Plot</button>
      </div>

      <div class="ui-section">
        <div class="ui-section-title">Import/Export</div>
        <div class="ui-row buttons">
          <button id="btn-export" class="btn btn-small">Export</button>
          <button id="btn-import" class="btn btn-small">Import</button>
        </div>
        <input type="file" id="import-file" accept=".json" style="display: none">
      </div>

      <div class="ui-section field-plot-section">
        <canvas id="field-plot-canvas"></canvas>
      </div>

      <div id="validation-messages"></div>
    `;

    // Get references
    this.runBtn = document.getElementById('btn-run') as HTMLButtonElement;
    this.pauseBtn = document.getElementById('btn-pause') as HTMLButtonElement;
    this.stepBtn = document.getElementById('btn-step') as HTMLButtonElement;
    this.resetBtn = document.getElementById('btn-reset') as HTMLButtonElement;
    this.applyBtn = document.getElementById('btn-apply') as HTMLButtonElement;

    this.presetSelect = document.getElementById('preset-select') as HTMLSelectElement;

    this.inputR = document.getElementById('input-R') as HTMLInputElement;
    this.inputV = document.getElementById('input-v') as HTMLInputElement;
    this.inputDt = document.getElementById('input-dt') as HTMLInputElement;
    this.inputMaxR = document.getElementById('input-maxR') as HTMLInputElement;
    this.inputAngleSamples = document.getElementById('input-angleSamples') as HTMLInputElement;
    this.inputTotalPrimordia = document.getElementById('input-totalPrimordia') as HTMLInputElement;
    this.inputBatchSize = document.getElementById('input-batchSize') as HTMLInputElement;

    this.kernelTypeSelect = document.getElementById('kernel-type-select') as HTMLSelectElement;
    this.kernelParamsDiv = document.getElementById('kernel-params') as HTMLElement;

    this.noiseEnabledCheckbox = document.getElementById('noise-enabled') as HTMLInputElement;
    this.inputNoiseSigma = document.getElementById('input-noise-sigma') as HTMLInputElement;
    this.inputNoiseSeed = document.getElementById('input-noise-seed') as HTMLInputElement;

    this.showRingCheckbox = document.getElementById('show-ring') as HTMLInputElement;
    this.showMetricsCheckbox = document.getElementById('show-metrics') as HTMLInputElement;
    this.showFieldPlotCheckbox = document.getElementById('show-field-plot') as HTMLInputElement;
    this.inputPointRadius = document.getElementById('input-point-radius') as HTMLInputElement;
    this.updateFieldPlotBtn = document.getElementById('btn-update-field-plot') as HTMLButtonElement;

    this.fieldPlotCanvas = document.getElementById('field-plot-canvas') as HTMLCanvasElement;
    this.fieldPlotCtx = this.fieldPlotCanvas.getContext('2d')!;

    this.validationDiv = document.getElementById('validation-messages') as HTMLElement;

    // Populate presets
    for (let i = 0; i < PRESETS.length; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = PRESETS[i].name;
      this.presetSelect.appendChild(opt);
    }

    // Initial kernel params
    this.updateKernelParamsUI();
  }

  // =============================================================================
  // Event Binding
  // =============================================================================

  private bindEvents(): void {
    this.runBtn.addEventListener('click', () => this.callbacks.onRun());
    this.pauseBtn.addEventListener('click', () => this.callbacks.onPause());
    this.stepBtn.addEventListener('click', () => this.callbacks.onStep());
    this.resetBtn.addEventListener('click', () => this.callbacks.onReset());
    this.applyBtn.addEventListener('click', () => this.handleApply());

    this.presetSelect.addEventListener('change', () => this.handlePresetChange());
    this.kernelTypeSelect.addEventListener('change', () => this.updateKernelParamsUI());

    this.updateFieldPlotBtn.addEventListener('click', () => this.callbacks.onUpdateFieldPlot());

    // Import/Export
    document.getElementById('btn-export')!.addEventListener('click', () => this.handleExport());
    document.getElementById('btn-import')!.addEventListener('click', () => {
      (document.getElementById('import-file') as HTMLInputElement).click();
    });
    document.getElementById('import-file')!.addEventListener('change', (e) => this.handleImport(e));
  }

  // =============================================================================
  // Kernel Params UI
  // =============================================================================

  private updateKernelParamsUI(): void {
    const type = this.kernelTypeSelect.value as KernelConfig['type'];
    let html = '';

    switch (type) {
      case 'exp':
        html = `
          <div class="ui-row"><label>A</label><input type="number" id="kernel-A" step="0.1" value="1.0"></div>
          <div class="ui-row"><label>λ</label><input type="number" id="kernel-lambda" step="0.01" value="0.18"></div>
        `;
        break;
      case 'gaussian':
        html = `
          <div class="ui-row"><label>A</label><input type="number" id="kernel-A" step="0.1" value="1.0"></div>
          <div class="ui-row"><label>σ</label><input type="number" id="kernel-sigma" step="0.01" value="0.15"></div>
        `;
        break;
      case 'softPower':
        html = `
          <div class="ui-row"><label>A</label><input type="number" id="kernel-A" step="0.1" value="1.0"></div>
          <div class="ui-row"><label>p</label><input type="number" id="kernel-p" step="0.1" value="2.0"></div>
          <div class="ui-row"><label>ε</label><input type="number" id="kernel-eps" step="0.001" value="0.01"></div>
        `;
        break;
      case 'hardCoreExp':
        html = `
          <div class="ui-row"><label>A</label><input type="number" id="kernel-A" step="0.1" value="1.0"></div>
          <div class="ui-row"><label>λ</label><input type="number" id="kernel-lambda" step="0.01" value="0.18"></div>
          <div class="ui-row"><label>d₀</label><input type="number" id="kernel-d0" step="0.01" value="0.05"></div>
        `;
        break;
      case 'custom':
        html = `
          <div class="ui-row"><label>Expression f(d)</label></div>
          <textarea id="custom-expr" class="custom-expr-input" placeholder="e.g., A * exp(-d / lambda)"></textarea>
          <div id="custom-expr-validation" class="expr-validation"></div>
          <div class="ui-row"><label>A</label><input type="number" id="kernel-A" step="0.1" value="1.0"></div>
          <div class="ui-row"><label>λ</label><input type="number" id="kernel-lambda" step="0.01" value="0.18"></div>
          <div class="ui-row"><label>σ</label><input type="number" id="kernel-sigma" step="0.01" value="0.15"></div>
          <div class="ui-row"><label>p</label><input type="number" id="kernel-p" step="0.1" value="2.0"></div>
          <div class="ui-row"><label>ε</label><input type="number" id="kernel-eps" step="0.001" value="0.01"></div>
          <div class="ui-row"><label>d₀</label><input type="number" id="kernel-d0" step="0.01" value="0.05"></div>
          <div class="expr-help">Supported: +, -, *, /, ^, sqrt, exp, log, sin, cos, abs, min, max<br>Variables: d, A, lambda, sigma, p, eps, d0</div>
        `;
        break;
    }

    this.kernelParamsDiv.innerHTML = html;

    // Get new references
    this.inputKernelA = document.getElementById('kernel-A') as HTMLInputElement;
    this.inputKernelLambda = document.getElementById('kernel-lambda') as HTMLInputElement;
    this.inputKernelSigma = document.getElementById('kernel-sigma') as HTMLInputElement;
    this.inputKernelP = document.getElementById('kernel-p') as HTMLInputElement;
    this.inputKernelEps = document.getElementById('kernel-eps') as HTMLInputElement;
    this.inputKernelD0 = document.getElementById('kernel-d0') as HTMLInputElement;
    this.customExprTextarea = document.getElementById('custom-expr') as HTMLTextAreaElement;
    this.customExprValidation = document.getElementById('custom-expr-validation') as HTMLElement;

    // Bind custom expression validation
    if (this.customExprTextarea) {
      this.customExprTextarea.addEventListener('input', () => this.validateCustomExpr());
    }

    // Populate from current config if matching type
    if (this.currentConfig.kernel.type === type) {
      this.populateKernelParamsFromConfig(this.currentConfig.kernel);
    }
  }

  private validateCustomExpr(): void {
    if (!this.customExprTextarea || !this.customExprValidation) return;
    const expr = this.customExprTextarea.value.trim();
    if (!expr) {
      this.customExprValidation.textContent = '';
      this.customExprValidation.className = 'expr-validation';
      return;
    }
    const error = validateExpression(expr);
    if (error) {
      this.customExprValidation.textContent = `Error: ${error}`;
      this.customExprValidation.className = 'expr-validation error';
    } else {
      this.customExprValidation.textContent = 'Valid ✓';
      this.customExprValidation.className = 'expr-validation valid';
    }
  }

  // =============================================================================
  // Populate UI from Config
  // =============================================================================

  private populateUIFromConfig(cfg: SimConfig): void {
    this.inputR.value = String(cfg.R);
    this.inputV.value = String(cfg.v);
    this.inputDt.value = String(cfg.dt);
    this.inputMaxR.value = String(cfg.maxR);
    this.inputAngleSamples.value = String(cfg.angleSamples);
    this.inputTotalPrimordia.value = String(cfg.totalPrimordia);
    this.inputBatchSize.value = String(cfg.batchSize);

    this.kernelTypeSelect.value = cfg.kernel.type;
    this.updateKernelParamsUI();
    this.populateKernelParamsFromConfig(cfg.kernel);

    this.noiseEnabledCheckbox.checked = cfg.noise.enabled;
    this.inputNoiseSigma.value = String(cfg.noise.sigmaThetaDeg);
    this.inputNoiseSeed.value = String(cfg.noise.seed);

    this.showRingCheckbox.checked = cfg.render.showRing;
    this.showMetricsCheckbox.checked = cfg.render.showMetrics;
    this.showFieldPlotCheckbox.checked = cfg.render.showFieldPlot;
    this.inputPointRadius.value = String(cfg.render.pointRadius);
  }

  private populateKernelParamsFromConfig(kernel: KernelConfig): void {
    switch (kernel.type) {
      case 'exp':
        if (this.inputKernelA) this.inputKernelA.value = String(kernel.A);
        if (this.inputKernelLambda) this.inputKernelLambda.value = String(kernel.lambda);
        break;
      case 'gaussian':
        if (this.inputKernelA) this.inputKernelA.value = String(kernel.A);
        if (this.inputKernelSigma) this.inputKernelSigma.value = String(kernel.sigma);
        break;
      case 'softPower':
        if (this.inputKernelA) this.inputKernelA.value = String(kernel.A);
        if (this.inputKernelP) this.inputKernelP.value = String(kernel.p);
        if (this.inputKernelEps) this.inputKernelEps.value = String(kernel.eps);
        break;
      case 'hardCoreExp':
        if (this.inputKernelA) this.inputKernelA.value = String(kernel.A);
        if (this.inputKernelLambda) this.inputKernelLambda.value = String(kernel.lambda);
        if (this.inputKernelD0) this.inputKernelD0.value = String(kernel.d0);
        break;
      case 'custom':
        if (this.customExprTextarea) this.customExprTextarea.value = kernel.expr;
        if (this.inputKernelA) this.inputKernelA.value = String(kernel.params.A);
        if (this.inputKernelLambda) this.inputKernelLambda.value = String(kernel.params.lambda);
        if (this.inputKernelSigma) this.inputKernelSigma.value = String(kernel.params.sigma);
        if (this.inputKernelP) this.inputKernelP.value = String(kernel.params.p);
        if (this.inputKernelEps) this.inputKernelEps.value = String(kernel.params.eps);
        if (this.inputKernelD0) this.inputKernelD0.value = String(kernel.params.d0);
        this.validateCustomExpr();
        break;
    }
  }

  // =============================================================================
  // Read Config from UI
  // =============================================================================

  private readConfigFromUI(): SimConfig {
    const type = this.kernelTypeSelect.value as KernelConfig['type'];
    let kernel: KernelConfig;

    const getNum = (el: HTMLInputElement | null, fallback: number): number => {
      if (!el) return fallback;
      const v = parseFloat(el.value);
      return isNaN(v) ? fallback : v;
    };

    switch (type) {
      case 'exp':
        kernel = {
          type: 'exp',
          A: getNum(this.inputKernelA, 1),
          lambda: getNum(this.inputKernelLambda, 0.18)
        };
        break;
      case 'gaussian':
        kernel = {
          type: 'gaussian',
          A: getNum(this.inputKernelA, 1),
          sigma: getNum(this.inputKernelSigma, 0.15)
        };
        break;
      case 'softPower':
        kernel = {
          type: 'softPower',
          A: getNum(this.inputKernelA, 1),
          p: getNum(this.inputKernelP, 2),
          eps: getNum(this.inputKernelEps, 0.01)
        };
        break;
      case 'hardCoreExp':
        kernel = {
          type: 'hardCoreExp',
          A: getNum(this.inputKernelA, 1),
          lambda: getNum(this.inputKernelLambda, 0.18),
          d0: getNum(this.inputKernelD0, 0.05)
        };
        break;
      case 'custom':
        kernel = {
          type: 'custom',
          expr: this.customExprTextarea?.value || 'A * exp(-d / lambda)',
          params: {
            A: getNum(this.inputKernelA, 1),
            lambda: getNum(this.inputKernelLambda, 0.18),
            sigma: getNum(this.inputKernelSigma, 0.15),
            p: getNum(this.inputKernelP, 2),
            eps: getNum(this.inputKernelEps, 0.01),
            d0: getNum(this.inputKernelD0, 0.05)
          }
        };
        break;
    }

    return {
      R: getNum(this.inputR, 1),
      v: getNum(this.inputV, 0.02),
      dt: getNum(this.inputDt, 1),
      maxR: getNum(this.inputMaxR, 3),
      angleSamples: Math.floor(getNum(this.inputAngleSamples, 720)),
      totalPrimordia: Math.floor(getNum(this.inputTotalPrimordia, 600)),
      batchSize: Math.floor(getNum(this.inputBatchSize, 30)),
      kernel,
      noise: {
        enabled: this.noiseEnabledCheckbox.checked,
        sigmaThetaDeg: getNum(this.inputNoiseSigma, 2),
        seed: Math.floor(getNum(this.inputNoiseSeed, 12345))
      },
      render: {
        showRing: this.showRingCheckbox.checked,
        showMetrics: this.showMetricsCheckbox.checked,
        showFieldPlot: this.showFieldPlotCheckbox.checked,
        pointRadius: getNum(this.inputPointRadius, 2.5)
      }
    };
  }

  // =============================================================================
  // Handlers
  // =============================================================================

  private handleApply(): void {
    const cfg = this.readConfigFromUI();
    const result = validateConfig(cfg);

    this.showValidation(result);

    if (!result.valid) {
      return;
    }

    // Check for stress test warning
    const preset = PRESETS.find(p => p.isStressTest && cfg.totalPrimordia >= 10000);
    if (preset) {
      if (!confirm('This configuration may cause performance issues. Continue?')) {
        return;
      }
    }

    this.currentConfig = cfg;

    // Update URL hash
    window.location.hash = encodeConfigToHash(cfg);

    this.callbacks.onApply(cloneConfig(cfg));
  }

  private handlePresetChange(): void {
    const idx = parseInt(this.presetSelect.value);
    const preset = PRESETS[idx];
    if (preset) {
      this.currentConfig = cloneConfig(preset.config);
      this.populateUIFromConfig(this.currentConfig);
    }
  }

  private handleExport(): void {
    const cfg = this.readConfigFromUI();
    const json = JSON.stringify(cfg, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'phyllotaxis-config.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  private handleImport(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const cfg = JSON.parse(reader.result as string) as SimConfig;
        const result = validateConfig(cfg);
        this.showValidation(result);

        if (result.valid) {
          this.currentConfig = cfg;
          this.populateUIFromConfig(cfg);
          this.callbacks.onApply(cloneConfig(cfg));
        }
      } catch (err) {
        this.showValidation({
          valid: false,
          errors: [`Invalid JSON: ${err}`],
          warnings: []
        });
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be imported again
    input.value = '';
  }

  // =============================================================================
  // Validation Display
  // =============================================================================

  private showValidation(result: ValidationResult): void {
    let html = '';

    for (const err of result.errors) {
      html += `<div class="validation-error">${err}</div>`;
    }
    for (const warn of result.warnings) {
      html += `<div class="validation-warning">${warn}</div>`;
    }

    this.validationDiv.innerHTML = html;
  }

  // =============================================================================
  // Public Methods
  // =============================================================================

  setRunning(running: boolean): void {
    this.runBtn.disabled = running;
    this.pauseBtn.disabled = !running;
  }

  getConfig(): SimConfig {
    return cloneConfig(this.currentConfig);
  }
}
