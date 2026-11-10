import { HalfFloatType, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** Tilt-shift (desfoque em cima e embaixo, como miniatura), vinheta e um tom quente leve: o visual HD-2D. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; varying vec2 vUv;
    void main() {
      float off = abs(vUv.y - 0.5);
      float k = smoothstep(0.2, 0.52, off) * 3.2;
      vec3 sum = texture2D(tDiffuse, vUv).rgb; float n = 1.0;
      if (k > 0.05) {
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.785398;
          vec2 d = vec2(cos(a), sin(a)) * k / uRes;
          sum += texture2D(tDiffuse, vUv + d).rgb + texture2D(tDiffuse, vUv + d * 2.0).rgb * 0.6; n += 1.6;
        }
      }
      vec3 c = sum / n;
      c *= vec3(1.04, 1.0, 0.94);
      float v = distance(vUv, vec2(0.5)); c *= 1.0 - smoothstep(0.45, 0.95, v) * 0.38;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/** Pós-processamento do modo HD-2D: bloom suave, tilt-shift e vinheta. Só na qualidade alta. */
export class PostFx {
  private composer: EffectComposer;
  private grade: ShaderPass;
  private bloom: UnrealBloomPass;

  constructor(gl: WebGLRenderer, scene: Scene, camera: Camera) {
    const target = new WebGLRenderTarget(4, 4, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(gl, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.32, 0.7, 0.88);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
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
