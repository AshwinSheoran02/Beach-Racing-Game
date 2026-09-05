import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import "./style.css";
const $ = (id: string) => document.getElementById(id)!;
const clamp = T.MathUtils.clamp,
  lerp = T.MathUtils.lerp,
  TAU = Math.PI * 2;
const wrap = (n: number, m = 1) => ((n % m) + m) % m,
  angle = (n: number) => wrap(n + Math.PI, TAU) - Math.PI;
let seed = 42;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const scene = new T.Scene();
scene.background = new T.Color("#8ed6e5");
scene.fog = new T.Fog("#a9dce3", 190, 640);
const renderer = new T.WebGLRenderer({
  canvas: $("game") as HTMLCanvasElement,
  antialias: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const camera = new T.PerspectiveCamera(60, innerWidth / innerHeight, 0.2, 1100);
scene.add(new T.HemisphereLight(0xd2f4ff, 0xbca078, 2.2));
const sun = new T.DirectionalLight(0xffefce, 2.6);
sun.position.set(-90, 160, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -160,
  right: 160,
  top: 160,
  bottom: -160,
  near: 1,
  far: 440,
});
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);
const mats = new Map<string, T.MeshStandardMaterial>();
function mat(c: string) {
  if (!mats.has(c))
    mats.set(c, new T.MeshStandardMaterial({ color: c, roughness: 0.83 }));
  return mats.get(c)!;
}
const batches = new Map<string, T.BufferGeometry[]>();
function mesh(
  g: T.BufferGeometry,
  c: string,
  x = 0,
  y = 0,
  z = 0,
  parent: T.Object3D = scene,
) {
  const m = new T.Mesh(g, mat(c));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function box(
  c: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  parent: T.Object3D = scene,
) {
  return mesh(new T.BoxGeometry(w, h, d), c, x, y, z, parent);
}
function staticGroup(g: T.Group) {
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    if (o instanceof T.Mesh) {
      const c = (o.material as T.MeshStandardMaterial).color.getHexString();
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (!batches.has(c)) batches.set(c, []);
      batches.get(c)!.push(geo);
    }
  });
}
function bake() {
  for (const [c, geos] of batches) {
    const m = new T.Mesh(
      mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))),
      mat("#" + c),
    );
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
  batches.clear();
}
const curve = new T.CatmullRomCurve3(
  [
    [-15, 0, 90],
    [60, 0, 90],
    [112, 0, 58],
    [120, 0, -5],
    [110, 0, -75],
    [70, 0, -110],
    [25, 0, -95],
    [-5, 0, -56],
    [-50, 0, -70],
    [-100, 0, -105],
    [-132, 0, -68],
    [-120, 0, -15],
    [-82, 0, 12],
    [-110, 0, 55],
    [-70, 0, 92],
  ].map((p) => new T.Vector3(...(p as [number, number, number]))),
  true,
  "catmullrom",
  0.45,
);
const length = curve.getLength(),
  N = 900,
  half = 9;
