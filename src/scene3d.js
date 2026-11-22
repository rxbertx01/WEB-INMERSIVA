import {
  WebGLRenderer, Scene, Color, Fog, PerspectiveCamera, Vector3, Vector2,
  Raycaster, AmbientLight, HemisphereLight, SpotLight, PointLight, Mesh, Group, Object3D,
  PlaneGeometry, BoxGeometry, CylinderGeometry, TorusGeometry, SphereGeometry,
  MeshStandardMaterial, MeshBasicMaterial, TextureLoader, CanvasTexture,
  Points, PointsMaterial, BufferGeometry, Float32BufferAttribute,
  DoubleSide, SRGBColorSpace, RepeatWrapping, AdditiveBlending, ACESFilmicToneMapping
} from 'three';
import { BASE } from './config.js';
import { S } from './state.js';
import { $, money, esc, shade } from './utils.js';
import { emit } from './bus.js';

const cv = $('#cv');
const HOME = { th: 0, ph: .22, d: 11, t: new Vector3(0, 2, 0) };
const st = { th: HOME.th, ph: HOME.ph, d: HOME.d, t: HOME.t.clone() };
const goal = { th: HOME.th, ph: HOME.ph, d: HOME.d, t: HOME.t.clone() };
const ray = new Raycaster();
const mp = new Vector2();

let R, scene, cam, metal, dust;
let accentMat, accentHalo, accentLight;
let drag = null, moved = 0, lastT = 0;
const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
const reduceMotion = typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Permite cambiar el acento del neón y la luz de relleno desde el panel admin.
export function setAccent(hex) {
  if (!accentMat) return;
  const color = new Color(hex);
  accentMat.color.copy(color);
  accentLight?.color.copy(color);
  if (accentHalo) {
    accentHalo.material.map?.dispose();
    accentHalo.material.map = glowTexture(hex);
    accentHalo.material.needsUpdate = true;
  }
}

export function home() {
  goal.th = HOME.th;
  goal.ph = HOME.ph;
  goal.d = HOME.d;
  goal.t.copy(HOME.t);
}

// Enfoca uno de los dos percheros laterales.
export function focusRack(side) {
  if (!S.has3D) return;
  goal.t.set(side === 'left' ? -4.6 : 4.6, 1.8, .2);
  goal.d = 6.5;
  goal.th = 0;
  goal.ph = .12;
}

function upd() {
  st.th += (goal.th - st.th) * .08;
  st.ph += (goal.ph - st.ph) * .08;
  st.d += (goal.d - st.d) * .08;
  st.t.lerp(goal.t, .08);
  cam.position.set(
    st.t.x + Math.sin(st.th) * Math.cos(st.ph) * st.d,
    st.t.y + Math.sin(st.ph) * st.d,
    st.t.z + Math.cos(st.th) * Math.cos(st.ph) * st.d
  );
  if (!reduceMotion) {
    // Parallax mínimo: la cámara acompaña al puntero sin alterar el orbit.
    pointer.sx += (pointer.x - pointer.sx) * .04;
    pointer.sy += (pointer.y - pointer.sy) * .04;
    cam.position.x += pointer.sx * .16;
    cam.position.y += pointer.sy * .1;
  }
  cam.lookAt(st.t);
}

// Texturas procedurales: concreto mate, halo del marco y tipografía del muro.
function concreteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3c3c40';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) {
    const v = Math.floor(Math.random() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},.06)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(8, 4);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function glowTexture(hex = '#FF2D2D') {
  const color = new Color(hex);
  const rgb = `${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)}`;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  gradient.addColorStop(0, `rgba(${rgb},.65)`);
  gradient.addColorStop(.45, `rgba(${rgb},.16)`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// Polvo en suspensión: da profundidad al volumen sin robar protagonismo a las prendas.
function mkDust() {
  const count = 140;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - .5) * 20;
    positions[i * 3 + 1] = Math.random() * 8;
    positions[i * 3 + 2] = (Math.random() - .5) * 12 - 1;
    speeds[i] = .06 + Math.random() * .14;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const mat = new PointsMaterial({
    color: 0xfff1e6, size: .035, transparent: true, opacity: .5,
    depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true
  });
  const points = new Points(geo, mat);
  points.userData.speeds = speeds;
  return points;
}

function brandTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#F5F5F7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 104px "Space Grotesk", sans-serif';
    ctx.fillText('A T E L I E R   /   V X', canvas.width / 2, canvas.height / 2);
    texture.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  return texture;
}

