import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.164.1/examples/jsm/controls/OrbitControls.js';

// -------------------------------
// Shared helpers and constants
// -------------------------------
const HISTORY_KEY = 'turbine-health-history-v2';
const HISTORY_LIMIT = 5;
const EPSILON = 0.02;

const fields = {
  temperature: document.getElementById('temperature'),
  vibration: document.getElementById('vibration'),
  rpm: document.getElementById('rpm')
};

const output = {
  box: document.getElementById('result'),
  title: document.getElementById('status-title'),
  message: document.getElementById('status-message')
};

const conditionConfig = {
  safe: {
    className: 'safe',
    title: 'SAFE: Normal Operation',
    suggestion: 'System is stable. Continue routine monitoring and scheduled maintenance.'
  },
  warningVibration: {
    className: 'warning',
    title: 'WARNING: Imbalance or Misalignment',
    suggestion: 'Inspect rotor alignment and balancing. Plan corrective service soon.'
  },
  warningTemp: {
    className: 'warning',
    title: 'WARNING: Overheating',
    suggestion: 'Check cooling flow, lubrication, and load conditions to reduce thermal stress.'
  },
  danger: {
    className: 'danger',
    title: 'DANGER: Bearing Failure Risk',
    suggestion: 'Reduce load and inspect bearings immediately to prevent catastrophic damage.'
  }
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isInvalidNumber = (value) => Number.isNaN(value) || !Number.isFinite(value);
const parseField = (element) => Number.parseFloat(element.value);

function applyResult(targetBox, targetTitle, targetMessage, stateClass, title, message) {
  targetBox.classList.remove('safe', 'warning', 'danger');
  targetBox.classList.add(stateClass);
  targetTitle.textContent = title;
  targetMessage.textContent = message;
}

// -------------------------------
// Main health checker
// -------------------------------
function evaluateCondition(temperature, vibration) {
  if (temperature > 100 && vibration > 7) return 'danger';
  if (vibration > 7) return 'warningVibration';
  if (temperature > 100) return 'warningTemp';
  return 'safe';
}

function getTrendDirection(values) {
  if (values.length < 2) return 'stable';
  const slope = (values[values.length - 1] - values[0]) / (values.length - 1);
  if (slope > EPSILON) return 'rising';
  if (slope < -EPSILON) return 'falling';
  return 'stable';
}

function computeHistoryTrend(history) {
  if (history.length < 2) {
    return { temp: 'stable', vib: 'stable', rpm: 'stable', dangerTrend: false };
  }

  const temperatureTrend = getTrendDirection(history.map((item) => item.temperature));
  const vibrationTrend = getTrendDirection(history.map((item) => item.vibration));
  const rpmTrend = getTrendDirection(history.map((item) => item.rpm));
  const dangerTrend = temperatureTrend === 'rising' && vibrationTrend === 'rising';

  return { temp: temperatureTrend, vib: vibrationTrend, rpm: rpmTrend, dangerTrend };
}

function arrowForTrend(direction) {
  if (direction === 'rising') return '↑ rising';
  if (direction === 'falling') return '↓ falling';
  return '→ stable';
}

function loadHistory() {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_LIMIT)));
}

const historyState = {
  readings: loadHistory()
};

const trendUI = {
  box: document.getElementById('trend-result'),
  title: document.getElementById('trend-title'),
  message: document.getElementById('trend-message'),
  list: document.getElementById('history-list')
};