function height(u: number) {
  return u > 0.4 && u < 0.53 ? Math.sin(((u - 0.4) / 0.13) * Math.PI) * 2.7 : 0;
}
function point(u: number) {
  u = wrap(u);
  const p = curve.getPointAt(u);
  p.y = height(u);
  return p;
}
function tangent(u: number) {
  return curve.getTangentAt(wrap(u)).setY(0).normalize();
}
function location(u: number, lane = 0) {
  const p = point(u),
    t = tangent(u);
  return p.add(new T.Vector3(t.z, 0, -t.x).multiplyScalar(lane));
}
const samples = Array.from({ length: N }, (_, i) => point(i / N));
function nearest(p: T.Vector3) {
  let best = Infinity,
    idx = 0;
  for (let i = 0; i < N; i++) {
    const q = samples[i],
      d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (d < best) {
      best = d;
      idx = i;
    }
  }
  const u = idx / N,
    t = tangent(u),
    q = samples[idx];
  return {
    u,
    dist: Math.sqrt(best),
    lane: (p.x - q.x) * t.z - (p.z - q.z) * t.x,
    t,
    p: q,
  };
}
function ribbon(width: number, c: string, offset = 0) {
  const v: number[] = [],
    ix: number[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N,
      p = point(u),
      t = tangent(u);
    for (const side of [-1, 1])
      v.push(p.x + t.z * width * side, p.y + offset, p.z - t.x * width * side);
    if (i < N) {
      const a = i * 2;
      ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(v, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  const m = mesh(g, c);
  m.receiveShadow = true;
  return m;
}
box("#edd39a", -15, -1.6, 0, 300, 3, 300);
box("#c9bc8b", 143, -1.1, 0, 18, 1, 300);
const water = mesh(
  new T.PlaneGeometry(1400, 1400, 90, 90),
  "#159fc0",
  350,
  -1.1,
  0,
);
water.rotation.x = -Math.PI / 2;
(water.material as T.MeshStandardMaterial).metalness = 0.25;
(water.material as T.MeshStandardMaterial).roughness = 0.3;
water.castShadow = false;
ribbon(11, "#e8c886", 0.015);
ribbon(9, "#d9b276", 0.035);
// Interrupted edge ribbons provide an unmistakable racing route.
for (let i = 0; i < 230; i++) {
  const u = i / 230,
    t = tangent(u);
  for (const side of [-1, 1]) {
    const p = location(u, side * 9.4);
    const g = new T.Group();
    const b = box(
      i % 2 ? "#fff0c9" : "#f18866",
      p.x,
      p.y + 0.12,
      p.z,
      0.34,
      0.2,
      (length / 230) * 0.83,
      g,
    );
    b.rotation.y = Math.atan2(t.x, t.z);
    staticGroup(g);
  }
}
function palm(x: number, z: number, s = 1) {
  const g = new T.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  const trunk = mesh(
    new T.CylinderGeometry(0.27, 0.52, 7, 7),
    "#997047",
    0,
    3.5,
    0,
    g,
  );
  trunk.rotation.z = -0.12;
  for (let i = 0; i < 7; i++) {
    const a = (i * TAU) / 7;
    const leaf = mesh(
      new T.ConeGeometry(1.1, 5.9, 4),
      "#31976b",
      Math.sin(a) * 2,
      6.9,
      Math.cos(a) * 2,
      g,
    );
    leaf.rotation.set(Math.cos(a) * 1.3, 0, -Math.sin(a) * 1.3);
  }
  staticGroup(g);
}
function umbrella(x: number, z: number, c: string) {
  const g = new T.Group();
  box("#f2e5c1", x, 1.6, z, 0.12, 3.2, 0.12, g);
  mesh(new T.ConeGeometry(2.3, 0.9, 10), c, x, 3.5, z, g);
  for (let k = -1; k <= 1; k += 2) {
    const chair = box("#fff0d6", x + k * 1.2, 0.6, z + 2, 0.8, 0.15, 1.8, g);
    chair.rotation.x = -0.2;
    box("#b78959", x + k * 1.2, 0.3, z + 2, 0.12, 0.6, 1.3, g);
  }
  box("#e87560", x, 0.35, z + 1, 0.7, 0.7, 0.5, g);
  staticGroup(g);
}
function hut(x: number, z: number, c: string) {
  const g = new T.Group();
  box("#ad8659", x, 0.6, z, 8, 1, 6, g);
  box(c, x, 2.4, z, 6.5, 3.2, 4.8, g);
  const roof = mesh(new T.ConeGeometry(5.4, 2.7, 4), "#b58750", x, 5.2, z, g);
  roof.rotation.y = Math.PI / 4;
  box("#244e59", x, 2.6, z + 2.45, 1.8, 2.4, 0.12, g);
  for (const dx of [-2.3, 2.3])
    box("#e2f5e2", x + dx, 2.9, z + 2.48, 1.3, 1.2, 0.12, g);
  staticGroup(g);
}
for (let i = 0; i < 100; i++) {
  const x = -145 + rand() * 287,
    z = -140 + rand() * 270;
  if (nearest(new T.Vector3(x, 0, z)).dist > 15)
    palm(x, z, 0.7 + rand() * 0.65);
}
for (let i = 0; i < 13; i++)
  umbrella(
    141 + rand() * 8,
    -90 + i * 14,
    ["#f08372", "#5bc6bb", "#ffdc79"][i % 3],
  );
for (let i = 0; i < 6; i++)
  hut(-45 + i * 16, 118, ["#70bfb6", "#f49a79", "#f0cd75"][i % 3]);
for (let i = 0; i < 45; i++) {
  const x = -160 + rand() * 65,
    z = -140 + rand() * 90;
  if (nearest(new T.Vector3(x, 0, z)).dist < 14) continue;
  const g = new T.Group();
  const r = mesh(
    new T.DodecahedronGeometry(2 + rand() * 6, 0),
    "#939d92",
    x,
    1,
    z,
    g,
  );
  r.scale.set(1, 0.8, 1.1);
  staticGroup(g);
}
// Raised boardwalk and railings.
for (let i = 0; i < 95; i++) {
  const u = 0.405 + i * 0.00125,
    p = point(u),
    t = tangent(u),
    g = new T.Group();
  const b = box(
    i % 3 ? "#ac8155" : "#b98f5e",
    p.x,
    p.y + 0.08,
    p.z,
    18,
    0.18,
    length * 0.0012,
    g,
  );
  b.rotation.y = Math.atan2(t.x, t.z);
  if (i % 4 === 0)
    for (const side of [-1, 1]) {
      const q = location(u, side * 10);
      box("#f2dfb4", q.x, q.y + 0.9, q.z, 0.25, 1.8, 0.25, g);
      const rail = box(
        "#b2865b",
        q.x,
        q.y + 1.4,
        q.z,
        0.22,
        0.18,
        length * 0.005,
        g,
      );
      rail.rotation.y = b.rotation.y;
    }
  staticGroup(g);
}
// Lifeguard stations, surfboards, spectators and festive route flags.
for (const z of [-25, 55]) {
  const g = new T.Group();
  for (const x of [145, 149])
    for (const dz of [-2, 2]) box("#eee4bd", x, 2, z + dz, 0.24, 4, 0.24, g);
  box("#f7e5b1", 147, 4, z, 5, 0.25, 5, g);
  box("#f6faf0", 147, 5, z, 4, 2, 3, g);
  box("#f18169", 147, 6.3, z, 5, 0.35, 4, g);
  box("#e6775b", 147, 5.2, z + 1.53, 0.35, 1.3, 0.08, g);
  box("#e6775b", 147, 5.2, z + 1.54, 1.2, 0.35, 0.08, g);
  staticGroup(g);
}
const flags: T.Mesh[] = [];
for (let i = 0; i < 42; i++) {
  const u = i / 42;
  for (const side of [-1, 1]) {
    const p = location(u, side * 11.8),
      g = new T.Group();
    box("#f8eaca", p.x, p.y + 1.8, p.z, 0.13, 3.6, 0.13, g);
    staticGroup(g);
    const f = mesh(
      new T.PlaneGeometry(1.5, 0.75),
      "#ef806c",
      p.x + 0.75,
      p.y + 3.15,
      p.z,
    );
    (f.material as T.MeshStandardMaterial).side = T.DoubleSide;
    flags.push(f);
  }
}
for (let i = 0; i < 24; i++) {
  const g = new T.Group(),
    x = -50 + i * 4,
    z = 106 + rand() * 3;
  mesh(new T.SphereGeometry(0.3, 6, 5), "#d49b72", x, 1.65, z, g);
  box(
    ["#ef826d", "#58a9bb", "#fff3ce"][i % 3],
    x,
    1.05,
    z,
    0.55,
    0.85,
    0.35,
    g,
  );
  for (const d of [-0.17, 0.17])
    box("#426575", x + d, 0.35, z, 0.16, 0.65, 0.2, g);
  staticGroup(g);
}
for (let i = 0; i < 12; i++) {
  const g = new T.Group(),
    z = -80 + i * 17;
  const surf = mesh(
    new T.SphereGeometry(1, 8, 6),
    ["#f8a263", "#5ab9b7", "#f5edcd"][i % 3],
    137,
    1.2,
    z,
    g,
  );
  surf.scale.set(0.45, 1.8, 0.13);
  surf.rotation.z = 0.25;
  mesh(new T.SphereGeometry(0.45, 8, 6), "#ffcf68", 139, 0.5, z + 3, g);
  staticGroup(g);
}
for (let i = 0; i < 9; i++) {
  const g = new T.Group(),
    x = 190 + rand() * 170,
    z = -180 + rand() * 360;
  const hull = mesh(new T.SphereGeometry(1, 8, 5), "#f8f1d3", x, 0, z, g);
  hull.scale.set(2, 0.8, 5);
  box("#8b755c", x, 4, z, 0.15, 8, 0.15, g);
  const sail = mesh(new T.ConeGeometry(3, 6, 3), "#fff3cf", x, 4.5, z, g);
  sail.scale.z = 0.05;
  staticGroup(g);
}
for (let i = 0; i < 30; i++) {
  const g = new T.Group();
  mesh(new T.SphereGeometry(0.4, 6, 5), "#f6c764", 173, 0.1, -150 + i * 10, g);
  staticGroup(g);
}
// Start arch and checker stripe.
const startPoint = point(0),
  st = tangent(0),
  arch = new T.Group();
arch.position.copy(startPoint);
arch.rotation.y = Math.atan2(st.x, st.z);
for (const x of [-11, 11]) box("#1b6570", x, 4, 0, 0.6, 8, 0.6, arch);
box("#1b6570", 0, 7.5, 0, 22, 1.7, 0.6, arch);
const sign = document.createElement("canvas");
sign.width = 1024;
sign.height = 128;
const sc = sign.getContext("2d")!;
sc.fillStyle = "#175863";
sc.fillRect(0, 0, 1024, 128);
sc.fillStyle = "#ffe3a0";
sc.font = "900 64px Arial";
sc.textAlign = "center";
sc.fillText("SUNCOAST  /  SPRINT", 512, 85);
const sm = new T.Mesh(
  new T.PlaneGeometry(20, 2.5),
  new T.MeshBasicMaterial({
    map: new T.CanvasTexture(sign),
    side: T.DoubleSide,
  }),
);
sm.position.set(0, 7.5, -0.34);
sm.rotation.y = Math.PI;
arch.add(sm);
scene.add(arch);
for (let j = 0; j < 2; j++)
  for (let i = 0; i < 18; i++) {
    const q = location(j * 0.001, i - 8.5),
      g = new T.Group();
    const b = box(
      (i + j) % 2 ? "#fff4db" : "#354e4d",
      q.x,
      0.08,
      q.z,
      1,
      0.05,
      length * 0.001,
      g,
    );
    b.rotation.y = arch.rotation.y;
    staticGroup(g);
  }
bake();
const foam: T.Mesh[] = [];
for (let i = 0; i < 8; i++) {
  const m = mesh(new T.PlaneGeometry(1, 680), "#e0f6e5", 164 + i * 8, -0.6, 0);
  m.rotation.x = -Math.PI / 2;
  m.castShadow = false;
  (m.material as T.MeshStandardMaterial).transparent = true;
  foam.push(m);
}
const birds = new T.Group();
for (let i = 0; i < 12; i++) {
  const b = box(
    "#f5f1d9",
    Math.sin(i * 2) * 60,
    25 + rand() * 15,
    Math.cos(i) * 80,
    1.5,
    0.08,
    0.22,
    birds,
  );
  b.rotation.z = 0.2;
}
scene.add(birds);
function makeCar(color: string) {
  const g = new T.Group(),
    body = new T.Group();
  g.add(body);
  box("#243d45", 0, 0.48, 0, 1.9, 0.32, 3.8, body);
  box(color, 0, 0.85, 0, 2, 0.6, 3.9, body);
  box(color, 0, 1.04, 1.25, 1.85, 0.22, 1.4, body);
  const cabin = box("#254e60", 0, 1.38, -0.25, 1.6, 0.65, 1.7, body);
  cabin.rotation.x = -0.09;
  box(color, 0, 1.75, -0.4, 1.64, 0.12, 1.3, body);
  box("#fff1cc", 0, 1.15, 1.24, 0.24, 0.04, 1.5, body);
  box("#fff1cc", 0, 1.82, -0.4, 0.24, 0.03, 1.2, body);
  box("#193943", 0, 1.22, -1.8, 2.15, 0.12, 0.4, body);
  for (const x of [-0.68, 0.68]) {
    box("#fff4bb", x, 0.95, 1.97, 0.48, 0.21, 0.05, body);
    box("#f56254", x, 0.91, -1.97, 0.5, 0.17, 0.05, body);
  }
  const wheels: T.Group[] = [],
    tires: T.Mesh[] = [];
  for (const z of [-1.22, 1.2])
    for (const x of [-1, 1]) {
      const w = new T.Group();
      w.position.set(x, 0.5, z);
      g.add(w);
      const tire = mesh(
        new T.CylinderGeometry(0.46, 0.46, 0.32, 12),
        "#26353b",
        0,
        0,
        0,
        w,
      );
      tire.rotation.z = Math.PI / 2;
      const hub = mesh(
        new T.CylinderGeometry(0.25, 0.25, 0.34, 8),
        "#e7e0c8",
        0,
        0,
        0,
        w,
      );
      hub.rotation.z = Math.PI / 2;
      wheels.push(w);
      tires.push(tire);
    }
  scene.add(g);
  return { g, body, wheels, tires };
}
type Car = {
  name: string;
  color: string;
  model: ReturnType<typeof makeCar>;
  p: T.Vector3;
  yaw: number;
  speed: number;
  vel: T.Vector3;
  u: number;
  total: number;
  next: number;
  lap: number;
  lapStart: number;
  laps: number[];
  finish: number | null;
  lane: number;
  skill: number;
  steer: number;
};
const colors = [
    "#f67f61",
    "#6bbec2",
    "#f3cb5f",
    "#a58fce",
    "#4f94d0",
    "#e6e7cc",
  ],
  names = ["YOU", "MAYA", "KAI", "RIO", "NOVA", "FINN"];
const cars: Car[] = names.map((name, i) => ({
  name,
  color: colors[i],
  model: makeCar(colors[i]),
  p: new T.Vector3(),
  yaw: 0,
  speed: 0,
  vel: new T.Vector3(),
  u: 0,
  total: 0,
  next: 0,
  lap: 0,
  lapStart: 0,
  laps: [],
  finish: null,
  lane: ((i % 3) - 1) * 3.8,
  skill: 0.95 + i * 0.007,
  steer: 0,
}));
const player = cars[0];
let state: "title" | "countdown" | "race" | "finish" = "title",
  paused = false,
  elapsed = 0,
  countdown = 3.7,
  lastBeep = 4,
  worldTime = 0,
  noticeTime = 0,
  lastRank = 6;
const keys = new Set<string>();
let autoTest = false;
addEventListener("keydown", (e) => {
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
      e.code,
    )
  )
    e.preventDefault();
  keys.add(e.code);
  if (e.code === "KeyR" && state === "race") recover(player);
  if (e.code === "Escape" && (state === "race" || state === "countdown"))
    togglePause();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => {
  keys.clear();
  if (state === "race" && !paused) togglePause();
});
function togglePause() {
  paused = !paused;
  $("pause").hidden = !paused;
  audio.level(paused ? 0 : 0.045);
}
function reset() {
  elapsed = 0;
  countdown = 3.7;
  lastBeep = 4;
  paused = false;
  lastRank = 6;
  for (let i = 0; i < 6; i++) {
    const c = cars[i],
      u = 1 - (14 + Math.floor(i / 2) * 6) / length;
    c.p.copy(location(u, i % 2 ? 3 : -3));
    c.yaw = Math.atan2(tangent(u).x, tangent(u).z);
    c.speed = 0;
    c.vel.set(0, 0, 0);
    c.u = u;
    c.total = u - 1;
    c.next = 0;
    c.lap = 0;
    c.lapStart = 0;
    c.laps = [];
    c.finish = null;
    c.steer = 0;
    c.model.g.position.copy(c.p);
    c.model.g.rotation.y = c.yaw;
  }
  camera.position.copy(player.p).add(new T.Vector3(-8, 6, -10));
}
function start() {
  audio.init();
  reset();
  state = "countdown";
  $("title").hidden = true;
  $("results").hidden = true;
  $("pause").hidden = true;
  $("hud").hidden = false;
}
$("play").onclick = start;
$("again").onclick = start;
$("restart").onclick = start;
$("resume").onclick = () => togglePause();
function recover(c: Car) {
  const maxU =
    c.next === 0
      ? c.lap === 0
        ? 1 - 8 / length
        : 0.98
      : (c.next - 1) / 12 + 0.012;
  const u = wrap(c.lap === 0 && c.next === 0 ? maxU : Math.min(c.u, maxU));
  c.p.copy(location(u, c === player ? 0 : c.lane));
  const t = tangent(u);
  c.yaw = Math.atan2(t.x, t.z);
  c.speed = 0;
  c.vel.set(0, 0, 0);
  c.u = u;
  if (c === player) notice("BACK ON TRACK");
}
function notice(s: string) {
  $("notice").textContent = s;
  noticeTime = 2.5;
}
class Sound {
  ctx: AudioContext | null = null;
  osc: OscillatorNode | null = null;
  gain: GainNode | null = null;
  noiseGain: GainNode | null = null;
  muted = false;
  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const ctx = (this.ctx = new AudioContext());
    const osc = (this.osc = ctx.createOscillator()),
      gain = (this.gain = ctx.createGain());
    osc.type = "sawtooth";
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 500;
    gain.gain.value = 0.04;
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * 0.3;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const ng = (this.noiseGain = ctx.createGain());
    ng.gain.value = 0.025;
    const nf = ctx.createBiquadFilter();
    nf.type = "lowpass";
    nf.frequency.value = 650;
    noise.connect(nf).connect(ng).connect(ctx.destination);
    noise.start();
  }
  level(v: number) {
    if (this.gain)
      this.gain.gain.setTargetAtTime(
        this.muted ? 0 : v,
        this.ctx!.currentTime,
        0.1,
      );
  }
  tone(freq: number, dur = 0.15, volume = 0.12) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.frequency.value = freq;
    o.connect(g).connect(this.ctx.destination);
    g.gain.setValueAtTime(volume, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }
  update(speed: number, drift: boolean) {
    if (!this.ctx) return;
    this.osc!.frequency.setTargetAtTime(
      45 + Math.abs(speed) * 4.5,
      this.ctx.currentTime,
      0.08,
    );
    this.level(paused ? 0 : 0.025 + Math.abs(speed) * 0.0006);
    this.noiseGain!.gain.setTargetAtTime(
      this.muted || paused ? 0 : drift ? 0.12 : 0.025,
      this.ctx.currentTime,
      0.15,
    );
  }
}
const audio = new Sound();
$("sound").onclick = () => {
  audio.init();
  audio.muted = !audio.muted;
  $("sound").textContent = audio.muted ? "SOUND OFF" : "SOUND ON";
};
const dustCount = 300,
  dustGeo = new T.BufferGeometry(),
  dustPos = new Float32Array(dustCount * 3),
  dustLife = new Float32Array(dustCount);
dustPos.fill(-1000);
dustGeo.setAttribute("position", new T.BufferAttribute(dustPos, 3));
const dust = new T.Points(
  dustGeo,
  new T.PointsMaterial({
    color: "#f0d4a3",
    size: 0.48,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  }),
);
scene.add(dust);
let dustHead = 0;
function emitDust(c: Car) {
  for (let j = 0; j < 2; j++) {
    const i = dustHead++ % dustCount;
    dustPos[i * 3] = c.p.x - Math.sin(c.yaw) * 1.5 + (rand() - 0.5) * 1.6;
    dustPos[i * 3 + 1] = c.p.y + 0.2;
    dustPos[i * 3 + 2] = c.p.z - Math.cos(c.yaw) * 1.5 + (rand() - 0.5) * 1.6;
    dustLife[i] = 0.7 + rand() * 0.6;
  }
}
const marks = new T.InstancedMesh(
  new T.PlaneGeometry(0.2, 1.2),
  new T.MeshBasicMaterial({
    color: "#866b49",
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  }),
  700,
);
marks.instanceMatrix.setUsage(T.DynamicDrawUsage);
scene.add(marks);
const dummy = new T.Object3D();
for (let i = 0; i < 700; i++) {
  dummy.position.set(0, -100, 0);
  dummy.updateMatrix();
  marks.setMatrixAt(i, dummy.matrix);
}
let markHead = 0;
function mark(c: Car) {
  for (const side of [-1, 1]) {
    dummy.position.set(
      c.p.x + Math.cos(c.yaw) * side * 0.8,
      c.p.y + 0.065,
      c.p.z - Math.sin(c.yaw) * side * 0.8,
    );
    dummy.rotation.set(-Math.PI / 2, 0, -c.yaw);
    dummy.updateMatrix();
    marks.setMatrixAt(markHead++ % 700, dummy.matrix);
  }
  marks.instanceMatrix.needsUpdate = true;
}
function aiInput(c: Car) {
  const look = clamp(7 + c.speed * 0.5, 9, 24),
    u = c.u + look / length;
  let lane = c.lane + Math.sin(elapsed * 0.45 + cars.indexOf(c) * 1.9) * 0.8;
  for (const other of cars) {
    if (other === c) continue;
    let ahead = wrap(other.u - c.u) * length;
    if (ahead > 0 && ahead < 15 && Math.abs(nearest(other.p).lane - lane) < 2.5)
      lane = clamp(lane + (lane > 0 ? -3 : 3), -6, 6);
  }
  const target = location(u, lane),
    desired = Math.atan2(target.x - c.p.x, target.z - c.p.z),
    error = angle(desired - c.yaw);
  const bend = Math.abs(
    angle(
      Math.atan2(tangent(c.u + 0.035).x, tangent(c.u + 0.035).z) -
        Math.atan2(tangent(c.u).x, tangent(c.u).z),
    ),
  );
  const targetSpeed = clamp(36 - bend * 24, 17, 36) * c.skill;
  return {
    throttle: c.speed < targetSpeed ? 1 : 0,
    brake: c.speed > targetSpeed + 2 ? 0.55 : 0,
    steer: clamp(error * 2, -1, 1),
    drift: false,
  };
}
function input() {
  return {
    throttle: keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0,
    brake: keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0,
    steer:
      (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) -
      (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0),
    drift: keys.has("Space"),
  };
}
let impactCooldown = 0;
function drive(c: Car, dt: number) {
  let inp =
    c !== player || autoTest || c.finish !== null ? aiInput(c) : input();
  const n = nearest(c.p),
    hard = c.u > 0.405 && c.u < 0.523,
    off = n.dist > 9;
  c.steer = lerp(c.steer, inp.steer, 1 - Math.exp(-9 * dt));
  const acc =
    inp.throttle * 18 -
    inp.brake * (c.speed > 1 ? 30 : 10) -
    c.speed * (off ? 0.9 : 0.14);
  c.speed = clamp(c.speed + acc * dt, -8, off ? 25 : 42);
  if (inp.drift && Math.abs(c.speed) > 8) c.speed *= 1 - dt * 0.12;
  const turn =
    clamp(Math.abs(c.speed) / 9, 0, 1) *
    (1.65 - Math.min(Math.abs(c.speed), 42) * 0.017) *
    (inp.drift ? 1.45 : 1);
  c.yaw += c.steer * turn * Math.sign(c.speed) * dt;
  const desired = new T.Vector3(
    Math.sin(c.yaw) * c.speed,
    0,
    Math.cos(c.yaw) * c.speed,
  );
  c.vel.lerp(desired, 1 - Math.exp(-(inp.drift ? 2.7 : hard ? 10 : 7) * dt));
  c.p.addScaledVector(c.vel, dt);
  const next = nearest(c.p);
  if (next.dist > 11.1) {
    const outward = new T.Vector3(next.t.z, 0, -next.t.x).multiplyScalar(
      Math.sign(next.lane),
    );
    c.p.copy(next.p).addScaledVector(outward, 11.05);
    const vn = c.vel.dot(outward);
    if (vn > 0) c.vel.addScaledVector(outward, -vn * 1.25);
    c.speed *= 1 - Math.min(0.25, dt * 4);
    c.yaw += angle(Math.atan2(next.t.x, next.t.z) - c.yaw) * dt * 2;
    if (c === player && impactCooldown <= 0) {
      audio.tone(70, 0.12, 0.16);
      impactCooldown = 0.5;
    }
  }
  c.p.y = height(next.u) + 0.09;
  const du = angle((next.u - c.u) * TAU) / TAU;
  if (Math.abs(du) < 0.03) c.total += du;
  c.u = next.u;
  // Ordered checkpoint gates: crossing forward only, no lap credit from resets.
  const prevU = wrap(c.u - du),
    gate = c.next / 12,
    dist = wrap(gate - prevU);
  if (
    c.finish === null &&
    du > 0 &&
    du < 0.03 &&
    dist <= du + 0.00001 &&
    next.dist < 11.3
  ) {
    if (c.next === 0) {
      if (c.lap > 0) {
        const lapTime = elapsed - c.lapStart;
        c.laps.push(lapTime);
        if (c === player) {
          audio.tone(720, 0.22);
          notice(
            c.lap === 2 ? "FINAL LAP" : `LAP ${c.lap + 1} · ${format(lapTime)}`,
          );
        }
      }
      c.lap++;
      c.lapStart = elapsed;
      if (c.lap > 3 && c.finish === null) {
        c.finish = elapsed;
        if (c === player) finishRace();
      }
    }
    c.next = (c.next + 1) % 12;
  }
  const m = c.model;
  m.g.position.copy(c.p);
  m.g.rotation.y = c.yaw;
  m.body.rotation.z = lerp(
    m.body.rotation.z,
    -c.steer * c.speed * 0.0025,
    dt * 7,
  );
  m.body.rotation.x = lerp(
    m.body.rotation.x,
    -inp.throttle * 0.025 + inp.brake * 0.04,
    dt * 6,
  );
  m.body.position.y = Math.sin(worldTime * 23) * Math.abs(c.speed) * 0.0007;
  for (let i = 0; i < 4; i++) {
    m.wheels[i].rotation.y = i >= 2 ? c.steer * 0.4 : 0;
    m.tires[i].rotation.x += (c.speed * dt) / 0.46;
  }
  if (Math.abs(c.speed) > 9 && !hard && rand() < 0.6) emitDust(c);
  if (
    Math.abs(c.speed) > 12 &&
    (inp.drift || Math.abs(c.steer) > 0.6) &&
    rand() < 0.4
  )
    mark(c);
}
function rank() {
  return [...cars].sort((a, b) =>
    a.finish !== null && b.finish !== null
      ? a.finish - b.finish
      : a.finish !== null
        ? -1
        : b.finish !== null
          ? 1
          : progress(b) - progress(a),
  );
}
function progress(c: Car) {
  return c.lap === 0
    ? c.total
    : ((c.lap - 1) * 12 + (c.next === 0 ? 12 : c.next) - 1) / 12 +
        clamp(wrap(c.u - (c.next === 0 ? 11 : c.next - 1) / 12), 0, 1 / 12);
}
function format(t: number) {
  return `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;
}
function finishRace() {
  state = "finish";
  $("results").hidden = false;
  $("hud").hidden = true;
  const r = rank().indexOf(player) + 1;
  $("resultTitle").textContent =
    r === 1 ? "Hello, champion." : r <= 3 ? "Podium paradise." : "What a ride.";
  $("summary").textContent =
    `${r}${r === 1 ? "st" : r === 2 ? "nd" : r === 3 ? "rd" : "th"} place · ${format(player.finish!)} total · ${format(Math.min(...player.laps))} best lap`;
  audio.tone(523, 0.3);
  setTimeout(() => audio.tone(659, 0.3), 180);
  setTimeout(() => audio.tone(784, 0.6), 360);
  updateResults();
}
function updateResults() {
  $("standings").innerHTML = rank()
    .map(
      (c, i) =>
        `<div class="row ${c === player ? "you" : ""}"><b>${i + 1}</b><span style="color:${c.color}">●</span><span>${c.name}</span><b>${c.finish !== null ? format(c.finish) : "RACING · LAP " + Math.min(3, Math.max(1, c.lap))}</b></div>`,
    )
    .join("");
}
const map = $("map") as HTMLCanvasElement,
  mc = map.getContext("2d")!;
function drawMap() {
  mc.clearRect(0, 0, 220, 190);
  const xy = (p: T.Vector3) => [110 + p.x * 0.57, 95 + p.z * 0.57];
  mc.beginPath();
  samples.forEach((p, i) => {
    const [x, y] = xy(p);
    i ? mc.lineTo(x, y) : mc.moveTo(x, y);
  });
  mc.closePath();
  mc.strokeStyle = "#edd7a580";
  mc.lineWidth = 9;
  mc.stroke();
  mc.strokeStyle = "#ffffff50";
  mc.lineWidth = 1;
  mc.stroke();
  for (const c of [...cars.slice(1), player]) {
    const [x, y] = xy(c.p);
    mc.beginPath();
    mc.arc(x, y, c === player ? 5 : 3.5, 0, TAU);
    mc.fillStyle = c === player ? "#fff" : c.color;
    mc.fill();
    if (c === player) {
      mc.strokeStyle = "#ffdc80";
      mc.lineWidth = 2;
      mc.stroke();
    }
  }
  mc.font = "bold 9px Arial";
  mc.fillStyle = "#ffe6a3";
  mc.fillText("SUNCOAST / 01", 13, 20);
}
function hud() {
  const r = rank().indexOf(player) + 1;
  $("position").textContent = String(r);
  if (r < lastRank && state === "race") notice("↑ POSITION GAINED");
  lastRank = r;
  $("lap").textContent = `LAP ${Math.min(3, Math.max(1, player.lap))} / 3`;
  $("time").textContent = format(elapsed);
  $("lapTime").textContent = format(elapsed - player.lapStart);
  $("best").textContent = player.laps.length
    ? format(Math.min(...player.laps))
    : "—";
  $("speed").textContent = String(Math.round(Math.abs(player.speed) * 3.6));
  $("speedbar").style.transform =
    `scaleX(${Math.max(0.03, Math.abs(player.speed) / 42)})`;
  $("surface").textContent =
    player.u > 0.405 && player.u < 0.523
      ? "WOODEN BOARDWALK"
      : keys.has("Space") && player.speed > 8
        ? "DRIFTING"
        : "BEACH SAND";
  drawMap();
}
function step(dt: number) {
  if (paused) return;
  worldTime += dt;
  impactCooldown -= dt;
  noticeTime -= dt;
  if (noticeTime <= 0) $("notice").textContent = "";
  if (state === "countdown") {
    countdown -= dt;
    const num = Math.ceil(countdown);
    $("count").textContent = num > 0 ? String(Math.min(3, num)) : "GO!";
    if (num !== lastBeep && num <= 3) {
      audio.tone(num > 0 ? 440 : 880, num > 0 ? 0.13 : 0.4);
      lastBeep = num;
    }
    if (countdown <= 0) {
      state = "race";
      elapsed = 0;
    }
  }
  if (state === "race" || state === "finish") {
    elapsed += dt;
    if (countdown > -0.8) {
      countdown -= dt;
      if (countdown < -0.8) $("count").textContent = "";
    }
    for (const c of cars) drive(c, dt);
    for (let i = 0; i < 6; i++)
      for (let j = i + 1; j < 6; j++) {
        const a = cars[i],
          b = cars[j],
          d = a.p.distanceTo(b.p);
        if (d < 2.25 && d > 0.001) {
          const n = a.p.clone().sub(b.p).normalize(),
            push = (2.25 - d) * 0.5;
          a.p.addScaledVector(n, push);
          b.p.addScaledVector(n, -push);
          a.speed *= 0.994;
          b.speed *= 0.994;
          a.vel.addScaledVector(n, 1);
          b.vel.addScaledVector(n, -1);
          if (i === 0 && impactCooldown <= 0) {
            audio.tone(85, 0.1, 0.12);
            impactCooldown = 0.4;
          }
        }
      }
  }
  for (let i = 0; i < dustCount; i++)
    if (dustLife[i] > 0) {
      dustLife[i] -= dt;
      dustPos[i * 3 + 1] += dt * 0.8;
      dustPos[i * 3] += dt * 0.5;
      if (dustLife[i] <= 0) dustPos[i * 3 + 1] = -100;
    }
  dustGeo.attributes.position.needsUpdate = true;
}
let last = performance.now(),
  accumulator = 0,
  frame = 0;
function render(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  accumulator += dt;
  while (accumulator >= 1 / 60) {
    step(1 / 60);
    accumulator -= 1 / 60;
  }
  if (state === "title") {
    camera.position.set(77 + Math.sin(now * 0.00007) * 5, 14, 115);
    camera.lookAt(122, 1, 40);
  } else {
    const speed = Math.abs(player.speed),
      forward = new T.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const target = player.p
      .clone()
      .addScaledVector(forward, -(8 + speed * 0.11))
      .add(new T.Vector3(0, 4.3 + speed * 0.025, 0));
    camera.position.lerp(target, 1 - Math.exp(-dt * 6));
    const look = player.p.clone().addScaledVector(forward, 6 + speed * 0.11);
    look.y += 1.2;
    camera.lookAt(look);
    camera.fov = lerp(camera.fov, 58 + speed * 0.22, dt * 3);
    camera.updateProjectionMatrix();
    sun.position.copy(player.p).add(new T.Vector3(-90, 160, 80));
    sun.target.position.copy(player.p);
  }
  const wa = water.geometry.attributes.position;
  for (let i = 0; i < wa.count; i++)
    wa.setZ(
      i,
      Math.sin(wa.getX(i) * 0.05 + worldTime * 0.9) * 0.17 +
        Math.cos(wa.getY(i) * 0.045 + worldTime) * 0.12,
    );
  wa.needsUpdate = true;
  foam.forEach((m, i) => {
    m.position.x = 153 + wrap(i * 8 - worldTime * 1.4, 64);
    m.scale.x = 0.7 + Math.sin(worldTime + i) * 0.25;
  });
  flags.forEach((f, i) => (f.rotation.y = Math.sin(worldTime * 2 + i) * 0.22));
  birds.rotation.y = worldTime * 0.025;
  birds.position.x = Math.sin(worldTime * 0.05) * 50;
  if (frame++ % 3 === 0) {
    hud();
    if (state === "finish") updateResults();
  }
  audio.update(player.speed, keys.has("Space") && player.speed > 8);
  renderer.render(scene, camera);
}
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setSize(innerWidth, innerHeight);
reset();
renderer.setAnimationLoop(render);
// Explicit test harness: only enabled with ?test=1, never active in normal play.
if (
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has("test")
)
  (window as any).__race = {
    start,
    step: (seconds: number) => {
      for (let i = 0; i < seconds * 60; i++) step(1 / 60);
      hud();
    },
    auto: (v: boolean) => (autoTest = v),
    keys: (list: string[]) => {
      keys.clear();
      list.forEach((k) => keys.add(k));
    },
    recover: () => recover(player),
    snapshot: () => ({
      state,
      elapsed,
      cars: cars.map((c) => ({
        name: c.name,
        lap: c.lap,
        next: c.next,
        u: c.u,
        speed: c.speed,
        finish: c.finish,
        laps: c.laps,
        progress: progress(c),
        distance: nearest(c.p).dist,
      })),
      rank: rank().map((c) => c.name),
    }),
    teleport: (u: number, lane: number) => {
      player.p.copy(location(u, lane));
    },
    pause: () => {
      paused = false;
      $("pause").hidden = true;
    },
  };
if (
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has("test")
) {
  const panel = document.createElement("div");
  panel.style.cssText =
    "position:absolute;bottom:60px;left:260px;z-index:100;display:flex;gap:3px";
  document.body.append(panel);
  const testButton = (name: string, fn: () => void) => {
    const b = document.createElement("button");
    b.textContent = name;
    b.style.cssText = "padding:7px;font-size:9px";
    b.onclick = () => {
      paused = false;
      fn();
      hud();
      status.textContent = JSON.stringify((window as any).__race.snapshot());
    };
    panel.append(b);
  };
  const status = document.createElement("pre");
  status.id = "test-status";
  status.style.cssText =
    "position:absolute;top:160px;left:10px;font-size:9px;max-width:280px;max-height:150px;overflow:hidden;white-space:pre-wrap;pointer-events:none;background:#1239";
  document.body.append(status);
  testButton("AUTO", () => (autoTest = !autoTest));
  testButton("+30 SEC", () => {
    for (let i = 0; i < 1800; i++) step(1 / 60);
  });
  testButton("+120 SEC", () => {
    for (let i = 0; i < 7200; i++) step(1 / 60);
  });
  testButton("THROTTLE", () => {
    autoTest = false;
    keys.clear();
    keys.add("KeyW");
    for (let i = 0; i < 120; i++) step(1 / 60);
    keys.clear();
  });
  testButton("BRAKE", () => {
    keys.clear();
    keys.add("KeyS");
    for (let i = 0; i < 120; i++) step(1 / 60);
    keys.clear();
  });
  testButton("DRIFT LEFT", () => {
    keys.clear();
    keys.add("KeyW");
    keys.add("KeyA");
    keys.add("Space");
    for (let i = 0; i < 60; i++) step(1 / 60);
    keys.clear();
  });
  testButton("STEER RIGHT", () => {
    keys.clear();
    keys.add("KeyW");
    keys.add("KeyD");
    for (let i = 0; i < 60; i++) step(1 / 60);
    keys.clear();
  });
  testButton("OFF TRACK", () => player.p.copy(location(player.u, 20)));
  testButton("RESET", () => recover(player));
  testButton("SKIP GATE", () => player.p.copy(location(0.8, 0)));
}
