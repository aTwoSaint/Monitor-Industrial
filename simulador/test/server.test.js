import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSimulator } from '../src/index.js';
import { createHistoryStore } from '../src/historico.js';

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

test('guarda y consulta lecturas en el histórico SQLite', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'monitor-industrial-'));
  const historyPath = path.join(directory, 'monitor.db');

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/historico?machineId=M-01&limit=10`);
      const data = await response.json();

      assert.equal(response.status, 200);
      assert.ok(data.readings.length > 0);
      assert.ok(data.readings.every((reading) => reading.machineId === 'M-01'));
    }, { historyPath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('recupera lecturas después de cerrar y volver a abrir SQLite', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'monitor-historico-'));
  const historyPath = path.join(directory, 'monitor.db');
  const reading = {
    machineId: 'M-01',
    timestamp: new Date(0).toISOString(),
    temperature: 73.2,
    pressure: 6.1,
    vibration: 2.3,
    machineState: 'Operativa',
    status: 'Operativa',
    alerts: [],
  };

  try {
    const firstStore = await createHistoryStore({ filePath: historyPath });
    await firstStore.save([reading]);
    await firstStore.close();

    const reopenedStore = await createHistoryStore({ filePath: historyPath });
    const readings = await reopenedStore.getLatest({ machineId: 'M-01' });
    await reopenedStore.close();

    assert.equal(readings.length, 1);
    assert.equal(readings[0].machineId, 'M-01');
    assert.equal(readings[0].temperature, 73.2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
