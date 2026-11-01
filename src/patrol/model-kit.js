// 巡检模型的公共零件：受光材质、圆润体、管件。模型朝 +Z，单位是米，放大倍数由 view 决定。
// 材质带一层与自身同色的自发光底色，夜里环境光很弱时仍然能看清轮廓。

import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const NIGHT_BOOST = 2.6;

export class Kit {
  constructor(accent) {
    this.accent = new THREE.Color(accent);
    this.root = new THREE.Group();
    this.lit = [];
  }

  // 受光的涂装材质
  paint(color, { rough = 0.4, metal = 0.15, glow = 0.16 } = {}) {
    const c = new THREE.Color(color);
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, emissive: c, emissiveIntensity: glow, fog: false });
    m.userData.glow = glow;
    this.lit.push(m);
    return m;
  }

  // 自发光的灯：不受光照，颜色可以在 update 里改
  lamp(color, opacity = 1) {
    return new THREE.MeshBasicMaterial({ color, fog: false, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: THREE.DoubleSide });
  }

  setNight(night) {
    for (const m of this.lit) m.emissiveIntensity = m.userData.glow * (night ? NIGHT_BOOST : 1);
  }

  mesh(parent, geo, mat, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  // 椭球：r 为基准半径，sx/sy/sz 为三向拉伸
  ball(r, sx = 1, sy = 1, sz = 1) {
    return new THREE.SphereGeometry(r, 28, 18).scale(sx, sy, sz);
  }

  // 沿 Z 的胶囊体（两端半球），len 为中段长度
  capsule(r, len, sx = 1, sy = 1, sz = 1) {
    return new THREE.CapsuleGeometry(r, len, 8, 20).rotateX(Math.PI / 2).scale(sx, sy, sz);
  }

  // 沿 X 的圆柱，用作电机、轮子
  drum(r, h, seg = 28) {
    return new THREE.CylinderGeometry(r, r, h, seg).rotateZ(Math.PI / 2);
  }

  // 从 a 到 b 的锥形管，r0 在 a 端，r1 在 b 端
  tube(parent, a, b, r0, r1, mat, seg = 14) {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, d.length(), seg), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    parent.add(m);
    return m;
  }
}
