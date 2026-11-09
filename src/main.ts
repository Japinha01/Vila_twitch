import { CommandProcessor } from './chat/commands';
import { Renderer } from './render/renderer';
import { TICKS_PER_SECOND } from './sim/config';
import { World } from './sim/world';
import { Panel } from './ui/panel';

const world = new World(Math.floor(Math.random() * 1e9)); // seed só para o mapa de hoje
const chat = new CommandProcessor(world, { now: () => performance.now() });
const renderer = new Renderer(document.getElementById('game') as HTMLCanvasElement, world);
const panel = new Panel(world, chat, renderer);

let last = performance.now();
let acc = 0;

function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000); // evita salto ao voltar de outra aba
  last = now;
  chat.process();
  acc += dt * TICKS_PER_SECOND * panel.speed;
  let steps = 0;
  while (acc >= 1 && steps++ < 60) { world.step(); acc -= 1; }
  if (steps >= 60) acc = 0;
  renderer.draw();
  panel.update();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// gancho para testes no navegador / depuração
(window as unknown as { __vila: unknown }).__vila = { world, chat, renderer };
