import test from 'node:test';
import assert from 'node:assert/strict';
import { createTemperatureAlert } from '../src/temperatura-alerta.js';

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
