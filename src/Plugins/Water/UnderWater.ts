import * as THREE from 'three';

import {
  Effect
} from '../../EffectBlock';

import {
  Block
} from '../../Block';


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


// Environment shaders
const envVertex = `
// Light projection matrix
uniform mat4 lightProjectionMatrix;
uniform mat4 lightViewMatrix;

varying vec3 lightPosition;
varying vec3 worldPosition;


void main(void){
  vec4 modelPosition = modelMatrix * vec4(position, 1.);
  worldPosition = modelPosition.xyz;

  // Compute position in the light coordinates system, this will be used for
  // comparing fragment depth with the caustics texture
  vec4 lightRelativePosition = lightProjectionMatrix * lightViewMatrix * modelMatrix * vec4(position, 1.);
  lightPosition = 0.5 + lightRelativePosition.xyz / lightRelativePosition.w * 0.5;

  // The position of the vertex
  gl_Position = projectionMatrix * viewMatrix * modelPosition;
}
`;

const envFragment = `
uniform vec3 light;
uniform sampler2D caustics;

varying vec3 lightPosition;
varying vec3 worldPosition;

const float bias = 0.005;

const vec3 underwaterColor = vec3(0.4, 0.9, 1.0);


void main() {
  // Compute flat shading normal (inefficient, should be computed on CPU once)
  vec3 X = dFdx(worldPosition);
  vec3 Y = dFdy(worldPosition);
  vec3 normal = normalize(cross(X, Y));

  float lightIntensity = - dot(light, normalize(normal));

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


/**
 * Block that receives the caustics.
 **/
// TODO: Take a 1D input, the underwater component that specifies if the vertex is underwater or not
export
class UnderWater extends Effect {

  constructor (parent: Block) {
    super(parent);

    // Remove meshes, we won't use NodeMeshes here
    this.meshes = [];

    // Initialize environment mapping and environment material
    this.envMappingMaterial = new THREE.ShaderMaterial({
      vertexShader: envMappingVertex,
      fragmentShader: envMappingFragment,
    });

    this.envMaterial = new THREE.ShaderMaterial({
      vertexShader: envVertex,
      fragmentShader: envFragment,
      uniforms: {
        light: { value: null },
        caustics: { value: null },
        lightProjectionMatrix: { value: null },
        lightViewMatrix: { value: null }
      },
      extensions: {
        derivatives: true
      }
    });

    this.envMappingMeshes = [];
    this.envMeshes = [];
    for (const mesh of parent.meshes) {
      const envMappingMesh = new THREE.Mesh(mesh.geometry, this.envMappingMaterial)
      envMappingMesh.matrixAutoUpdate = false;
      this.envMappingMeshes.push(envMappingMesh);

      const envMesh = new THREE.Mesh(mesh.geometry, this.envMaterial);
      envMesh.matrixAutoUpdate = false;
      this.envMeshes.push(envMesh);
    }
  }

  /**
   * Add the effect to a given scene
   */
  addToScene (scene: THREE.Scene) {
    super.addToScene(scene);

    for (const mesh of this.envMeshes) {
      scene.add(mesh);
    }
  }

  setLight (light: THREE.Vector3, lightProjectionMatrix: THREE.Matrix4, lightViewMatrix: THREE.Matrix4) {
    this.envMaterial.uniforms['light'].value = light;
    this.envMaterial.uniforms['lightProjectionMatrix'].value = lightProjectionMatrix;
    this.envMaterial.uniforms['lightViewMatrix'].value = lightViewMatrix;
  }

  setCausticsTexture (causticsTexture: THREE.Texture) {
    this.envMaterial.uniforms['caustics'].value = causticsTexture;
  }

  renderEnvMap (renderer: THREE.WebGLRenderer, lightCamera: THREE.Camera) {
    for (const mesh of this.envMappingMeshes) {
      // @ts-ignore: Until https://github.com/mrdoob/three.js/pull/19564 is released
      renderer.render(mesh, lightCamera);
    }
  }

  setMatrix (matrix: THREE.Matrix4) {
    for (const mesh of this.envMappingMeshes) {
      mesh.matrix.copy(matrix);
      mesh.updateMatrixWorld(true);
    }
    for (const mesh of this.envMeshes) {
      mesh.matrix.copy(matrix);
      mesh.updateMatrixWorld(true);
    }
  }

  static readonly envMapSize: number = 256;
  static envMappingTarget: THREE.WebGLRenderTarget = new THREE.WebGLRenderTarget(UnderWater.envMapSize, UnderWater.envMapSize, {type: THREE.FloatType});
  private envMappingMaterial: THREE.ShaderMaterial;
  private envMappingMeshes: THREE.Mesh[];
  private envMeshes: THREE.Mesh[];

  private envMaterial: THREE.ShaderMaterial;

}
