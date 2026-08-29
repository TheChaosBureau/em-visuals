**Sources.** Two identical 2-pole machines at $\vec{r}_A = -\frac{D}{2}\hat{x}$, $\vec{r}_B = +\frac{D}{2}\hat{x}$, both axial along $\hat{z}$, length $L$, bore radius $R$.
**Currents.** Same balanced 3-phase supply, parallel polarity:
$$i_k(t) = I\cos!\bigl(\omega t - \tfrac{2\pi k}{3}\bigr), \qquad k = 0,1,2$$
**Magnetic moments** (Clarke transform applied to each machine):
$$\vec{m}_A(t) = \vec{m}_B(t) = m_0\bigl(\cos\omega t;\hat{x} + \sin\omega t;\hat{y}\bigr), \qquad m_0 = \tfrac{3}{2}NIR^2$$
where $N$ = turns per phase, $I$ = peak current.
**Interior bore field** (inside each machine, away from ends):
$$\vec{B}_{\text{bore}}^{(j)}(\theta,z,t) = g_j(z),B_0\cos(p\theta - \omega t);\hat{e}_r ;-; \frac{R}{p},g_j'(z),B_0\cos(p\theta - \omega t);\hat{e}_z$$
with $g_j(z)$ the axial envelope centered on machine $j$, and $g_j' = dg_j/dz$. First term is the working flux; second is forced by $\nabla\cdot\vec{B}=0$.
**Exterior field** (outside both machines, $|\vec{r}-\vec{r}_j| \gg R$). Each machine is a magnetic dipole:
$$\vec{B}_{\text{dip}}(\vec{r};,\vec{m},\vec{r}_0) = \frac{\mu_0}{4\pi}\Bigl[\frac{3(\vec{m}\cdot\hat{\rho})\hat{\rho} - \vec{m}}{|\vec{\rho}|^3}\Bigr], \qquad \vec{\rho} = \vec{r} - \vec{r}_0$$
**Total field everywhere** (superposition — Maxwell is linear):
$$\vec{B}(\vec{r},t) = \vec{B}^{(A)}(\vec{r},t) + \vec{B}^{(B)}(\vec{r},t)$$
where each $\vec{B}^{(j)}$ is the bore expression inside machine $j$'s volume and the dipole expression outside it.
**Constraints.** Satisfied by construction:
$$\nabla\cdot\vec{B} = 0 \quad\text{(the $B_z$ end-terms exist to enforce this)}$$
$$\nabla\times\vec{B} = \mu_0\vec{J} \quad\text{(Biot-Savart is the integral form of this)}$$
**Interaction energy** (what makes them "fit"):
$$U(t) = -\vec{m}_B \cdot \vec{B}^{(A)}(\vec{r}_B,t) = -\frac{\mu_0}{4\pi}\frac{2,m_0^2}{D^3}$$
For parallel moments this is **constant and negative** — the two rotating dipoles lock in mutual attraction at all times because their moments co-rotate. The $1/D^3$ is the dipole-dipole interaction; it's attractive when moments are parallel and collinear with the separation axis.
**Why the flux closes.** At the midplane $x=0$ between the machines, $\vec{B}^{(A)}$ and $\vec{B}^{(B)}$ are both pointing in the same transverse direction (both moments point the same way). Field lines leaving A's "N side" encounter B's "S side" directly across the gap and enter. The return path goes through B's bore, exits B's far side, arches through free space, and re-enters A's far side. Every field line closes — $\nabla\cdot\vec{B}=0$ guarantees it — and with two machines the closure is compact instead of going to infinity.
**Antiparallel variant.** Replace $\vec{m}_B \to -\vec{m}_B$ (reverse B's phase sequence). Then $U = +\frac{\mu_0}{4\pi}\frac{2m_0^2}{D^3}$ — positive, repulsive. A's N faces B's N; flux can't enter and diverts sideways. Same equations, sign flip, completely different topology.
---
This is the virtual _photon_ exchange analogue, precisely. And the reasons it's not the gluon analogue are structurally informative — they point at what the gluon analogue _would_ have to look like.
**Why this is photon exchange.**
The mediating field here is B, which is the classical limit of the U(1) photon field. The essential properties that make it photon-like:
- The B-field doesn't carry sequence charge. It couples _to_ currents that have sequence content, but the field itself is sequence-neutral. A photon couples to electric charge but doesn't carry electric charge.
- The sequence channels are **diagonal**. That's the whole point of Fortescue — the transform diagonalizes the coupling. Positive-sequence current makes positive-sequence flux. Negative makes negative. They don't mix. Each channel is an independent U(1).
- There's no field self-interaction. $\vec{B}^{(A)} + \vec{B}^{(B)}$ is just linear superposition. Photons pass through each other.
The two-motor interaction energy $U = -\mu_0 m_0^2/(2\pi D^3)$ is a textbook dipole-dipole potential, and its QED derivation is a single tree-level photon-exchange diagram. Nothing more.
