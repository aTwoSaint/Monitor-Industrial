const PROFILES = {
  'M-01': { temperature: 62, pressure: 6.5, vibration: 2.0 },
  'M-02': { temperature: 55, pressure: 4.2, vibration: 1.5 },
  'M-03': { temperature: 48, pressure: 4.5, vibration: 3.0 },
  'M-04': { temperature: 70, pressure: 5.0, vibration: 2.5 },
};
const DEFAULT_PROFILE = { temperature: 60, pressure: 5, vibration: 2 };

export const MACHINE_IDS = Object.keys(PROFILES);
export const FAULT_TYPES = ['overheat', 'vibration', 'pressure_drop', 'dropout'];
export const ALERT_THRESHOLDS = {
  temperature: { warning: 82, critical: 92 },
  pressure: { lowWarning: 3.2, lowCritical: 2.4, highWarning: 8.5 },
  vibration: { warning: 4.5, critical: 6 },
};

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

function getAlerts(reading) {
  const alerts = [];

  if (reading.machineState === 'Parada') {
    alerts.push({
      code: 'dropout',
      severity: 'critical',
      message: 'Máquina detenida',
    });
  }

  if (reading.temperature >= ALERT_THRESHOLDS.temperature.critical) {
    alerts.push({
      code: 'overheat',
      severity: 'critical',
      message: 'Temperatura crítica',
    });
  } else if (reading.temperature >= ALERT_THRESHOLDS.temperature.warning) {
    alerts.push({
      code: 'overheat',
      severity: 'warning',
      message: 'Temperatura elevada',
    });
  }

  if (reading.pressure <= ALERT_THRESHOLDS.pressure.lowCritical) {
    alerts.push({
      code: 'pressure_drop',
      severity: 'critical',
      message: 'Presión crítica',
    });
  } else if (reading.pressure <= ALERT_THRESHOLDS.pressure.lowWarning) {
    alerts.push({
      code: 'pressure_drop',
      severity: 'warning',
      message: 'Presión baja',
    });
  } else if (reading.pressure >= ALERT_THRESHOLDS.pressure.highWarning) {
    alerts.push({
      code: 'pressure',
      severity: 'warning',
      message: 'Presión elevada',
    });
  }

  if (reading.vibration >= ALERT_THRESHOLDS.vibration.critical) {
    alerts.push({
      code: 'vibration',
      severity: 'critical',
      message: 'Vibración crítica',
    });
  } else if (reading.vibration >= ALERT_THRESHOLDS.vibration.warning) {
    alerts.push({
      code: 'vibration',
      severity: 'warning',
      message: 'Vibración elevada',
    });
  }

  return alerts;
}

export function generateReading(machineId, previous, timestamp = Date.now(), random = Math.random) {
  const profile = PROFILES[machineId] ?? DEFAULT_PROFILE;
  const previousState = previous?.machineState ?? 'Operativa';
  let machineState = previousState;

  if (previousState === 'Parada') {
    if (random() < 0.35) machineState = 'Operativa';
  } else if (random() < 0.004) {
    machineState = 'Parada';
  }

  const drift = (value, range) => value + (random() - 0.5) * range;
  let temperature = drift(previous?.temperature ?? profile.temperature, 1.8);
  let pressure = drift(previous?.pressure ?? profile.pressure, 0.16);
  let vibration = drift(previous?.vibration ?? profile.vibration, 0.22);

  if (machineState === 'Parada') {
    temperature -= 0.4;
    vibration *= 0.82;
  } else {
    const fault = random();
    if (fault < 0.006) temperature += 24;
    else if (fault < 0.012) vibration += 3.4;
    else if (fault < 0.018) pressure -= 2.2;
  }

  const reading = {
    machineId,
    timestamp: new Date(timestamp).toISOString(),
    temperature: round(Math.max(0, temperature), 1),
    pressure: round(Math.max(0, pressure), 2),
    vibration: round(Math.max(0, vibration), 2),
    machineState,
  };
  reading.alerts = getAlerts(reading);
  reading.status = machineState === 'Parada'
    ? 'Parada'
    : reading.alerts.some((alert) => alert.severity === 'critical')
      ? 'Alarma'
      : reading.alerts.length
        ? 'Atención'
        : 'Operativa';

  return reading;
}
