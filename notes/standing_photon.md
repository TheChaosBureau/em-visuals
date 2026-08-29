## Standing-wave photon ≅ quantized antisymmetric LCL mode

**1. Two-mode setup**

A cavity of length $L$ with perfect conductors supports two independent traveling modes:

$$\hat{a}_+ : \text{photon at } +\hbar k_0, \qquad \hat{a}_- : \text{photon at } -\hbar k_0, \qquad k_0 = n\pi/L$$

with $[\hat{a}_\pm, \hat{a}_\pm^\dagger] = 1$, $[\hat{a}_+, \hat{a}_-^\dagger] = 0$. Form the symmetric/antisymmetric combinations:

$$\hat{a}_s = \tfrac{1}{\sqrt{2}}(\hat{a}_+ + \hat{a}_-), \qquad \hat{a}_a = \tfrac{1}{\sqrt{2}}(\hat{a}_+ - \hat{a}_-)$$

Both are independent canonical mode operators. $\hat{a}_s$ creates the cosine standing wave (E-antinode at center), $\hat{a}_a$ the sine standing wave (B-antinode at center).

**2. Single-photon standing-wave state**

$$|1\rangle_s = \hat{a}_s^\dagger|0\rangle = \tfrac{1}{\sqrt{2}}\big(|1_+, 0_-\rangle + |0_+, 1_-\rangle\big)$$

Bell-like in the $\pm k$ momentum basis. With $\hat{P} = \hbar k_0(\hat{n}_+ - \hat{n}_-)$:

$$\langle 1_s|\hat{P}|1_s\rangle = \tfrac{1}{2}(\hbar k_0 - \hbar k_0) = 0$$

$$\langle 1_s|\hat{P}^2|1_s\rangle = \tfrac{1}{2}\big((\hbar k_0)^2 + (\hbar k_0)^2\big) = \hbar^2 k_0^2$$

