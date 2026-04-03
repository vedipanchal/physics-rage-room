import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.164.1/examples/jsm/controls/OrbitControls.js';

const form = document.getElementById('health-form');
const temperatureInput = document.getElementById('temperature');
const vibrationInput = document.getElementById('vibration');
const rpmInput = document.getElementById('rpm');
const resultBox = document.getElementById('result');
const statusTitle = document.getElementById('status-title');
const statusMessage = document.getElementById('status-message');

const canvasHost = document.getElementById('turbine-canvas');

const conditionConfig = {
  safe: {
    title: 'SAFE: Normal Operation',
    suggestion: 'System is stable. Continue routine monitoring and scheduled maintenance.',
    className: 'safe'
  },
  warningVibration: {
    title: 'WARNING: Imbalance or Misalignment',
    suggestion: 'Inspect rotor alignment and balancing. Plan corrective service soon.',
    className: 'warning'
  },
  warningTemp: {
    title: 'WARNING: Overheating',
    suggestion: 'Check cooling flow, lubrication, and load conditions to reduce thermal stress.',
    className: 'warning'
  },
  danger: {
    title: 'DANGER: Bearing Failure Risk',
    suggestion: 'Reduce load and inspect bearings immediately to prevent catastrophic damage.',
    className: 'danger'
  }
};

function evaluateCondition(temperature, vibration) {
  if (temperature > 100 && vibration > 7) return 'danger';
  if (vibration > 7) return 'warningVibration';
  if (temperature > 100) return 'warningTemp';
  return 'safe';
}

function updateResult(conditionKey) {
  const condition = conditionConfig[conditionKey];
  resultBox.classList.remove('safe', 'warning', 'danger');
  resultBox.classList.add(condition.className);
  statusTitle.textContent = condition.title;
  statusMessage.textContent = condition.suggestion;
  setModelState(conditionKey);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const temperature = Number.parseFloat(temperatureInput.value);
  const vibration = Number.parseFloat(vibrationInput.value);
  const rpm = Number.parseFloat(rpmInput.value);

  if ([temperature, vibration, rpm].some((value) => Number.isNaN(value))) {
    statusTitle.textContent = 'Please complete all fields';
    statusMessage.textContent = 'Temperature, vibration, and RPM are required before analysis.';
    resultBox.classList.remove('safe', 'warning', 'danger');
    resultBox.classList.add('danger');
    return;
  }

  const conditionKey = evaluateCondition(temperature, vibration);
  updateResult(conditionKey);
});

let scene;
let camera;
let renderer;
let controls;
let turbineGroup;
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
  turbineGroup = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: '#283657', metalness: 0.7, roughness: 0.35 });
  const shaftMat = new THREE.MeshStandardMaterial({ color: baseColors.shaft, metalness: 0.75, roughness: 0.3 });
  const bearingMat = new THREE.MeshStandardMaterial({ color: baseColors.bearing, metalness: 0.7, roughness: 0.3, emissive: 0x000000 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: baseColors.blades, metalness: 0.45, roughness: 0.35 });

  const housing = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 2.4, 22), bodyMat);
  housing.rotation.z = Math.PI / 2;
  turbineGroup.add(housing);

  shaftMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.2, 18), shaftMat);
  shaftMesh.rotation.z = Math.PI / 2;
  turbineGroup.add(shaftMesh);

  bearingMesh = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.11, 16, 34), bearingMat);
  bearingMesh.rotation.y = Math.PI / 2;
  turbineGroup.add(bearingMesh);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 16), bodyMat);
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

  if (conditionKey === 'danger') {
    bearingMaterial.color.copy(statusColors.danger);
    bearingMaterial.emissive.copy(statusColors.danger);
    bearingMaterial.emissiveIntensity = 0.38;
    shaftMaterial.color.copy(statusColors.warning);
  } else if (conditionKey === 'warningVibration') {
    shaftMaterial.color.copy(statusColors.warning);
    shaftMaterial.emissive.copy(statusColors.warning);
    shaftMaterial.emissiveIntensity = 0.2;
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
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
    blades.rotation.x += 0.03;
    controls.update();
    renderer.render(scene, camera);
  };

  animate();
}

function onResize() {
  if (!renderer || !camera) return;
  const { clientWidth, clientHeight } = canvasHost;
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(clientWidth, clientHeight);
}

window.addEventListener('resize', onResize);
window.addEventListener('beforeunload', () => {
  window.cancelAnimationFrame(animationHandle);
  controls?.dispose();
  renderer?.dispose();
});

init3D();
