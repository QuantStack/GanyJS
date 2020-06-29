import * as THREE from 'three';

import {
  Effect
} from '../../EffectBlock';

import {
  Block
} from '../../Block';

import {
  UnderWater
} from './UnderWater';

const black = new THREE.Color('black');


// Init environment mapping shaders
const initEnvMappingVertex = `
varying vec4 worldPosition;


void main() {
  // Compute world position
  worldPosition = modelMatrix * vec4(position, 1.);

  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const initEnvMappingFragment = `
varying vec4 worldPosition;


void main() {
  gl_FragColor = vec4(worldPosition.xyz, 1.);
}
`;


// Caustics shaders
const causticsVertex = `
uniform vec3 light;

uniform sampler2D envMap;
uniform float deltaEnvMapTexture;

varying vec3 oldPosition;
varying vec3 newPosition;
varying float waterDepth;
varying float depth;

// Air refractive index / Water refractive index
const float eta = 0.7504;

// TODO Make this a uniform
// This is the maximum iterations when looking for the ray intersection with the environment,
// if after this number of attempts we did not find the intersection, the result will be wrong.
const int MAX_ITERATIONS = 50;


void main() {
  vec4 modelPosition = modelMatrix * vec4(position, 1.);

  // This is the initial position: the ray starting point
  oldPosition = modelPosition.xyz;

  // Compute water coordinates in the screen space
  vec4 projectedWaterPosition = projectionMatrix * viewMatrix * modelPosition;

  vec2 currentPosition = projectedWaterPosition.xy;
  vec2 coords = 0.5 + 0.5 * currentPosition;

  vec3 refracted = refract(light, normal, eta);
  vec4 projectedRefractionVector = projectionMatrix * viewMatrix * vec4(refracted, 1.);

  vec3 refractedDirection = projectedRefractionVector.xyz;

  waterDepth = 0.5 + 0.5 * projectedWaterPosition.z / projectedWaterPosition.w;
  float currentDepth = projectedWaterPosition.z;
  vec4 environment = texture2D(envMap, coords);

  // This factor will scale the delta parameters so that we move from one pixel to the other in the env map
  float factor = deltaEnvMapTexture / length(refractedDirection.xy);

  vec2 deltaDirection = refractedDirection.xy * factor;
  float deltaDepth = refractedDirection.z * factor;

  for (int i = 0; i < MAX_ITERATIONS; i++) {
    // Move the coords in the direction of the refraction
    currentPosition += deltaDirection;
    currentDepth += deltaDepth;

    // End of loop condition: The ray has hit the environment
    if (environment.w <= currentDepth) {
      break;
    }

    environment = texture2D(envMap, 0.5 + 0.5 * currentPosition);
  }

  newPosition = environment.xyz;

  vec4 projectedEnvPosition = projectionMatrix * viewMatrix * vec4(newPosition, 1.0);
  depth = 0.5 + 0.5 * projectedEnvPosition.z / projectedEnvPosition.w;

  gl_Position = projectedEnvPosition;
}
`;

const causticsFragment = `
uniform float causticsFactor;

varying vec3 oldPosition;
varying vec3 newPosition;
varying float waterDepth;
varying float depth;


void main() {
  float causticsIntensity = 0.;

  if (depth >= waterDepth) {
    float oldArea = length(dFdx(oldPosition)) * length(dFdy(oldPosition));
    float newArea = length(dFdx(newPosition)) * length(dFdy(newPosition));

    causticsIntensity = causticsFactor * ((oldArea / newArea) - 1.);
  }

  gl_FragColor = vec4(causticsIntensity, causticsIntensity, causticsIntensity, depth);
}
`;


// Water shaders
const waterVertex = `
varying vec3 norm;


