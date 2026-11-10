import {
  BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, SphereGeometry, TorusGeometry,
} from 'three';

export const WAGON_WHEEL_R = 0.32;

/**
 * Carroça da caravana, de frente para +x: caçamba com tábuas, cobertura de lona arqueada, carga atrás (caixotes, barril, saco),
 * banco com condutor, lanterna, rodas com aro, cubo e raios, e uma junta de dois bois presa por um cabeçalho.
 * `userData.wheel` marca os pivôs das rodas (giram em z) e `userData.legs` as pernas dos bois (balançam em z).
 */
export function makeWagon(): Group {
  const g = new Group();
  const m = (color: string): MeshLambertMaterial => new MeshLambertMaterial({ color });
  const wood = m('#8a5a2b'), plank = m('#a06a35'), dark = m('#3b2a1a'), iron = m('#4a4f55'), clothDark = m('#d9c795');
  const box = (w: number, h: number, d: number, mat: MeshLambertMaterial, x: number, y: number, z: number): Mesh => {
    const o = new Mesh(new BoxGeometry(w, h, d), mat);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };

  // caçamba: piso, tábuas laterais, frente e traseira
  box(2.0, 0.1, 0.95, wood, 0, 0.55, 0);
  for (const z of [-0.47, 0.47]) { box(2.0, 0.28, 0.06, plank, 0, 0.74, z); box(2.0, 0.05, 0.08, wood, 0, 0.9, z); }
  box(0.06, 0.28, 0.95, plank, 1.0, 0.74, 0);
  box(0.06, 0.28, 0.95, plank, -1.0, 0.74, 0);
  // eixos
  for (const x of [-0.6, 0.6]) box(0.12, 0.1, 1.2, dark, x, 0.34, 0);

  // lona arqueada (meio cilindro deitado) e nervuras
  const arch = new Mesh(new CylinderGeometry(0.5, 0.5, 1.15, 14, 1, true, 0, Math.PI), new MeshLambertMaterial({ color: '#efe0b8', side: DoubleSide }));
  arch.rotation.z = Math.PI / 2;
  arch.position.set(0.3, 0.85, 0);
  arch.scale.set(1, 1, 0.92);
  g.add(arch);
  for (const x of [-0.25, 0.85]) {
    const rib = new Mesh(new TorusGeometry(0.47, 0.025, 6, 14, Math.PI), wood);
    rib.rotation.y = Math.PI / 2;
    rib.position.set(x, 0.85, 0);
    g.add(rib);
  }
  box(0.05, 0.3, 0.7, clothDark, 0.89, 0.95, 0); // franja de lona na frente

  // carga atrás, fora da lona
  box(0.36, 0.3, 0.36, plank, -0.75, 0.75, -0.2);
  box(0.3, 0.26, 0.3, wood, -0.78, 0.73, 0.22);
  box(0.28, 0.24, 0.28, plank, -0.75, 1.0, -0.2);
  const barrel = new Mesh(new CylinderGeometry(0.17, 0.17, 0.34, 10), wood);
  barrel.position.set(-0.45, 0.77, 0.3);
  g.add(barrel);
  const sack = new Mesh(new SphereGeometry(0.2, 8, 6), clothDark);
  sack.scale.set(1.2, 0.85, 0.95);
  sack.position.set(-0.45, 0.78, -0.28);
  g.add(sack);

  // banco, condutor e lanterna
  box(0.3, 0.06, 0.8, wood, 1.12, 0.98, 0);
  box(0.06, 0.3, 0.8, wood, 0.98, 1.1, 0);
  box(0.24, 0.34, 0.26, m('#b5453a'), 1.1, 1.2, 0.18);
  const head = new Mesh(new SphereGeometry(0.11, 8, 6), m('#e8b98f'));
  head.position.set(1.1, 1.5, 0.18);
  g.add(head);
  const hat = new Mesh(new CylinderGeometry(0.2, 0.2, 0.03, 10), m('#6b4a22'));
  hat.position.set(1.1, 1.6, 0.18);
  g.add(hat);
  const hatTop = new Mesh(new CylinderGeometry(0.1, 0.11, 0.1, 10), m('#6b4a22'));
  hatTop.position.set(1.1, 1.66, 0.18);
  g.add(hatTop);
  box(0.04, 0.3, 0.04, dark, -1.0, 1.05, 0.45);
  const lamp = new Mesh(new BoxGeometry(0.1, 0.12, 0.1), new MeshBasicMaterial({ color: '#ffd45e' }));
  lamp.position.set(-1.0, 1.25, 0.45);
  g.add(lamp);

  // rodas: aro (torus), cubo e 8 raios; o pivô gira em torno de z
  for (const [x, z] of [[-0.6, 0.62], [0.6, 0.62], [-0.6, -0.62], [0.6, -0.62]]) {
    const pivot = new Group();
    pivot.position.set(x, WAGON_WHEEL_R, z);
    pivot.userData.wheel = true;
    pivot.add(new Mesh(new TorusGeometry(WAGON_WHEEL_R - 0.03, 0.04, 6, 16), iron));
    pivot.add(new Mesh(new CylinderGeometry(0.07, 0.07, 0.12, 8), dark));
    pivot.children[1].rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const spoke = new Mesh(new BoxGeometry(WAGON_WHEEL_R * 2 - 0.06, 0.04, 0.04), wood);
      spoke.rotation.z = (i * Math.PI) / 4;
      pivot.add(spoke);
    }
    g.add(pivot);
  }

  // timão e junta de bois
  box(1.5, 0.07, 0.07, wood, 1.7, 0.6, 0);
  box(0.08, 0.08, 0.8, wood, 2.5, 0.98, 0);
  const legs: Group[] = [];
  const hide = [m('#7a5230'), m('#a8794a')];
  [-0.22, 0.22].forEach((oz, k) => {
    const ox = new Group();
    ox.position.set(2.3, 0, oz);
    const h = hide[k];
    const body = new Mesh(new BoxGeometry(0.78, 0.44, 0.36), h); body.position.set(0, 0.78, 0); ox.add(body);
    const neck = new Mesh(new BoxGeometry(0.22, 0.32, 0.3), h); neck.position.set(0.44, 0.88, 0); ox.add(neck);
    const face = new Mesh(new BoxGeometry(0.3, 0.24, 0.24), h); face.position.set(0.62, 0.8, 0); ox.add(face);
    const muzzle = new Mesh(new BoxGeometry(0.1, 0.16, 0.2), m('#d9b99b')); muzzle.position.set(0.8, 0.76, 0); ox.add(muzzle);
    for (const hz of [-0.14, 0.14]) {
      const horn = new Mesh(new BoxGeometry(0.06, 0.06, 0.14), m('#efe6d2')); horn.position.set(0.58, 0.97, hz * 1.2); ox.add(horn);
    }
    const tail = new Mesh(new BoxGeometry(0.05, 0.3, 0.05), h); tail.position.set(-0.42, 0.78, 0); tail.rotation.z = 0.3; ox.add(tail);
    for (const [lx, lz] of [[0.28, 0.12], [0.28, -0.12], [-0.28, 0.12], [-0.28, -0.12]]) {
      const leg = new Group();
      leg.position.set(lx, 0.58, lz);
      const limb = new Mesh(new BoxGeometry(0.1, 0.52, 0.1), h);
      limb.position.y = -0.26;
      leg.add(limb);
      ox.add(leg);
      legs.push(leg);
    }
    g.add(ox);
  });
  g.userData.legs = legs;
  g.traverse((o) => { o.castShadow = true; });
  g.scale.setScalar(1.15);
  return g;
}
