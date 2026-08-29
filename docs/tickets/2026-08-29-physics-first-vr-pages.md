# Ticket: physics-first VR pages / interactive library

**Status:** SCOPING — not approved for implementation. Do not execute task-by-task.
This is a design record to revisit, not a plan. When a direction is chosen, promote the
relevant section into `docs/superpowers/plans/` as a proper plan with checkboxes.

**Opened:** 2026-08-29
**Context:** conversation analyzing two physics notes ("Standing-wave photon ≅ quantized
antisymmetric LCL mode" and the two-motor dipole-exchange note) against what
`rotating-field-machine.html` actually computes.

---

## 1. The framing that motivates all of this

### What the current VR scene actually is

`rotating-field-machine.html` renders a **magnetoquasistatic near-field of a rotating
dipole pair** — computed exactly, but occupying a very specific corner of
electrodynamics:

- No retardation. `blend()` (line 724) applies the field instantaneously. Implicitly kL ≪ 1.
- No boundaries. No cavity, no L, therefore no quantized k₀ = nπ/L.
- No quantization, nothing stochastic. One deterministic classical field realization.
- Coulomb gauge, ∇·A = 0 (verified to 4.7e-8 by `verify_fields.js` test 4).
- E is −∂A/∂t only; conductor surface charge dropped (stated at line 230).

### "Are we experiencing a photon?" — no, and the reason is the interesting part

The classical EM field is a **coherent state**, not a Fock state. The renderer draws
⟨α|Ê|α⟩ for |α|² enormous. A single photon has ⟨n|Ê|n⟩ = 0 identically, since Ê ∝ (â + â†)
and ⟨n|â|n⟩ = 0. **A one-photon state has no field pattern at all — only a variance.**
Rendering |1⟩ the way this page renders B would produce an empty scene.

You *can* visualize a photon, but the visualizable objects are probability/variance
objects — mode function |u(r)|², two-point correlation, Wigner function — never a field
arrow. Every arrow and flux line currently in the scene is the classical limit, i.e. the
limit where photon-number structure has been washed out. Note #1 §6 warns about exactly
this conflation; the current scene sits on the wrong side of it.

**What IS legitimately experienced:** the exchange potential. Grabbing a motor, moving it,
watching flux reconnect while U(t) updates *is* the ħ→0 limit of the one-photon-exchange
diagram. But "virtual photon" names a term in a perturbation series, not an object in the
scene. There is no photon in the gap — there is a near field whose perturbative expansion
has one photon in it. And because there is no retardation, what is felt is the
instantaneous Coulomb-gauge piece, which in QED is the gauge-artifact half, cancelled
against the transverse piece. The propagating part is exactly what is missing.

**Why it is not a gluon, experientially:** right now the flux *spreads* — 1/r³ fan-out,
most lines closing through free space, a fraction threading the far machine. That
spreading is the entire visual character of the scene. A self-interacting field collapses
it into a tube of constant cross-section, with U(D) linear in D instead of 1/D³. In a
headset that difference is immediate: pull the sources apart and the connection does not
fade, it stretches at constant tension until it snaps and pair-produces. Not a parameter
tweak — a different solver.

### The organizing idea

The repo sits at the **origin of a two-axis space**, and each axis is physics it lacks:

|  | no self-interaction | self-interaction |
|---|---|---|
| **instantaneous** | current page (near-zone dipole pair) | flux tube / confinement (page D) |
| **retarded** | radiation, cavity, photons (pages A, B, C) | — (out of scope) |

Every candidate page below is a step along one of those axes.

---

## 2. Architectural invariant — protect this

Every field on the machine page is stored as **two real quadrature grids** and animated by
a linear blend:

```js
// rotating-field-machine.html:724
function blend(c, s) { ... B[i] = c*Bc[i] + s*Bs[i]; }   // c = cos ωt, s = sin ωt
```

This is *the* thing that makes precompute-then-blend possible, and it is why the page hits
VR framerate at all: the expensive Biot–Savart integral runs once, and every frame is a
scalar multiply-add over cached grids. It is also, not coincidentally, the classical
avatar of mode quadratures — `Bc ± i·Bs` are the ±helicity channels.

**Which candidate pages preserve it:**

- **Page A (retardation): YES.** At fixed ω the retarded field is still
  Re[B̃(r)e^{−iωt}] = cos(ωt)·Re B̃ + sin(ωt)·Im B̃ — still exactly two real grids.
  `blend()`, the trilinear sampler, and the whole field-line tracer are unchanged.
  Only the kernel becomes complex. **This is the single most important finding in this
  ticket.** It makes page A cheap.
- **Page B (cavity): YES.** A cavity mode is monochromatic.
- **Page C (Fock/coherent): N/A.** Not a field animation.
- **Page D (flux tube): NO.** The vortex is nonlinear and static. This is a genuine
  architectural fork and must be treated as such — it cannot share the pipeline.

---

## 3. Candidate pages

### Page A — Retarded field / radiation zone  ← recommended first

**What you'd see.** Near-field loops close locally; beyond r ~ c/ω they pinch off and
propagate outward. The rotating-dipole shedding animation, interactive, in VR. This
basically does not exist in good interactive form anywhere.

**Physics.** For harmonic drive I(t) = Re[Î e^{−iωt}], the retarded vector potential is

    A(r) = (μ₀/4π) ∫ Î e^{ik|r−r′|}/|r−r′| dl′,   k = ω/c

**Implementation options (decide before starting):**

1. *Cheap and probably sufficient:* keep the near grid as-is and make `sampleFar`
   (line 747) the **full retarded rotating point dipole**. Detachment happens at
   r ~ c/ω, which is outside the machine anyway, so the near grid barely matters.
   The repo already uses exactly this near-grid/far-dipole hybrid.
2. *Expensive and exact:* retarded quadrature inside `fieldA`/`fieldB`. The current
   closed-form straight-segment log formula has no elementary analogue with the e^{ikR}
   factor, so this needs Gauss–Legendre per segment with refinement near the observation
   point. Precompute cost goes from ~186 closed-form evals per grid point to ~186·N_q.

**Formulas to use (magnetic-dipole duals of Jackson 9.18/9.19 — VERIFY NUMERICALLY,
sign and μ₀ conventions vary):**

    B = (μ₀/4π)[ k²(n̂ × m) × n̂ · e^{ikr}/r  +  (3n̂(n̂·m) − m)(1/r³ − ik/r²) e^{ikr} ]
    E = −(μ₀ c k²/4π)(n̂ × m) · (e^{ikr}/r)(1 − 1/(ikr))

with complex m; rotating dipole is m = m₀(x̂ + iŷ).

**New UI parameter.** A λ/D (or kR_bore) slider from ∞ → ~1. At the quasistatic end it
must reproduce the current page exactly — that is a regression test, not just a nicety.

**Verification (`verify_retarded.js`, matching repo culture):**
- k→0 reproduces the existing static `sampleFar` dipole to ~1e-10
- ∇·B = 0 at finite k
- **∇×B = μ₀ε₀ ∂E/∂t** — the Ampère–Maxwell displacement-current term. This is a *new*
  Maxwell constraint the current page structurally cannot test.
- ⟨S⟩ through a sphere is radius-independent in the far zone, and matches the Larmor
  result for a rotating dipole (two orthogonal linear dipoles in quadrature → factor 2)
- the existing "flux loops closed" readout should *fall* as λ/D decreases — nice
  continuity with existing UI, and a good visual invariant

**Gotcha.** `squash()` (display-only radial log compression, r₀ = 3.5) will fight this
page directly: the whole point is structure at r ~ λ, which is exactly where squash kicks
in. Needs a per-page rethink, possibly disabled or re-centered on λ.

**Effort.** Option 1: small, roughly a day including verification. Option 2: multi-day.

**Closes.** Nothing in the notes directly, but unlocks B and C.

---

### Page B — Conducting cavity / standing wave

**What you'd see.** k₀ = nπ/L quantization, E-antinode vs B-antinode at center, the 90°
time phase between W_E and W_B. This is note #1 §1, and the last row of its §4 table,
made spatial.

**Two framings (decide):**

1. *Machine-in-a-box.* Source between two conducting planes, image-dipole series.
   Note: for a PEC, magnetic-dipole images go the **opposite** way from electric-dipole
   images (parallel m → parallel image; perpendicular m → antiparallel). **Verify this,
   do not assume** — check B_normal = 0 and E_tangential = 0 on the walls numerically.
2. *Bare cavity mode.* Skip the machine. Render mode functions directly: E ∝ sin/cos(k₀z),
   B in quadrature, with n dialable. Cheaper, and it is the actual object of note #1 §1 —
   the machine becomes an optional probe placed inside.

Recommendation leans to (2) for fidelity to the note; (1) is better continuity with the
existing page.

**Verification.** E_t = 0 and B_n = 0 on walls; ∮W_E = ∮W_B over a cycle; 90° time phase;
k₀L = nπ to machine precision.

**Effort.** Moderate, builds directly on A.

---

### Page C — Coherent vs Fock vs vacuum  ("what am I actually looking at")

**What you'd see.** One cavity mode rendered three ways, with a toggle:
- **coherent |α⟩** — a definite oscillating field pattern (what every page shows today)
- **Fock |n⟩** — arrows all identically zero, replaced by a variance shell / volumetric
  fuzz with intensity ∝ (n + ½)|u(r)|²
- **vacuum |0⟩** — the same, at n = 0: the irreducible fuzz

The toggle is the entire pedagogical payload: watch the arrows vanish while the fuzz
brightens. It makes "you are not looking at a photon" visceral.

**Panels (2D, alongside the 3D view):**
- **Wigner αβ plane** — vacuum = unit disk, |n⟩ = ring of radius √(2n+1) with negative
  center, |α⟩ = displaced disk. Labeled explicitly as the Wigner plane.
- **Poincaré αβ plane** — the classical Clarke Lissajous. Labeled explicitly, and
  visually distinguished from the Wigner panel. This *is* note #1 §6's anti-conflation
  point, and the reason both panels must be on screen simultaneously.
- **Photon-number distribution** — coherent = Poisson(|α|²), Fock = δ, thermal = geometric.
- **Binomial momentum partition** — P(j) = C(n,j)/2ⁿ at n = 1, 4, 16 with the ħk₀√n
  envelope. This is literally figure (a) that note #1 asked for; this page absorbs it.

**Physics.** No field solver. Wigner function of |n⟩ is
W_n(α) = (2/π)(−1)ⁿ L_n(4|α|²) e^{−2|α|²}.

**Verification.** ∫W = 1; ⟨n̂⟩ and ⟨n̂²⟩ moments; binomial variance = n (note #1 §3's
ΔP = ħk₀√n).

**Effort.** Low-to-moderate. Mostly 2D canvas panels plus one volumetric shader. No new
solver. Cheapest of the four and the most pointed.

---

### Page D — Flux tube / confinement contrast

**What you'd see.** Side-by-side, same grab interaction, live U readout: abelian field
(1/r³, spreading, U ~ 1/D³) beside a vortex (constant cross-section tube, U ~ σD). In VR,
pull the sources apart and feel the difference. This is the page that pays off
*specifically* in VR, because it is about distance intuition.

**Physics.** Dual-superconductor / abelian Higgs (Nielsen–Olesen) vortex. Complex scalar
φ = v f(ρ)e^{iθ} plus gauge profile a(ρ), from the 1D radial ODE system; string tension
σ ~ πv² ln κ at large κ. Two-source setup is a monopole–antimonopole pair joined by one
vortex line, U(D) = σD + const.

**Honest-labeling requirement.** This is an *effective model* of confinement — the abelian
projection. No color, no three-ness, no explicit gluon self-coupling. The repo has a
strong culture of a "What this model does not include" panel (line 230); this page needs
the loudest one yet, or it will overclaim.

**Effort.** High. New solver (1D ODE profile + 3D placement + new UI), and it breaks the
two-quadrature pipeline.

---

### Small item, independent of all of the above

**αβ Lissajous scope on the existing page.** Third scope panel beside `scI`/`scU`. Data is
already present in `MOM[i].mc/.ms`. The collapse across the three modes is:

- `parallel`: m_A + m_B = 2m₀(cos ωt, sin ωt) → **circle**, radius 2m₀
- `antiphase`: m_A + m_B ≡ 0 → **a point**
- `negseq`: m_A + m_B = 2m₀ cos ωt · x̂ → **a line**; and m_A − m_B = 2m₀ sin ωt · ŷ

~1 hour. Closes the one row of note #1 §4's table the page can already support.

---

## 4. Game / interactive-library ambition — open questions

Deliberately unresolved. These should be settled *before* page 3 of whatever gets built,
not after page 6.

- **Unit of work: page or engine?** Current architecture is deliberately zero-dependency,
  self-contained HTML per page, vendored Three, no build step. A "library" implies
  extracting `field-kernels.js` + `xr-controls.js` + the scene/rail scaffold into a shared
  core. That is a real refactor with real cost, and doing it late is much worse than doing
  it early or never.
- **What is the verb?** Today the only verb is *grab and place*. Candidates: tune a
  parameter to hit a target (resonance-finding), separate sources until something breaks
  (flux-tube snap), match a measured pattern by adjusting phases (sequence identification).
  Worth noting that grab-and-place already yields a genuine physics loop on page A: move
  the source, watch loops detach.
- **Game or sandbox?** Is there a scoring/objective layer at all? "Physics-first VR game"
  and "interactive library" fork here and pull the UI in opposite directions.
- **Audience.** Teaching (guardrails, guided sequence, correctness-first) vs. exploration
  (freedom, no rails). Also opposite pulls.
- **Non-VR parity.** Current pages work fully on desktop. Does the game? If yes, the verb
  has to survive mouse input.
- **Perf budget.** The current page already degrades seeds in XR
  (`renderer.xr.isPresenting ? Math.min(S.nSeed, 15)`). Any shared engine needs that
  discipline built in, not bolted on.
- **Units.** Repo normalizes μ₀IN/4π = 1, R_bore = 1. Retardation introduces a second
  scale (k, or λ/R_bore). A library needs one normalization convention stated once,
  surfaced in each page's header sub-line as the existing pages do.

---

## 5. Findings from this session worth preserving

Discrepancies found between the two physics notes and what the repo actually computes.
`verify_fields.js` already encodes all three; recording them so they are not re-litigated.

1. **U(t) is not constant.** The two-motor note claims U = −(μ₀/4π)·2m₀²/D³ constant for
   parallel moments. Actual: U = û(1 − 3cos²ωt) = û(−½ − 1.5 cos 2ωt). The note's −2û is
   the instantaneous value at ωt = 0 only. The pair is attractive *on cycle average* but
   goes **repulsive** for |cos ωt| < 1/√3. `verify_fields.js:232-257` prints:

   ```
   parallel             U in [-2.000,  1.000]  mean -0.500
   anti-phase           U in [-1.000,  2.000]  mean  0.500
   reversed sequence    U in [-2.000, -1.000]  mean -1.500
   -> U is NOT constant in any mode; it ripples at 2*omega.
   ```

2. **Sequence reversal ≠ polarity reversal.** The note says "reverse B's phase sequence"
   to get m_B → −m_B. Sequence reversal is `negseq` (counter-rotation); polarity reversal
   is `antiphase`. The repulsive case is `antiphase` (mean +0.5û). `negseq` is mean
   **−1.5û** — three times more deeply bound than parallel, and uniquely **never
   repulsive at any phase**. See `machineList()` at line 320.

3. **The bore-field expression drops a term.** The note's `B_bore` keeps only ê_r and ê_z.
   The actual interior field is *uniform transverse*, so B_θ/B_r = −tan(θ − ωt).
   Measured −0.835 vs −0.842 predicted, `verify_fields.js:118-145`.

4. **Two different Z₂ involutions, conflated in note #1 §4.** The note maps the 180°-offset
   state (I₂ = −I₁) to the antisymmetric eigenvector (â₊ − â₋)/√2. But â₊/â₋ are the two
   ±momentum channels of *one* resonator, whereas the 180° offset is antisymmetry under
   exchange of the *two ports*. In the machine these are distinct:
   `parallel`/`antiphase` are the ±1 eigenvectors of **port exchange**; `negseq` is a
   **helicity flip**. The standing wave is `negseq` — its port-sum is the cosine standing
   wave (â_s) and its port-difference the sine standing wave (â_a), both present at once.
   The note assigned it to the wrong button.

5. **§7's symmetry argument is stronger than needed for the first moment.** ⟨τ_z⟩ = 0 in
   *all three* modes, because U is a single-frequency periodic function of drive angle —
   periodicity, not exchange symmetry. What the Z₂ label actually controls is the
   **second** moment: ripple amplitude 1.5û (parallel) vs 0.5û (negseq), a factor of 3.

6. **The U(1) claim is confirmed architecturally.** `packSegments` concatenates both
   machines into one Biot–Savart integral, `blend` linearly scales cached grids, and
   `sampleFar` (line 747) is a bare `for (const M of MOM)` sum. There is no term anywhere
   coupling B_A to B_B — that absence *is* the U(1) statement. A non-abelian analogue
   needs the field to source itself, which destroys precompute-then-blend entirely, since
   superposition is the only reason that caching is valid.

---

## 6. Recommended first increment (if/when this is picked up)

**Page A option 1 (retarded `sampleFar`) + the αβ scope.** Rationale: the retarded kernel
is a contained change to one function, the two-quadrature architecture survives untouched,
it adds the single most conspicuous missing physics, and it unlocks B and C. The αβ scope
is an hour and closes a note table row today.

**Then page C**, as the standalone that actually answers "what am I looking at" — and
which needs no field solver at all.

Defer the library/engine refactor decision until at least one new page exists, but do not
defer it past two.

---

## 7. References

- `rotating-field-machine.html` — lines 320 (`machineList`), 724 (`blend`), 747
  (`sampleFar`), 975 (`Ufn`), 993 (`meanInteractionEnergy`), 223 (2ω note), 230
  (exclusions panel)
- `field-kernels.js` — `fieldB`, `fieldA`, exact finite-segment closed forms
- `verify_fields.js` — 35 closed-form checks; tests 2 and 7 carry the note discrepancies
- `docs/superpowers/plans/2026-08-28-delta-wye-transformer.md` — prior plan, for format
- Source notes: "Standing-wave photon ≅ quantized antisymmetric LCL mode" and the
  two-motor dipole-exchange note (conversation, 2026-08-29)
- Blais et al., *Rev. Mod. Phys.* 2021 — cQED treatment cited by note #1 §5