function renderHistory() {
  trendUI.list.innerHTML = '';
  const latestFive = historyState.readings.slice(-HISTORY_LIMIT).reverse();

  if (!latestFive.length) {
    trendUI.list.innerHTML = '<p class="inline-note">No readings saved yet.</p>';
    return;
  }

  latestFive.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div>T ${entry.temperature.toFixed(1)}°C | V ${entry.vibration.toFixed(1)} mm/s | ${entry.rpm.toFixed(0)} RPM</div>
      <time>${new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
    `;
    trendUI.list.appendChild(item);
  });
}

function updateTrendPanel() {
  const trend = computeHistoryTrend(historyState.readings);
  const title = `Trend: Temp ${arrowForTrend(trend.temp)}, Vib ${arrowForTrend(trend.vib)}`;

  if (trend.dangerTrend) {
    applyResult(
      trendUI.box,
      trendUI.title,
      trendUI.message,
      'danger',
      title,
      'Warning: both temperature and vibration are trending upward. Inspect early to avoid escalation.'
    );
  } else {
    applyResult(
      trendUI.box,
      trendUI.title,
      trendUI.message,
      'safe',
      title,
      `RPM trend ${arrowForTrend(trend.rpm)}. Last ${Math.min(historyState.readings.length, HISTORY_LIMIT)} readings stored locally.`
    );
  }

  renderHistory();
}

function pushReading(temperature, vibration, rpm) {
  historyState.readings.push({ temperature, vibration, rpm, timestamp: Date.now() });
  historyState.readings = historyState.readings.slice(-HISTORY_LIMIT);
  saveHistory(historyState.readings);
  updateTrendPanel();
}

function evaluateMainAndRender(temperature, vibration, rpm) {
  const conditionKey = evaluateCondition(temperature, vibration);
  const condition = conditionConfig[conditionKey];

  let message = condition.suggestion;
  const trend = computeHistoryTrend(historyState.readings);
  if (conditionKey === 'safe' && trend.dangerTrend) {
    message = `${condition.suggestion} Trend warning: readings are rising; schedule proactive inspection.`;
  }

  applyResult(output.box, output.title, output.message, condition.className, condition.title, message);
  setModelState(conditionKey);
  pushReading(temperature, vibration, rpm);
}

const form = document.getElementById('health-form');
form.addEventListener('submit', (event) => {
  event.preventDefault();

  const temperature = parseField(fields.temperature);
  const vibration = parseField(fields.vibration);
  const rpm = parseField(fields.rpm);

  if ([temperature, vibration, rpm].some(isInvalidNumber)) {
    applyResult(
      output.box,
      output.title,
      output.message,
      'danger',
      'Please complete all fields',
      'Temperature, vibration, and RPM are required before analysis.'
    );
    return;
  }

  evaluateMainAndRender(temperature, vibration, rpm);
});

document.querySelectorAll('[data-preset]').forEach((button) => {
  button.addEventListener('click', () => {
    const preset = button.dataset.preset;
    const presetMap = {
      normal: { temperature: 88, vibration: 3.8, rpm: 1800 },
      warning: { temperature: 103, vibration: 6.6, rpm: 1775 },
      danger: { temperature: 116, vibration: 8.7, rpm: 1705 }
    };

    const selected = presetMap[preset];
    fields.temperature.value = selected.temperature;
    fields.vibration.value = selected.vibration;
    fields.rpm.value = selected.rpm;
    evaluateMainAndRender(selected.temperature, selected.vibration, selected.rpm);
  });
});

// -------------------------------
// Smart calculator modules
// -------------------------------
const performanceInputs = {
  inlet: document.getElementById('inlet-temp'),
  outlet: document.getElementById('outlet-temp'),
  pressureRatio: document.getElementById('pressure-ratio'),
  massFlow: document.getElementById('mass-flow')
};

const performanceUI = {
  box: document.getElementById('performance-result'),
  title: document.getElementById('performance-title'),
  message: document.getElementById('performance-message'),
  details: document.getElementById('performance-details')
};

function calculatePerformance(input) {
  const gamma = 1.33;
  const cp = 1.148; // kJ/(kg*K), hot gas approximation

  const tinK = input.inlet + 273.15;
  const toutK = input.outlet + 273.15;
  const idealTout = tinK * Math.pow(1 / input.pressureRatio, (gamma - 1) / gamma);

  const etaIsentropic = clamp((tinK - toutK) / (tinK - idealTout), 0, 1.05);
  const thermalDrop = Math.max(0, tinK - toutK);
  const powerKW = input.massFlow * cp * thermalDrop;

  return {
    efficiencyPct: etaIsentropic * 100,
    powerKW,
    details: `η_is ≈ (T_in - T_out)/(T_in - T_out,ideal) = (${tinK.toFixed(1)} - ${toutK.toFixed(1)})/(${tinK.toFixed(1)} - ${idealTout.toFixed(1)})`
  };
}

function renderPerformance() {
  const values = {
    inlet: parseField(performanceInputs.inlet),
    outlet: parseField(performanceInputs.outlet),
    pressureRatio: parseField(performanceInputs.pressureRatio),
    massFlow: parseField(performanceInputs.massFlow)
  };

  if (Object.values(values).some(isInvalidNumber)) {
    applyResult(
      performanceUI.box,
      performanceUI.title,
      performanceUI.message,
      'warning',
      'Waiting for complete inputs',
      'Provide inlet/outlet temperatures, pressure ratio, and mass flow.'
    );
    return;
  }

  if (values.outlet >= values.inlet || values.pressureRatio <= 1 || values.massFlow <= 0) {
    applyResult(
      performanceUI.box,
      performanceUI.title,
      performanceUI.message,
      'danger',
      'Input consistency issue',
      'Expected: inlet > outlet, pressure ratio > 1, and positive mass flow.'
    );
    return;
  }

  const result = calculatePerformance(values);
  const health = result.efficiencyPct < 60 ? 'danger' : result.efficiencyPct < 80 ? 'warning' : 'safe';

  const guidance =
    health === 'danger'
      ? 'Low efficiency. Check blade fouling, leaks, and expansion path losses.'
      : health === 'warning'
        ? 'Moderate efficiency. Tune operating point and inspect compressor/turbine matching.'
        : 'Performance is healthy for the current operating point.';

  applyResult(
    performanceUI.box,
    performanceUI.title,
    performanceUI.message,
    health,
    `Efficiency ${result.efficiencyPct.toFixed(1)}% | Power ${result.powerKW.toFixed(0)} kW`,
    guidance
  );
  performanceUI.details.textContent = `${result.details} | P ≈ m·cp·ΔT = ${result.powerKW.toFixed(1)} kW`;
}

const maintenanceInputs = {
  hours: document.getElementById('run-hours'),
  vibration: document.getElementById('maint-vibration'),
  temperature: document.getElementById('maint-temp')
};

const maintenanceUI = {
  box: document.getElementById('maintenance-result'),
  title: document.getElementById('maintenance-title'),
  message: document.getElementById('maintenance-message'),
  details: document.getElementById('maintenance-details')
};

function evaluateMaintenance(values) {
  const hourScore = clamp(values.hours / 8000, 0, 1) * 35;
  const vibrationScore = clamp(values.vibration / 8, 0, 1.4) * 40;
  const temperatureScore = clamp((values.temperature - 50) / 60, 0, 1.4) * 25;
  const total = hourScore + vibrationScore + temperatureScore;

  if (total >= 78) {
    return {
      level: 'danger',
      urgency: 'Urgency: Immediate',
      action: 'Schedule shutdown inspection now. Prioritize bearings, alignment, and lubrication circuit.',
      formula: `Score=${total.toFixed(1)} (H:${hourScore.toFixed(1)} V:${vibrationScore.toFixed(1)} T:${temperatureScore.toFixed(1)})`
    };
  }

  if (total >= 52) {
    return {
      level: 'warning',
      urgency: 'Urgency: Planned Soon',
      action: 'Plan maintenance in next operating window and trend vibration daily.',
      formula: `Score=${total.toFixed(1)} (H:${hourScore.toFixed(1)} V:${vibrationScore.toFixed(1)} T:${temperatureScore.toFixed(1)})`
    };
  }

  return {
    level: 'safe',
    urgency: 'Urgency: Routine',
    action: 'Continue normal operation with scheduled maintenance interval.',
    formula: `Score=${total.toFixed(1)} (H:${hourScore.toFixed(1)} V:${vibrationScore.toFixed(1)} T:${temperatureScore.toFixed(1)})`
  };
}

function renderMaintenance() {
  const values = {
    hours: parseField(maintenanceInputs.hours),
    vibration: parseField(maintenanceInputs.vibration),
    temperature: parseField(maintenanceInputs.temperature)
  };

  if (Object.values(values).some(isInvalidNumber)) {
    applyResult(
      maintenanceUI.box,
      maintenanceUI.title,
      maintenanceUI.message,
      'warning',
      'Waiting for complete inputs',
      'Enter running hours, vibration, and temperature to compute urgency.'
    );
    return;
  }

  const result = evaluateMaintenance(values);
  applyResult(maintenanceUI.box, maintenanceUI.title, maintenanceUI.message, result.level, result.urgency, result.action);
  maintenanceUI.details.textContent = result.formula;
}

const converterInputs = {
  c: document.getElementById('temp-c'),
  f: document.getElementById('temp-f'),
  rpm: document.getElementById('rpm-convert'),
  hz: document.getElementById('hz-convert'),
  mms: document.getElementById('mms-convert'),
  ms: document.getElementById('ms-convert')
};

function setValue(input, value) {
  input.value = Number.isFinite(value) ? value.toFixed(4).replace(/\.?0+$/, '') : '';
}

function bindConverterPair(sourceEl, targetEl, convertFn) {
  sourceEl.addEventListener('input', () => {
    const sourceValue = parseField(sourceEl);
    if (isInvalidNumber(sourceValue)) {
      targetEl.value = '';
      return;
    }
    setValue(targetEl, convertFn(sourceValue));
  });
}

bindConverterPair(converterInputs.c, converterInputs.f, (value) => (value * 9) / 5 + 32);
bindConverterPair(converterInputs.f, converterInputs.c, (value) => ((value - 32) * 5) / 9);
bindConverterPair(converterInputs.rpm, converterInputs.hz, (value) => value / 60);
bindConverterPair(converterInputs.hz, converterInputs.rpm, (value) => value * 60);
bindConverterPair(converterInputs.mms, converterInputs.ms, (value) => value / 1000);
bindConverterPair(converterInputs.ms, converterInputs.mms, (value) => value * 1000);

function resetCalculatorCard(inputSet, callback) {
  Object.values(inputSet).forEach((input) => {
    input.value = '';
  });
  callback();
}

Object.values(performanceInputs).forEach((input) => input.addEventListener('input', renderPerformance));
Object.values(maintenanceInputs).forEach((input) => input.addEventListener('input', renderMaintenance));

document.getElementById('performance-reset').addEventListener('click', () => resetCalculatorCard(performanceInputs, renderPerformance));
document.getElementById('maintenance-reset').addEventListener('click', () => resetCalculatorCard(maintenanceInputs, renderMaintenance));
document.getElementById('converter-reset').addEventListener('click', () => {
  Object.values(converterInputs).forEach((input) => {
    input.value = '';
  });
});

// Simple self-checks (run in DevTools):
// console.assert(evaluateCondition(101, 8) === 'danger', 'danger rule failed');
// console.assert(calculatePerformance({ inlet: 520, outlet: 360, pressureRatio: 6.5, massFlow: 42 }).powerKW > 0, 'power calc failed');

// -------------------------------
// 3D turbine model (existing feature)
// -------------------------------
const canvasHost = document.getElementById('turbine-canvas');
let scene;
let camera;
let renderer;
let controls;
let shaftMesh;
let bearingMesh;
let blades;
let animationHandle;

const baseColors = {
  shaft: new THREE.Color('#7f8fa6'),
  bearing: new THREE.Color('#5f6b8e'),
  blades: new THREE.Color('#71a0ff')
};

const statusColors = {
  safe: new THREE.Color('#23bf7f'),
  warning: new THREE.Color('#ffd452'),
  danger: new THREE.Color('#ff6d88')
};

function buildTurbineModel() {
  const turbineGroup = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: '#283657', metalness: 0.7, roughness: 0.35 });
  const shaftMat = new THREE.MeshStandardMaterial({ color: baseColors.shaft, metalness: 0.75, roughness: 0.3 });
  const bearingMat = new THREE.MeshStandardMaterial({ color: baseColors.bearing, metalness: 0.7, roughness: 0.3, emissive: 0x000000 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: baseColors.blades, metalness: 0.45, roughness: 0.35 });

  const housing = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 2.4, 20), bodyMat);
  housing.rotation.z = Math.PI / 2;
  turbineGroup.add(housing);

  shaftMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.2, 16), shaftMat);
  shaftMesh.rotation.z = Math.PI / 2;
  turbineGroup.add(shaftMesh);

  bearingMesh = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.11, 14, 28), bearingMat);
  bearingMesh.rotation.y = Math.PI / 2;
  turbineGroup.add(bearingMesh);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 14), bodyMat);
  hub.position.x = -1.05;
  hub.rotation.z = Math.PI / 2;
  turbineGroup.add(hub);

  blades = new THREE.Group();
  const bladeGeometry = new THREE.BoxGeometry(1.0, 0.1, 0.24);
  for (let i = 0; i < 3; i += 1) {
    const blade = new THREE.Mesh(bladeGeometry, bladeMat);
    blade.position.x = -1.38;
    blade.rotation.x = (i * Math.PI * 2) / 3;
    blade.position.y = Math.cos(blade.rotation.x) * 0.37;
    blade.position.z = Math.sin(blade.rotation.x) * 0.37;
    blades.add(blade);
  }

  turbineGroup.add(blades);
  scene.add(turbineGroup);
}

function setModelState(conditionKey) {
  if (!bearingMesh || !shaftMesh) return;

  const bearingMaterial = bearingMesh.material;
  const shaftMaterial = shaftMesh.material;

  bearingMaterial.emissiveIntensity = 0;
  shaftMaterial.emissiveIntensity = 0;
  bearingMaterial.emissive.setHex(0x000000);
  shaftMaterial.emissive.setHex(0x000000);

  if (conditionKey === 'danger') {
    bearingMaterial.color.copy(statusColors.danger);
    bearingMaterial.emissive.copy(statusColors.danger);
    bearingMaterial.emissiveIntensity = 0.35;
    shaftMaterial.color.copy(statusColors.warning);
  } else if (conditionKey === 'warningVibration') {
    shaftMaterial.color.copy(statusColors.warning);
    shaftMaterial.emissive.copy(statusColors.warning);
    shaftMaterial.emissiveIntensity = 0.18;
    bearingMaterial.color.copy(baseColors.bearing);
  } else if (conditionKey === 'warningTemp') {
    bearingMaterial.color.copy(statusColors.warning);
    shaftMaterial.color.copy(baseColors.shaft);
  } else {
    bearingMaterial.color.copy(statusColors.safe);
    shaftMaterial.color.copy(statusColors.safe);
  }
}

function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1228');

  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(3.2, 1.8, 3.2);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
  canvasHost.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 2;
  controls.maxDistance = 7;
  controls.enablePan = false;

  const ambientLight = new THREE.AmbientLight('#8ba4ff', 0.7);
  const keyLight = new THREE.DirectionalLight('#ffffff', 1.2);
  keyLight.position.set(3, 4, 2);
  scene.add(ambientLight, keyLight);

  buildTurbineModel();
  setModelState('safe');

  const animate = () => {
    animationHandle = window.requestAnimationFrame(animate);
    blades.rotation.x += 0.028;
    controls.update();
    renderer.render(scene, camera);
  };

  animate();
}

window.addEventListener('resize', () => {
  if (!renderer || !camera) return;
  const { clientWidth, clientHeight } = canvasHost;
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(clientWidth, clientHeight);
});

window.addEventListener('beforeunload', () => {
  window.cancelAnimationFrame(animationHandle);
  controls?.dispose();
  renderer?.dispose();
});

init3D();
renderPerformance();
renderMaintenance();
updateTrendPanel();
