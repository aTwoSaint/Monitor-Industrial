export function createTemperatureAlert({ threshold, durationSeconds }) {
  return createSustainedAlert({
    metric: 'temperature',
    threshold,
    durationSeconds,
    direction: 'above',
    code: 'temperature-persistent',
    severity: 'critical',
    message: `Temperatura superior a ${threshold} °C durante ${durationSeconds} s`,
  });
}

export function createSustainedAlert({
  metric,
  threshold,
  durationSeconds,
  direction = 'above',
  code,
  severity = 'critical',
  message,
}) {
  if (!metric || !code || typeof message !== 'string'
    || !['above', 'below'].includes(direction)
    || !Number.isFinite(threshold)
    || !Number.isFinite(durationSeconds)
    || durationSeconds < 1) {
    throw new Error('La regla temporal debe tener parámetros válidos');
  }

  const startedAt = new Map();
  const durationMs = durationSeconds * 1000;

  const evaluate = (reading) => {
    const value = reading[metric];
    const exceeds = direction === 'above'
      ? value > threshold
      : value < threshold;

    if (!exceeds) {
      startedAt.delete(reading.machineId);
      return null;
    }

    const timestamp = Date.parse(reading.timestamp);
    const start = startedAt.get(reading.machineId) ?? timestamp;
    startedAt.set(reading.machineId, start);
    if (timestamp - start < durationMs) return null;

    return { code, severity, message };
  };

  evaluate.reset = () => startedAt.clear();
  return evaluate;
}