void main() {
  // Interpolate normals
  norm = normal;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const waterFragment = `
uniform vec3 light;

varying vec3 norm;


void main() {
  float light_intensity = - dot(light, norm);

  vec3 color = vec3(0.45, 0.64, 0.74);

  gl_FragColor = vec4(color * light_intensity, 0.7);
}
`;


export
interface WaterOptions {

  causticsEnabled?: boolean;

  underWaterBlocks?: UnderWater[];

  causticsFactor?: number;

}


/**
 * Displays beautiful water and computes real-time caustics.
 **/
// TODO Inherit from something else than Effect
export
class Water extends Effect {

  constructor (parent: Block, options?: WaterOptions) {
    super(parent);

    if (options) {
      this.causticsEnabled = options.causticsEnabled !== undefined ? options.causticsEnabled : this.causticsEnabled;
      this.underWaterBlocks = options.underWaterBlocks !== undefined ? options.underWaterBlocks : this.underWaterBlocks;
      this._causticsFactor = options.causticsFactor !== undefined ? options.causticsFactor : this._causticsFactor;
    }

    // Remove meshes, only the water and the environment will stay
    this.meshes = [];

    // Initialize water caustics
    this.causticsTarget = new THREE.WebGLRenderTarget(this.causticsSize, this.causticsSize, {type: THREE.FloatType});
    this.causticsMaterial = new THREE.ShaderMaterial({
      vertexShader: causticsVertex,
      fragmentShader: causticsFragment,
      uniforms: {
        light: { value: null },
        envMap: { value: null },
        deltaEnvMapTexture: { value: 1. / UnderWater.envMapSize },
        causticsFactor: { value: this._causticsFactor },
      },
      extensions: {
        derivatives: true
      },
      transparent: true,
    });

    this.causticsMaterial.blending = THREE.CustomBlending;

    // Set the blending so that:
    // Caustics intensity uses an additive function
    this.causticsMaterial.blendEquation = THREE.AddEquation;
    this.causticsMaterial.blendSrc = THREE.OneFactor;
    this.causticsMaterial.blendDst = THREE.OneFactor;

    // Caustics depth does not use blending, we just set the value
    this.causticsMaterial.blendEquationAlpha = THREE.AddEquation;
    this.causticsMaterial.blendSrcAlpha = THREE.OneFactor;
    this.causticsMaterial.blendDstAlpha = THREE.ZeroFactor;

    this.updateWaterGeometry();

    this.causticsMesh = new THREE.Mesh(this.waterGeometry, this.causticsMaterial);
    this.causticsMesh.matrixAutoUpdate = false;

    // Initialize water mesh
    this.waterMaterial = new THREE.ShaderMaterial({
      uniforms: {
        light: { value: null },
      },
      vertexShader: waterVertex,
      fragmentShader: waterFragment,
      transparent: true,
      side: THREE.DoubleSide
    });

    this.waterMesh = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
    this.waterMesh.matrixAutoUpdate = false;

    // Initialize the light camera
    this.light = new THREE.Vector3(0., 0., -1.);
    this.lightCamera = new THREE.OrthographicCamera(-1, 1, 1, -1);

    // Create mesh that serves as an initializer for the environment mapping
    // So that we get meaningful values in the environment map by default
    this.initEnvMapMaterial = new THREE.ShaderMaterial({
      vertexShader: initEnvMappingVertex,
      fragmentShader: initEnvMappingFragment
    });
    this.initEnvMapMesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.initEnvMapMaterial);

    this.updateLightCamera();

    this.waterMaterial.uniforms['light'].value = this.light;
    this.causticsMaterial.uniforms['light'].value = this.light;

    // Event listener for geometry change
    this.parent.on('change:geometry', this.updateWater.bind(this));

    // Initialize renderer hook, this hook updates the caustics texture
    this.beforeRenderHook = this._beforeRenderHook;
    this.updateMatrix();
  }

  /**
   * Add the effect to a given scene
   */
  addToScene (scene: THREE.Scene) {
    super.addToScene(scene);

    scene.add(this.waterMesh);

    for (const underwater of this.underWaterBlocks) {
      underwater.addToScene(scene);
    }
  }

  /**
   * Update the water geometry and request caustics update.
   */
  updateWater (): void {
    this.updateWaterGeometry();

    this.causticsMesh.geometry = this.waterGeometry;
    this.waterMesh.geometry = this.waterGeometry;

    // Request caustics texture update on the next frame.
    this.causticsNeedsUpdate = true;
  }

  set causticsFactor(value: number) {
    this._causticsFactor = value;
    this.causticsMaterial.uniforms['causticsFactor'].value = value;
  }

  private updateWaterGeometry (): void {
    this.waterGeometry = new THREE.BufferGeometry();

    const vertexBuffer = new THREE.BufferAttribute(this.parent.vertices, 3);
    this.waterGeometry.setAttribute('position', vertexBuffer);

    if (this.parent.triangleIndices !== null) {
      const indexBuffer = new THREE.BufferAttribute(this.parent.triangleIndices, 1);
      this.waterGeometry.setIndex(indexBuffer);
    } else {
      this.waterGeometry.setIndex(null);
    }

    this.waterGeometry.computeVertexNormals();
  }

  private updateLightCamera (): void {
    // TODO Use bounding box instead?
    const boundSphere = new THREE.Sphere().copy(this.boundingSphere);

    // Apply transformations to the boundingSphere
    const scaleMatrix = new THREE.Matrix4().makeScale(this._scale.x, this._scale.y, this._scale.z);
    const positionMatrix = new THREE.Matrix4().makeTranslation(this._position.x, this._position.y, this._position.z);

    const matrix = new THREE.Matrix4().multiplyMatrices(scaleMatrix, positionMatrix);

    boundSphere.applyMatrix4(matrix);

    // Move the mesh that serves at initializing the env map
    this.initEnvMapMesh.scale.set(boundSphere.radius, boundSphere.radius, boundSphere.radius);
    this.initEnvMapMesh.position.set(boundSphere.center.x, boundSphere.center.y, -boundSphere.radius);
    this.initEnvMapMesh.updateMatrixWorld(true);

    // Change frustum
    this.lightCamera.left = -boundSphere.radius;
    this.lightCamera.right = boundSphere.radius;
    this.lightCamera.top = boundSphere.radius;
    this.lightCamera.bottom = -boundSphere.radius;
    this.lightCamera.near = 0.;
    this.lightCamera.far = 2 * boundSphere.radius;

    this.lightCamera.position.set(0., 0., boundSphere.radius);
    this.lightCamera.lookAt(boundSphere.center);

    // Recompute camera projection matrices
    this.lightCamera.updateProjectionMatrix();
    this.lightCamera.updateMatrixWorld(true);

    // Set the light to the underWaterBlocks
    for (const underwater of this.underWaterBlocks) {
      underwater.setLight(this.light, this.lightCamera.projectionMatrix, this.lightCamera.matrixWorldInverse);
    }
  }

  /**
   * Update the caustics texture if needed.
   */
  private _beforeRenderHook (renderer: THREE.WebGLRenderer): void {
    if (this.causticsNeedsUpdate && this.causticsEnabled) {
      // Update environment map texture
      renderer.setRenderTarget(UnderWater.envMappingTarget);
      renderer.setClearColor(black, 0);
      renderer.clear();

      renderer.render(this.initEnvMapMesh, this.lightCamera);

      for (const underwater of this.underWaterBlocks) {
        underwater.renderEnvMap(renderer, this.lightCamera);
      }

      // Render caustics texture
      this.causticsMaterial.uniforms['envMap'].value = UnderWater.envMappingTarget.texture;

      renderer.setRenderTarget(this.causticsTarget);
      renderer.clear();

      renderer.render(this.causticsMesh, this.lightCamera);

      for (const underwater of this.underWaterBlocks) {
        underwater.setCausticsTexture(this.causticsTarget.texture);
      }

      this.causticsNeedsUpdate = false;
    }
  }

  protected updateMatrix () {
    const scaleMatrix = new THREE.Matrix4().makeScale(this._scale.x, this._scale.y, this._scale.z);
    const positionMatrix = new THREE.Matrix4().makeTranslation(this._position.x, this._position.y, this._position.z);

    const matrix = new THREE.Matrix4().multiplyMatrices(scaleMatrix, positionMatrix);

    this.causticsMesh.matrix.copy(matrix);
    this.causticsMesh.updateMatrixWorld(true);

    this.waterMesh.matrix.copy(matrix);
    this.waterMesh.updateMatrixWorld(true);

    for (const underwater of this.underWaterBlocks) {
      underwater.setMatrix(matrix);
    }

    this.updateLightCamera();

    // Because the environment has moved we need to update the environment
    // mapping and the caustics texture
    this.causticsNeedsUpdate = true;
  }

  // Overwrite the base bounding sphere to take the env into account
  get boundingSphere () : THREE.Sphere {
    this.waterGeometry.computeBoundingSphere();

    const boundingSpheres: THREE.Sphere[] = [this.waterGeometry.boundingSphere as THREE.Sphere];
    for (const underwater of this.underWaterBlocks) {
      boundingSpheres.push(underwater.boundingSphere);
    }

    boundingSpheres.sort((a: THREE.Sphere, b: THREE.Sphere) => b.radius - a.radius);

    return boundingSpheres[0];
  }

  // TODO Use the same directional light as the scene
  private light: THREE.Vector3;
  private lightCamera: THREE.OrthographicCamera;

  private causticsNeedsUpdate: boolean = true;
  causticsEnabled: boolean = false;

  private causticsSize: number = 512;
  private causticsTarget: THREE.WebGLRenderTarget;
  private causticsMaterial: THREE.ShaderMaterial;
  private causticsMesh: THREE.Mesh;
  private _causticsFactor: number = 0.2;

  private waterMaterial: THREE.ShaderMaterial;
  private waterMesh: THREE.Mesh;

  private waterGeometry: THREE.BufferGeometry;

  private initEnvMapMaterial: THREE.ShaderMaterial;
  private initEnvMapMesh: THREE.Mesh;

  private underWaterBlocks: UnderWater[] = [];

}
