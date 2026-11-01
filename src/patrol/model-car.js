// 电动巡逻车：圆角车身、玻璃舱、带轮毂的车轮、顶部警灯，行驶时车轮转动。
import * as THREE from 'three';
import { Kit } from './model-kit.js';

// 车身侧影：x 为车宽方向的一半，沿 Z 挤出后做圆角
function bodyShape() {
  const s = new THREE.Shape();
  s.moveTo(-2.05, 0.28);
  s.lineTo(-2.08, 0.75);
  s.quadraticCurveTo(-2.05, 0.98, -1.7, 1.02);
  s.lineTo(-0.9, 1.06);
  s.lineTo(1.0, 1.04);
  s.quadraticCurveTo(1.85, 0.98, 2.05, 0.74);
  s.lineTo(2.1, 0.4);
  s.quadraticCurveTo(2.08, 0.28, 1.9, 0.28);
  s.closePath();
  return s;
}

export function buildCar(accent) {
  const k = new Kit(accent);
  const white = k.paint(0xf1f3f5, { rough: 0.28, metal: 0.3 });
  const shell = k.paint(accent, { rough: 0.3, metal: 0.3, glow: 0.3 });
  const dark = k.paint(0x1d2328, { rough: 0.5, metal: 0.4, glow: 0.05 });
  const glass = k.paint(0x1a2c42, { rough: 0.06, metal: 0.85, glow: 0.22 });
  const steel = k.paint(0xaab3bb, { rough: 0.25, metal: 0.9, glow: 0.1 });
  const head = k.lamp(0xfff3c4);
  const tail = k.lamp(0xff3b3b);
  const body = new THREE.Group();
  k.root.add(body);

  // 车身：沿车长方向的侧影挤出，倒角后边缘圆润
  const hull = new THREE.ExtrudeGeometry(bodyShape(), { depth: 1.5, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.14, bevelSegments: 5, curveSegments: 18 });
  hull.translate(0, 0, -0.75);
  hull.rotateY(Math.PI / 2); // 侧影的 x 轴变成车长，朝 +Z
  k.mesh(body, hull, white);
  // 侧面彩色腰线与前后保险杠
  for (const sx of [-1, 1]) k.mesh(body, new THREE.BoxGeometry(0.03, 0.12, 2.5), shell, sx * 0.9, 0.9, 0.05);
  k.mesh(body, new THREE.BoxGeometry(1.7, 0.22, 0.34), dark, 0, 0.42, 2.18);
  k.mesh(body, new THREE.BoxGeometry(1.7, 0.22, 0.34), dark, 0, 0.42, -2.18);

  // 玻璃舱：前窗斜、后窗斜，顶盖白色
  const cabin = new THREE.Group();
  body.add(cabin);
  const cs = new THREE.Shape();
  cs.moveTo(-1.35, 1.05);
  cs.lineTo(-0.95, 1.62);
  cs.lineTo(0.55, 1.65);
  cs.lineTo(1.2, 1.06);
  cs.closePath();
  const cab = new THREE.ExtrudeGeometry(cs, { depth: 1.3, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.06, bevelSegments: 3 });
  cab.translate(0, 0, -0.65);
  cab.rotateY(Math.PI / 2);
  k.mesh(cabin, cab, glass, 0, 0, 0.1);
  k.mesh(cabin, new THREE.BoxGeometry(1.42, 0.07, 1.5), white, 0, 1.69, -0.1);

  // 顶部警灯条：红蓝交替闪烁
  const bar = new THREE.Group();
  bar.position.set(0, 1.78, -0.1);
  body.add(bar);
  k.mesh(bar, new THREE.BoxGeometry(1.0, 0.08, 0.22), dark);
  const redL = k.mesh(bar, new THREE.CapsuleGeometry(0.07, 0.3, 4, 10).rotateZ(Math.PI / 2), k.lamp(0xff3030), 0.28, 0.08, 0);
  const blueL = k.mesh(bar, new THREE.CapsuleGeometry(0.07, 0.3, 4, 10).rotateZ(Math.PI / 2), k.lamp(0x3b7bff), -0.28, 0.08, 0);

  // 前后灯
  for (const sx of [-1, 1]) {
    k.mesh(body, new THREE.BoxGeometry(0.34, 0.1, 0.05), head, sx * 0.58, 0.72, 2.14);
    k.mesh(body, new THREE.BoxGeometry(0.34, 0.08, 0.05), tail, sx * 0.58, 0.76, -2.14);
  }
  k.mesh(body, new THREE.BoxGeometry(0.5, 0.1, 0.04), shell, 0, 0.72, 2.16);
  // 后视镜
  for (const sx of [-1, 1]) k.mesh(body, new THREE.BoxGeometry(0.14, 0.1, 0.07), dark, sx * 0.98, 1.1, 0.88);

  // 车轮：胎 + 轮毂 + 辐条
  const wheels = [];
  for (const [sx, sz] of [[1, 1.3], [-1, 1.3], [1, -1.3], [-1, -1.3]]) {
    const w = new THREE.Group();
    w.position.set(sx * 0.9, 0.36, sz);
    body.add(w);
    const spin = new THREE.Group();
    w.add(spin);
    k.mesh(spin, new THREE.CylinderGeometry(0.36, 0.36, 0.26, 32).rotateZ(Math.PI / 2), dark);
    k.mesh(spin, new THREE.CylinderGeometry(0.22, 0.22, 0.27, 24).rotateZ(Math.PI / 2), steel);
    for (let i = 0; i < 5; i++) {
      k.mesh(spin, new THREE.BoxGeometry(0.28, 0.05, 0.3), dark).rotation.x = (i / 5) * Math.PI;
    }
    wheels.push(spin);
  }

  let roll = 0;
  return {
    group: k.root,
    setNight: (n) => k.setNight(n),
    update(time, a, dt) {
      const moving = a.mode === 'go' || a.mode === 'back';
      if (moving) roll += (a.speed * dt) / 0.36;
      for (const s of wheels) s.rotation.x = roll;
      // 出警时警灯闪烁，平时只亮蓝灯
      const flash = a.mode === 'go' || a.mode === 'work';
      redL.visible = flash && time % 0.5 < 0.25;
      blueL.visible = flash ? time % 0.5 >= 0.25 : true;
    },
  };
}
