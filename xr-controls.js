export function applyDeadzone(value, threshold = 0.16) {
  return Math.abs(value) > threshold ? value : 0;
}

export function nextScale(current, verticalAxis, dt) {
  return Math.max(0.5, Math.min(2, current * Math.exp(-verticalAxis * dt * 0.9)));
}

export function pressedEdge(current, previous) {
  return Boolean(current && !previous);
}
