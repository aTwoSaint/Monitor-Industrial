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


