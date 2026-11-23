const machineGrid = document.querySelector('#machine-grid');
const alertsBody = document.querySelector('#alerts-body');
const connection = document.querySelector('#connection');
const toggleButton = document.querySelector('#toggle-button');
const resetButton = document.querySelector('#reset-button');
const historyMachine = document.querySelector('#history-machine');
const historyBody = document.querySelector('#history-body');

const metricDefinitions = [
  { key: 'temperature', label: 'Temperatura', unit: '°C', digits: 1 },
  { key: 'pressure', label: 'Presión', unit: 'bar', digits: 2 },
  { key: 'vibration', label: 'Vibración', unit: 'mm/s', digits: 2 },
];

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderMachines(readings) {
  machineGrid.replaceChildren();
  for (const reading of readings) {
    const card = makeElement('article', `machine-card state-${reading.status.toLowerCase()}`);
    const heading = makeElement('div', 'machine-heading');
    const title = makeElement('div', 'machine-title');
    title.append(makeElement('span', 'machine-icon', 'M'), makeElement('h3', '', reading.machineId));
    const badge = makeElement('span', `status-badge status-${reading.status.toLowerCase()}`, reading.status);
    heading.append(title, badge);
    card.append(heading);

    const metrics = makeElement('div', 'metrics');
    for (const metric of metricDefinitions) {
      const item = makeElement('div', 'metric');
      const value = makeElement('strong', 'metric-value');
      value.append(document.createTextNode(reading[metric.key].toFixed(metric.digits) + ' '));
      value.append(makeElement('small', '', metric.unit));
      item.append(makeElement('span', 'metric-label', metric.label), value);
      metrics.append(item);
    }
    card.append(metrics);
    const state = makeElement('div', 'machine-foot');
    state.append(
      makeElement('span', 'state-dot'),
      makeElement('span', '', `Estado: ${reading.machineState}`),
    );
    card.append(state);
    machineGrid.append(card);
  }
}

function renderAlerts(readings) {
  const alerts = readings.flatMap((reading) => reading.alerts.map((alert) => ({
    machineId: reading.machineId,
    timestamp: reading.timestamp,
    ...alert,
  })));
  alertsBody.replaceChildren();
  document.querySelector('#alert-count').textContent = `${alerts.length} ${alerts.length === 1 ? 'alerta' : 'alertas'}`;

  if (alerts.length === 0) {
    const row = makeElement('tr');
    row.append(makeElement('td', 'empty-state', 'Sin alertas activas. La planta funciona dentro de los umbrales.'));
    row.firstChild.colSpan = 4;
    alertsBody.append(row);
    return;
  }

  for (const alert of alerts) {
    const row = makeElement('tr');
    row.append(
      makeElement('td', 'table-machine', alert.machineId),
      makeElement('td', '', alert.message),
      makeElement('td', '', ''),
      makeElement('td', 'table-time', new Date(alert.timestamp).toLocaleTimeString('es-ES')),
    );
    row.children[2].append(makeElement('span', `severity severity-${alert.severity}`, alert.severity === 'critical' ? 'Crítica' : 'Aviso'));
    alertsBody.append(row);
  }
}

function render(data) {
  const { readings, running } = data;
  renderMachines(readings);
  renderAlerts(readings);
  document.querySelector('#machine-count').textContent = readings.length;
  document.querySelector('#operational-count').textContent = readings.filter(({ status }) => status === 'Operativa').length;
  document.querySelector('#attention-count').textContent = readings.filter(({ status }) => status === 'Atención').length;
  document.querySelector('#incident-count').textContent = readings.filter(({ status }) => ['Alarma', 'Parada'].includes(status)).length;
  document.querySelector('#last-update').textContent = `Última actualización: ${new Date().toLocaleTimeString('es-ES')}`;
  connection.classList.toggle('is-paused', !running);
  connection.innerHTML = `<i></i> ${running ? 'Simulación activa' : 'Simulación pausada'}`;
  toggleButton.innerHTML = running ? '<span aria-hidden="true">Ⅱ</span> Pausar' : '<span aria-hidden="true">▶</span> Reanudar';
  toggleButton.disabled = false;
  resetButton.disabled = false;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Error HTTP ${response.status}`);
  return data;
}

async function refresh() {
  try {
    render(await request('/api/lecturas'));
    connection.classList.remove('has-error');
  } catch (error) {
    connection.classList.add('has-error');
    connection.textContent = `Error de conexión: ${error.message}`;
  }
}

function connectLiveUpdates() {
  const events = new EventSource('/api/eventos');
  events.onmessage = (event) => {
    try {
      render(JSON.parse(event.data));
      connection.classList.remove('has-error');
    } catch (error) {
      connection.classList.add('has-error');
      connection.textContent = `Error al procesar las lecturas: ${error.message}`;
    }
  };
  events.onerror = () => {
    connection.classList.add('has-error');
    connection.textContent = 'Reconectando con el servidor…';
  };
}

async function refreshHistory() {
  try {
    const machineId = historyMachine.value;
    const query = machineId ? `?machineId=${encodeURIComponent(machineId)}&limit=20` : '?limit=20';
    const data = await request(`/api/historico${query}`);
    historyBody.replaceChildren();

    if (data.readings.length === 0) {
      const row = makeElement('tr');
      row.append(makeElement('td', 'empty-state', 'Todavía no hay lecturas guardadas.'));
      row.firstChild.colSpan = 6;
      historyBody.append(row);
      return;
    }

    for (const reading of [...data.readings].reverse()) {
      const row = makeElement('tr');
      row.append(
        makeElement('td', 'table-machine', reading.machineId),
        makeElement('td', '', `${reading.temperature.toFixed(1)} °C`),
        makeElement('td', '', `${reading.pressure.toFixed(2)} bar`),
        makeElement('td', '', `${reading.vibration.toFixed(2)} mm/s`),
        makeElement('td', '', reading.status),
        makeElement('td', 'table-time', new Date(reading.timestamp).toLocaleTimeString('es-ES')),
      );
      historyBody.append(row);
    }
  } catch (error) {
    historyBody.replaceChildren();
    const row = makeElement('tr');
    row.append(makeElement('td', 'empty-state', `No se pudo cargar el histórico: ${error.message}`));
    row.firstChild.colSpan = 6;
    historyBody.append(row);
  }
}

toggleButton.addEventListener('click', async () => {
  try {
    const { running } = await request('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: toggleButton.textContent.includes('Pausar') ? 'pause' : 'start' }),
    });
    render(await request('/api/lecturas'));
    if (running) await refresh();
  } catch (error) {
    connection.classList.add('has-error');
    connection.textContent = `No se pudo cambiar el estado: ${error.message}`;
  }
});

resetButton.addEventListener('click', async () => {
  try {
    render(await request('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' }),
    }));
  } catch (error) {
    connection.classList.add('has-error');
    connection.textContent = `No se pudo reiniciar: ${error.message}`;
  }
});

historyMachine.addEventListener('change', refreshHistory);

refresh();
refreshHistory();
connectLiveUpdates();
setInterval(refreshHistory, 5000);
