import {
  AmbientLight, BufferAttribute, BufferGeometry, Color, DirectionalLight, DoubleSide, HemisphereLight, LessDepth,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry,
  Fog, Group, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { BUILDINGS, GRID_H, GRID_W } from '../sim/config';
import type { World } from '../sim/world';
import { makeBuilding } from './models';
import { EventFx } from './eventfx';
import { SceneSync } from './scenesync';
import { buildTerrain, fillWater, HS, paintTops, waterIndices } from './terrain';
import type { CameraState, GameView, Ghost } from './view';

const FOV = 35;
const MIN_DIST = 8;
const MAX_DIST = 110;

/** Visual 3D em baixo polígono (Three.js). A simulação não sabe que ele existe. */
export class Renderer3D implements GameView {
  ghost: Ghost | null = null;
  hoverTile: { x: number; y: number } | null = null;
  selectedId: number | null = null;
  followId: number | null = null;
  private lastDraw = 0;

  private gl: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.1, 300);
  private ray = new Raycaster();

  private terrain!: Mesh;
  private terrainGeo!: BufferGeometry;
  private terrainVersion = -1;
  private water!: Mesh;
  private waterPos!: Float32Array;
  private waterCol!: Float32Array;
  private paintFrame = 0;

  private sun = new DirectionalLight('#fff0d0', 1.25);
  private hemi = new HemisphereLight('#d6ecff', '#6b5a43', 0.75);
  private mood = 0; // 0 = temperada, 1 = seca (suavizado)
  private overlays: Mesh[] = []; // quadras de destaque (prévia de obra e mouse)
  private sync: SceneSync;
  private fx: EventFx;
  private ghostModel: Group | null = null;
  private ghostKey = '';

  // câmera orbital
  private yaw = Math.PI / 4;
  private pitch = 0.9;
  private dist = 30;
  private target = new Vector3(23, 2, 16);
  private cssW = 1;
  private cssH = 1;

  /** `transparent`: fundo sem cor (overlay do OBS, a vila aparece sobre o vídeo da live). */
  constructor(private canvas: HTMLCanvasElement, private world: World, opts: { transparent?: boolean } = {}) {
    this.gl = new WebGLRenderer({ canvas, antialias: true, alpha: !!opts.transparent });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if (opts.transparent) this.gl.setClearColor(0x000000, 0);
    else { this.scene.background = new Color('#26323a'); this.scene.fog = new Fog('#26323a', 110, 260); }

    // luz: céu azulado, sol quente de lado (as sombras entram no acabamento)
    this.scene.add(this.hemi);
    this.scene.add(new AmbientLight('#ffffff', 0.15));
    const sun = this.sun;
    sun.position.set(-18, 30, 12);
    sun.target.position.set(GRID_W / 2, 0, GRID_H / 2);
    sun.position.add(sun.target.position);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 120;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = PCFSoftShadowMap;

    this.buildWater();
    this.rebuildTerrain();
    this.sync = new SceneSync(this.scene, world);
    this.fx = new EventFx(this.scene, world);
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
    this.terrain.receiveShadow = true;
    this.terrain.castShadow = true;
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
    this.waterCol = new Float32Array(n * 16);
    g.setAttribute('color', new BufferAttribute(this.waterCol, 4).setUsage(35048));
    g.setIndex(new BufferAttribute(waterIndices(), 1));
    g.setDrawRange(0, 0);
    this.water = new Mesh(g, new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, transparent: true, roughness: 0.12, metalness: 0, depthWrite: true, depthFunc: LessDepth }));
    this.water.frustumCulled = false;
    this.water.renderOrder = 2;
    this.scene.add(this.water);
  }

  // ---------- câmera ----------
  /** Qualidade gráfica: 0 baixa (sem sombras, resolução 1×), 1 média (sombras leves), 2 alta. */
  quality = 2;
  setQuality(q: number): void {
    this.quality = Math.max(0, Math.min(2, Math.round(q)));
    const dpr = window.devicePixelRatio || 1;
    this.gl.setPixelRatio(Math.min(dpr, this.quality === 2 ? 2 : this.quality === 1 ? 1.25 : 1));
    this.sun.castShadow = this.quality > 0;
    const size = this.quality === 2 ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.resize();
  }

  private slowFrames = 0;
  private lastFrameAt = 0;
  /** Se o quadro demora muito por vários segundos seguidos, baixa a qualidade sozinho. Devolve a nova qualidade ou null. */
  watchPerformance(now: number): number | null {
    const dt = now - this.lastFrameAt;
    this.lastFrameAt = now;
    if (dt <= 0 || dt > 1000) { this.slowFrames = 0; return null; } // aba escondida ou pausa
    this.slowFrames = dt > 45 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 90 && this.quality > 0) { this.slowFrames = 0; this.setQuality(this.quality - 1); return this.quality; }
    return null;
  }

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

  getCamera(): CameraState {
    return { yaw: this.yaw, pitch: this.pitch, dist: this.dist, tx: this.target.x, ty: this.target.y, tz: this.target.z };
  }

  setCamera(c: CameraState): void {
    this.yaw = c.yaw; this.pitch = c.pitch; this.dist = c.dist;
    this.target.set(c.tx, c.ty, c.tz);
    this.placeCamera();
  }

  setNames(on: boolean): void { this.sync.names = on; }

  resetCamera(): void {
    this.yaw = Math.PI / 4;
    this.pitch = 0.9;
    this.dist = 34;
    const hall = this.world.buildings[0]; // começa olhando a prefeitura
    this.target.set(hall.x + hall.w / 2, 2, hall.y + hall.h / 2);
    this.placeCamera();
  }

  centerOn(x: number, y: number): void {
    this.followId = null;
    this.target.set(x, this.world.groundZ(x, y) * HS, y);
    this.placeCamera();
  }

  panBy(dxCss: number, dyCss: number): void {
    this.followId = null; // mexeu na câmera: solta o aldeão
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
    this.sync.update(now, this.camera, this.selectedId, this.spriteTint);
    this.followStep(now);
    const q = fillWater(w, this.waterPos, now, this.waterCol);
    this.water.geometry.setDrawRange(0, q * 6);
    (this.water.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.water.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;

    this.updateMood();
    this.fx.update(now, this.target);
    this.fx.applyLight(this.sun, this.hemi, this.scene.background as Color | null);
    this.updateSpriteTint();
    this.updateOverlays();
    this.gl.render(this.scene, this.camera);
  }

  /** Céu e luz mudam com a estação: azulado e fresco na temperada, quente e pálido na seca. */
  /** Câmera acompanhando o aldeão: o alvo desliza até ele; giro e zoom continuam livres. */
  private followStep(now: number): void {
    const dt = Math.min(0.25, Math.max(0, now - this.lastDraw));
    this.lastDraw = now;
    if (this.followId === null) return;
    const v = this.world.villagers.find((q) => q.id === this.followId);
    if (!v) { this.followId = null; return; }
    const p = this.sync.positionOf(v.id) ?? v;
    const k = 1 - Math.exp(-dt * 5);
    this.target.x += (p.x - this.target.x) * k;
    this.target.z += (p.y - this.target.z) * k;
    this.target.y += (this.world.groundZ(p.x, p.y) * HS - this.target.y) * k;
    this.placeCamera();
  }

  private spriteTint = new Color(1, 1, 1);
  /** Luz dos sprites: soma das luzes da cena, normalizada para o dia claro ficar com as cores originais. */
  private updateSpriteTint(): void {
    const t = this.spriteTint;
    t.setRGB(0, 0, 0);
    t.r = this.sun.color.r * this.sun.intensity * 0.5 + this.hemi.color.r * this.hemi.intensity * 0.65;
    t.g = this.sun.color.g * this.sun.intensity * 0.5 + this.hemi.color.g * this.hemi.intensity * 0.65;
    t.b = this.sun.color.b * this.sun.intensity * 0.5 + this.hemi.color.b * this.hemi.intensity * 0.65;
    t.multiplyScalar(1 / 1.1);
    t.r = Math.min(1.15, t.r); t.g = Math.min(1.15, t.g); t.b = Math.min(1.15, t.b);
  }

  private updateMood(): void {
    const target = this.world.season.drought ? 1 : 0;
    this.mood += (target - this.mood) * 0.02;
    const m = this.mood;
    if (this.scene.background) {
      (this.scene.background as Color).set('#26323a').lerp(this.tmpDry.set('#4a3a2c'), m);
      this.scene.fog?.color.copy(this.scene.background as Color);
    }
    this.sun.color.set('#fff0d0').lerp(this.tmpDry.set('#ffc880'), m);
    this.sun.intensity = 1.25 - 0.1 * m;
    this.hemi.color.set('#d6ecff').lerp(this.tmpDry.set('#ffe9c4'), m);
    this.hemi.intensity = 0.75 - 0.1 * m;
  }
  private tmpDry = new Color();

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
