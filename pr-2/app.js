const SPEED_OF_LIGHT_KM_S = 300_000;
const WS_URL = "ws://localhost:21700";
const HTTP_URL = "http://localhost:21700";
const RADIAL_MAX_KM = 150;
const MAX_BUFFERED_POINTS = 8_000;

let socket = null;
let lastScanAngle = null;
let currentRotation = 0;
let maxTrailRotations = 4;

const points = [];

const elements = {
  wsStatus: document.getElementById("wsStatus"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  refreshConfigBtn: document.getElementById("refreshConfigBtn"),
  configForm: document.getElementById("configForm"),
  message: document.getElementById("message"),

  measurementsPerRotation: document.getElementById("measurementsPerRotation"),
  rotationSpeed: document.getElementById("rotationSpeed"),
  numberOfTargets: document.getElementById("numberOfTargets"),
  targetSpeed: document.getElementById("targetSpeed"),
  trailRotations: document.getElementById("trailRotations"),
  usePowerColoring: document.getElementById("usePowerColoring"),

  rotationCounter: document.getElementById("rotationCounter"),
  scanAngleValue: document.getElementById("scanAngleValue"),
  pointsCount: document.getElementById("pointsCount"),
};

function setMessage(text, isError = false) {
  elements.message.textContent = text;
  elements.message.style.color = isError ? "#ffd3d8" : "#b9e1ff";
}

function setWsStatus(connected) {
  elements.wsStatus.textContent = connected ? "WS: підключено" : "WS: відключено";
  elements.wsStatus.classList.toggle("connected", connected);
  elements.wsStatus.classList.toggle("disconnected", !connected);
}

function measurementToDistanceKm(timeSeconds) {
  return (SPEED_OF_LIGHT_KM_S * timeSeconds) / 2;
}

function pointAlpha(age) {
  const normalized = 1 - age / maxTrailRotations;
  return Math.max(0.06, Math.min(1, normalized));
}

function powerToMarker(power, alpha) {
  if (!elements.usePowerColoring.checked) {
    return {
      color: `rgba(0, 255, 140, ${alpha.toFixed(3)})`,
      size: 8,
    };
  }

  const safePower = Math.max(power ?? 1, 1e-6);
  const logPower = Math.log10(safePower);
  const normalized = Math.max(0, Math.min(1, (logPower + 1) / 4));

  const hue = 180 - normalized * 170;
  const sat = 90;
  const light = 55;

  return {
    color: `hsla(${hue.toFixed(0)}, ${sat}%, ${light}%, ${alpha.toFixed(3)})`,
    size: 7 + normalized * 8,
  };
}

function trimPoints() {
  const minRotationToKeep = currentRotation - maxTrailRotations;

  while (points.length > 0 && points[0].rotation < minRotationToKeep) {
    points.shift();
  }

  if (points.length > MAX_BUFFERED_POINTS) {
    points.splice(0, points.length - MAX_BUFFERED_POINTS);
  }
}

function updateTelemetry(scanAngle = null) {
  elements.rotationCounter.textContent = String(currentRotation);
  elements.scanAngleValue.textContent = scanAngle === null ? "—" : `${scanAngle.toFixed(1)}°`;
  elements.pointsCount.textContent = String(points.length);
}

function initializePlot() {
  Plotly.newPlot(
    "plot",
    [
      {
        type: "scatterpolar",
        mode: "markers",
        theta: [],
        r: [],
        text: [],
        hovertemplate:
          "Азимут: %{theta:.1f}°<br>Відстань: %{r:.2f} км<br>%{text}<extra></extra>",
        marker: {
          size: [],
          color: [],
          line: { width: 0 },
        },
      },
    ],
    {
      paper_bgcolor: "#09121b",
      plot_bgcolor: "#09121b",
      margin: { l: 20, r: 20, t: 20, b: 20 },
      font: { color: "#d3ecff" },
      polar: {
        bgcolor: "#0a1622",
        radialaxis: {
          range: [0, RADIAL_MAX_KM],
          tick0: 0,
          dtick: 20,
          gridcolor: "#17415b",
          linecolor: "#235372",
          ticksuffix: " км",
        },
        angularaxis: {
          direction: "clockwise",
          rotation: 90,
          gridcolor: "#17415b",
          linecolor: "#235372",
          tickmode: "array",
          tickvals: [0, 45, 90, 135, 180, 225, 270, 315],
        },
      },
      showlegend: false,
    },
    { responsive: true }
  );
}

function renderPlot() {
  const theta = [];
  const r = [];
  const color = [];
  const size = [];
  const text = [];

  for (const point of points) {
    const age = currentRotation - point.rotation;
    if (age > maxTrailRotations) continue;

    const alpha = pointAlpha(age);
    const marker = powerToMarker(point.power, alpha);

    theta.push(point.angle);
    r.push(point.distanceKm);
    color.push(marker.color);
    size.push(marker.size);
    text.push(`power: ${Number(point.power).toFixed(3)}`);
  }

  Plotly.react(
    "plot",
    [
      {
        type: "scatterpolar",
        mode: "markers",
        theta,
        r,
        text,
        hovertemplate:
          "Азимут: %{theta:.1f}°<br>Відстань: %{r:.2f} км<br>%{text}<extra></extra>",
        marker: {
          color,
          size,
          line: { width: 0 },
        },
      },
    ],
    undefined,
    { responsive: true }
  );
}

function handleMeasurementMessage(payload) {
  if (typeof payload.scanAngle !== "number") {
    return;
  }

  if (lastScanAngle !== null && payload.scanAngle < lastScanAngle) {
    currentRotation += 1;
  }
  lastScanAngle = payload.scanAngle;

  if (Array.isArray(payload.echoResponses)) {
    for (const echo of payload.echoResponses) {
      if (typeof echo.time !== "number") continue;

      const distanceKm = measurementToDistanceKm(echo.time);
      if (!Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > RADIAL_MAX_KM) {
        continue;
      }

      points.push({
        angle: payload.scanAngle,
        distanceKm,
        power: typeof echo.power === "number" ? echo.power : 1,
        rotation: currentRotation,
      });
    }
  }

  trimPoints();
  updateTelemetry(payload.scanAngle);
  renderPlot();
}

function connectWebSocket() {
  if (socket?.readyState === WebSocket.OPEN) {
    return;
  }

  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    setWsStatus(true);
    setMessage("Підключення до WebSocket встановлено.");
  };

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      handleMeasurementMessage(payload);
    } catch {
      setMessage("Отримано некоректний JSON-пакет.", true);
    }
  };

  socket.onerror = () => {
    setMessage("Помилка WebSocket. Перевірте, чи запущений Docker-контейнер.", true);
  };

  socket.onclose = () => {
    setWsStatus(false);
    setMessage("WebSocket-з’єднання закрите.");
  };
}

