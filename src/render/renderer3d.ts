import {
  AmbientLight, BufferAttribute, BufferGeometry, Color, DirectionalLight, DoubleSide, HemisphereLight, LessDepth,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry,
  Group, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { BUILDINGS, GRID_H, GRID_W } from '../sim/config';
import type { World } from '../sim/world';
import { makeBuilding } from './models';
import { SceneSync } from './scenesync';
import { buildTerrain, fillWater, HS, paintTops, waterIndices } from './terrain';
import type { GameView, Ghost } from './view';

const FOV = 35;
const MIN_DIST = 8;
const MAX_DIST = 70;

/** Visual 3D em baixo polígono (Three.js). A simulação não sabe que ele existe. */
export class Renderer3D implements GameView {
  ghost: Ghost | null = null;
  hoverTile: { x: number; y: number } | null = null;
  selectedId: number | null = null;

  private gl: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.1, 300);
  private ray = new Raycaster();

  private terrain!: Mesh;
  private terrainGeo!: BufferGeometry;
  private terrainVersion = -1;
  private water!: Mesh;
  private waterPos!: Float32Array;
  private paintFrame = 0;

  private overlays: Mesh[] = []; // quadras de destaque (prévia de obra e mouse)
  private sync: SceneSync;
  private ghostModel: Group | null = null;
  private ghostKey = '';

  // câmera orbital
  private yaw = Math.PI / 4;
  private pitch = 0.9;
  private dist = 30;
  private target = new Vector3(23, 2, 16);
  private cssW = 1;
  private cssH = 1;

  constructor(private canvas: HTMLCanvasElement, private world: World) {
    this.gl = new WebGLRenderer({ canvas, antialias: true });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.background = new Color('#26323a');

    // luz: céu azulado, sol quente de lado (as sombras entram no acabamento)
    this.scene.add(new HemisphereLight('#d6ecff', '#6b5a43', 0.75));
    this.scene.add(new AmbientLight('#ffffff', 0.15));
    const sun = new DirectionalLight('#fff0d0', 1.25);
    sun.position.set(-18, 30, 12);
    this.scene.add(sun);

    this.buildWater();
    this.rebuildTerrain();
    this.sync = new SceneSync(this.scene, world);
    for (let i = 0; i < 6; i++) {
      const m = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ transparent: true, opacity: 0.5, side: DoubleSide, depthWrite: false }));
      m.visible = false;
      m.renderOrder = 5;
      this.scene.add(m);
      this.overlays.push(m);
    }

    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
    this.resetCamera();
  }

  // ---------- malhas ----------
  private rebuildTerrain(): void {
    if (this.terrain) { this.scene.remove(this.terrain); this.terrainGeo.dispose(); }
    const t = buildTerrain(this.world);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(t.positions, 3));
    g.setAttribute('color', new BufferAttribute(t.colors, 3));
    g.setIndex(new BufferAttribute(t.indices, 1));
    g.computeVertexNormals();
    paintTops(this.world, t.colors);
    this.terrainGeo = g;
    this.terrain = new Mesh(g, new MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(this.terrain);
    this.terrainVersion = this.world.terrainVersion;
  }

  private buildWater(): void {
    const n = GRID_W * GRID_H;
    const g = new BufferGeometry();
    this.waterPos = new Float32Array(n * 12);
    g.setAttribute('position', new BufferAttribute(this.waterPos, 3).setUsage(35048)); // DynamicDrawUsage
    const normals = new Float32Array(n * 12);
    for (let i = 0; i < n * 4; i++) normals[i * 3 + 1] = 1;
    g.setAttribute('normal', new BufferAttribute(normals, 3));
    g.setIndex(new BufferAttribute(waterIndices(), 1));
    g.setDrawRange(0, 0);
    this.water = new Mesh(g, new MeshStandardMaterial({ color: '#52b0ff', transparent: true, opacity: 0.72, roughness: 0.25, metalness: 0, depthWrite: true, depthFunc: LessDepth }));
    this.water.frustumCulled = false;
    this.water.renderOrder = 2;
    this.scene.add(this.water);
  }

  // ---------- câmera ----------
  private resize(): void {
    const box = this.canvas.parentElement!.getBoundingClientRect();
    this.cssW = Math.max(1, box.width);
    this.cssH = Math.max(1, box.height);
    this.gl.setSize(this.cssW, this.cssH, false);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.camera.aspect = this.cssW / this.cssH;
    this.camera.updateProjectionMatrix();
  }

  private placeCamera(): void {
    const t = this.target;
    t.x = Math.min(GRID_W, Math.max(0, t.x));
    t.z = Math.min(GRID_H, Math.max(0, t.z));
    this.camera.position.set(
      t.x + this.dist * Math.cos(this.pitch) * Math.sin(this.yaw),
      t.y + this.dist * Math.sin(this.pitch),
      t.z + this.dist * Math.cos(this.pitch) * Math.cos(this.yaw),
    );
    this.camera.lookAt(t);
  }

  resetCamera(): void {
    this.yaw = Math.PI / 4;
    this.pitch = 0.9;
    this.dist = 30;
    this.target.set(23, 2, 16);
    this.placeCamera();
  }

  centerOn(x: number, y: number): void {
    this.target.set(x, this.world.groundZ(x, y) * HS, y);
    this.placeCamera();
  }

  panBy(dxCss: number, dyCss: number): void {
    const k = (2 * this.dist * Math.tan((FOV * Math.PI) / 360)) / this.cssH; // tiles por pixel
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw); // direção "direita" no chão
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); // direção "para frente" no chão
    this.target.x += -rx * dxCss * k + (fx * dyCss * k) / Math.sin(this.pitch);
    this.target.z += -rz * dxCss * k + (fz * dyCss * k) / Math.sin(this.pitch);
    this.placeCamera();
  }

  rotateBy(dxCss: number): void {
    this.yaw -= dxCss * 0.006;
    this.placeCamera();
  }

  zoomAt(factor: number, cssX: number, cssY: number): void {
    const before = this.groundPoint(cssX, cssY);
    this.dist = Math.min(MAX_DIST, Math.max(MIN_DIST, this.dist / factor));
    this.placeCamera();
    const after = this.groundPoint(cssX, cssY);
    if (before && after) { this.target.x += before.x - after.x; this.target.z += before.z - after.z; this.placeCamera(); }
  }

  private setRay(cssX: number, cssY: number): void {
    this.ray.setFromCamera(new Vector2((cssX / this.cssW) * 2 - 1, -(cssY / this.cssH) * 2 + 1), this.camera);
  }

  /** Ponto do plano do alvo sob o ponteiro. */
  private groundPoint(cssX: number, cssY: number): Vector3 | null {
    this.setRay(cssX, cssY);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    if (Math.abs(d.y) < 1e-6) return null;
    const t = (this.target.y - o.y) / d.y;
    return t > 0 ? new Vector3(o.x + d.x * t, this.target.y, o.z + d.z * t) : null;
  }

  pickTile(cssX: number, cssY: number): { x: number; y: number } | null {
    this.setRay(cssX, cssY);
    const hit = this.ray.intersectObject(this.terrain, false)[0];
    if (!hit) return null;
    // empurra um fio para dentro do terreno: acertos em parede caem no tile certo
    const p = hit.point.clone().addScaledVector(this.ray.ray.direction, 0.01);
    const x = Math.floor(p.x), y = Math.floor(p.z);
    return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H ? { x, y } : null;
  }

  // ---------- quadro ----------
  draw(): void {
    const w = this.world;
    if (this.terrainVersion !== w.terrainVersion) this.rebuildTerrain();
    if (this.paintFrame++ % 8 === 0) {
      const col = this.terrainGeo.getAttribute('color') as BufferAttribute;
      paintTops(w, col.array as Float32Array);
      col.needsUpdate = true;
    }
    const now = performance.now() / 1000;
    this.sync.update(now, this.camera, this.selectedId);
    const q = fillWater(w, this.waterPos, now);
    this.water.geometry.setDrawRange(0, q * 6);
    (this.water.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;

    this.updateOverlays();
    this.gl.render(this.scene, this.camera);
  }

  private updateOverlays(): void {
    const w = this.world;
    for (const m of this.overlays) m.visible = false;
    const place = (m: Mesh, x: number, y: number, color: string, opacity: number): void => {
      const i = w.idx(x, y);
      m.position.set(x + 0.5, (w.height[i] + Math.min(w.water[i], 2.5)) * HS + 0.03, y + 0.5);
      const mat = m.material as MeshBasicMaterial;
      mat.color.set(color);
      mat.opacity = opacity;
      m.visible = true;
    };
    if (this.ghost) {
      const spec = BUILDINGS[this.ghost.kind];
      let n = 0;
      for (let j = 0; j < spec.h; j++) for (let i = 0; i < spec.w; i++) {
        const x = this.ghost.x + i, y = this.ghost.y + j;
        if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
        place(this.overlays[n++], x, y, this.ghost.ok ? '#51cf66' : '#ff6b6b', 0.55);
      }
      this.showGhostModel(this.ghost);
    } else if (this.hoverTile) {
      this.hideGhostModel();
      place(this.overlays[0], this.hoverTile.x, this.hoverTile.y, '#ffffff', 0.35);
    } else this.hideGhostModel();
  }

  /** Prévia translúcida do prédio (verde = pode, vermelho = não pode). */
  private showGhostModel(gh: Ghost): void {
    const key = `${gh.kind}:${gh.ok}`;
    if (this.ghostKey !== key) {
      this.hideGhostModel(true);
      const m = makeBuilding(gh.kind);
      const mat = new MeshBasicMaterial({ color: gh.ok ? '#69db7c' : '#ff8787', transparent: true, opacity: 0.55, depthWrite: false });
      m.traverse((o) => { if ((o as Mesh).isMesh) (o as Mesh).material = mat; });
      this.scene.add(m);
      this.ghostModel = m;
      this.ghostKey = key;
    }
    const spec = BUILDINGS[gh.kind];
    const w = this.world;
    const cx = Math.min(GRID_W - 1, Math.max(0, gh.x)), cy = Math.min(GRID_H - 1, Math.max(0, gh.y));
    this.ghostModel!.position.set(gh.x + spec.w / 2, w.height[w.idx(cx, cy)] * HS, gh.y + spec.h / 2);
    this.ghostModel!.visible = true;
  }

  private hideGhostModel(drop = false): void {
    if (!this.ghostModel) return;
    if (drop) { this.scene.remove(this.ghostModel); this.ghostModel = null; this.ghostKey = ''; } else this.ghostModel.visible = false;
  }
}
