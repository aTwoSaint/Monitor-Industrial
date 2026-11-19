import test from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_THRESHOLDS, generateReading, MACHINE_IDS } from '../src/generador.js';

test('genera lecturas iniciales para todas las máquinas', () => {
  for (const machineId of MACHINE_IDS) {
    const reading = generateReading(machineId, undefined, 0, () => 0.5);

    assert.equal(reading.machineId, machineId);
    assert.equal(reading.timestamp, new Date(0).toISOString());
    assert.equal(reading.machineState, 'Operativa');
    assert.equal(reading.status, 'Operativa');
    assert.ok(reading.temperature > 0);
    assert.ok(reading.pressure > 0);
    assert.ok(reading.vibration > 0);
    assert.deepEqual(reading.alerts, []);
  }
});

test('marca como crítica una lectura que supera umbrales críticos', () => {
  const reading = generateReading('M-01', {
    temperature: ALERT_THRESHOLDS.temperature.critical + 2,
    pressure: ALERT_THRESHOLDS.pressure.lowCritical - 0.1,
    vibration: ALERT_THRESHOLDS.vibration.critical + 1,
    machineState: 'Operativa',
  }, 0, () => 0.5);

  assert.equal(reading.status, 'Alarma');
  assert.deepEqual(reading.alerts.map((alert) => alert.code), [
    'overheat',
    'pressure_drop',
    'vibration',
  ]);
  assert.ok(reading.alerts.every((alert) => alert.severity === 'critical'));
});

test('detecta valores de advertencia y presión alta', () => {
  const reading = generateReading('M-02', {
    temperature: ALERT_THRESHOLDS.temperature.warning,
    pressure: ALERT_THRESHOLDS.pressure.highWarning,
    vibration: ALERT_THRESHOLDS.vibration.warning,
    machineState: 'Operativa',
  }, 0, () => 0.5);

  assert.equal(reading.status, 'Atención');
  assert.deepEqual(reading.alerts.map((alert) => alert.code), [
    'overheat',
    'pressure',
    'vibration',
  ]);
  assert.ok(reading.alerts.every((alert) => alert.severity === 'warning'));
});

test('mantiene una máquina parada y alerta hasta que se recupere', () => {
  const previous = {
    temperature: 55,
    pressure: 4.2,
    vibration: 1.5,
    machineState: 'Parada',
  };
  const stopped = generateReading('M-02', previous, 0, () => 0.9);

  assert.equal(stopped.machineState, 'Parada');
  assert.equal(stopped.status, 'Parada');
  assert.equal(stopped.alerts[0].code, 'dropout');

  const recovered = generateReading('M-02', previous, 0, () => 0.1);
  assert.equal(recovered.machineState, 'Operativa');
});
