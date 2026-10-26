import * as THREE from "three";

const TEAL = 0x00c2a8;
const INK = 0x101820;

const matSolid = (color: number, opts: { rough?: number; metal?: number; emissive?: number; emissiveIntensity?: number; transparent?: boolean; opacity?: number; side?: THREE.Side } = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.75,
    metalness: opts.metal ?? 0.1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function panel(w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

/**
 * Holographic classroom interior (origin at floor centre, GLB-style Y-up).
 * Local space: x -5..5 (width), y 0..3.6 (height), z -3.7..3.7 (depth).
 * Door on the -z wall, whiteboard on the +z wall. Matches the app's dark
 * premium + teal holographic language.
 */
export function buildClassroom(): THREE.Group {
  const W = 10;
  const D = 7.4;
  const H = 3.6;
  const g = new THREE.Group();

  const matWall = matSolid(0xf4f6f7, { transparent: true, opacity: 0.42, side: THREE.DoubleSide });
  const matWallEdge = matSolid(TEAL, { emissive: TEAL, emissiveIntensity: 0.55 });
  const matFloor = matSolid(0xe9f0f2, { transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const matGlass = matSolid(0xbfe9ff, { emissive: 0x7fd8ff, emissiveIntensity: 0.35, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const matBoard = matSolid(0xffffff, { rough: 0.35 });
  const matFrame = matSolid(INK, { rough: 0.5, metal: 0.4 });
  const matWood = matSolid(TEAL, { transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const matTrim = matSolid(TEAL, { emissive: TEAL, emissiveIntensity: 0.4 });
  const matLight = matSolid(0xfff6e0, { emissive: 0xfff2c8, emissiveIntensity: 4.5, transparent: true, opacity: 0.85 });

  // floor + teal grid
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), matFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  g.add(floor);
  const grid = new THREE.GridHelper(D, 12, TEAL, TEAL);
  grid.rotation.x = Math.PI / 2;
  grid.position.y = 0.006;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  g.add(grid);

  // walls (holographic panels) + teal wireframe edges
  panel(W, H, matWall, 0, H / 2, -D / 2, 0, g); // back (door)
  panel(W, H, matWall, 0, H / 2, D / 2, Math.PI, g); // front (board)
  panel(D, H, matWall, -W / 2, H / 2, 0, Math.PI / 2, g); // left
  panel(D, H, matWall, W / 2, H / 2, 0, -Math.PI / 2, g); // right
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), matWall);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  g.add(ceil);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), matWallEdge);
  shell.material.transparent = true;
  shell.material.opacity = 0.15;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)), matWallEdge);
  g.add(edges);

  // whiteboard on front wall
  const bw = 3.4;
  const bh = 1.35;
  panel(bw, bh, matBoard, 0, 1.9, D / 2 + 0.02, Math.PI, g);
  const bf = new THREE.BoxGeometry(bw + 0.14, 0.05, 0.02);
  const bfM = new THREE.Mesh(bf, matFrame);
  bfM.position.set(0, 1.9 + bh / 2 + 0.04, D / 2 - 0.01);
  g.add(bfM);
  const bfM2 = bfM.clone();
  bfM2.position.y = 1.9 - bh / 2 - 0.04;
  g.add(bfM2);
  box(bw + 0.1, 0.05, 0.02, matTrim, 0, 0.5, D / 2 - 0.02, g);

  // projector + lens on ceiling front
  box(0.5, 0.22, 0.28, matFrame, 0, H - 0.35, D / 2 - 1.4, g);
  box(0.16, 0.12, 0.12, matLight, 0, H - 0.46, D / 2 - 1.28, g);

  // teacher desk + chair (front, right)
  box(1.9, 0.05, 0.85, matWood, W / 2 - 2.1, 0.76, D / 2 - 1.1, g);
  box(0.05, 0.76, 0.8, matFrame, W / 2 - 3.0, 0.38, D / 2 - 1.1, g);
  box(0.05, 0.76, 0.8, matFrame, W / 2 - 1.2, 0.38, D / 2 - 1.1, g);
  box(0.5, 0.06, 0.5, matFrame, W / 2 - 1.4, 0.48, D / 2 - 1.9, g);
  box(0.5, 0.55, 0.08, matFrame, W / 2 - 1.4, 0.85, D / 2 - 1.9, g);

  // student benches: 6 rows x 3 columns (double desks)
  const rows = [0.9, 1.75, 2.6, 3.45, 4.3, 5.15];
  const cols = [-3.4, 0, 3.4];
  for (let i = 0; i < rows.length; i++) {
    const ry = D / 2 - 1.0 - i * 0.85;
    for (const cx of cols) {
      box(2.6, 0.045, 0.58, matWood, cx, 0.74, ry, g);
      box(2.6, 0.05, 0.3, matWood, cx, 0.44, ry - 0.42, g);
      box(0.05, 0.72, 0.05, matFrame, cx - 1.15, 0.37, ry + 0.1, g);
      box(0.05, 0.72, 0.05, matFrame, cx + 1.15, 0.37, ry + 0.1, g);
      box(0.05, 0.42, 0.05, matFrame, cx - 1.15, 0.21, ry - 0.42, g);
      box(0.05, 0.42, 0.05, matFrame, cx + 1.15, 0.21, ry - 0.42, g);
    }
  }

  // door on back wall + frame + handle
  box(1.4, 2.2, 0.06, matFrame, -3.0, 1.1, -D / 2 + 0.04, g);
  panel(0.9, 0.34, matFrame, -3.0, 2.55, -D / 2 + 0.03, 0, g); // sign plate (label attaches here)
  box(0.04, 0.1, 0.04, matTrim, -3.0 + 0.55, 1.05, -D / 2 + 0.06, g);

  // windows on left wall (glowing)
  const winPos = [-2.4, 0.0, 2.4];
  for (const wz of winPos) {
    panel(1.4, 2.0, matGlass, -W / 2 + 0.03, 1.9, wz, Math.PI / 2, g);
  }

  // tube lights on ceiling
  for (const lx of [-2.0, 2.0]) {
    for (const lz of [-2.2, 0.0, 2.2]) {
      box(1.5, 0.05, 0.16, matLight, lx, H - 0.04, lz, g);
    }
  }

  // baseboard teal trim
  box(W, 0.12, 0.06, matTrim, 0, 0.06, -D / 2 + 0.03, g);
  box(W, 0.12, 0.06, matTrim, 0, 0.06, D / 2 - 0.03, g);
  box(0.06, 0.12, D, matTrim, -W / 2 + 0.03, 0.06, 0, g);
  box(0.06, 0.12, D, matTrim, W / 2 - 0.03, 0.06, 0, g);

  // accent column strips (subtle, near board wall)
  box(0.1, H, 0.08, matTrim, -3.6, H / 2, D / 2 - 0.05, g);
  box(0.1, H, 0.08, matTrim, 3.6, H / 2, D / 2 - 0.05, g);

  return g;
}

/** World position of the in-room camera + target for the current room group. */
export function roomCamera(roomGroup: THREE.Object3D): { cam: THREE.Vector3; target: THREE.Vector3 } {
  const cam = new THREE.Vector3(0, 1.65, -3.1);
  const target = new THREE.Vector3(0, 2.0, 3.4);
  roomGroup.localToWorld(cam);
  roomGroup.localToWorld(target);
  return { cam, target };
}