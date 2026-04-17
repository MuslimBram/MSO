
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { AppState, SimulationVoxel, RebuildTarget, VoxelData } from '../types';
import { CONFIG, COLORS } from '../utils/voxelConstants';

export class VoxelEngine {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private instanceMesh: THREE.InstancedMesh | null = null;
  private dummy = new THREE.Object3D();
  
  // Group to hold the content
  private contentGroup: THREE.Group;
  
  // VR Specifics
  private dolly: THREE.Group; // Used to move the user in VR
  private controllers: THREE.XRTargetRaySpace[] = [];
  private controllerGrips: THREE.XRGripSpace[] = [];
  
  private voxels: SimulationVoxel[] = [];
  private rebuildTargets: RebuildTarget[] = [];
  private rebuildStartTime: number = 0;
  
  private state: AppState = AppState.STABLE;
  private onStateChange: (state: AppState) => void;
  private onCountChange: (count: number) => void;

  constructor(
    container: HTMLElement, 
    onStateChange: (state: AppState) => void,
    onCountChange: (count: number) => void
  ) {
    this.container = container;
    this.onStateChange = onStateChange;
    this.onCountChange = onCountChange;

    // Init Three.js
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.BG_COLOR);
    this.scene.fog = new THREE.Fog(CONFIG.BG_COLOR, 20, 100); 

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(30, 30, 60);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    
    container.appendChild(this.renderer.domElement);
    
    // VR Button
    const vrButton = VRButton.createButton(this.renderer);
    vrButton.style.position = 'absolute';
    vrButton.style.bottom = '20px';
    vrButton.style.left = 'calc(50% - 75px)';
    vrButton.style.zIndex = '100';
    container.appendChild(vrButton);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.target.set(0, 5, 0);

    // --- VR Setup for Movement (Dolly) ---
    this.dolly = new THREE.Group();
    // Start user slightly back and up
    this.dolly.position.set(0, 0, 20); 
    this.scene.add(this.dolly);
    // Add camera to dolly only when XR starts? No, XR manager handles camera. 
    // We add the dolly to the scene, and when in XR, the camera is relative to the "reference space".
    // We will move the dolly to simulate walking.
    this.dolly.add(this.camera);

    this.setupControllers();

    // Content Group
    this.contentGroup = new THREE.Group();
    this.scene.add(this.contentGroup);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(50, 80, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    this.scene.add(dirLight);

    // Floor
    const planeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 1 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), planeMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = CONFIG.FLOOR_Y;
    floor.receiveShadow = true;
    this.contentGroup.add(floor);

    // VR SCALING: 1:1 Real Scale
    // Previously we scaled down to 0.15. Now we keep it 1.0 so user can walk INSIDE it.
    this.contentGroup.scale.set(1, 1, 1); 
    this.contentGroup.position.set(0, 0, 0);

    this.renderer.setAnimationLoop(this.render.bind(this));
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  private setupControllers() {
      // Controllers
      const controllerModelFactory = new XRControllerModelFactory();

      for (let i = 0; i < 2; i++) {
          const controller = this.renderer.xr.getController(i);
          this.dolly.add(controller);
          this.controllers.push(controller);

          const grip = this.renderer.xr.getControllerGrip(i);
          grip.add(controllerModelFactory.createControllerModel(grip));
          this.dolly.add(grip);
          this.controllerGrips.push(grip);
      }
  }

  // Handle VR Movement
  private handleVRMovement() {
      if (!this.renderer.xr.isPresenting) return;

      const session = this.renderer.xr.getSession();
      if (!session) return;

      // Check input sources for joysticks
      for (const source of session.inputSources) {
          if (source.gamepad) {
              const axes = source.gamepad.axes;
              // Usually axes[2] is X and axes[3] is Y for joystick
              // Or axes[0], axes[1] depending on controller.
              // Quest: 2 & 3
              
              const x = axes[2] || axes[0] || 0;
              const y = axes[3] || axes[1] || 0;

              if (Math.abs(x) > 0.1 || Math.abs(y) > 0.1) {
                  const speed = 0.2;
                  // Move relative to camera direction
                  const quaternion = this.camera.quaternion;
                  const direction = new THREE.Vector3(x, 0, y).applyQuaternion(quaternion);
                  direction.y = 0; // Keep on floor
                  direction.normalize();

                  this.dolly.position.addScaledVector(direction, speed);
              }
          }
      }
  }

  public loadInitialModel(data: VoxelData[]) {
    this.createVoxels(data);
    this.onCountChange(this.voxels.length);
    this.state = AppState.STABLE;
    this.onStateChange(this.state);
  }

