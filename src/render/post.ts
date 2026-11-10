import { AddEquation, CustomBlending, HalfFloatType, OneFactor, SrcAlphaFactor, Vector2, ZeroFactor, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** Tilt-shift (desfoque em cima e embaixo, como miniatura), vinheta e um tom quente leve: o visual HD-2D. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new Vector2(1, 1) }, uClear: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uClear; varying vec2 vUv;
    void main() {
      float off = abs(vUv.y - 0.5);
      float k = smoothstep(0.2, 0.52, off) * 3.2;
      vec4 first = texture2D(tDiffuse, vUv); vec4 sum = first; float n = 1.0;
      if (k > 0.05) {
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.785398;
          vec2 d = vec2(cos(a), sin(a)) * k / uRes;
          sum += texture2D(tDiffuse, vUv + d) + texture2D(tDiffuse, vUv + d * 2.0) * 0.6; n += 1.6;
        }
      }
      vec4 px = sum / n;
      vec3 c = px.rgb * vec3(1.04, 1.0, 0.94);
      float v = distance(vUv, vec2(0.5)); c *= 1.0 - smoothstep(0.45, 0.95, v) * 0.38;
      // fundo transparente (OBS): o brilho do bloom também vira opacidade, senão sumiria sobre o vídeo
      float a = uClear > 0.5 ? clamp(max(px.a, max(c.r, max(c.g, c.b))), 0.0, 1.0) : 1.0;
      gl_FragColor = vec4(c, a);
    }`,
};

/** Pós-processamento do modo HD-2D: bloom suave, tilt-shift e vinheta. Só na qualidade alta. */
export class PostFx {
  private composer: EffectComposer;
  private grade: ShaderPass;
  private bloom: UnrealBloomPass;

  constructor(gl: WebGLRenderer, scene: Scene, camera: Camera, transparent = false) {
    const target = new WebGLRenderTarget(4, 4, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(gl, target);
    const rp = new RenderPass(scene, camera);
    if (transparent) { rp.clearAlpha = 0; rp.clear = true; }
    this.composer.addPass(rp);
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.32, 0.7, 0.88);
    if (transparent) {
      // o bloom do three escreve alfa 1 em tudo; aqui ele só soma cor e preserva o alfa da cena (fundo transparente do OBS)
      const bm = (this.bloom as unknown as { blendMaterial: { blending: number; blendEquation: number; blendSrc: number; blendDst: number; blendSrcAlpha: number | null; blendDstAlpha: number | null; blendEquationAlpha: number | null } }).blendMaterial;
      bm.blending = CustomBlending; bm.blendEquation = AddEquation; bm.blendSrc = SrcAlphaFactor; bm.blendDst = OneFactor;
      bm.blendSrcAlpha = ZeroFactor; bm.blendDstAlpha = OneFactor; bm.blendEquationAlpha = AddEquation;
    }
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uClear.value = transparent ? 1 : 0;
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number, dpr: number): void {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.grade.uniforms.uRes.value.set(w * dpr, h * dpr);
  }

  render(): void { this.composer.render(); }
}
