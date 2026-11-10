import { IcosahedronGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, type Scene } from 'three';
import { GRID_H, GRID_W } from '../sim/config';
import type { World } from '../sim/world';
import { HS } from './terrain';

const PER_TILE = 2;
const hash = (n: number): number => { const x = Math.sin(n * 91.3 + 17.7) * 43758.5453; return x - Math.floor(x); };

/** Pedregulhos espalhados pelas jazidas (só enfeite, uma chamada de desenho para todos); somem sob os prédios. */
export class MineProps {
  private mesh: InstancedMesh;
  private frame = 0;
  private lastVersion = -1;
  private m = new Matrix4();
  private q = new Quaternion();
  private p = new Vector3();
  private s = new Vector3();
  private e = new Vector3(0, 1, 0);

  constructor(scene: Scene) {
    this.mesh = new InstancedMesh(new IcosahedronGeometry(0.2, 0), new MeshLambertMaterial({ color: '#8c9096', flatShading: true }), GRID_W * GRID_H * PER_TILE);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(w: World): void {
    const sig = w.buildings.length * 1000 + w.terrainVersion;
    if (this.frame++ % 30 !== 0 && sig === this.lastVersion) return;
    this.lastVersion = sig;
    const covered = new Set<number>();
    for (const b of w.buildings) for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) covered.add(w.idx(b.x + i, b.y + j));
    let n = 0;
    for (const t of w.mineTiles()) {
      if (covered.has(t)) continue;
      const x = t % GRID_W, y = (t - x) / GRID_W;
      for (let k = 0; k < PER_TILE; k++) {
        const hs = hash(t * 7 + k);
        const sc = 0.5 + hash(t * 13 + k) * 1.1;
        this.p.set(x + 0.15 + hash(t * 3 + k * 5) * 0.7, w.height[t] * HS + 0.05, y + 0.15 + hash(t * 11 + k * 3) * 0.7);
        this.q.setFromAxisAngle(this.e, hs * 6.28);
        this.s.set(sc, sc * (0.6 + hash(t + k) * 0.5), sc);
        this.m.compose(this.p, this.q, this.s);
        this.mesh.setMatrixAt(n++, this.m);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
