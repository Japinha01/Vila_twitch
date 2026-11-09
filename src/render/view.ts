import type { PlaceableKind } from '../sim/world';

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
  resetCamera(): void;
  centerOn(x: number, y: number): void;
  draw(): void;
}
