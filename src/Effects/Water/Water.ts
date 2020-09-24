import * as THREE from 'three';
import * as Nodes from 'three/examples/jsm/nodes/Nodes';

import {
  Effect
} from '../../EffectBlock';

import {
  Block, BlockOptions, BeforeRenderHookOptions
} from '../../Block';

import {
  NodeMesh, NodeOperation
} from '../../NodeMesh';

import {
  BasicNodeMaterial
} from '../../utils/BasicNodeMaterial';

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
interface WaterOptions extends BlockOptions {

  causticsEnabled?: boolean;

  underWaterBlocks?: UnderWater[];

  causticsFactor?: number;

  skybox?: THREE.CubeTexture;

}


/**
 * Displays beautiful water and computes real-time caustics.
 **/
export
class Water extends Effect {

  constructor (parent: Block, options?: WaterOptions) {
    super(parent, undefined, options);

    if (options) {
      this.causticsEnabled = options.causticsEnabled !== undefined ? options.causticsEnabled : this.causticsEnabled;
      this.underWaterBlocks = options.underWaterBlocks !== undefined ? options.underWaterBlocks : this.underWaterBlocks;
      this._causticsFactor = options.causticsFactor !== undefined ? new Nodes.FloatNode(options.causticsFactor) : this._causticsFactor;
      this.skybox = options.skybox !== undefined ? new Nodes.CubeTextureNode(options.skybox) : new Nodes.CubeTextureNode(new THREE.CubeTexture());
      this.useSkyboxNode = new Nodes.FloatNode(options.skybox !== undefined ? 1 : 0);
    }

    // Shallow copy the water meshes for the caustics computation (Geometries are not copied, we only create new Materials using BasicNodeMaterial)
    this.causticsMeshes = this.meshes.map((nodeMesh: NodeMesh) => nodeMesh.copy(BasicNodeMaterial));
    this.meshes = this.meshes.map((nodeMesh: NodeMesh) => nodeMesh.copy(BasicNodeMaterial));

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

        // Workaround wrong normal
        vec3 norm = normal;
        if (dot(light, normal) > 0.) {
          norm = - normal;
        }

        vec3 refracted = refract(light, norm, eta);
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

        // This is needed for discarding the modelMatrix multiplication
        return (inverse(modelMatrix) * vec4(newPosition, 1.0)).xyz;
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

      // Fragment shader
      nodeMesh.addColorNode(NodeOperation.ASSIGN, causticsIntensityNodeCall);
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

      nodeMesh.buildMaterial();
    }