function disconnectWebSocket() {
  if (!socket) return;
  socket.close();
  socket = null;
}

async function fetchConfig() {
  const response = await fetch(`${HTTP_URL}/config`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function refreshConfig() {
  try {
    const config = await fetchConfig();
    elements.measurementsPerRotation.value = config.measurementsPerRotation;
    elements.rotationSpeed.value = config.rotationSpeed;
    elements.numberOfTargets.value = config.numberOfTargets;
    elements.targetSpeed.value = config.targetSpeed;
    setMessage("Параметри завантажено з сервера.");
  } catch (error) {
    setMessage(`Не вдалося завантажити /config: ${error.message}`, true);
  }
}

async function applyConfig(event) {
  event.preventDefault();

  maxTrailRotations = Math.max(1, Number(elements.trailRotations.value) || 4);

  const body = {
    measurementsPerRotation: Number(elements.measurementsPerRotation.value),
    rotationSpeed: Number(elements.rotationSpeed.value),
    numberOfTargets: Number(elements.numberOfTargets.value),
    targetSpeed: Number(elements.targetSpeed.value),
  };

  try {
    const response = await fetch(`${HTTP_URL}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}`);
    }

    trimPoints();
    renderPlot();
    setMessage("Параметри застосовано успішно.");
    await refreshConfig();
  } catch (error) {
    setMessage(`Помилка оновлення параметрів: ${error.message}`, true);
  }
}

function wireEvents() {
  elements.connectBtn.addEventListener("click", connectWebSocket);
  elements.disconnectBtn.addEventListener("click", disconnectWebSocket);
  elements.refreshConfigBtn.addEventListener("click", () => {
    void refreshConfig();
  });
  elements.configForm.addEventListener("submit", applyConfig);
  elements.trailRotations.addEventListener("change", () => {
    maxTrailRotations = Math.max(1, Number(elements.trailRotations.value) || 4);
    trimPoints();
    renderPlot();
  });
  elements.usePowerColoring.addEventListener("change", renderPlot);
}

function bootstrap() {
  initializePlot();
  wireEvents();
  updateTelemetry();
  setWsStatus(false);
  void refreshConfig();
  connectWebSocket();
}

bootstrap();
