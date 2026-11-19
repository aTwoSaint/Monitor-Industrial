import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulator } from '../src/index.js';

async function withServer(run, options = {}) {
  const server = createSimulator({ random: () => 0.5, intervalMs: 60_000, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('publica la interfaz y lecturas para las máquinas configuradas', async () => {
  await withServer(async (baseUrl) => {
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);

    const response = await fetch(`${baseUrl}/api/lecturas`);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.running, true);
    assert.deepEqual(data.readings.map(({ machineId }) => machineId), ['M-01', 'M-02', 'M-03', 'M-04']);
  });
});

test('pausa y reanuda la simulación y rechaza acciones desconocidas', async () => {
  await withServer(async (baseUrl) => {
    const pause = await fetch(`${baseUrl}/api/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pause' }),
    });
    assert.equal((await pause.json()).running, false);

    const invalid = await fetch(`${baseUrl}/api/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'explode' }),
    });
    assert.equal(invalid.status, 400);

    const resume = await fetch(`${baseUrl}/api/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });
    assert.equal((await resume.json()).running, true);
  });
});

test('incluye en la API una alerta tras mantener la temperatura elevada', async () => {
  await withServer(async (baseUrl) => {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const response = await fetch(`${baseUrl}/api/lecturas`);
    const data = await response.json();

    assert.ok(data.readings.some((reading) =>
      reading.alerts.some((alert) => alert.code === 'temperature-persistent')));
  }, {
    intervalMs: 100,
    temperatureThreshold: 40,
    temperatureDurationSeconds: 1,
  });
});