  private createVoxels(data: VoxelData[]) {
    if (this.instanceMesh) {
      this.contentGroup.remove(this.instanceMesh);
      this.instanceMesh.geometry.dispose();
      if (Array.isArray(this.instanceMesh.material)) {
          this.instanceMesh.material.forEach(m => m.dispose());
      } else {
          this.instanceMesh.material.dispose();
      }
    }

    this.voxels = data.map((v, i) => {
        const c = new THREE.Color(v.color);
        c.offsetHSL(0, 0, (Math.random() * 0.1) - 0.05);
        return {
            id: i,
            x: v.x, y: v.y, z: v.z, color: c,
            vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0,
            rvx: 0, rvy: 0, rvz: 0
        };
    });

    const geometry = new THREE.BoxGeometry(CONFIG.VOXEL_SIZE - 0.05, CONFIG.VOXEL_SIZE - 0.05, CONFIG.VOXEL_SIZE - 0.05);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 });
    this.instanceMesh = new THREE.InstancedMesh(geometry, material, this.voxels.length);
    this.instanceMesh.castShadow = true;
    this.instanceMesh.receiveShadow = true;
    
    this.contentGroup.add(this.instanceMesh);
    this.draw();
  }

  private draw() {
    if (!this.instanceMesh) return;
    this.voxels.forEach((v, i) => {
        this.dummy.position.set(v.x, v.y, v.z);
        this.dummy.rotation.set(v.rx, v.ry, v.rz);
        this.dummy.updateMatrix();
        this.instanceMesh!.setMatrixAt(i, this.dummy.matrix);
        this.instanceMesh!.setColorAt(i, v.color);
    });
    this.instanceMesh.instanceMatrix.needsUpdate = true;
    this.instanceMesh.instanceColor!.needsUpdate = true;
  }

  public dismantle() {
    if (this.state !== AppState.STABLE) return;
    this.state = AppState.DISMANTLING;
    this.onStateChange(this.state);

    this.voxels.forEach(v => {
        v.vx = (Math.random() - 0.5) * 0.8;
        v.vy = Math.random() * 0.5;
        v.vz = (Math.random() - 0.5) * 0.8;
        v.rvx = (Math.random() - 0.5) * 0.2;
        v.rvy = (Math.random() - 0.5) * 0.2;
        v.rvz = (Math.random() - 0.5) * 0.2;
    });
  }

  private getColorDist(c1: THREE.Color, hex2: number): number {
    const c2 = new THREE.Color(hex2);
    const r = (c1.r - c2.r) * 0.3;
    const g = (c1.g - c2.g) * 0.59;
    const b = (c1.b - c2.b) * 0.11;
    return Math.sqrt(r * r + g * g + b * b);
  }

  public rebuild(targetModel: VoxelData[]) {
    if (this.state === AppState.REBUILDING) return;

    const available = this.voxels.map((v, i) => ({ index: i, color: v.color, taken: false }));
    const mappings: RebuildTarget[] = new Array(this.voxels.length).fill(null);

    targetModel.forEach(target => {
        let bestDist = 9999;
        let bestIdx = -1;

        for (let i = 0; i < available.length; i++) {
            if (available[i].taken) continue;
            const d = this.getColorDist(available[i].color, target.color);
            if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
                if (d < 0.01) break;
            }
        }

        if (bestIdx !== -1) {
            available[bestIdx].taken = true;
            const h = Math.max(0, (target.y - CONFIG.FLOOR_Y) / 15);
            mappings[available[bestIdx].index] = {
                x: target.x, y: target.y, z: target.z,
                delay: h * 800
            };
        }
    });

    for (let i = 0; i < this.voxels.length; i++) {
        if (!mappings[i]) {
            mappings[i] = {
                x: this.voxels[i].x, y: this.voxels[i].y, z: this.voxels[i].z,
                isRubble: true, delay: 0
            };
        }
    }

    this.rebuildTargets = mappings;
    this.rebuildStartTime = Date.now();
    this.state = AppState.REBUILDING;
    this.onStateChange(this.state);
  }

  private updatePhysics() {
    if (this.state === AppState.DISMANTLING) {
        this.voxels.forEach(v => {
            v.vy -= 0.025;
            v.x += v.vx; v.y += v.vy; v.z += v.vz;
            v.rx += v.rvx; v.ry += v.rvy; v.rz += v.rvz;
            if (v.y < CONFIG.FLOOR_Y + 0.5) {
                v.y = CONFIG.FLOOR_Y + 0.5;
                v.vy *= -0.5; v.vx *= 0.9; v.vz *= 0.9;
            }
        });
    } else if (this.state === AppState.REBUILDING) {
        const now = Date.now();
        const elapsed = now - this.rebuildStartTime;
        let allDone = true;

        this.voxels.forEach((v, i) => {
            const t = this.rebuildTargets[i];
            if (t.isRubble) return;
            if (elapsed < t.delay) { allDone = false; return; }
            const speed = 0.12;
            v.x += (t.x - v.x) * speed;
            v.y += (t.y - v.y) * speed;
            v.z += (t.z - v.z) * speed;
            v.rx *= 0.8; v.ry *= 0.8; v.rz *= 0.8;

            if ((t.x - v.x) ** 2 + (t.y - v.y) ** 2 + (t.z - v.z) ** 2 > 0.01) allDone = false;
            else { v.x = t.x; v.y = t.y; v.z = t.z; }
        });

        if (allDone) {
            this.state = AppState.STABLE;
            this.onStateChange(this.state);
        }
    }
  }

  private render() {
    this.handleVRMovement();
    
    // Only update controls if NOT in VR (OrbitControls messes up VR view)
    if (!this.renderer.xr.isPresenting) {
        this.controls.update();
    }
    
    this.updatePhysics();
    
    if (this.state !== AppState.STABLE || (this.controls.autoRotate && !this.renderer.xr.isPresenting)) {
        this.draw();
    }
    
    this.renderer.render(this.scene, this.camera);
  }

  public handleResize() {
      if (this.camera && this.renderer && this.container) {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
      }
  }
  
  public setAutoRotate(enabled: boolean) {
    if (this.controls) this.controls.autoRotate = enabled;
  }

  public getJsonData(): string {
      const data = this.voxels.map((v, i) => ({
          id: i,
          x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2),
          c: '#' + v.color.getHexString()
      }));
      return JSON.stringify(data, null, 2);
  }
  
  public getUniqueColors(): string[] {
    const colors = new Set<string>();
    this.voxels.forEach(v => colors.add('#' + v.color.getHexString()));
    return Array.from(colors);
  }

  public cleanup() {
    this.renderer.setAnimationLoop(null);
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
         this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    const vrButton = document.getElementById('VRButton');
    if (vrButton) vrButton.remove();
    this.renderer.dispose();
  }
}
