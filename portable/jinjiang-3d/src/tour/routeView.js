// 贴地的行程线：沿街道铺一条会向前流动的色带，站点竖一根短杆。

import * as THREE from 'three';

const VERT = `
attribute float aSide;
attribute float aDist;
varying float vDist;
varying float vSide;
void main() {
  vDist = aDist;
  vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = `
uniform float uTime;
uniform float uMotion;
uniform vec3 uColor;
varying float vDist;
varying float vSide;
void main() {
  float flow = fract(vDist * 0.04 - uTime * 0.22 * uMotion);
  float dash = smoothstep(0.0, 0.08, flow) * smoothstep(0.58, 0.34, flow);
  float edge = smoothstep(1.0, 0.45, abs(vSide));
  float alpha = (0.38 + dash * 0.62) * edge;
  gl_FragColor = vec4(uColor, alpha);
}
`;

export class RouteView {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'itinerary-route';
    this.group.renderOrder = 3;
    this.markers = [];
    this.mesh = null;
    this.pinGeo = null;
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: {
        uTime: { value: 0 },
        uMotion: { value: 1 },
        uColor: { value: new THREE.Color('#e4b15a') },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
  }

  setMotion(on) {
    this.mat.uniforms.uMotion.value = on ? 1 : 0;
  }

  setPath(points) {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (!points || points.length < 2) return;
    const pos = [];
    const side = [];
    const dist = [];
    const index = [];
    const cum = [0];
    for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
    const half = 2.15;
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      let dx = next.x - prev.x;
      let dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const px = -dz * half;
      const pz = dx * half;
      const y = (points[i].groundY ?? points[i].y ?? 0) + 1.45;
      pos.push(points[i].x + px, y, points[i].z + pz, points[i].x - px, y, points[i].z - pz);
      side.push(1, -1);
      dist.push(cum[i], cum[i]);
      if (!i) continue;
      const b = i * 2;
      index.push(b - 2, b - 1, b, b - 1, b + 1, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    geo.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = true;
    this.mesh.renderOrder = 3;
    this.group.add(this.mesh);
  }

  setStops(stops) {
    this.clearMarkers();
    if (!stops?.length) return;
    if (!this.pinGeo) {
      this.pinGeo = new THREE.CylinderGeometry(0.65, 0.65, 12, 5);
      this.pinGeo.translate(0, 6, 0);
    }
    for (const s of stops) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xe4b15a });
      const mesh = new THREE.Mesh(this.pinGeo, mat);
      mesh.position.set(s.x, s.groundY || s.y || 0, s.z);
      mesh.userData.id = s.id;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.markers.push(mesh);
    }
  }

  setActive(id) {
    for (const mesh of this.markers) mesh.material.color.set(mesh.userData.id === id ? 0xfff4dc : 0xe4b15a);
  }

  update(time) {
    this.mat.uniforms.uTime.value = time;
  }

  clear() {
    this.setPath([]);
    this.clearMarkers();
  }

  clearMarkers() {
    for (const mesh of this.markers) {
      this.group.remove(mesh);
      mesh.material.dispose();
    }
    this.markers = [];
  }
}
