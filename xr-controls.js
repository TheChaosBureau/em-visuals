export function applyDeadzone(value, threshold = 0.16) {
  return Math.abs(value) > threshold ? value : 0;
}

export function nextScale(current, verticalAxis, dt) {
  return Math.max(0.5, Math.min(2, current * Math.exp(-verticalAxis * dt * 0.9)));
}

export function pressedEdge(current, previous) {
  return Boolean(current && !previous);
}

export function canGrab(owner, controllerId) {
  return owner == null || owner === controllerId;
}

export function beginGrab(owners, motorIndex, controllerId) {
  if (!Number.isInteger(motorIndex) || motorIndex < 0 || !canGrab(owners[motorIndex], controllerId)) return false;
  owners[motorIndex] = controllerId;
  return true;
}

export function endGrab(owners, motorIndex, controllerId) {
  if (owners[motorIndex] !== controllerId) return false;
  owners[motorIndex] = null;
  return true;
}
