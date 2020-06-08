import * as THREE from 'three';

import {
  Effect
} from '../EffectBlock';

import {
  Block
} from '../Block';

const black = new THREE.Color('black');


// Environment mapping shaders
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


// Environment shaders
const envVertex = `
uniform vec3 light;

// Light projection matrix
uniform mat4 lightProjectionMatrix;
uniform mat4 lightViewMatrix;

varying float lightIntensity;
varying vec3 lightPosition;


void main(void){
  lightIntensity = - dot(light, normalize(normal));

  // Compute position in the light coordinates system, this will be used for
  // comparing fragment depth with the caustics texture
  vec4 lightRelativePosition = lightProjectionMatrix * lightViewMatrix * modelMatrix * vec4(position, 1.);
  lightPosition = 0.5 + lightRelativePosition.xyz / lightRelativePosition.w * 0.5;

  // The position of the vertex
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}
`;

const envFragment = `
uniform sampler2D caustics;

varying float lightIntensity;
varying vec3 lightPosition;

const float bias = 0.005;

const vec3 underwaterColor = vec3(0.4, 0.9, 1.0);


void main() {
  // Set the frag color
  float computedLightIntensity = 0.5;

  computedLightIntensity += 0.2 * lightIntensity;

  // Retrieve caustics information
  vec2 causticsInfo = texture2D(caustics, lightPosition.xy).zw;
  float causticsIntensity = causticsInfo.x;
  float causticsDepth = causticsInfo.y;

  if (causticsDepth > lightPosition.z - bias) {
    computedLightIntensity += causticsIntensity;
  }

  gl_FragColor = vec4(underwaterColor * computedLightIntensity, 1.);
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


/**
 * Displays beautiful water with real-time caustics.
 **/
// TODO Inherit from something else than Effect
export
class Water extends Effect {

  constructor (parent: Block) {
    super(parent);

    // Remove meshes, only the water and the environment will stay
    this.meshes = [];

    // Initialize the light camera
    // TODO Use the same directional light as the scene
    // TODO Compute clip planes values depending on the mesh + env bounding box
    const light = [0., 0., -1.];
    this.lightCamera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0., 5.);
    this.lightCamera.position.set(-2 * light[0], -2 * light[1], -2 * light[2]);
    this.lightCamera.lookAt(0, 0, 0);

    // Initialize environment mapping and environment material
    this.envMappingTarget = new THREE.WebGLRenderTarget(this.envMapSize, this.envMapSize, {type: THREE.FloatType});
    this.envMappingMaterial = new THREE.ShaderMaterial({
      vertexShader: envMappingVertex,
      fragmentShader: envMappingFragment,
    });

    this.envMaterial = new THREE.ShaderMaterial({
      vertexShader: envVertex,
      fragmentShader: envFragment,
      uniforms: {
        light: { value: light },
        caustics: { value: null },
        lightProjectionMatrix: { value: this.lightCamera.projectionMatrix },
        lightViewMatrix: { value: this.lightCamera.matrixWorldInverse  }
      },
    });

    this.envMappingMeshes = [];
    this._environmentMeshes = [];
    for (const envMesh of parent.options.environmentMeshes) {
      this.envMappingMeshes.push(new THREE.Mesh(envMesh.geometry, this.envMappingMaterial));
      this._environmentMeshes.push(new THREE.Mesh(envMesh.geometry, this.envMaterial));
    }

    // Initialize water caustics
    this.causticsTarget = new THREE.WebGLRenderTarget(this.causticsSize, this.causticsSize, {type: THREE.FloatType});
    this.causticsMaterial = new THREE.ShaderMaterial({
      vertexShader: causticsVertex,
      fragmentShader: causticsFragment,
      uniforms: {
        light: { value: light },
        envMap: { value: null },
        deltaEnvMapTexture: { value: 1. / this.envMapSize },
      },
      side: THREE.DoubleSide,
      extensions: {
        derivatives: true
      }
    });

    this.updateWaterGeometry();

    this.causticsMesh = new THREE.Mesh(this.waterGeometry, this.causticsMaterial);

    // Initialize water mesh
    this.waterMaterial = new THREE.ShaderMaterial({
      uniforms: {
        light: { value: light },
      },
      vertexShader: waterVertex,
      fragmentShader: waterFragment,
      side: THREE.DoubleSide
    });

    this.waterMesh = new THREE.Mesh(this.waterGeometry, this.waterMaterial);

    // Event listener for geometry change
    this.parent.on('change:geometry', this.updateWater.bind(this));

    // Initialize renderer hook, this hook updates the caustics texture
    this.beforeRenderHook = this._beforeRenderHook;
  }

  /**
   * Add the effect to a given scene
   */
  addToScene (scene: THREE.Scene) {
    super.addToScene(scene);

    scene.add(this.waterMesh);
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

  /**
   * Update the caustics texture if needed.
   */
  private _beforeRenderHook (renderer: THREE.WebGLRenderer): void {
    if (this.causticsNeedsUpdate) {
      // Update environment map texture
      renderer.setRenderTarget(this.envMappingTarget);
      renderer.setClearColor(black, 0);
      renderer.clear();

      for (const mesh of this.envMappingMeshes) {
        // @ts-ignore: Until https://github.com/mrdoob/three.js/pull/19564 is released
        renderer.render(mesh, this.lightCamera);
      }

      // Render caustics texture
      this.causticsMaterial.uniforms['envMap'].value = this.envMappingTarget.texture;

      renderer.setRenderTarget(this.causticsTarget);
      renderer.clear();

      // @ts-ignore: Until https://github.com/mrdoob/three.js/pull/19564 is released
      renderer.render(this.causticsMesh, this.lightCamera);

      this.envMaterial.uniforms['caustics'].value = this.causticsTarget.texture;

      this.causticsNeedsUpdate = false;
    }
  }

  private lightCamera: THREE.OrthographicCamera;

  private causticsNeedsUpdate: boolean = true;

  private envMapSize: number = 256;
  private envMappingTarget: THREE.WebGLRenderTarget;
  private envMappingMaterial: THREE.ShaderMaterial;
  private envMappingMeshes: THREE.Mesh[];

  private envMaterial: THREE.ShaderMaterial;

  private causticsSize: number = 512;
  private causticsTarget: THREE.WebGLRenderTarget;
  private causticsMaterial: THREE.ShaderMaterial;
  private causticsMesh: THREE.Mesh;

  private waterMaterial: THREE.ShaderMaterial;
  private waterMesh: THREE.Mesh;

  private waterGeometry: THREE.BufferGeometry;

}
