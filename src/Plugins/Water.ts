import * as THREE from 'three';

import {
  Effect
} from '../EffectBlock';

import {
  Block
} from '../Block';


const envMappingVertex = `
varying vec4 worldPosition;
varying float depth;


void main() {
  // Compute world position
  worldPosition = modelMatrix * vec4(position, 1.);

  // Project vertex in the screen coordinates
  vec4 projectedPosition = projectionMatrix * viewMatrix * worldPosition;

  // Store vertex depth
  depth = projectedPosition.z;

  gl_Position = projectedPosition;
}
`;

const envMappingFragment = `
varying vec4 worldPosition;
varying float depth;


void main() {
  gl_FragColor = vec4(worldPosition.xyz, depth);
}
`;


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
  // This is the initial position: the ray starting point
  oldPosition = position;

  // Compute water coordinates in the screen space
  vec4 projectedWaterPosition = projectionMatrix * viewMatrix * vec4(position, 1.);

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
// TODO Make it a uniform
const float causticsFactor = 0.2;

varying vec3 oldPosition;
varying vec3 newPosition;
varying float waterDepth;
varying float depth;


void main() {
  float causticsIntensity = 0.;

  if (depth >= waterDepth) {
    float oldArea = length(dFdx(oldPosition)) * length(dFdy(oldPosition));
    float newArea = length(dFdx(newPosition)) * length(dFdy(newPosition));

    causticsIntensity = causticsFactor * oldArea / newArea;
  }

  gl_FragColor = vec4(causticsIntensity, causticsIntensity, causticsIntensity, depth);
}
`;


/**
 * Displays beautiful water with real-time caustics.
 **/
// TODO Inherit from something else than Effect
export
class Water extends Effect {

  constructor (parent: Block) {
    super(parent);

    // Initialize the light camera
    // TODO Use the same directional light as the scene?
    // TODO Use meaningful default values for the clip planes
    const light = [0., 0., -1.];
    this.lightCamera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0., 5.);
    lightCamera.position.set(-2 * light[0], -2 * light[1], -2 * light[2]);
    lightCamera.lookAt(0, 0, 0);

    // Initialize environment mapping
    this.envMappingTarget = new THREE.WebGLRenderTarget(this.envMapSize, this.envMapSize, {type: THREE.FloatType});
    this.envMappingMaterial = new THREE.ShaderMaterial({
      vertexShader: envMappingVertex,
      fragmentShader: envMappingFragment,
    });

    this.envMappingMeshes = [];
    this.environmentMeshes = [];
    for (const envMesh of parent.options.environmentMeshes) {
      this.envMappingMeshes.push(new THREE.Mesh(envMesh.geometry, this.envMappingMaterial));
      // this.environmentMeshes.push(new THREE.Mesh(envMesh.geometry, this.environmentMaterial))
    }

    // Initialize water caustics
    this.causticsTarget = new THREE.WebGLRenderTarget(this.causticsSize, this.causticsSize, {type: THREE.FloatType});
    this.causticsMaterial = new THREE.ShaderMaterial({
      uniforms: {
        light: { value: light },
        envMap: { value: null },
        deltaEnvMapTexture: { value: 1. / this.envMapSize },
      },
      vertexShader: causticsVertex,
      fragmentShader: causticsFragment,
      side: THREE.DoubleSide,
      extensions: {
        derivatives: true
      }
    });

    this.waterGeometry = new THREE.BufferGeometry();

    const vertexBuffer = new THREE.BufferAttribute(parent.vertices, 3);
    this.waterGeometry.setAttribute('position', vertexBuffer);

    this.waterGeometry.computeVertexNormals();

    this.causticsMesh = new THREE.Mesh(this.waterGeometry, this.causticsMaterial);

    // Initialize renderer hook, this hook updates the caustics texture
    this.beforeRenderHook = this._beforeRenderHook;
  }

  /**
   * Add the effect to a given scene
   */
  addToScene (scene: THREE.Scene) {
    super.addToScene(scene);

    // TODO Add the water mesh
  }

  /**
   * Update the caustics texture if needed.
   */
  _beforeRenderHook (renderer: THREE.WebGLRenderer): void {
    if (this.causticsNeedsUpdate) {
      // Update environment map texture
      renderer.setRenderTarget(this.envMappingTarget);
      renderer.setClearColor(black, 0);
      renderer.clear();

      for (const mesh of this.envMappingMeshes) {
        renderer.render(mesh, this.lightCamera);
      }

      // Render caustics texture
      this.causticsMaterial.uniforms['envMap'].value = this.envMappingTarget.texture;

      renderer.setRenderTarget(this.causticsTarget);
      renderer.clear();

      renderer.render(this.causticsMesh, this.lightCamera);

      this.causticsNeedsUpdate = false;
    }
  }

  private lightCamera: THREE.OrthographicCamera;

  private causticsNeedsUpdate: boolean = true;

  private envMapSize: number = 256;
  private envMappingTarget: THREE.WebGLRenderTarget;
  private envMappingMaterial: THREE.ShaderMaterial;

  private causticsSize: number = 512;
  private causticsTarget: THREE.WebGLRenderTarget;
  private causticsMaterial: THREE.ShaderMaterial;

  private waterGeometry: THREE.BufferGeometry;

}
