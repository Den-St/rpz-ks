const WS_URL = "ws://localhost:21701";
const LIGHT_SPEED_KM_PER_MS = 300;
const SATELLITE_TTL_MS = 10_000;
const DENOMINATOR_EPSILON = 1e-8;

let socket = null;
let lastNumericalPosition = null;
const latestMeasurements = new Map();
const analyticTrail = [];
const numericTrail = [];
const jumpDistances = { analytic: [], numeric: [] };

const elements = {
  wsStatus: document.getElementById("wsStatus"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  timeSpreadInput: document.getElementById("timeSpreadInput"),
  trailLengthInput: document.getElementById("trailLengthInput"),
  satelliteCount: document.getElementById("satelliteCount"),
  timeSpreadValue: document.getElementById("timeSpreadValue"),
  lastDistanceValue: document.getElementById("lastDistanceValue"),
  analyticJumpValue: document.getElementById("analyticJumpValue"),
  numericJumpValue: document.getElementById("numericJumpValue"),
  analyticPosition: document.getElementById("analyticPosition"),
  numericPosition: document.getElementById("numericPosition"),
  message: document.getElementById("message"),
};

function setMessage(text, isError = false) {
  elements.message.textContent = text;
  elements.message.style.color = isError ? "#ffd4d8" : "#b9e1ff";
}

function setWsStatus(isConnected) {
  elements.wsStatus.textContent = isConnected ? "WS: підключено" : "WS: відключено";
  elements.wsStatus.classList.toggle("connected", isConnected);
  elements.wsStatus.classList.toggle("disconnected", !isConnected);
}

function formatPosition(position) {
  return position ? `(${position.x.toFixed(3)}; ${position.y.toFixed(3)}) км` : "—";
}

function distanceKm(message) {
  return LIGHT_SPEED_KM_PER_MS * (message.receivedAt - message.sentAt);
}

function euclideanDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function getTrailLimit() {
  return Math.max(0, Number(elements.trailLengthInput.value) || 0);
}

function appendTrail(trail, point) {
  trail.push(point);
  const limit = getTrailLimit();
  if (trail.length > limit) trail.splice(0, trail.length - limit);
}

function appendJump(method, trail, point) {
  const previous = trail.at(-1);
  if (previous) {
    jumpDistances[method].push(euclideanDistance(previous, point));
    if (jumpDistances[method].length > 80) jumpDistances[method].shift();
  }
}

function calculateAnalyticPosition([first, second, third]) {
  const a = 2 * (second.x - first.x);
  const b = 2 * (second.y - first.y);
  const c = first.r ** 2 - second.r ** 2 - first.x ** 2 + second.x ** 2 - first.y ** 2 + second.y ** 2;
  const d = 2 * (third.x - second.x);
  const e = 2 * (third.y - second.y);
  const f = second.r ** 2 - third.r ** 2 - second.x ** 2 + third.x ** 2 - second.y ** 2 + third.y ** 2;
  const denominator = e * a - b * d;

  if (Math.abs(denominator) < DENOMINATOR_EPSILON) {
    throw new Error("Супутники розташовані майже на одній прямій.");
  }

  return {
    x: (c * e - f * b) / denominator,
    y: (c * d - a * f) / (b * d - a * e),
  };
}

function lossFunction(measurements, point) {
  return measurements.reduce((total, satellite) => {
    const residual = Math.hypot(point[0] - satellite.x, point[1] - satellite.y) - satellite.r;
    return total + residual ** 2;
  }, 0);
}

function calculateNumericPosition(measurements, initialPosition) {
  if (typeof numeric === "undefined") {
    throw new TypeError("Бібліотека numeric.js не завантажилась.");
  }

  const result = numeric.uncmin(
    (point) => lossFunction(measurements, point),
    [initialPosition.x, initialPosition.y],
    1e-10,
    undefined,
    100
  );
  const [x, y] = result.solution;
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Чисельний метод не збігся.");
  return { x, y };
}

function getFreshMeasurements() {
  const values = [...latestMeasurements.values()];
  const newestTime = Math.max(...values.map((measurement) => measurement.receivedAt));
  for (const [id, measurement] of latestMeasurements) {
    if (newestTime - measurement.receivedAt > SATELLITE_TTL_MS) latestMeasurements.delete(id);
  }
  return [...latestMeasurements.values()]
    .sort((first, second) => second.receivedAt - first.receivedAt)
    .slice(0, 3);
}

function updateTelemetry(measurements, spread = null) {
  elements.satelliteCount.textContent = String(latestMeasurements.size);
  elements.timeSpreadValue.textContent = spread === null ? "—" : `${spread.toFixed(1)} мс`;
  const latest = measurements.at(0);
  elements.lastDistanceValue.textContent = latest ? `${latest.r.toFixed(3)} км` : "—";
  const average = (method) => {
    const jumps = jumpDistances[method];
    return jumps.length ? `${(jumps.reduce((sum, item) => sum + item, 0) / jumps.length).toFixed(3)} км` : "—";
  };
  elements.analyticJumpValue.textContent = average("analytic");
  elements.numericJumpValue.textContent = average("numeric");
}

function processMeasurements() {
  const measurements = getFreshMeasurements();
  if (measurements.length < 3) {
    updateTelemetry(measurements);
    renderPlot(measurements, null, null);
    setMessage("Очікування актуальних вимірювань від трьох супутників.");
    return;
  }

  const times = measurements.map((measurement) => measurement.receivedAt);
  const spread = Math.max(...times) - Math.min(...times);
  const threshold = Math.max(1, Number(elements.timeSpreadInput.value) || 300);
  updateTelemetry(measurements, spread);

  if (spread > threshold) {
    renderPlot(measurements, analyticTrail.at(-1) ?? null, numericTrail.at(-1) ?? null);
    setMessage(`Розрахунок пропущено: розкид ${spread.toFixed(1)} мс більший за ${threshold} мс.`, true);
    return;
  }

  let analyticPosition = null;
  let analyticError = null;
  try {
    analyticPosition = calculateAnalyticPosition(measurements);
  } catch (error) {
    analyticError = error;
  }

  try {
    const numericStart = analyticPosition ?? lastNumericalPosition ?? { x: 50, y: 50 };
    const numericPosition = calculateNumericPosition(measurements, numericStart);
    if (analyticPosition) {
      appendJump("analytic", analyticTrail, analyticPosition);
      appendTrail(analyticTrail, analyticPosition);
    }
    appendJump("numeric", numericTrail, numericPosition);
    appendTrail(numericTrail, numericPosition);
    lastNumericalPosition = numericPosition;
    elements.analyticPosition.textContent = formatPosition(analyticPosition);
    elements.numericPosition.textContent = formatPosition(numericPosition);
    updateTelemetry(measurements, spread);
    renderPlot(measurements, analyticPosition, numericPosition);
    setMessage(analyticError
      ? `Оновлено чисельне рішення. Аналітичне недоступне: ${analyticError.message}`
      : `Координати оновлено. Часовий розкид: ${spread.toFixed(1)} мс.`);
  } catch (error) {
    renderPlot(measurements, analyticTrail.at(-1) ?? null, numericTrail.at(-1) ?? null);
    setMessage(`Розрахунок неможливий: ${error.message}`, true);
  }
}

function traceFromTrail(trail, name, color) {
  return {
    type: "scatter", mode: "lines+markers", name,
    x: trail.map((point) => point.x), y: trail.map((point) => point.y),
    line: { color, width: 1 }, marker: { color, size: 5, opacity: 0.38 },
    hoverinfo: "skip",
  };
}

function renderPlot(measurements, analyticPosition, numericPosition) {
  const traces = [
    traceFromTrail(analyticTrail, "Слід (аналітичний)", "rgba(255, 203, 91, .35)"),
    traceFromTrail(numericTrail, "Слід (чисельний)", "rgba(69, 227, 155, .35)"),
    {
      type: "scatter", mode: "markers+text", name: "Супутники",
      x: measurements.map((item) => item.x), y: measurements.map((item) => item.y),
      text: measurements.map((item, index) => `S${index + 1}`), textposition: "top center",
      hovertemplate: "%{text}<br>x: %{x:.3f} км<br>y: %{y:.3f} км<extra></extra>",
      marker: { color: "#17c8ff", size: 13, symbol: "diamond", line: { color: "#d9f5ff", width: 1 } },
    },
  ];
  if (analyticPosition) traces.push({ type: "scatter", mode: "markers", name: "Аналітичний", x: [analyticPosition.x], y: [analyticPosition.y], marker: { color: "#ffcb5b", size: 15, symbol: "x", line: { width: 2 } } });
  if (numericPosition) traces.push({ type: "scatter", mode: "markers", name: "Чисельний", x: [numericPosition.x], y: [numericPosition.y], marker: { color: "#45e39b", size: 12, symbol: "circle", line: { color: "#e9fff4", width: 1 } } });

  Plotly.react("plot", traces, {
    paper_bgcolor: "#0a1520", plot_bgcolor: "#091521", font: { color: "#daf0ff" },
    margin: { l: 55, r: 25, t: 22, b: 52 }, showlegend: true,
    legend: { orientation: "h", y: 1.11, x: 0, bgcolor: "rgba(0,0,0,0)" },
    xaxis: { title: "X, км", range: [0, 100], dtick: 10, gridcolor: "#1a3d55", zeroline: false },
    yaxis: { title: "Y, км", range: [0, 100], dtick: 10, gridcolor: "#1a3d55", zeroline: false, scaleanchor: "x", scaleratio: 1 },
  }, { responsive: true, displayModeBar: false });
}

function handleMessage(event) {
  try {
    const payload = JSON.parse(event.data);
    const r = distanceKm(payload);
    if (!payload.id || !Number.isFinite(payload.x) || !Number.isFinite(payload.y) || !Number.isFinite(r) || r < 0) throw new Error("некоректні поля пакета");
    latestMeasurements.set(payload.id, { ...payload, r });
    processMeasurements();
  } catch (error) {
    setMessage(`Не вдалося обробити повідомлення: ${error.message}`, true);
  }
}

function connectWebSocket() {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  socket = new WebSocket(WS_URL);
  socket.onopen = () => { setWsStatus(true); setMessage("Підключено до GPS-емулятора."); };
  socket.onmessage = handleMessage;
  socket.onerror = () => setMessage("Помилка WebSocket. Перевірте Docker-контейнер і порт 21701.", true);
  socket.onclose = () => { setWsStatus(false); setMessage("WebSocket-з’єднання закрито."); };
}

function initialize() {
  elements.connectBtn.addEventListener("click", connectWebSocket);
  elements.disconnectBtn.addEventListener("click", () => socket?.close());
  elements.trailLengthInput.addEventListener("change", () => {
    const limit = getTrailLimit();
    if (analyticTrail.length > limit) analyticTrail.splice(0, analyticTrail.length - limit);
    if (numericTrail.length > limit) numericTrail.splice(0, numericTrail.length - limit);
    renderPlot(getFreshMeasurements(), analyticTrail.at(-1) ?? null, numericTrail.at(-1) ?? null);
  });
  renderPlot([], null, null);
  setWsStatus(false);
  connectWebSocket();
}

initialize();