function mkPhoto(g) {
  const group = new Group();
  const h = 1.5;
  const w = h * (g.w || 1) / (g.h || 1);
  const texture = new TextureLoader().load(g.img);
  texture.colorSpace = SRGBColorSpace;
  const plane = new Mesh(
    new PlaneGeometry(w, h),
    new MeshBasicMaterial({ map: texture, transparent: true, alphaTest: .08, side: DoubleSide, color: 0xe6e6e6 })
  );
  plane.position.y = -h / 2 + .15;
  group.add(plane);
  const hook = new Mesh(new TorusGeometry(.08, .012, 6, 16, Math.PI * 1.4), metal);
  hook.position.y = .3;
  group.add(hook);
  group.traverse(o => { o.userData.g = g; });
  group.userData.g = g;
  return group;
}

function mkGarment(g) {
  if (g.img) return mkPhoto(g);

  const base = new Color(shade(g.color, 1.35));
  const material = new MeshStandardMaterial({
    color: base,
    emissive: base.clone().multiplyScalar(.25), // las prendas negras siguen siendo legibles
    roughness: /cuero|nylon/i.test(g.fabric || '') ? .4 : .8,
    metalness: .05
  });
  const group = new Group();
  const add = (geo, x, y, z, rz = 0) => {
    const mesh = new Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    group.add(mesh);
    return mesh;
  };

  if (g.type === 'cargo') {
    add(new BoxGeometry(.38, 1.1, .22), -.22, -.55, 0);
    add(new BoxGeometry(.38, 1.1, .22), .22, -.55, 0);
    add(new BoxGeometry(.85, .2, .24), 0, .05, 0);
  } else {
    const length = g.type === 'coat' ? 1.35 : g.type === 'hoodie' ? .8 : .7;
    const width = g.type === 'hoodie' ? .95 : .85;
    add(new BoxGeometry(width, length, .28), 0, -length / 2 + .1, 0);
    const sleeve = g.type === 'coat' ? 1 : .75;
    add(new BoxGeometry(.28, sleeve, .26), -width / 2 - .1, -sleeve / 2 + .05, 0, .18);
    add(new BoxGeometry(.28, sleeve, .26), width / 2 + .1, -sleeve / 2 + .05, 0, -.18);
    if (g.type === 'hoodie') add(new SphereGeometry(.2, 12, 8), 0, .12, -.1);
    if (g.type === 'bomber') add(new BoxGeometry(width, .1, .3), 0, -length + .12, 0);
  }

  const hook = new Mesh(new TorusGeometry(.08, .012, 6, 16, Math.PI * 1.4), metal);
  hook.position.y = .3;
  group.add(hook);
  group.traverse(o => { o.userData.g = g; });
  group.userData.g = g;
  return group;
}

function disposeGroup(root) {
  root.traverse(o => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.filter(Boolean).forEach(mat => {
      if (mat.userData?.shared) return; // el metal de las perchas es compartido
      mat.map?.dispose();
      mat.dispose();
    });
  });
}

function removeMesh(mesh) {
  scene?.remove(mesh);
  const i = S.rackMeshes.indexOf(mesh);
  if (i >= 0) S.rackMeshes.splice(i, 1);
  disposeGroup(mesh);
}

export function slotOf(g) {
  return S.slots.find(s => s.item === g) || null;
}

function preferredSide(g) {
  return g.type === 'bomber' || g.type === 'coat' ? 'left' : 'right';
}

export function hang(g, slot) {
  if (!S.has3D) return null;
  slot = slot
    || S.slots.find(s => !s.item && s.side === preferredSide(g))
    || S.slots.find(s => !s.item);
  if (!slot) return null;
  const mesh = mkGarment(g);
  mesh.position.set(slot.x, slot.y - .35, slot.z);
  mesh.userData.base = mesh.position.clone();
  scene.add(mesh);
  slot.item = g;
  slot.mesh = mesh;
  S.rackMeshes.push(mesh);
  return slot;
}

export function unhang(g) {
  const slot = slotOf(g);
  if (!slot || !S.has3D) return;
  removeMesh(slot.mesh);
  slot.item = null;
  slot.mesh = null;
}

