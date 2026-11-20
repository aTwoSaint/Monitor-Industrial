import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import initSqlJs from 'sql.js';

export async function createHistoryStore({ filePath } = {}) {
  const SQL = await initSqlJs();
  let database;

  if (filePath) {
    await mkdir(path.dirname(filePath), { recursive: true });
    try {
      const savedDatabase = await readFile(filePath);
      database = new SQL.Database(savedDatabase);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      database = new SQL.Database();
    }
  } else {
    database = new SQL.Database();
  }

  database.run(`
    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      temperature REAL NOT NULL,
      pressure REAL NOT NULL,
      vibration REAL NOT NULL,
      machine_state TEXT NOT NULL,
      status TEXT NOT NULL,
      alerts TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS readings_machine_timestamp
      ON readings(machine_id, timestamp);
  `);

  const persist = async () => {
    if (!filePath) return;
    await writeFile(filePath, Buffer.from(database.export()));
  };

  return {
    async save(readings) {
      const statement = database.prepare(`
        INSERT INTO readings (
          machine_id, timestamp, temperature, pressure, vibration,
          machine_state, status, alerts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      try {
        database.run('BEGIN');
        for (const reading of readings) {
          statement.run([
            reading.machineId,
            reading.timestamp,
            reading.temperature,
            reading.pressure,
            reading.vibration,
            reading.machineState,
            reading.status,
            JSON.stringify(reading.alerts),
          ]);
        }
        database.run('COMMIT');
      } catch (error) {
        database.run('ROLLBACK');
        throw error;
      } finally {
        statement.free();
      }

      await persist();
    },

    async getLatest({ machineId, limit = 100 } = {}) {
      const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
      const query = machineId
        ? 'SELECT * FROM readings WHERE machine_id = ? ORDER BY timestamp DESC LIMIT ?'
        : 'SELECT * FROM readings ORDER BY timestamp DESC LIMIT ?';
      const statement = database.prepare(query);
      const parameters = machineId ? [machineId, safeLimit] : [safeLimit];
      const rows = [];

      statement.bind(parameters);
      while (statement.step()) {
        const row = statement.getAsObject();
        rows.push({
          id: row.id,
          machineId: row.machine_id,
          timestamp: row.timestamp,
          temperature: row.temperature,
          pressure: row.pressure,
          vibration: row.vibration,
          machineState: row.machine_state,
          status: row.status,
          alerts: JSON.parse(row.alerts),
        });
      }
      statement.free();
      return rows.reverse();
    },

    async close() {
      await persist();
      database.close();
    },
  };
}
