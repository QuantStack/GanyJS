import * as THREE from 'three';
import * as Nodes from 'three/examples/jsm/nodes/Nodes';

import {
  Effect
} from '../../EffectBlock';

import {
  Block
} from '../../Block';

import {
  NodeOperation
} from '../../NodeMesh';

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
      this._causticsFactor = options.causticsFactor !== undefined ? new Nodes.FloatNode(options.causticsFactor) : this._causticsFactor;
    }

    // Shallow copy the water meshes for the caustics computation (Geometries are not copied, we only create new Materials/Shaders)
    this.causticsMeshes = this.meshes.map((nodeMesh: NodeMesh) => nodeMesh.copy());

    // Initialize the light camera
    this.light = new THREE.Vector3(0., 0., -1.);
    const lightNode = new Nodes.Vector3Node(this.light);
    this.lightCamera = new THREE.OrthographicCamera(-1, 1, 1, -1);

    // Initialize water caustics Mesh
    this.causticsTarget = new THREE.WebGLRenderTarget(this.causticsSize, this.causticsSize, {type: THREE.FloatType});

    const oldPositionVarying = new Nodes.VarNode('vec3');
    const newPositionVarying = new Nodes.VarNode('vec3')
    const waterDepthVarying = new Nodes.VarNode('float');
    const depthVarying = new Nodes.VarNode('float');

    const causticsComputationNode = new Nodes.FunctionNode(
      `vec3 causticsFunc${this.id}(sampler2D envMap, float deltaEnvMapTexture, vec3 position, vec3 light){
        // Air refractive index / Water refractive index
        const float eta = 0.7504;

        // TODO Make this a uniform
        // This is the maximum iterations when looking for the ray intersection with the environment,
        // if after this number of attempts we did not find the intersection, the result will be wrong.
        const int MAX_ITERATIONS = 50;

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

        return newPosition;
      }`
    );

    causticsComputationNode.keywords = {
      oldPosition: oldPositionVarying,
      newPosition: newPositionVarying,
      waterDepth: waterDepthVarying,
      depth: depthVarying,
    };

    const causticsComputationNodeCall = new Nodes.FunctionCallNode(
      causticsComputationNode,
      [this.envMap, new Nodes.FloatNode(1. / UnderWater.envMapSize), new Nodes.PositionNode(), lightNode]
    );

    const causticsIntensityNode = new Nodes.FunctionNode(
      `vec3 causticsIntensityFunc${this.id}(vec3 oldPosition, vec3 newPosition, float waterDepth, float depth, float causticsFactor){
        float causticsIntensity = 0.;

        if (depth >= waterDepth) {
          float oldArea = length(dFdx(oldPosition)) * length(dFdy(oldPosition));
          float newArea = length(dFdx(newPosition)) * length(dFdy(newPosition));

          causticsIntensity = causticsFactor * ((oldArea / newArea) - 1.);
        }

        return vec3(causticsIntensity);
      }`
    );

    const causticsIntensityNodeCall = new Nodes.FunctionCallNode(
      causticsIntensityNode,
      [oldPositionVarying, newPositionVarying, waterDepthVarying, depthVarying, this._causticsFactor]
    );

    for (const nodeMesh of this.causticsMeshes) {
      // Vertex shader
      nodeMesh.addTransformNode(NodeOperation.ASSIGN, causticsComputationNodeCall);
      nodeMesh.addColorNode(NodeOperation.ASSIGN, causticsIntensityNodeCall);

      // Fragment shader
      nodeMesh.addAlphaNode(NodeOperation.ASSIGN, depthVarying);

      nodeMesh.material.blending = THREE.CustomBlending;

      // Set the blending so that:
      // Caustics intensity uses an additive function
      nodeMesh.material.blendEquation = THREE.AddEquation;
      nodeMesh.material.blendSrc = THREE.OneFactor;
      nodeMesh.material.blendDst = THREE.OneFactor;

      // Caustics depth does not use blending, we just set the value
      nodeMesh.material.blendEquationAlpha = THREE.AddEquation;
      nodeMesh.material.blendSrcAlpha = THREE.OneFactor;
      nodeMesh.material.blendDstAlpha = THREE.ZeroFactor;
    }

    // Set the water color and opacity
    this.addColorNode(NodeOperation.ASSIGN, new Nodes.Vector3Node(0.45, 0.64, 0.74));
    this.addAlphaNode(NodeOperation.ASSIGN, new Nodes.FloatNode(0.7));

    // Create mesh that serves as an initializer for the environment mapping
    // So that we get meaningful values in the environment map by default
    this.initEnvMapMaterial = new THREE.ShaderMaterial({
      vertexShader: initEnvMappingVertex,
      fragmentShader: initEnvMappingFragment
    });
    this.initEnvMapMesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.initEnvMapMaterial);

    this.updateLightCamera();

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

    for (const underwater of this.underWaterBlocks) {
      underwater.addToScene(scene);
    }
  }

  /**
   * This will request a caustics update.
   */
  updateWater (): void {
    // Request caustics texture update on the next frame.
    this.causticsNeedsUpdate = true;
  }

  set causticsFactor(value: number) {
    this._causticsFactor.value = value;
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
      // this.causticsMaterial.uniforms['envMap'].value = UnderWater.envMappingTarget.texture;

      renderer.setRenderTarget(this.causticsTarget);
      renderer.setClearColor(black, 0);
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

    for (const watermesh of this.meshes) {
      watermesh.setMatrix(matrix);
    }

    for (const underwater of this.underWaterBlocks) {
      underwater.setMatrix(matrix);
    }

    this.updateLightCamera();

    // Because the environment has moved we need to update the environment
    // mapping and the caustics texture
    this.causticsNeedsUpdate = true;
  }

  // TODO Use the same directional light as the scene
  private light: THREE.Vector3;
  private lightCamera: THREE.OrthographicCamera;

  private causticsNeedsUpdate: boolean = true;
  causticsEnabled: boolean = false;

  private causticsSize: number = 1024;
  private causticsTarget: THREE.WebGLRenderTarget;
  private causticsMeshes: NodeMesh[];
  private _causticsFactor: Nodes.FloatNode = new Nodes.FloatNode(0.2);

  private initEnvMapMaterial: THREE.ShaderMaterial;
  private initEnvMapMesh: THREE.Mesh;
  private envMap: Nodes.TextureNode = new Nodes.TextureNode(UnderWater.envMappingTarget.texture);

  private underWaterBlocks: UnderWater[] = [];

}