export function focus(g) {
  if (!S.has3D) return;
  const slot = slotOf(g);
  if (!slot) return;
  // El objetivo se desplaza a la derecha para que la prenda quede en el tercio izquierdo,
  // libre para el drawer, con un acercamiento suave.
  goal.t.set(slot.x + 1.15, 1.75, slot.z + .5);
  goal.d = 3.9;
  goal.th = -.08;
  goal.ph = .09;
}

function pick(e) {
  if (!S.has3D) return null;
  const rect = cv.getBoundingClientRect();
  mp.set(
    (e.clientX - rect.left) / rect.width * 2 - 1,
    -(e.clientY - rect.top) / rect.height * 2 + 1
  );
  ray.setFromCamera(mp, cam);
  const hit = ray.intersectObjects(S.rackMeshes, true)[0];
  return hit ? hit.object.userData.g : null;
}

function hover(e) {
  if (drag && moved > 4) { $('#tip').style.display = 'none'; return; }
  const g = pick(e);
  const tip = $('#tip');
  if (g) {
    tip.style.display = 'block';
    tip.style.left = e.clientX + 14 + 'px';
    tip.style.top = e.clientY + 14 + 'px';
    tip.innerHTML = `<b>${esc(g.name)}</b>${esc(money(g.price))} · ${esc(g.fabric)}`;
    cv.style.cursor = 'pointer';
  } else {
    tip.style.display = 'none';
    cv.style.cursor = drag ? 'grabbing' : 'grab';
  }
}

function resize() {
  if (!R) return;
  R.setSize(innerWidth, innerHeight, false);
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
}

function loop(t) {
  requestAnimationFrame(loop);
  if (!S.has3D || !R) return;
  const dt = Math.min(.05, (t - lastT) / 1000 || 0);
  lastT = t;
  upd();
  S.rackMeshes.forEach(m => { m.rotation.z = Math.sin(t * .001 + m.position.x) * .012; });
  if (!reduceMotion) {
    if (dust) {
      const pos = dust.geometry.attributes.position;
      const speeds = dust.userData.speeds;
      for (let i = 0; i < speeds.length; i++) {
        const y = pos.array[i * 3 + 1] + speeds[i] * dt;
        pos.array[i * 3 + 1] = y > 8 ? 0 : y;
        pos.array[i * 3] += Math.sin(t * .0003 + i) * dt * .05;
      }
      pos.needsUpdate = true;
    }
    // Respiración del neón: el halo y la luz de relleno laten al unísono.
    const breath = .5 + .5 * Math.sin(t * .0009);
    if (accentHalo) accentHalo.material.opacity = .72 + breath * .28;
    if (accentLight) accentLight.intensity = 48 + breath * 26;
  }
  R.render(scene, cam);
}

