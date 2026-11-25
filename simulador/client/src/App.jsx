import { useEffect, useState } from 'react';

const metricDefinitions = [
  { key: 'temperature', label: 'Temperatura', unit: '°C', digits: 1 },
  { key: 'pressure', label: 'Presión', unit: 'bar', digits: 2 },
  { key: 'vibration', label: 'Vibración', unit: 'mm/s', digits: 2 },
];

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Error HTTP ${response.status}`);
  return data;
}

function Topbar({ running, connectionError }) {
  const status = connectionError
    ? `Error de conexión: ${connectionError}`
    : running
      ? 'Simulación activa'
      : 'Simulación pausada';

  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="Monitor Industrial, inicio">
        <span className="brand-mark" aria-hidden="true">MI</span>
        <span>MONITOR<span className="brand-light"> INDUSTRIAL</span></span>
      </a>
      <div className="topbar-meta">
        <span className={`live-indicator ${running ? '' : 'is-paused'} ${connectionError ? 'has-error' : ''}`}>
          <i></i> {status}
        </span>
        <span className="plant-label">PLANTA NORTE <span>·</span> LÍNEA 01</span>
      </div>
    </header>
  );
}

function SummaryCards({ readings }) {
  return (
    <section className="summary-grid" aria-label="Resumen de planta">
      <article className="summary-card">
        <span className="summary-label">MÁQUINAS MONITORIZADAS</span>
        <strong>{readings.length}</strong>
        <span className="summary-foot">Equipos conectados</span>
      </article>
      <article className="summary-card">
        <span className="summary-label">OPERATIVAS</span>
        <strong>{readings.filter(({ status }) => status === 'Operativa').length}</strong>
        <span className="summary-foot">Funcionamiento normal</span>
      </article>
      <article className="summary-card summary-warning">
        <span className="summary-label">EN ATENCIÓN</span>
        <strong>{readings.filter(({ status }) => status === 'Atención').length}</strong>
        <span className="summary-foot">Requieren seguimiento</span>
      </article>
      <article className="summary-card summary-critical">
        <span className="summary-label">ALARMAS / PARADAS</span>
        <strong>{readings.filter(({ status }) => ['Alarma', 'Parada'].includes(status)).length}</strong>
        <span className="summary-foot">Requieren intervención</span>
      </article>
    </section>
  );
}

function MachineCard({ reading }) {
  return (
    <article className={`machine-card state-${reading.status.toLowerCase()}`}>
      <div className="machine-heading">
        <div className="machine-title">
          <span className="machine-icon" aria-hidden="true">M</span>
          <h3>{reading.machineId}</h3>
        </div>
        <span className={`status-badge status-${reading.status.toLowerCase()}`}>{reading.status}</span>
      </div>
      <div className="metrics">
        {metricDefinitions.map((metric) => (
          <div className="metric" key={metric.key}>
            <span className="metric-label">{metric.label}</span>
            <strong className="metric-value">
              {reading[metric.key].toFixed(metric.digits)}{' '}
              <small>{metric.unit}</small>
            </strong>
          </div>
        ))}
      </div>
      <div className="machine-foot">
        <span className="state-dot"></span>
        <span>Estado: {reading.machineState}</span>
      </div>
    </article>
  );
}

function AlertsTable({ readings }) {
  const alerts = readings.flatMap((reading) =>
    reading.alerts.map((alert) => ({
      machineId: reading.machineId,
      timestamp: reading.timestamp,
      ...alert,
    })),
  );

  return (
    <section className="alerts-section">
      <div className="section-heading">
        <div>
          <h2>Alertas activas</h2>
          <p>Condiciones detectadas en la última lectura</p>
        </div>
        <span className="alert-total">{alerts.length} {alerts.length === 1 ? 'alerta' : 'alertas'}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Equipo</th><th>Condición</th><th>Nivel</th><th>Hora</th></tr>
          </thead>
          <tbody>
            {alerts.length === 0 ? (
              <tr>
                <td className="empty-state" colSpan="4">Sin alertas activas. La planta funciona dentro de los umbrales.</td>
              </tr>
            ) : alerts.map((alert, index) => (
              <tr key={`${alert.machineId}-${alert.code}-${index}`}>
                <td className="table-machine">{alert.machineId}</td>
                <td>{alert.message}</td>
                <td>
                  <span className={`severity severity-${alert.severity}`}>
                    {alert.severity === 'critical' ? 'Crítica' : 'Aviso'}
                  </span>
                </td>
                <td className="table-time">{new Date(alert.timestamp).toLocaleTimeString('es-ES')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HistoryTable({ readings, machineId, onMachineChange, error }) {
  return (
    <section className="history-section">
      <div className="section-heading">
        <div>
          <h2>Histórico reciente</h2>
          <p>Lecturas guardadas en SQLite</p>
        </div>
        <label className="history-filter">
          Equipo
          <select value={machineId} onChange={(event) => onMachineChange(event.target.value)}>
            <option value="">Todas</option>
            <option value="M-01">M-01</option>
            <option value="M-02">M-02</option>
            <option value="M-03">M-03</option>
            <option value="M-04">M-04</option>
          </select>
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Equipo</th><th>Temperatura</th><th>Presión</th><th>Vibración</th><th>Estado</th><th>Hora</th></tr>
          </thead>
          <tbody>
            {error ? (
              <tr><td className="empty-state" colSpan="6">No se pudo cargar el histórico: {error}</td></tr>
            ) : readings.length === 0 ? (
              <tr><td className="empty-state" colSpan="6">Todavía no hay lecturas guardadas.</td></tr>
            ) : [...readings].reverse().map((reading, index) => (
              <tr key={`${reading.machineId}-${reading.timestamp}-${index}`}>
                <td className="table-machine">{reading.machineId}</td>
                <td>{reading.temperature.toFixed(1)} °C</td>
                <td>{reading.pressure.toFixed(2)} bar</td>
                <td>{reading.vibration.toFixed(2)} mm/s</td>
                <td>{reading.status}</td>
                <td className="table-time">{new Date(reading.timestamp).toLocaleTimeString('es-ES')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function App() {
  const [readings, setReadings] = useState([]);
  const [running, setRunning] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [historyMachine, setHistoryMachine] = useState('');
  const [historyReadings, setHistoryReadings] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [lastUpdate, setLastUpdate] = useState('—');

  async function refreshReadings() {
    try {
      const data = await request('/api/lecturas');
      setReadings(data.readings);
      setRunning(data.running);
      setConnectionError('');
      setLastUpdate(new Date().toLocaleTimeString('es-ES'));
    } catch (error) {
      setConnectionError(error.message);
    }
  }

  async function refreshHistory(machineId = historyMachine) {
    try {
      const query = machineId ? `?machineId=${encodeURIComponent(machineId)}&limit=20` : '?limit=20';
      const data = await request(`/api/historico${query}`);
      setHistoryReadings(data.readings);
      setHistoryError('');
    } catch (error) {
      setHistoryReadings([]);
      setHistoryError(error.message);
    }
  }

  useEffect(() => {
    refreshReadings();
    refreshHistory();
    const events = new EventSource('/api/eventos');
    events.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setReadings(data.readings);
        setRunning(data.running);
        setConnectionError('');
        setLastUpdate(new Date().toLocaleTimeString('es-ES'));
      } catch (error) {
        setConnectionError(error.message);
      }
    };
    events.onerror = () => setConnectionError('Reconectando con el servidor…');

    const historyInterval = setInterval(() => refreshHistory(), 5000);
    return () => {
      events.close();
      clearInterval(historyInterval);
    };
  }, []);

  async function changeRunningState(action) {
    try {
      const data = await request('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      setRunning(data.running);
      setReadings(data.readings);
      setConnectionError('');
      setLastUpdate(new Date().toLocaleTimeString('es-ES'));
    } catch (error) {
      setConnectionError(error.message);
    }
  }

  function changeHistoryMachine(machineId) {
    setHistoryMachine(machineId);
    refreshHistory(machineId);
  }

  return (
    <>
      <Topbar running={running} connectionError={connectionError} />
      <main className="dashboard">
        <section className="page-heading">
          <div>
            <p className="eyebrow">CENTRO DE OPERACIONES <span>/</span> SUPERVISIÓN</p>
            <h1>Estado de planta</h1>
            <p className="subtitle">Telemetría simulada de maquinaria en tiempo real.</p>
          </div>
          <div className="controls">
            <button
              className="button button-secondary"
              type="button"
              disabled={!readings.length}
              onClick={() => changeRunningState(running ? 'pause' : 'start')}
            >
              <span aria-hidden="true">{running ? 'Ⅱ' : '▶'}</span> {running ? 'Pausar' : 'Reanudar'}
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={!readings.length}
              onClick={() => changeRunningState('reset')}
            >
              <span aria-hidden="true">↻</span> Reiniciar
            </button>
          </div>
        </section>
        <SummaryCards readings={readings} />
        <section className="section-heading">
          <div>
            <h2>Equipos</h2>
            <p>Lecturas más recientes de cada máquina</p>
          </div>
          <span className="updated-label">ACTUALIZACIÓN AUTOMÁTICA · 1 S</span>
        </section>
        <section className="machine-grid" aria-live="polite" aria-label="Estado de las máquinas">
          {readings.map((reading) => <MachineCard reading={reading} key={reading.machineId} />)}
        </section>
        <AlertsTable readings={readings} />
        <HistoryTable
          readings={historyReadings}
          machineId={historyMachine}
          onMachineChange={changeHistoryMachine}
          error={historyError}
        />
        <footer>
          <span>MONITOR INDUSTRIAL <span className="footer-divider">/</span> SIMULADOR DE TELEMETRÍA</span>
          <span>Última actualización: {lastUpdate}</span>
        </footer>
      </main>
    </>
  );
}
