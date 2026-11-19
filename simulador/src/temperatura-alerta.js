export function createTemperatureAlert({ threshold, durationSeconds }) {
  if (!Number.isFinite(threshold) || !Number.isFinite(durationSeconds) || durationSeconds < 1) {
    throw new Error('El umbral y la duración de la alerta deben ser válidos');
  }

  const startedAt = new Map();
  const durationMs = durationSeconds * 1000;

  const evaluate = (reading) => {
    if (reading.temperature < threshold) {
      startedAt.delete(reading.machineId);
      return null;
    }

    const timestamp = Date.parse(reading.timestamp);
    const start = startedAt.get(reading.machineId) ?? timestamp;
    startedAt.set(reading.machineId, start);
    if (timestamp - start < durationMs) return null;

    return {
      code: 'temperature-persistent',
      severity: 'critical',
      message: `Temperatura superior a ${threshold} °C durante ${durationSeconds} s`,
    };
  };

  evaluate.reset = () => startedAt.clear();
  return evaluate;
}