export function initScene() {
  try {
    R = new WebGLRenderer({ canvas: cv, antialias: true });
  } catch (err) {
    S.has3D = false;
    document.body.classList.add('no3d');
    console.warn('[atelier-vx] WebGL no disponible: se usa el carrusel 2D.', err);
    return;
  }

  R.setPixelRatio(Math.min(devicePixelRatio, 2));
  R.toneMapping = ACESFilmicToneMapping;
  R.toneMappingExposure = 1.05;
  scene = new Scene();
  scene.background = new Color(0x0A0A0B);
  scene.fog = new Fog(0x0A0A0B, 16, 42);
  cam = new PerspectiveCamera(50, 1, .1, 70);

  const concrete = concreteTexture();
  // Iluminación física: las intensidades van en candela, por eso son altas.
  scene.add(new AmbientLight(0xffffff, 3.2));
  scene.add(new HemisphereLight(0xffffff, 0x8a8a92, 2.2));

  const key = new SpotLight(0xffffff, 900, 50, .85, .55);
  key.position.set(0, 9, 7);
  key.target.position.set(0, 2.5, -2);
  scene.add(key, key.target);
  [-4.6, 4.6].forEach(x => {
    const rackLight = new SpotLight(0xffffff, 750, 30, .75, .6);
    rackLight.position.set(x, 7, 4);
    rackLight.target.position.set(x, 1.8, .2);
    scene.add(rackLight, rackLight.target);
  });
  const fill = new PointLight(0xFF2D2D, 60, 20);
  fill.position.set(0, 3.4, -4.5);
  scene.add(fill);
  accentLight = fill;

  dust = mkDust();
  scene.add(dust);

  const floor = new Mesh(
    new PlaneGeometry(40, 40),
    new MeshStandardMaterial({ map: concrete, color: 0xe6e6ea, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const carpet = new Mesh(
    new BoxGeometry(15, .02, 8),
    new MeshStandardMaterial({ color: 0x2b2830, roughness: 1 })
  );
  carpet.position.set(0, .02, 2.6);
  scene.add(carpet);

  const wall = new Mesh(
    new PlaneGeometry(40, 11),
    new MeshStandardMaterial({ map: concrete, color: 0xdcdce0, roughness: 1 })
  );
  wall.position.set(0, 5.5, -6);
  scene.add(wall);

  // Muro frontal: marco retroiluminado con la identidad de la marca.
  const frameY = 3.6, frameZ = -5.86, frameW = 5.4, frameH = 1.9, bar = .07;
  const frameMat = new MeshBasicMaterial({ color: 0xFF2D2D });
  accentMat = frameMat;
  const halo = new Mesh(
    new PlaneGeometry(frameW + 1.6, frameH + 1.6),
    new MeshBasicMaterial({
      map: glowTexture(), transparent: true,
      blending: AdditiveBlending, depthWrite: false
    })
  );
  halo.position.set(0, frameY, frameZ - .04);
  scene.add(halo);
  accentHalo = halo;

  [[0, frameY + frameH / 2, frameW, bar], [0, frameY - frameH / 2, frameW, bar]].forEach(([x, y, w, h]) => {
    const mesh = new Mesh(new BoxGeometry(w, h, .06), frameMat);
    mesh.position.set(x, y, frameZ);
    scene.add(mesh);
  });
  [[-frameW / 2, frameY], [frameW / 2, frameY]].forEach(([x, y]) => {
    const mesh = new Mesh(new BoxGeometry(bar, frameH, .06), frameMat);
    mesh.position.set(x, y, frameZ);
    scene.add(mesh);
  });

  const brand = new Mesh(
    new PlaneGeometry(4.9, 1.22),
    new MeshBasicMaterial({ map: brandTexture(), transparent: true, depthWrite: false })
  );
  brand.position.set(0, frameY, frameZ + .04);
  scene.add(brand);

  metal = new MeshStandardMaterial({ color: 0xbfc0c4, metalness: .9, roughness: .3 });
  metal.userData.shared = true;

  // Dos percheros laterales: outerwear a la izquierda, esenciales a la derecha.
  for (const side of ['left', 'right']) {
    const x0 = side === 'left' ? -4.6 : 4.6;
    const rail = new Mesh(new CylinderGeometry(.03, .03, 4, 10), metal);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(x0, 2.3, .2);
    scene.add(rail);

    [-2, 2].forEach(dx => {
      const post = new Mesh(new CylinderGeometry(.03, .03, 2.3, 10), metal);
      post.position.set(x0 + dx, 1.15, .2);
      scene.add(post);
      const foot = new Mesh(new BoxGeometry(.08, .04, 1), metal);
      foot.position.set(x0 + dx, .02, .2);
      scene.add(foot);
    });

    for (let i = 0; i < 6; i++) {
      S.slots.push({ x: x0 - 1.7 + i * .68, y: 2.3, z: .2, side, item: null, mesh: null });
    }
  }

  BASE.forEach(g => hang(g));

  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; moved = 0; cv.style.cursor = 'grabbing'; });
  addEventListener('pointerup', () => { drag = null; cv.style.cursor = 'grab'; });
  cv.addEventListener('pointermove', e => {
    if (!drag) {
      pointer.x = (e.clientX / innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / innerHeight) * 2 - 1);
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      moved += Math.abs(dx) + Math.abs(dy);
      goal.th = Math.max(-1.1, Math.min(1.1, goal.th - dx * .005));
      goal.ph = Math.max(.02, Math.min(.8, goal.ph + dy * .004));
      drag = { x: e.clientX, y: e.clientY };
    }
    hover(e);
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    goal.d = Math.max(3, Math.min(15, goal.d + e.deltaY * .01));
  }, { passive: false });
  cv.addEventListener('click', e => {
    if (moved > 4) return;
    const g = pick(e);
    if (g) emit('garment:pick', g);
  });

  addEventListener('resize', resize);
  resize();
  requestAnimationFrame(loop);
}
