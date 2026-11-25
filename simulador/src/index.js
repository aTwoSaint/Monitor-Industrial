import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateReading, MACHINE_IDS } from './generador.js';
import { createSustainedAlert, createTemperatureAlert } from './temperatura-alerta.js';
import { createHistoryStore } from './historico.js';

const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

function isInsideDirectory(directory, filePath) {
  const relative = path.relative(directory, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function readStaticFile(urlPathname) {
  const relativePath = urlPathname === '/' ? 'index.html' : urlPathname.replace(/^\/+/, '');
  for (const directory of [DIST_DIR, PUBLIC_DIR]) {
    const filePath = path.resolve(directory, relativePath);
    if (!isInsideDirectory(directory, filePath)) continue;
    try {
      const content = await readFile(filePath);
      return {
        content,
        contentType: CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return undefined;
}
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

function validateHistoryQuery(url) {
  const machineId = url.searchParams.get('machineId');
  if (machineId && !MACHINE_IDS.includes(machineId)) {
    const error = new Error('machineId no válido');
    error.status = 400;
    throw error;
  }

  const limitValue = url.searchParams.get('limit');
  if (limitValue !== null) {
    if (!/^\d+$/.test(limitValue)) {
      const error = new Error('limit debe ser un entero entre 1 y 500');
      error.status = 400;
      throw error;
    }
    const limit = Number(limitValue);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      const error = new Error('limit debe ser un entero entre 1 y 500');
      error.status = 400;
      throw error;
    }
  }

  return {
    machineId: machineId || undefined,
    limit: limitValue === null ? undefined : Number(limitValue),
  };
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
  pressureThreshold = 2.4,
  pressureDurationSeconds = 5,
  vibrationThreshold = 6,
  vibrationDurationSeconds = 5,
  historyPath,
} = {}) {
  const temperatureAlert = createTemperatureAlert({
    threshold: temperatureThreshold,
    durationSeconds: temperatureDurationSeconds,
  });
  const pressureAlert = createSustainedAlert({
    metric: 'pressure',
    threshold: pressureThreshold,
    durationSeconds: pressureDurationSeconds,
    direction: 'below',
    code: 'pressure-persistent',
    severity: 'critical',
    message: `Presión inferior a ${pressureThreshold} bar durante ${pressureDurationSeconds} s`,
  });
  const vibrationAlert = createSustainedAlert({
    metric: 'vibration',
    threshold: vibrationThreshold,
    durationSeconds: vibrationDurationSeconds,
    direction: 'above',
    code: 'vibration-persistent',
    severity: 'critical',
    message: `Vibración superior a ${vibrationThreshold} mm/s durante ${vibrationDurationSeconds} s`,
  });
  const sustainedAlerts = [temperatureAlert, pressureAlert, vibrationAlert];
  let running = true;
  let readings = MACHINE_IDS.map((machineId) => generateReading(machineId, undefined, Date.now(), random));
  readings = readings.map((reading) => sustainedAlerts.reduce(
    (withAlerts, alert) => addSustainedAlert(withAlerts, alert(withAlerts)),
    reading,
  ));
  const historyReady = createHistoryStore({
    filePath: historyPath,
  }).then((store) => {
    historyStore = store;
    return store.save(readings);
  }).catch((error) => {
    historyError = error;
  });
  let historyStore;
  let historyError;
  const sseClients = new Set();

  const publishReadings = () => {
    const payload = `data: ${JSON.stringify({ running, readings })}\n\n`;
    for (const response of sseClients) {
      response.write(payload);
    }
  };

  const advance = () => {
    if (!running) return;
    const timestamp = Date.now();
    readings = readings.map((previous) => {
      const reading = generateReading(previous.machineId, previous, timestamp, random);
      return sustainedAlerts.reduce(
        (withAlerts, alert) => addSustainedAlert(withAlerts, alert(withAlerts)),
        reading,
      );
    });
    publishReadings();
    historyReady.then(() => {
      if (historyStore) return historyStore.save(readings);
    }).catch((error) => {
      console.error('No se pudo guardar el histórico:', error);
    });
  };
  const interval = setInterval(advance, intervalMs);

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');

    if (url.pathname === '/api/lecturas' && request.method === 'GET') {
      sendJson(response, 200, { running, readings });
      return;
    }

    if (url.pathname === '/api/eventos' && request.method === 'GET') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
      });
      sseClients.add(response);
      response.write(`data: ${JSON.stringify({ running, readings })}\n\n`);
      request.once('close', () => sseClients.delete(response));
      return;
    }

    if (url.pathname === '/api/historico' && request.method === 'GET') {
      try {
        await historyReady;
        if (historyError) throw historyError;
        const { machineId, limit } = validateHistoryQuery(url);
        const history = await historyStore.getLatest({ machineId: machineId || undefined, limit });
        sendJson(response, 200, { readings: history });
      } catch (error) {
        sendJson(response, error.status ?? 500, {
          error: error.status ? error.message : 'No se pudo leer el histórico',
        });
      }
      return;
    }

    if (url.pathname === '/api/control' && request.method === 'POST') {
      try {
        const { action } = await readJson(request);
        if (action === 'pause') running = false;
        else if (action === 'start') running = true;
        else if (action === 'reset') {
          sustainedAlerts.forEach((alert) => alert.reset());
          readings = MACHINE_IDS.map((machineId) => {
            const reading = generateReading(machineId, undefined, Date.now(), random);
            return sustainedAlerts.reduce(
              (withAlerts, alert) => addSustainedAlert(withAlerts, alert(withAlerts)),
              reading,
            );
          });
          running = true;
          historyReady.then(() => {
            if (historyStore) return historyStore.save(readings);
          }).catch((error) => {
            console.error('No se pudo guardar el histórico:', error);
          });
        } else {
          sendJson(response, 400, { error: 'Acción no válida' });
          return;
        }
        publishReadings();
        sendJson(response, 200, { running, readings });
      } catch (error) {
        sendJson(response, error.status ?? 400, { error: error.message });
      }
      return;
    }

    if (request.method === 'GET') {
      try {
        const staticFile = await readStaticFile(url.pathname);
        if (staticFile) {
          response.writeHead(200, {
            'Content-Type': staticFile.contentType,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          });
          response.end(staticFile.content);
          return;
        }
      } catch (error) {
        console.error(`No se pudo leer el recurso ${url.pathname}:`, error);
        sendJson(response, 500, { error: 'No se pudo cargar la interfaz' });
        return;
      }
    }

    sendJson(response, 404, { error: 'Recurso no encontrado' });
  });

  server.once('close', () => {
    clearInterval(interval);
    historyReady.then(async () => {
      if (historyStore) await historyStore.close();
    }).catch((error) => {
      console.error('No se pudo cerrar el histórico:', error);
    });
  });
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
    pressureThreshold: Number(process.env.PRESSURE_ALERT_THRESHOLD ?? 2.4),
    pressureDurationSeconds: Number(process.env.PRESSURE_ALERT_SECONDS ?? 5),
    vibrationThreshold: Number(process.env.VIBRATION_ALERT_THRESHOLD ?? 6),
    vibrationDurationSeconds: Number(process.env.VIBRATION_ALERT_SECONDS ?? 5),
    historyPath: process.env.HISTORY_DB_PATH ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'monitor.db'),
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Monitor Industrial disponible en http://127.0.0.1:${port}`);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