So $\Delta P = \hbar k_0$. The magnitude $|P|$ is sharp (one photon's worth), the sign is in superposition. Direction-of-flow has no answer for this state — not because of measurement disturbance, but because the state is not an eigenvector of $\hat{P}$.

**3. n-photon standing-wave state**

Binomial expansion of $(\hat{a}_+^\dagger + \hat{a}_-^\dagger)^n$ gives

$$|n\rangle_s = \frac{1}{2^{n/2}}\sum_{j=0}^{n}\sqrt{\binom{n}{j}},|j_+, (n-j)_-\rangle$$

The partition $j$ between left- and right-traveling photons is **Binomial$(n, \tfrac{1}{2})$**, and the momentum eigenvalue on each branch is $\hbar k_0(2j - n)$. Standard binomial moments:

$$\langle \hat{P}\rangle_n = 0, \qquad \langle \hat{P}^2\rangle_n = \hbar^2 k_0^2 \cdot n, \qquad \Delta P = \hbar k_0 \sqrt{n}$$

The $\sqrt{n}$ is the quantum random walk: each photon independently chooses left or right with equal amplitude, and total momentum is the sum of $n$ iid $\pm\hbar k_0$ Bernoulli variables. Same scaling as shot noise, vacuum fluctuations, and Hong-Ou-Mandel coincidence dips — all features of two-mode interference at a beamsplitter, which is exactly what the symmetric combination $\hat{a}_s$ is.

**4. Mapping to the LCL**

The two LCL ports play the role of the two traveling modes. The 180°-offset state has $\vec{I}_2 = -\vec{I}_1$, which is precisely the antisymmetric eigenvector $(\hat{a}_+ - \hat{a}_-)/\sqrt{2} = \hat{a}_a$ — the _sine_ standing wave.

|LCL classical observable|Quantized standing-wave observable|
|---|---|
|αβ current locus per port (circle)|Single traveling-mode quadrature (rotating)|
|αβ locus of port-summed currents (line)|Standing-mode quadrature (linear superposition)|
|Net active power $\langle p_{3\phi}\rangle$|$\langle\hat{P}\rangle = 0$|
|RMS reactive circulation $\sqrt{\langle q^2\rangle}$|$\sqrt{\langle\hat{P}^2\rangle} = \hbar k_0 \sqrt{n}$|
|Total stored energy|$\hbar\omega_0 \langle \hat{n}_+ + \hat{n}_-\rangle = n\hbar\omega_0$|
|C-bank voltage antinode|E-field antinode|
|L-bank current antinode|B-field antinode|
|90° time phase $W_C \leftrightarrow W_L$|$\tfrac{1}{2}\epsilon_0 E^2 \leftrightarrow \tfrac{1}{2\mu_0}B^2$|

The clean correspondence: **net flow ↔ first moment, circulation magnitude ↔ second moment**. The LCL Akagi $q$ is the classical avatar of $\Delta P$.

**5. Quantizing the LCL completes the entry**

Define canonical conjugates for the antisymmetric mode: $\hat{Q}_a$ (charge on the antisymmetric C bank), $\hat{\Phi}_a$ (flux through the antisymmetric L bank), with $[\hat{Q}_a, \hat{\Phi}_a] = i\hbar$. Construct

$$\hat{a}_a = \frac{1}{\sqrt{2\hbar}}\left(\sqrt{\frac{1}{C_a}},\hat{Q}_a \cdot \omega_0^{-1/2} + i \sqrt{\frac{1}{L_a}},\hat{\Phi}_a \cdot \omega_0^{-1/2}\right)\sqrt{\omega_0}$$

(modulo bookkeeping factors — the standard LC oscillator quantization). The Fock states $|n\rangle_a$ then have:

- $\langle\hat{Q}_a\rangle = \langle\hat{\Phi}_a\rangle = 0$ (Wigner function isotropic)
- $\langle\hat{Q}_a^2\rangle, \langle\hat{\Phi}_a^2\rangle \propto (n + \tfrac{1}{2})$ (vacuum + photon contributions)
- Same binomial partition statistics across the two LCL ports as the EM Fock state across $\pm k$ traveling modes

This is exactly cQED for a coplanar resonator — the Blais et al. _RMP_ 2021 review treats it formally.

**6. Two αβ planes — keep them distinct**

The αβ Lissajous of the _classical_ 3-phase currents (circular vs. linear) lives in the **Poincaré-sphere αβ plane** — it encodes helicity content / polarization state. The αβ of the _quantized mode quadratures_ (Gaussian disk for vacuum, ring for Fock, displaced disk for coherent) lives in the **Wigner-function αβ plane** — it encodes quantum statistics. The LCL captures the first immediately; quantizing it captures the second. Conflating them (which a lot of pop-science Bloch-sphere imagery does) makes the photon look more like an electron than it is.

**7. The structural payoff for the Rosetta program**

The reason no net power flows in either system is the same: **the state is the antisymmetric eigenvector of an exchange operator that flips the two helicity / momentum channels, and any helicity-odd observable (Poynting flux, $\hat{P}$, $\langle p_{3\phi}\rangle$) must vanish in expectation by symmetry alone**. No dynamics required. The Fortescue decomposition is the helicity decomposition; symmetric/antisymmetric combinations of positive and negative sequence are the standing-wave eigenmodes; the LCL with 180° offset is the minimal lumped-element realization. Quantizing the LCL gives you, _for free_, the binomial momentum-partition statistics of a standing-wave Fock state and the $\sqrt{n}$ shot-noise structure of two-mode interference.

That last sentence is the clean Rosetta entry.

---


Want a Plotly figure for the Quarto notebook showing (a) the binomial momentum distribution for $|n\rangle_s$ at $n = 1, 4, 16$ overlaid with the $\sqrt{n}$ envelope, and (b) the αβ Lissajous collapse from circle (single port) to line (180°-offset combination)?
