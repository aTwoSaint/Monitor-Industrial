import test from 'node:test';
import assert from 'node:assert/strict';
import { createSustainedAlert, createTemperatureAlert } from '../src/temperatura-alerta.js';

function reading(machineId, temperature, second) {
  return {
    machineId,
    temperature,
    timestamp: new Date(second * 1000).toISOString(),
  };
}

test('avisa cuando el umbral se supera durante el tiempo configurado', () => {
  const check = createTemperatureAlert({ threshold: 80, durationSeconds: 2 });

  assert.equal(check(reading('M-01', 81, 0)), null);
  assert.equal(check(reading('M-01', 81, 1)), null);
  assert.equal(check(reading('M-01', 81, 2)).code, 'temperature-persistent');
});

test('reinicia el contador si la temperatura baja antes de completar la duración', () => {
  const check = createTemperatureAlert({ threshold: 80, durationSeconds: 2 });

  check(reading('M-01', 81, 0));
  check(reading('M-01', 79, 1));
  assert.equal(check(reading('M-01', 81, 2)), null);
  assert.equal(check(reading('M-01', 81, 4)).code, 'temperature-persistent');
});

test('detecta presión baja durante el tiempo configurado', () => {
  const check = createSustainedAlert({
    metric: 'pressure',
    threshold: 2.4,
    durationSeconds: 2,
    direction: 'below',
    code: 'pressure-persistent',
    message: 'Presión baja persistente',
  });

  const lowPressure = (second) => ({ machineId: 'M-01', pressure: 2.1, timestamp: new Date(second * 1000).toISOString() });
  assert.equal(check(lowPressure(0)), null);
  assert.equal(check(lowPressure(1)), null);
  assert.equal(check(lowPressure(2)).code, 'pressure-persistent');
});

test('detecta vibración alta y reinicia al volver al rango normal', () => {
  const check = createSustainedAlert({
    metric: 'vibration',
    threshold: 6,
    durationSeconds: 2,
    direction: 'above',
    code: 'vibration-persistent',
    message: 'Vibración alta persistente',
  });
  const readingAt = (vibration, second) => ({
    machineId: 'M-01',
    vibration,
    timestamp: new Date(second * 1000).toISOString(),
  });

  check(readingAt(7, 0));
  check(readingAt(5, 1));
  assert.equal(check(readingAt(7, 2)), null);
  assert.equal(check(readingAt(7, 4)).code, 'vibration-persistent');
});
