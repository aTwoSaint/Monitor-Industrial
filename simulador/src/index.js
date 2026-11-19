import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateReading, MACHINE_IDS } from './generador.js';
import { createTemperatureAlert } from './temperatura-alerta.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
};
const MAX_BODY_BYTES = 1024;

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      const error = new Error('El cuerpo de la solicitud es demasiado grande');
      error.status = 413;
      throw error;
    }
  }

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('El cuerpo debe ser un JSON válido');
    error.status = 400;
    throw error;
  }
}

function addSustainedAlert(reading, alert) {
  if (!alert) return reading;
  const alerts = [...reading.alerts, alert];
  return {
    ...reading,
    alerts,
    status: reading.machineState === 'Parada'
      ? 'Parada'
      : alert.severity === 'critical'
        ? 'Alarma'
        : reading.status === 'Operativa'
          ? 'Atención'
          : reading.status,
  };
}

export function createSimulator({
  random = Math.random,
  intervalMs = 1000,
  temperatureThreshold = 88,
  temperatureDurationSeconds = 5,
} = {}) {
  const temperatureAlert = createTemperatureAlert({
    threshold: temperatureThreshold,
    durationSeconds: temperatureDurationSeconds,
  });
  let running = true;
  let readings = MACHINE_IDS.map((machineId) => generateReading(machineId, undefined, Date.now(), random));
  readings = readings.map((reading) => addSustainedAlert(reading, temperatureAlert(reading)));

  const advance = () => {
    if (!running) return;
    const timestamp = Date.now();
    readings = readings.map((previous) => {
      const reading = generateReading(previous.machineId, previous, timestamp, random);
      return addSustainedAlert(reading, temperatureAlert(reading));
    });
  };
  const interval = setInterval(advance, intervalMs);

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');

    if (url.pathname === '/api/lecturas' && request.method === 'GET') {
      sendJson(response, 200, { running, readings });
      return;
    }

    if (url.pathname === '/api/control' && request.method === 'POST') {
      try {
        const { action } = await readJson(request);
        if (action === 'pause') running = false;
        else if (action === 'start') running = true;
        else if (action === 'reset') {
          temperatureAlert.reset();
          readings = MACHINE_IDS.map((machineId) => {
            const reading = generateReading(machineId, undefined, Date.now(), random);
            return addSustainedAlert(reading, temperatureAlert(reading));
          });
          running = true;
        } else {
          sendJson(response, 400, { error: 'Acción no válida' });
          return;
        }
        sendJson(response, 200, { running, readings });
      } catch (error) {
        sendJson(response, error.status ?? 400, { error: error.message });
      }
      return;
    }

    if (request.method === 'GET' && STATIC_FILES[url.pathname]) {
      const [filename, contentType] = STATIC_FILES[url.pathname];
      try {
        const content = await readFile(path.join(PUBLIC_DIR, filename));
        response.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(content);
      } catch (error) {
        console.error(`No se pudo leer el recurso ${filename}:`, error);
        sendJson(response, 500, { error: 'No se pudo cargar la interfaz' });
      }
      return;
    }

    sendJson(response, 404, { error: 'Recurso no encontrado' });
  });

  server.once('close', () => clearInterval(interval));
  return server;
}

export function startServer() {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un número entero entre 1 y 65535');
  }

  const server = createSimulator({
    temperatureThreshold: Number(process.env.TEMP_ALERT_THRESHOLD ?? 88),
    temperatureDurationSeconds: Number(process.env.TEMP_ALERT_SECONDS ?? 5),
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Monitor Industrial disponible en http://127.0.0.1:${port}`);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
