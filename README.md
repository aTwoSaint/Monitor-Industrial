# Monitor Industrial

## Qué problema resuelve

Permite probar una vista de supervisión industrial sin conectar máquinas reales: simula la telemetría de cuatro equipos, detecta umbrales de temperatura, presión y vibración, y presenta estados y alertas en un dashboard local.

## Captura

![Dashboard de Monitor Industrial](docs/captura.svg)

Vista ilustrativa; los valores de la aplicación se generan de forma aleatoria.

## Cómo ejecutarlo (3 comandos)

Requiere Node.js 18 o superior. Desde la raíz del repositorio:

```bash
cd simulador
npm test
npm start
```

Después abre `http://127.0.0.1:3000` en el navegador.

## Arquitectura

```text
┌────────────────────┐     GET /api/lecturas      ┌────────────────────┐
│ Navegador           │ ◄──────────────────────── │ Servidor Node.js   │
│ HTML / CSS / JS     │ ── SSE /api/eventos ─────►│ HTTP + estado      │
└────────────────────┘                            └─────────┬──────────┘
                              ─── POST /api/control ─────────────►
                                                            │ cada segundo
                                                  ┌─────────▼──────────┐
                                                  │ Generador de       │
                                                  │ telemetría y alertas│
                                                  └────────────────────┘
```

El servidor usa módulos nativos de Node.js y sirve la interfaz y la API desde el mismo origen.

## Decisiones y estado de esta fase

- Se mantiene el dashboard y la API sencillos de la fase anterior: una lectura por segundo y sin dependencias de interfaz.
- Como primer paso de reglas temporizadas, se añadió una alerta crítica si la temperatura de una máquina supera el umbral configurado durante varios segundos consecutivos.
- Para esta entrega, el umbral y la duración se configuran al iniciar el servidor con `TEMP_ALERT_THRESHOLD` y `TEMP_ALERT_SECONDS` (valores iniciales: `88` y `5`). Se reinicia el contador si la temperatura vuelve al umbral o por debajo.
- La regla temporal está cubierta por pruebas unitarias; la actualización en vivo sin polling y el resto de requisitos quedan para fases posteriores.
- En esta fase se añadió persistencia local con SQLite mediante `sql.js`. Las lecturas se guardan por máquina y pueden consultarse desde `/api/historico?machineId=M-01&limit=20`. El fichero se guarda en `simulador/data/monitor.db` y se puede cambiar con `HISTORY_DB_PATH`.
- Se añadió al dashboard una vista de histórico reciente con filtro por máquina. El histórico usa los datos persistidos y se actualiza cada cinco segundos.
- La actualización de las lecturas pasó de consultas periódicas de un segundo a Server-Sent Events. El navegador recibe cada cambio por `/api/eventos` y reconecta automáticamente si la conexión se interrumpe.
- Al probar la persistencia se descartó `better-sqlite3` porque necesita compilarse con herramientas C++ y no hay una instalación compatible disponible en este equipo. Se eligió `sql.js`, que funciona en Node.js como JavaScript puro y permite seguir con la fase sin instalar Visual Studio.

## Limitaciones conocidas

- Los datos son sintéticos. Las lecturas quedan persistidas en SQLite, pero no existe conexión con sensores reales ni autenticación para el archivo de datos.
- El histórico se mantiene en un único fichero local sin archivado automático ni limpieza de datos antiguos.
- El estado de la simulación vive en memoria y es compartido por los navegadores conectados a esa instancia.
- El dashboard mantiene una conexión SSE y consulta el histórico cada cinco segundos.
- La regla de duración solo cubre temperatura y se configura mediante variables de entorno. No tiene una pantalla de administración.
- El servidor escucha solo en `127.0.0.1`. Las probabilidades y umbrales son ilustrativos y no sustituyen criterios de seguridad industrial.

## Próximos pasos

1. Añadir persistencia e histórico con una base de datos SQL.
2. Evaluar Server-Sent Events para enviar actualizaciones en vivo.
3. Ampliar la configuración de reglas y añadir más pruebas para la API.
4. Valorar una interfaz React, CI y despliegue una vez asentada la versión local.
