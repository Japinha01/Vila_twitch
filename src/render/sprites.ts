import { CanvasTexture, NearestFilter } from 'three';
import type { Job } from '../sim/types';
import { JOBS } from '../sim/types';

/** Célula de cada quadro no atlas (px). O corpo ocupa 16×24 e sobra 1px de margem para o contorno. */
export const CELL_W = 18;
export const CELL_H = 26;
/** Quadros por função: 0 parado, 1 e 2 andando, 3 e 4 trabalhando. */
export const FRAMES = 5;
export const FOOT_ROW = 25; // linha (de cima) onde ficam os pés dentro da célula

/** Paleta por código: o shader troca pele, cabelo, camisa e calça pela cor de cada viewer. */
const P = {
  skin: '#ff0000', skinS: '#990000',
  hair: '#00ff00', hairS: '#009900',
  shirt: '#0000ff', shirtS: '#000099',
  pants: '#ffff00', pantsS: '#999900',
  metal: '#c0c8cc', wood: '#8c5e33', eye: '#1a1210',
  line: '#1c1210',
} as const;

type Draw = (x: number, y: number, w: number, h: number, c: string) => void;

/** Aldeão de perfil olhando para a direita, 16×24; `f` = quadro (pernas e braço). */
function drawBody(R: Draw, f: number, job: Job): void {
  const walk = f === 1 || f === 2;
  const work = f === 3 || f === 4;
  const bob = walk ? 0 : 0;
  // pernas
  const a = f === 1 ? 2 : f === 2 ? -2 : 0;
  R(6 + a, 17, 2, 6, P.pants); R(6 + a, 21, 2, 2, P.pantsS);
  R(9 - a, 17, 2, 6, P.pantsS); R(9 - a, 21, 2, 2, P.pantsS);
  R(6 + a, 23, 3, 1, P.eye); R(9 - a, 23, 3, 1, P.eye);
  // torso
  R(5, 9 + bob, 7, 8, P.shirt); R(5, 15 + bob, 7, 2, P.shirtS); R(11, 9 + bob, 1, 6, P.shirtS);
  // cabeça
  R(5, 1, 7, 8, P.skin); R(5, 7, 7, 2, P.skinS);
  R(4, 0, 8, 3, P.hair); R(4, 3, 3, 5, P.hair); R(4, 7, 2, 1, P.hairS); R(8, 0, 4, 1, P.hairS);
  R(10, 4, 1, 2, P.eye);
  // braço e ferramenta
  const tool = (x: number, y: number): void => {
    if (job === 'wood') { R(x, y - 5, 1, 7, P.wood); R(x + 1, y - 6, 3, 3, P.metal); }
    else if (job === 'stone') { R(x, y - 5, 1, 8, P.wood); R(x - 2, y - 6, 6, 2, P.metal); }
    else if (job === 'food') { R(x, y - 5, 1, 8, P.wood); R(x + 1, y - 5, 3, 1, P.metal); }
    else if (job === 'water') { R(x - 1, y + 1, 4, 3, '#339af0'); R(x, y, 2, 1, P.wood); }
    else { R(x, y - 3, 1, 5, P.wood); R(x - 1, y - 4, 4, 2, P.metal); }
  };
  if (work) {
    const up = f === 3;
    R(8, 10, 2, 4, P.skin); R(up ? 9 : 10, up ? 7 : 11, 2, 2, P.skin);
    tool(up ? 11 : 13, up ? 6 : 11);
  } else {
    R(7 + (walk ? (f === 1 ? -1 : 1) : 0), 10, 2, 5, P.skin);
    tool(11, 14);
  }
}

/** Gera o atlas (uma linha por função, cinco quadros por linha) com contorno de 1px. */
export function makeAtlas(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = CELL_W * FRAMES;
  cv.height = CELL_H * JOBS.length;
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  JOBS.forEach((job, row) => {
    for (let f = 0; f < FRAMES; f++) {
      const ox = f * CELL_W + 1, oy = row * CELL_H + 1;
      drawBody((x, y, w, h, c) => { g.fillStyle = c; g.fillRect(ox + x, oy + y, w, h); }, f, job);
    }
  });
  // contorno: todo pixel vazio ao lado de um pixel cheio (dentro da própria célula) vira linha escura
  const img = g.getImageData(0, 0, cv.width, cv.height);
  const d = img.data, W = cv.width, H = cv.height;
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 0;
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (solid(x, y)) continue;
    if (!(solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) continue;
    const i = (y * W + x) * 4;
    out[i] = 28; out[i + 1] = 18; out[i + 2] = 16; out[i + 3] = 255;
  }
  img.data.set(out);
  g.putImageData(img, 0, 0);
  const tex = new CanvasTexture(cv);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

export const SPRITE_VERT = /* glsl */ `
attribute vec3 aOff;
attribute vec2 aCell;   // quadro, linha da função
attribute float aFlip;
attribute float aScale;
attribute vec3 aSkin;
attribute vec3 aHair;
attribute vec3 aShirt;
attribute vec3 aPants;
uniform vec3 uRight;
uniform float uPx;
varying vec2 vUv;
varying vec3 vSkin; varying vec3 vHair; varying vec3 vShirt; varying vec3 vPants;
void main() {
  float u = aFlip > 0.0 ? position.x : 1.0 - position.x;
  vUv = vec2((aCell.x + u) / ${FRAMES}.0, 1.0 - (aCell.y + 1.0 - position.y) / ${JOBS.length}.0);
  vSkin = aSkin; vHair = aHair; vShirt = aShirt; vPants = aPants;
  vec3 wp = aOff + uRight * (position.x - 0.5) * ${CELL_W}.0 * uPx * aScale
          + vec3(0.0, (position.y * ${CELL_H}.0 - (${CELL_H}.0 - ${FOOT_ROW}.0 - 1.0)) * uPx * aScale, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

export const SPRITE_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uTint;
varying vec2 vUv;
varying vec3 vSkin; varying vec3 vHair; varying vec3 vShirt; varying vec3 vPants;
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  vec3 c = t.rgb;
  vec3 col = c;
  float mx = max(c.r, max(c.g, c.b));
  float sh = mx < 0.8 ? 0.7 : 1.0;
  if (c.r > 0.5 && c.g < 0.2 && c.b < 0.2) col = vSkin * sh;
  else if (c.g > 0.5 && c.r < 0.2 && c.b < 0.2) col = vHair * sh;
  else if (c.b > 0.5 && c.r < 0.2 && c.g < 0.2) col = vShirt * sh;
  else if (c.r > 0.5 && c.g > 0.5 && c.b < 0.2) col = vPants * (sh < 1.0 ? 0.55 : 0.8);
  gl_FragColor = vec4(pow(col, vec3(2.2)) * uTint, 1.0);
  #include <colorspace_fragment>
}`;