    // Create mesh that serves as an initializer for the environment mapping
    // So that we get meaningful values in the environment map by default
    this.initEnvMapMaterial = new THREE.ShaderMaterial({
      vertexShader: initEnvMappingVertex,
      fragmentShader: initEnvMappingFragment
    });
    this.initEnvMapMesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.initEnvMapMaterial);

    // Target for computing the screen space refraction
    this.screenSpaceTarget = new THREE.WebGLRenderTarget(512, 512);

    // Compute reflection and refraction on the water surface
    const reflected = new Nodes.VarNode('vec3');
    const reflectionFactor = new Nodes.VarNode('float');
    const refractedPosition = new Nodes.VarNode('vec2');
    const waterReflectionRefractionNode = new Nodes.FunctionNode(
      `void computeReflectionRefractionFunc${this.id}(vec3 position, vec3 normal){
        const float refractionFactor = 1.;

        const float fresnelBias = 0.1;
        const float fresnelPower = 2.;
        const float fresnelScale = 1.;

        // Air refractive index / Water refractive index
        const float eta = 0.7504;

        vec3 wPosition = (modelMatrix * vec4(position, 1.)).xyz;

        vec3 eye = normalize(wPosition - cameraPosition);

        // Workaround wrong normal
        vec3 norm = normal;
        if (dot(eye, normal) > 0.) {
          norm = - normal;
        }

        vec3 refracted = normalize(refract(eye, norm, eta));
        reflected = normalize(reflect(eye, norm));

        reflectionFactor = fresnelBias + fresnelScale * pow(1. + dot(eye, norm), fresnelPower);

        vec4 projectedRefractedPosition = projectionMatrix * modelViewMatrix * vec4(position + refractionFactor * refracted, 1.0);
        refractedPosition = projectedRefractedPosition.xy / projectedRefractedPosition.w;
      }`
    );

    waterReflectionRefractionNode.keywords = { reflected, reflectionFactor, refractedPosition };

    const waterReflectionRefractionNodeCall = new Nodes.FunctionCallNode(
      waterReflectionRefractionNode,
      [new Nodes.PositionNode(), new Nodes.NormalNode(Nodes.NormalNode.WORLD)]
    );

    this.addExpressionNode(waterReflectionRefractionNodeCall);

    const getWaterSurfaceColorNode1 = new Nodes.FunctionNode(
      `vec3 getWaterSurfaceColorFunc1${this.id}(sampler2D envMap, samplerCube skybox){
        vec3 refractedColor = texture2D(envMap, refractedPosition * 0.5 + 0.5).xyz;
        vec3 reflectedColor = textureCube(skybox, reflected).xyz;

        return mix(refractedColor, reflectedColor, clamp(reflectionFactor, 0., 1.));
      }`
    );

    getWaterSurfaceColorNode1.keywords = { reflected, reflectionFactor, refractedPosition };

    this.screenSpaceTargetTextureNode = new Nodes.TextureNode(this.screenSpaceTarget.texture);

    const getWaterSurfaceColorNodeCall1 = new Nodes.FunctionCallNode(
      getWaterSurfaceColorNode1,
      [this.screenSpaceTargetTextureNode, this.skybox]
    );

    const getWaterSurfaceColorNode2 = new Nodes.FunctionNode(
      `vec3 getWaterSurfaceColorFunc2${this.id}(sampler2D envMap){
        vec3 refractedColor = texture2D(envMap, refractedPosition * 0.5 + 0.5).xyz;
        vec3 reflectedColor = vec3(0.22, 0.47, 0.77);

        return mix(refractedColor, reflectedColor, clamp(reflectionFactor, 0., 1.));
      }`
    );

    getWaterSurfaceColorNode2.keywords = { reflectionFactor, refractedPosition };

    const getWaterSurfaceColorNodeCall2 = new Nodes.FunctionCallNode(
      getWaterSurfaceColorNode2,
      [new Nodes.TextureNode(this.screenSpaceTarget.texture)]
    );

    this.addColorNode(
      NodeOperation.ASSIGN,
      new Nodes.CondNode(
        this.useSkyboxNode, new Nodes.FloatNode(1), Nodes.CondNode.EQUAL,
        getWaterSurfaceColorNodeCall1, getWaterSurfaceColorNodeCall2
      )
    );

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
   * Perform extra computation before the actual rendering of the scene.
   */
  private _beforeRenderHook (renderer: THREE.WebGLRenderer, options: BeforeRenderHookOptions): void {
    // Update the caustics texture if needed
    if (this.causticsNeedsUpdate && this.causticsEnabled) {
      // Update environment map texture
      renderer.setRenderTarget(UnderWater.envMappingTarget);
      renderer.setClearColor(black, 0);
      renderer.clear();

      renderer.render(this.initEnvMapMesh, this.lightCamera);

      for (const underwater of this.underWaterBlocks) {
        underwater.renderEnvMap(renderer, this.lightCamera);
      }

      this.envMap.value = UnderWater.envMappingTarget.texture;

      // Render caustics texture
      renderer.setRenderTarget(this.causticsTarget);
      renderer.setClearColor(black, 0);
      renderer.clear();

      for (const causticsMesh of this.causticsMeshes) {
        renderer.render(causticsMesh.mesh, this.lightCamera);
      }

      for (const underwater of this.underWaterBlocks) {
        underwater.setCausticsTexture(this.causticsTarget.texture);
      }

      this.causticsNeedsUpdate = false;
    }

    // Render everything but the refractive water for the screen space refraction
    if (this.screenSpaceTarget.width != renderer.domElement.width || this.screenSpaceTarget.height != renderer.domElement.height) {
      this.screenSpaceTarget.setSize(renderer.domElement.width, renderer.domElement.height);
    }

    renderer.setRenderTarget(this.screenSpaceTarget);
    renderer.setClearColor(options.clearColor, options.clearOpacity);
    renderer.clear();

    this.meshes.forEach((nodeMesh: NodeMesh) => nodeMesh.mesh.visible = false);
    renderer.render(options.scene, options.camera);

    this.screenSpaceTargetTextureNode.value = this.screenSpaceTarget.texture;

    this.meshes.forEach((nodeMesh: NodeMesh) => nodeMesh.mesh.visible = true);
  }

  protected updateMatrix () {
    const scaleMatrix = new THREE.Matrix4().makeScale(this._scale.x, this._scale.y, this._scale.z);
    const positionMatrix = new THREE.Matrix4().makeTranslation(this._position.x, this._position.y, this._position.z);

    const matrix = new THREE.Matrix4().multiplyMatrices(scaleMatrix, positionMatrix);

    for (const watermesh of this.meshes) {
      watermesh.matrix = matrix;
    }

    for (const causticsmesh of this.causticsMeshes) {
      causticsmesh.matrix = matrix;
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

  private screenSpaceTarget: THREE.WebGLRenderTarget;
  private screenSpaceTargetTextureNode: Nodes.TextureNode;
  private useSkyboxNode: Nodes.FloatNode;
  private skybox: Nodes.CubeTextureNode;

  private initEnvMapMaterial: THREE.ShaderMaterial;
  private initEnvMapMesh: THREE.Mesh;
  private envMap: Nodes.TextureNode = new Nodes.TextureNode(UnderWater.envMappingTarget.texture);

  private underWaterBlocks: UnderWater[] = [];

}
