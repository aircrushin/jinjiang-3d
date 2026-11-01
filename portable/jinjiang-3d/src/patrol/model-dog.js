// 四足巡检机器人：圆润躯干、带传感器的头部、两节腿，对角步态行走。
import * as THREE from 'three';
import { Kit } from './model-kit.js';

const HIP_Y = 0.414;
const THIGH = 0.22;
const KNEE0 = -1.1;
const THIGH0 = 0.55;

export function buildDog(accent) {
  const k = new Kit(accent);
  const white = k.paint(0xe9edf0, { rough: 0.38, metal: 0.1 });
  const shell = k.paint(accent, { rough: 0.34, metal: 0.2, glow: 0.3 });
  const dark = k.paint(0x20262c, { rough: 0.5, metal: 0.45, glow: 0.05 });
  const steel = k.paint(0x8a949e, { rough: 0.3, metal: 0.85, glow: 0.08 });
  const eye = k.lamp(0x8cf2ff);
  const strip = k.lamp(accent);
  const red = k.lamp(0xff4d4d);
  const body = new THREE.Group();
  k.root.add(body);

  // 躯干：白色外壳 + 彩色背板 + 深色腹部
  k.mesh(body, k.capsule(0.13, 0.4, 1.2, 0.78, 1), white, 0, 0.46, 0);
  k.mesh(body, k.capsule(0.11, 0.33, 1.15, 0.5, 1), shell, 0, 0.545, -0.02);
  k.mesh(body, k.capsule(0.1, 0.34, 1.1, 0.5, 1), dark, 0, 0.395, 0);
  for (const sx of [-1, 1]) k.mesh(body, new THREE.BoxGeometry(0.012, 0.02, 0.46), strip, sx * 0.159, 0.47, 0);
  k.mesh(body, new THREE.BoxGeometry(0.12, 0.022, 0.012), red, 0, 0.47, -0.332);

  // 顶部激光雷达与天线
  k.mesh(body, new THREE.CylinderGeometry(0.04, 0.045, 0.035, 20), dark, 0, 0.595, 0.1);
  k.mesh(body, new THREE.SphereGeometry(0.034, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), k.lamp(accent, 0.85), 0, 0.612, 0.1);
  k.tube(body, new THREE.Vector3(-0.07, 0.56, -0.2), new THREE.Vector3(-0.085, 0.73, -0.24), 0.007, 0.004, dark, 6);
  k.mesh(body, k.ball(0.012), red, -0.085, 0.735, -0.24);

  // 头部：绕颈部转动，扫描时左右摆
  const head = new THREE.Group();
  head.position.set(0, 0.5, 0.34);
  body.add(head);
  k.mesh(head, k.ball(0.075, 1.1, 0.9, 1), dark, 0, -0.01, 0);
  k.mesh(head, k.ball(0.1, 1.15, 0.85, 1.05), white, 0, 0.02, 0.1);
  k.mesh(head, k.ball(0.085, 1.1, 0.62, 0.5), dark, 0, 0.025, 0.19);
  for (const sx of [-1, 1]) {
    k.mesh(head, k.ball(0.019, 1, 1.2, 0.8), eye, sx * 0.05, 0.03, 0.232);
    k.mesh(head, k.ball(0.03), shell, sx * 0.118, 0.02, 0.08);
  }
  k.mesh(head, k.ball(0.014), eye, 0, 0.075, 0.2);

  // 四条腿：髋 → 大腿 → 膝 → 小腿 → 脚；FL/RR 同相，FR/RL 反相
  const legs = [];
  for (const [sx, sz, ph] of [[1, 1, 0], [-1, 1, Math.PI], [1, -1, Math.PI], [-1, -1, 0]]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.185, HIP_Y, sz * 0.26);
    body.add(hip);
    k.mesh(hip, k.drum(0.052, 0.075), dark, 0, 0, 0);
    k.mesh(hip, k.drum(0.032, 0.088), shell, 0, 0, 0);
    const thigh = new THREE.Group();
    hip.add(thigh);
    k.mesh(thigh, new THREE.CapsuleGeometry(0.036, 0.14, 6, 14).scale(0.9, 1, 1), white, 0, -0.11, 0);
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    thigh.add(knee);
    k.mesh(knee, k.drum(0.04, 0.072), steel, 0, 0, 0);
    k.mesh(knee, new THREE.CapsuleGeometry(0.026, 0.15, 6, 12), dark, 0, -0.115, 0);
    k.mesh(knee, k.ball(0.04), dark, 0, -0.225, 0);
    legs.push({ thigh, knee, ph });
  }

  let amp = 0;
  let phase = 0;
  return {
    group: k.root,
    setNight: (n) => k.setNight(n),
    update(time, a, dt) {
      const moving = a.mode === 'patrol' || a.mode === 'go' || a.mode === 'back';
      amp += ((moving ? 1 : 0) - amp) * Math.min(1, dt * 6);
      phase += dt * 9 * amp;
      for (const leg of legs) {
        const p = phase + leg.ph;
        const swing = Math.cos(p);
        leg.thigh.rotation.x = THIGH0 + amp * 0.38 * Math.sin(p);
        leg.knee.rotation.x = KNEE0 - amp * 0.55 * Math.max(0, -swing) + amp * 0.08 * Math.max(0, swing);
      }
      body.position.y = amp * 0.01 * Math.sin(phase * 2);
      body.rotation.x = amp * 0.02 * Math.sin(phase * 2 + 1);
      body.rotation.z = amp * 0.025 * Math.sin(phase);
      body.scale.y = 1 + Math.sin(time * 2) * 0.008;
      const scan = a.mode === 'work' ? Math.sin(time * 2.4) * 0.75 : Math.sin(time * 0.8) * 0.16 * amp;
      head.rotation.y += (scan - head.rotation.y) * Math.min(1, dt * 8);
    },
  };
}
