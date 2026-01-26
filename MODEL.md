# Phyllotaxis Inhibition-Field Model

## Overview

This simulator implements a **geometric inhibition-field model** for phyllotaxis — the arrangement of leaves, seeds, or other organs around a plant stem. The model explains why many plants exhibit Fibonacci spiral patterns (13, 21, 34, 55... spirals) through a simple local optimization process.

---

## Core Concept

New primordia (organ precursors) are born on a circular **active ring** at the apex of a growing shoot. Each existing primordium emits an **inhibitory field** that repels new growth. A new primordium appears at the angle where total inhibition is **minimal**.

As the plant grows, older primordia **drift outward** (radially), weakening their influence. This drift + inhibition dynamic naturally produces the golden angle divergence (~137.5°) and Fibonacci spiral counts.

---

## Model Components

### 1. Geometry

| Parameter | Symbol | Description |
|-----------|--------|-------------|
| Active ring radius | `R` | Fixed radius where new primordia are born |
| Radial drift velocity | `v` | How fast primordia move outward per time step |
| Time step | `dt` | Simulation time increment |
| Maximum radius | `maxR` | Primordia beyond this are ignored (inactive) |

### 2. Primordium State

Each primordium stores:
- **r** — current radial distance (increases over time due to drift)
- **θ** — birth angle (immutable)
- **cos(θ), sin(θ)** — cached trigonometric values for performance

### 3. Inhibition Field

The total field at a candidate angle θ on the active ring is:

```
F(θ) = Σ K(dᵢ)   for all i ∈ active
```

where:
- **dᵢ** = Euclidean distance from candidate point (R, θ) to primordium i
- **K(d)** = kernel function (inhibition strength vs distance)

### 4. Placement Rule

```
θ* = argmin F(θ)   over θ ∈ [0, 2π)
```

The simulator samples `angleSamples` discrete candidates, finds the minimum, then applies **parabolic refinement** for sub-sample precision.

---

## Fibonacci (Default) Preset

### Parameters

```typescript
{
  R: 1.0,              // active ring radius
  v: 0.02,             // drift velocity
  dt: 1.0,             // time step
  maxR: 3.0,           // cutoff radius for active set
  angleSamples: 720,   // angular resolution (0.5° steps)
  totalPrimordia: 1000, // total organs to generate
  batchSize: 30,       // steps per animation frame

  kernel: {
    type: 'exp',       // exponential decay kernel
    A: 1.0,            // amplitude
    lambda: 0.18       // decay length scale
  },

  noise: {
    enabled: false,    // no stochastic perturbation
    sigmaThetaDeg: 2.0,
    seed: 12345
  }
}
```

### Kernel Function

**Exponential decay:**

```
K(d) = A · exp(-d / λ)
```

With `A = 1.0` and `λ = 0.18`:

| Distance d | Inhibition K(d) |
|------------|-----------------|
| 0.00       | 1.000           |
| 0.10       | 0.574           |
| 0.18       | 0.368 (1/e)     |
| 0.30       | 0.189           |
| 0.50       | 0.062           |

The parameter **λ = 0.18** controls the "reach" of inhibition:
- Smaller λ → tighter packing, more primordia fit in active zone
- Larger λ → sparser arrangement, fewer simultaneous competitors

### Why λ = 0.18?

This value is tuned so that:
1. Multiple primordia (typically 5–8) remain "active" (within maxR) at any time
2. Their inhibition fields overlap enough to create a single clear minimum
3. The resulting divergence angle converges to **~137.5°** (golden angle)

---

## Algorithm (Step-by-Step)

```
1. DRIFT: For each primordium, r += v * dt

2. UPDATE ACTIVE SET:
   - Skip primordia with r > maxR (they've drifted too far)
   - Build arrays of (x, y) coordinates for active primordia

3. EVALUATE FIELD:
   For each candidate angle θᵢ (i = 0..angleSamples-1):
     - Compute candidate point: (R·cos(θᵢ), R·sin(θᵢ))
     - Sum kernel contributions from all active primordia
     - Record F(θᵢ)

4. FIND MINIMUM:
   - Find discrete index i_min with lowest F
   - Parabolic refinement using neighbors F[i-1], F[i], F[i+1]
   - Compute refined angle θ*

5. ADD PRIMORDIUM:
   - Create new primordium at (R, θ*)
   - Cache cos(θ*), sin(θ*)

6. REPEAT until totalPrimordia reached
```

---

## Expected Output

With the Fibonacci preset:

| Metric | Expected Value |
|--------|----------------|
| Mean divergence angle | ~137.5° ± 0.5° |
| Visible spirals (clockwise) | 13, 21, 34... |
| Visible spirals (counter-clockwise) | 8, 13, 21... |
| Standard deviation | < 1° (deterministic mode) |

The spiral counts are consecutive Fibonacci numbers because the golden angle (360° × (1 - 1/φ) ≈ 137.508°) is the "most irrational" angle — it maximally avoids alignment, distributing primordia optimally.

---

## Alternative Kernels

| Kernel | Formula | Behavior |
|--------|---------|----------|
| Exponential | `A·exp(-d/λ)` | Smooth decay, classic phyllotaxis |
| Gaussian | `A·exp(-d²/2σ²)` | Faster falloff, sharper boundaries |
| Soft Power | `A/(d^p + ε)` | Adjustable singularity at d→0 |
| Hard-Core Exp | `A·exp(-d/λ)` + exclusion for d < d₀ | Strict minimum spacing |
| Custom | User expression | Arbitrary formula via expr-eval |

---

## References

- Douady, S., & Couder, Y. (1996). "Phyllotaxis as a physical self-organized growth process"
- Mitchison, G. J. (1977). "Phyllotaxis and the Fibonacci series"
- Jean, R. V. (1994). "Phyllotaxis: A Systemic Study in Plant Morphogenesis"
