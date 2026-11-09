import type { PlaceableKind } from '../sim/world';

/** Câmera orbital do 3D: o overlay do OBS copia exatamente o que o streamer faz. */
export interface CameraState { yaw: number; pitch: number; dist: number; tx: number; ty: number; tz: number }

export interface Ghost { kind: PlaceableKind; x: number; y: number; ok: boolean }

/** O que o painel precisa de qualquer visual (2D isométrico ou 3D). */
export interface GameView {
  ghost: Ghost | null;
  hoverTile: { x: number; y: number } | null;
  selectedId: number | null;
  /** tile sob o ponteiro (coordenadas CSS do canvas) */
  pickTile(cssX: number, cssY: number): { x: number; y: number } | null;
  panBy(dxCss: number, dyCss: number): void;
  zoomAt(factor: number, cssX: number, cssY: number): void;
  /** só o visual 3D gira */
  rotateBy?(dxCss: number): void;
  /** só o visual 3D tem câmera orbital */
  getCamera?(): CameraState;
  setCamera?(s: CameraState): void;
  /** só o visual 3D: nomes flutuando sobre os aldeões */
  setNames?(on: boolean): void;
  resetCamera(): void;
  centerOn(x: number, y: number): void;
  draw(): void;
}
