// 多旋翼巡检无人机：流线机身、四臂电机与旋翼、云台相机、起落架和航行灯。
import * as THREE from 'three';
import { Kit } from './model-kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildDrone(accent) {
  const k = new Kit(accent);
  const white = k.paint(0xeef1f4, { rough: 0.35, metal: 0.1 });
  const shell = k.paint(accent, { rough: 0.3, metal: 0.25, glow: 0.3 });
  const dark = k.paint(0x1e2429, { rough: 0.5, metal: 0.5, glow: 0.05 });
  const steel = k.paint(0x8a949e, { rough: 0.3, metal: 0.85, glow: 0.08 });
  const glass = k.paint(0x16263a, { rough: 0.08, metal: 0.8, glow: 0.2 });
  const blade = k.paint(0x2a3138, { rough: 0.45, metal: 0.3, glow: 0.05 });
  const body = new THREE.Group();
  k.root.add(body);

  // 机身：白色壳体 + 彩色上盖 + 深色底板
  k.mesh(body, k.capsule(0.1, 0.22, 1.6, 0.75, 1), white, 0, 0, 0);
  k.mesh(body, k.capsule(0.088, 0.2, 1.5, 0.6, 0.96), shell, 0, 0.036, -0.005);
  k.mesh(body, k.capsule(0.07, 0.2, 1.45, 0.5, 0.96), dark, 0, -0.048, 0);
  // 机头视觉传感器、顶部 GPS 与频闪灯
  for (const sx of [-1, 1]) k.mesh(body, k.ball(0.022, 1.5, 1, 0.5), dark, sx * 0.07, 0.005, 0.2);
  k.mesh(body, k.ball(0.014, 2, 0.7, 0.5), k.lamp(0x8cf2ff), 0, 0.012, 0.215);
  k.mesh(body, new THREE.CylinderGeometry(0.034, 0.038, 0.02, 20), white, 0, 0.08, -0.1);
  k.tube(body, V(0, 0.09, -0.1), V(0, 0.15, -0.11), 0.005, 0.003, dark, 6);
  const strobe = k.mesh(body, k.ball(0.016), k.lamp(0xffffff), 0, 0.09, 0.06);

  // 四条机臂：臂管 → 电机 → 旋翼；前臂航行灯左红右绿，后臂白
  const rotors = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const m = V(sx * 0.3, 0.03, sz * 0.3);
    k.tube(body, V(sx * 0.07, 0.015, sz * 0.07), m, 0.03, 0.022, white);
    k.mesh(body, new THREE.CylinderGeometry(0.042, 0.046, 0.07, 24), dark, m.x, m.y, m.z);
    k.mesh(body, new THREE.CylinderGeometry(0.048, 0.048, 0.014, 24), shell, m.x, m.y - 0.02, m.z);
    k.mesh(body, k.ball(0.028), steel, m.x, m.y + 0.04, m.z);
    const rotor = new THREE.Group();
    rotor.position.set(m.x, m.y + 0.06, m.z);
    body.add(rotor);
    k.mesh(rotor, new THREE.SphereGeometry(1, 20, 8).scale(0.26, 0.006, 0.028), blade);
    for (const t of [-1, 1]) k.mesh(rotor, k.ball(0.014, 1, 0.5, 1), shell, t * 0.245, 0, 0);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.27, 40).rotateX(-Math.PI / 2), k.lamp(0xffffff, 0.09));
    disc.position.set(m.x, m.y + 0.06, m.z);
    body.add(disc);
    const nav = sz > 0 ? (sx < 0 ? 0x4dff88 : 0xff4d4d) : 0xffffff;
    k.mesh(body, k.ball(0.017), k.lamp(nav), m.x + sx * 0.045, m.y - 0.035, m.z + sz * 0.045);
    rotors.push({ rotor, dir: sx * sz });
  }

  // 起落架：两条滑橇，每条两根支腿
  for (const sx of [-1, 1]) {
    for (const z of [-0.13, 0.13]) k.tube(body, V(sx * 0.1, -0.04, z), V(sx * 0.2, -0.17, z), 0.013, 0.01, dark, 8);
    k.mesh(body, new THREE.CapsuleGeometry(0.012, 0.4, 4, 10).rotateX(Math.PI / 2), dark, sx * 0.2, -0.17, 0);
  }

  // 云台相机：挂在机头下方，作业时左右扫描
  const gimbal = new THREE.Group();
  gimbal.position.set(0, -0.1, 0.17);
  body.add(gimbal);
  k.mesh(body, new THREE.BoxGeometry(0.05, 0.04, 0.05), dark, 0, -0.065, 0.17);
  k.mesh(gimbal, k.ball(0.048), dark);
  k.mesh(gimbal, new THREE.TorusGeometry(0.036, 0.005, 8, 24), shell, 0, 0, 0.026);
  k.mesh(gimbal, k.ball(0.026, 1, 1, 0.8), glass, 0, 0, 0.032);
  k.mesh(gimbal, k.ball(0.009), k.lamp(0x8cf2ff), 0.008, 0.008, 0.055);

  let pitch = 0;
  return {
    group: k.root,
    setNight: (n) => k.setNight(n),
    update(time, a, dt) {
      for (const r of rotors) r.rotor.rotation.y = time * 52 * r.dir;
      const fast = a.mode === 'go' || a.mode === 'back' || a.mode === 'patrol';
      pitch += ((fast ? 0.1 : 0) - pitch) * Math.min(1, dt * 3);
      body.rotation.x = pitch + Math.sin(time * 1.1 + a.x) * 0.012;
      body.rotation.z = Math.sin(time * 1.3 + a.z) * 0.025;
      body.position.y = Math.sin(time * 5 + a.x) * 0.012;
      gimbal.rotation.x = -0.35 + Math.sin(time * 0.7) * 0.08;
      gimbal.rotation.y = a.mode === 'work' ? Math.sin(time * 2.6) * 0.7 : Math.sin(time * 0.6) * 0.18;
      strobe.visible = time % 1.2 < 0.1;
    },
  };
}
