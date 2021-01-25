import * as THREE from 'three';

import {
  TrackballControls
} from 'three/examples/jsm/controls/TrackballControls';

import {
  Block
} from './Block';


/**
 * 3-D Scene class
 */
export
class Scene {

  constructor () {
    this.scene = new THREE.Scene();

    // lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    this.scene.add(this.directionalLight);
  }

  /**
   * Add an GanyJS block to the scene
   */
  addBlock (block: Block) {
    this.blocks.push(block);
    block.addToScene(this.scene);
  }

  handleCameraMove (cameraPosition: THREE.Vector3, cameraTarget: THREE.Vector3) {
    this.directionalLight.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    this.directionalLight.target.position.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
  }

  handleCameraMoveEnd (cameraPosition: THREE.Vector3) {
    for (const block of this.blocks) {
      block.handleCameraMoveEnd(cameraPosition);
    }
  }

  dispose () {
    this.scene.dispose();

    for (const block of this.blocks) {
      block.dispose();
    }
  }

  scene: THREE.Scene;
  blocks: Block[] = [];

  private directionalLight: THREE.DirectionalLight;

}


/**
 * 3-D Renderer class
 */
export
class Renderer {

  constructor (el: HTMLElement, scene: Scene) {
    this.el = el;

    this.scene = scene;
  }

  initialize () {
    const { width, height } = this.el.getBoundingClientRect();

    this.camera = new THREE.PerspectiveCamera(
      50,
      width / height,
      0.001,
      99999
    );
    this.camera.position.z = 2;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
    this.renderer.autoClear = false;

    this.color = 'white';
    this.opacity = 1;
    this.clearColor = new THREE.Color(this.color);
    this.renderer.setClearColor(this.clearColor, this.opacity);

    this.renderer.setSize(width, height);
    this.renderer.localClippingEnabled = true;

    this.el.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new TrackballControls(
      this.camera,
      this.el
    );

    this.controls.screen.width = width;
    this.controls.screen.height = height;

    this.controls.rotateSpeed = 2.5;
    this.controls.zoomSpeed = 1.2;
    this.controls.panSpeed = 0.9;
    this.controls.dynamicDampingFactor = 0.9;

    this.controls.addEventListener('change', this.handleCameraMove.bind(this));
    this.controls.addEventListener('end', this.handleCameraMoveEnd.bind(this));

    this.handleCameraMove();

    this.animate();
  }

  /**
   * Resize renderer
   */
  resize () {
    const { width, height } = this.el.getBoundingClientRect();

    this.renderer.setSize(width, height);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.controls.handleResize();

    this.controls.screen.width = width;
    this.controls.screen.height = height;
  }

  set backgroundColor (color: string) {
    this.color = color;
    this.clearColor = new THREE.Color(this.color);

    this.renderer.setClearColor(this.clearColor, this.opacity);
  }

  set backgroundOpacity (opacity: number) {
    this.opacity = opacity;

    this.renderer.setClearColor(this.clearColor, this.opacity);
  }

  set cameraPosition (position: THREE.Vector3) {
    this.camera.position.set(position.x, position.y, position.z);
  }

  get cameraPosition () {
    return this.camera.position;
  }

  set cameraUp (position: THREE.Vector3) {
    this.camera.up.set(position.x, position.y, position.z);
  }

  get cameraUp () {
    return this.camera.position;
  }

  set cameraTarget (position: THREE.Vector3) {
    this.controls.target.set(position.x, position.y, position.z);
  }

  get cameraTarget () {
    return this.controls.target;
  }

  /**
   * Animation
   */
  private animate () {
    this.animationID = window.requestAnimationFrame(this.animate.bind(this));

    for (const block of this.scene.blocks) {
      if (block.beforeRenderHook !== null) {
        block.beforeRenderHook(
          this.renderer,
          {scene: this.scene.scene, camera: this.camera, clearColor: this.clearColor, clearOpacity: this.opacity}
        );
      }
    }

    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(this.clearColor, this.opacity);
    this.renderer.clear();

    this.renderer.render(this.scene.scene, this.camera);

    this.controls.update();
  }

  handleCameraMove () {
    this.scene.handleCameraMove(this.camera.position, this.cameraTarget);
  }

  handleCameraMoveEnd () {
    this.scene.handleCameraMoveEnd(this.camera.position);
  }

  dispose () {
    window.cancelAnimationFrame(this.animationID);

    this.controls.dispose();

    this.renderer.dispose();
  }

  el: HTMLElement;

  scene: Scene;

  camera: THREE.PerspectiveCamera;
  controls: TrackballControls;
  renderer: THREE.WebGLRenderer;

  materialVersions: { [keys: string]: number; } = {};

  private animationID: number;

  private color: string;
  private clearColor: THREE.Color;
  private opacity: number;

}
