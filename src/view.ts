import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Box, KitchenModel, Mover } from './cabinets';
import { frameYaw, roomWalls, toPlan } from './layout';
import type { KitchenDesign, MaterialKey } from './types';

const MM = 0.001;
const OPEN_PER_SECOND = 2;
const ease = (p: number) => p * p * (3 - 2 * p);
const centre = (b: Box) => b.min.map((v, i) => (v + b.max[i]) / 2);
const size = (b: Box) => b.min.map((v, i) => b.max[i] - v);

interface MoverState { mover: Mover; group: THREE.Group; progress: number; target: number }

/** Renders a generated kitchen; click a door, flap or drawer to open or close it. */
export class KitchenView {
  private readonly container: HTMLElement;
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 60);
  private readonly controls: OrbitControls;
  private readonly sun = new THREE.DirectionalLight('#ffffff', 1.4);
  private readonly content = new THREE.Group();
  private readonly edgeMaterial = new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22 });
  private readonly raycaster = new THREE.Raycaster();
  private materials: THREE.Material[] = [];
  private movers = new Map<string, MoverState>();
  private framedRoom = '';
  private last = performance.now();

  constructor(container: HTMLElement) {
    this.container = container;
    const renderer = this.renderer;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.NeutralToneMapping;
    container.append(renderer.domElement);

    this.scene.background = new THREE.Color('#e7e5e0');
    this.scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.01;
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#d6d0c6', 0.9), this.sun, this.sun.target, this.content);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 10;

    let down: [number, number] | undefined;
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', event => { down = [event.clientX, event.clientY]; });
    canvas.addEventListener('pointerup', event => {
      // A click toggles; a drag only orbits.
      if (down && Math.hypot(event.clientX - down[0], event.clientY - down[1]) < 5) {
        const id = this.pick(event);
        if (id) this.toggle(id);
      }
      down = undefined;
    });
    canvas.addEventListener('pointermove', event => { if (!down) canvas.style.cursor = this.pick(event) ? 'pointer' : ''; });
    new ResizeObserver(() => this.resize()).observe(container);
    renderer.setAnimationLoop(() => this.tick());
  }

  setModel(design: KitchenDesign, model: KitchenModel) {
    this.clear();
    const look = this.createMaterials(design);
    this.content.add(this.createRoom(design));
    const previous = this.movers;
    this.movers = new Map();
    for (const run of model.runs) {
      const runGroup = new THREE.Group();
      runGroup.position.set(run.frame.origin[0] * MM, 0, run.frame.origin[1] * MM);
      runGroup.rotation.y = frameYaw(run.frame);
      this.content.add(runGroup);
      for (const mover of model.movers.filter(m => m.run === run.id)) {
        const group = new THREE.Group();
        group.position.set(mover.pivot[0] * MM, mover.pivot[1] * MM, mover.pivot[2] * MM);
        runGroup.add(group);
        const state = { mover, group, progress: previous.get(mover.id)?.progress ?? 0, target: previous.get(mover.id)?.target ?? 0 };
        this.movers.set(mover.id, state);
        this.apply(state);
      }
      const add = (mesh: THREE.Mesh, b: Box, moverId?: string) => {
        const state = moverId ? this.movers.get(moverId) : undefined;
        const pivot = state?.mover.pivot ?? [0, 0, 0], c = centre(b);
        mesh.position.set((c[0] - pivot[0]) * MM, (c[1] - pivot[1]) * MM, (c[2] - pivot[2]) * MM);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.userData.mover = moverId;
        (state?.group ?? runGroup).add(mesh);
      };
      for (const panel of model.panels) {
        if (panel.run !== run.id) continue;
        const [w, h, d] = size(panel.box);
        const geometry = new THREE.BoxGeometry(w * MM, h * MM, d * MM);
        const mesh = new THREE.Mesh(geometry, look[panel.material]);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), this.edgeMaterial);
        edges.raycast = () => {};
        mesh.add(edges);
        add(mesh, panel.box, panel.mover);
      }
      for (const fitting of model.fittings) {
        if (fitting.run !== run.id) continue;
        const [w, h, d] = size(fitting.box);
        const geometry = fitting.shape === 'cylinder'
          ? new THREE.CylinderGeometry(w * MM / 2, w * MM / 2, h * MM, 16)
          : new THREE.BoxGeometry(w * MM, h * MM, d * MM);
        add(new THREE.Mesh(geometry, look[fitting.look]), fitting.box, fitting.mover);
      }
    }
    this.frame(design, model);
  }

  toggle(id: string) {
    const state = this.movers.get(id);
    if (state) state.target = state.target ? 0 : 1;
  }

  setAll(open: boolean) {
    for (const state of this.movers.values()) state.target = open ? 1 : 0;
  }

  diagnostics() {
    let meshes = 0;
    this.content.traverse(object => { if (object instanceof THREE.Mesh) meshes++; });
    return { meshes, movers: [...this.movers.values()].map(s => ({ id: s.mover.id, progress: s.progress, target: s.target })) };
  }

  /** Screen position of a moving front, for browser checks. */
  screenPoint(id: string): [number, number] | undefined {
    const front = this.movers.get(id)?.group.children[0];
    if (!front) return;
    const point = front.getWorldPosition(new THREE.Vector3()).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return [rect.left + (point.x + 1) / 2 * rect.width, rect.top + (1 - point.y) / 2 * rect.height];
  }

  private createMaterials(design: KitchenDesign) {
    const board = (key: MaterialKey, roughness: number) =>
      new THREE.MeshStandardMaterial({ color: design.materials[key].color, roughness });
    const look = {
      carcass: board('carcass', 0.6), drawer: board('drawer', 0.6), back: board('back', 0.75),
      front: board('front', design.frontStyle.finish === 'painted' ? 0.7 : 0.5), worktop: board('worktop', 0.45),
      metal: new THREE.MeshStandardMaterial({ color: '#c4c7ca', metalness: 1, roughness: 0.32 }),
      plastic: new THREE.MeshStandardMaterial({ color: '#2d2d2b', roughness: 0.6 }),
    };
    this.materials = Object.values(look);
    return look;
  }

  private createRoom(design: KitchenDesign) {
    const room = new THREE.Group();
    const height = design.room.height * MM;
    const floorMaterial = new THREE.MeshStandardMaterial({ color: '#d9d3c8', roughness: 0.85, side: THREE.DoubleSide });
    // Single-sided walls disappear when the camera orbits outside the room.
    const wallMaterial = new THREE.MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.95 });
    this.materials.push(floorMaterial, wallMaterial);
    const outline = new THREE.Shape(design.room.walls.map(wall => new THREE.Vector2(wall.start[0] * MM, wall.start[1] * MM)));
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(outline), floorMaterial);
    floor.rotation.x = Math.PI / 2;
    floor.receiveShadow = true;
    room.add(floor);
    for (const wall of roomWalls(design.room.walls)) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wall.length * MM, height), wallMaterial);
      mesh.position.set((wall.start[0] + wall.end[0]) / 2 * MM, height / 2, (wall.start[1] + wall.end[1]) / 2 * MM);
      mesh.rotation.y = Math.atan2(wall.inward[0], wall.inward[1]);
      mesh.receiveShadow = true;
      room.add(mesh);
    }
    return room;
  }

  /** Lights the room from in front of the main run; reframes the camera only when the room changes. */
  private frame(design: KitchenDesign, model: KitchenModel) {
    const run = model.runs.find(r => r.kind === 'base') ?? model.runs[0];
    if (!run) return;
    const points = design.room.walls.map(wall => wall.start);
    const extent = Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0])) +
      Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1]));
    const [tx, tz] = toPlan(run.frame, run.length / 2, 300);
    const [sx, sz] = toPlan(run.frame, run.length / 2 + 1200, 3000);
    this.sun.position.set(sx * MM, 4.5, sz * MM);
    this.sun.target.position.set(tx * MM, 0, tz * MM);
    const shadow = this.sun.shadow.camera;
    shadow.left = shadow.bottom = -extent * MM;
    shadow.right = shadow.top = extent * MM;
    shadow.far = 20;
    shadow.updateProjectionMatrix();

    const roomKey = JSON.stringify(design.room.walls);
    if (roomKey === this.framedRoom) return;
    this.framedRoom = roomKey;
    // Face the main run and step back (and up) far enough to see every run's footprint.
    const depth = design.construction.worktopDepth;
    const corners = model.runs.flatMap(r => [0, r.length].flatMap(x => [0, depth].map(z => toPlan(r.frame, x, z))));
    const along = corners.map(([px, pz]) => (px - run.frame.origin[0]) * run.frame.xAxis[0] + (pz - run.frame.origin[1]) * run.frame.xAxis[1]);
    const out = corners.map(([px, pz]) => (px - run.frame.origin[0]) * run.frame.zAxis[0] + (pz - run.frame.origin[1]) * run.frame.zAxis[1]);
    const [x0, x1, z0, z1] = [Math.min(...along), Math.max(...along), Math.min(...out), Math.max(...out)];
    const [ax, az] = toPlan(run.frame, (x0 + x1) / 2, (z0 + z1) / 2);
    const [cx, cz] = toPlan(run.frame, (x0 + x1) / 2, z1 + Math.max(2800, (x1 - x0) * 1.1));
    this.controls.target.set(ax * MM, 1.1, az * MM);
    this.camera.position.set(cx * MM, 1.5 + (z1 - z0) * MM / 2, cz * MM);
    this.controls.update();
  }

  private clear() {
    this.content.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) object.geometry.dispose();
    });
    this.content.clear();
    for (const material of this.materials) material.dispose();
  }

  private pick(event: PointerEvent): string | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      (event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
    return this.raycaster.intersectObject(this.content, true)[0]?.object.userData.mover;
  }

  private apply({ mover, group, progress }: MoverState) {
    const e = ease(progress);
    if (mover.motion === 'slide') group.position.z = (mover.pivot[2] + mover.amount * e) * MM;
    else group.rotation[mover.motion === 'swing-y' ? 'y' : 'x'] = THREE.MathUtils.degToRad(mover.amount * e);
  }

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private tick() {
    const now = performance.now(), step = Math.min(0.05, (now - this.last) / 1000) * OPEN_PER_SECOND;
    this.last = now;
    for (const state of this.movers.values()) {
      if (state.progress === state.target) continue;
      state.progress = state.target > state.progress
        ? Math.min(state.target, state.progress + step) : Math.max(state.target, state.progress - step);
      this.apply(state);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
