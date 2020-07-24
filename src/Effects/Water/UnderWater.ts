import * as THREE from 'three';

import {
  Effect, Input, InputDimension
} from '../../EffectBlock';

import {
  Component
} from '../../Data';

import {
  Block, BlockOptions
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
const getEnvVertex = (underwater: String) => `
attribute float ${underwater};

// Light projection matrix
uniform mat4 lightProjectionMatrix;
uniform mat4 lightViewMatrix;

varying vec3 lightPosition;
varying vec3 worldPosition;
varying vec3 textureBlending;
varying float v${underwater};
varying vec3 vNormal;


void main(void){
  // Interpolate the underwater value
  v${underwater} = ${underwater};

  vNormal = normal.xyz;

  vec4 modelPosition = modelMatrix * vec4(position, 1.);
  worldPosition = modelPosition.xyz;

  // Compute position in the light coordinates system, this will be used for
  // comparing fragment depth with the caustics texture
  vec4 lightRelativePosition = lightProjectionMatrix * lightViewMatrix * modelPosition;
  lightPosition = 0.5 + lightRelativePosition.xyz / lightRelativePosition.w * 0.5;

  // Texture blending
  textureBlending = abs(normal);
  textureBlending = normalize(max(textureBlending, 0.00001)); // Force weights to sum to 1.0
  float b = textureBlending.x + textureBlending.y + textureBlending.z;
  textureBlending /= vec3(b, b, b);

  // The position of the vertex
  gl_Position = projectionMatrix * viewMatrix * modelPosition;
}
`;

const getEnvFragment = (underwater: String) => `
uniform vec3 light;
uniform sampler2D caustics;
uniform vec3 defaultColor;

#ifdef USE_TEXTURING
uniform sampler2D envTexture;
#endif

// TODO Make those uniforms
const vec2 resolution = vec2(1024.);
const float scale = 1. / 0.5;
const vec2 sandTextureResolution = vec2(512, 512);

vec3 texColor;

varying vec3 lightPosition;
varying vec3 worldPosition;
varying vec3 textureBlending;
varying float v${underwater};
varying vec3 vNormal;

const float bias = 0.001;

const vec3 underwaterColor = vec3(0.4, 0.9, 1.0);
const vec3 overwaterColor = vec3(1.);

float blur(sampler2D image, vec2 uv, vec2 resolution, vec2 direction) {
  float intensity = 0.;
  vec2 off1 = vec2(1.3846153846) * direction;
  vec2 off2 = vec2(3.2307692308) * direction;
  intensity += texture2D(image, uv).x * 0.2270270270;
  intensity += texture2D(image, uv + (off1 / resolution)).x * 0.3162162162;
  intensity += texture2D(image, uv - (off1 / resolution)).x * 0.3162162162;
  intensity += texture2D(image, uv + (off2 / resolution)).x * 0.0702702703;
  intensity += texture2D(image, uv - (off2 / resolution)).x * 0.0702702703;
  return intensity;
}

vec2 random2(vec2 st){
    st = vec2(
        dot(st, vec2(127.1, 311.7)),
        dot(st, vec2(269.5, 183.3))
    );

    return -1.0 + 2.0 * fract(sin(st) * 43758.5453123);
}

// Gradient Noise
float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(
            dot(random2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
            dot(random2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)),
            u.x
        ),
        mix(
            dot(random2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
            dot(random2(i + vec2(1.0, 1.0) ), f - vec2(1.0, 1.0)),
            u.x
        ),
        u.y
    );
}

void main() {
  float lightIntensity = - dot(light, normalize(vNormal));

  float computedLightIntensity = 0.5;
  computedLightIntensity += 0.2 * lightIntensity;

#ifdef USE_TEXTURING
  // Texture tri-planar mapping
  vec3 xaxis = texture2D(envTexture, worldPosition.yz * scale).xyz;
  vec3 yaxis = texture2D(envTexture, worldPosition.xz * scale).xyz;
  vec3 zaxis = texture2D(envTexture, worldPosition.xy * scale).xyz;
#else
  // Tri-planar mapping on the generated sand texture
  vec3 xaxis = vec3(noise(worldPosition.yz * 100. * scale) * 0.2 + 0.9) * defaultColor;
  vec3 yaxis = vec3(noise(worldPosition.xz * 100. * scale) * 0.2 + 0.9) * defaultColor;
  vec3 zaxis = vec3(noise(worldPosition.xy * 100. * scale) * 0.2 + 0.9) * defaultColor;
#endif
  texColor = xaxis * textureBlending.x + yaxis * textureBlending.y + zaxis * textureBlending.z;

  if (v${underwater} > 0.) {
    // Retrieve caustics information
    vec2 causticsInfo = texture2D(caustics, lightPosition.xy).zw;
    float causticsDepth = causticsInfo.y;

    float causticsIntensity = 0.5 * (
      blur(caustics, lightPosition.xy, resolution, vec2(0., 0.5)) +
      blur(caustics, lightPosition.xy, resolution, vec2(0.5, 0.))
    );

    if (causticsDepth > lightPosition.z - bias) {
      computedLightIntensity += causticsIntensity;
    }

    gl_FragColor = vec4(texColor * underwaterColor * computedLightIntensity, 1.);
  } else {
    gl_FragColor = vec4(texColor * overwaterColor * computedLightIntensity, 1.);
  }
}
`;


export
interface UnderWaterOptions extends BlockOptions {

  defaultColor?: THREE.Color;

  texture?: THREE.Texture;

}


/**
 * Block that receives the caustics.
 **/
export
class UnderWater extends Effect {

  constructor (parent: Block, input: Input, options?: UnderWaterOptions) {
    super(parent, input, options);

    // Remove meshes, we won't use NodeMeshes here
    this.meshes = [];

    this.inputComponent = this.inputs[0];

    if (options) {
      this._defaultColor = options.defaultColor !== undefined ? options.defaultColor : this._defaultColor;
      this._texture = options.texture !== undefined ? options.texture : this._texture;
    }

    // Initialize environment mapping and environment material
    this.envMappingMaterial = new THREE.ShaderMaterial({
      vertexShader: envMappingVertex,
      fragmentShader: envMappingFragment,
    });

    this.envMaterial = new THREE.ShaderMaterial({
      vertexShader: getEnvVertex(this.inputComponent.shaderName),
      fragmentShader: getEnvFragment(this.inputComponent.shaderName),
      uniforms: {
        light: { value: null },
        caustics: { value: null },
        envTexture: { value: this._texture },
        defaultColor: { value: this._defaultColor },
        lightProjectionMatrix: { value: null },
        lightViewMatrix: { value: null }
      },
      defines: {
        USE_TEXTURING: this._texture !== null
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

      (mesh.geometry as THREE.BufferGeometry).setAttribute(this.inputComponent.shaderName, this.inputComponent.bufferAttribute);

      // We need the normals in shaders
      mesh.geometry.computeVertexNormals();

      const envMesh = new THREE.Mesh(mesh.geometry, this.envMaterial);
      envMesh.matrixAutoUpdate = false;
      this.envMeshes.push(envMesh);
    }

    this.initialized = true;
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

  set defaultColor (value: THREE.Color) {
    this._defaultColor = value;
    this.envMaterial.uniforms['defaultColor'].value = value;
  }

  set texture (texture: THREE.Texture | null) {
    this._texture = texture;

    if (this._texture === null) {
      this.envMaterial.uniforms['envTexture'].value = null;
      this.envMaterial.defines['USE_TEXTURING'] = false;

      return;
    }

    this._texture.wrapS = THREE.RepeatWrapping;
    this._texture.wrapT = THREE.RepeatWrapping;

    this.envMaterial.uniforms['envTexture'].value = this._texture;
    this.envMaterial.defines['USE_TEXTURING'] = true;
  }

  renderEnvMap (renderer: THREE.WebGLRenderer, lightCamera: THREE.Camera) {
    for (const mesh of this.envMappingMeshes) {
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

  setInput(input?: Input) : void {
    super.setInput(input);

    if (this.initialized) {
      this.inputComponent = this.inputs[0];

      for (const mesh of this.envMeshes) {
        (mesh.geometry as THREE.BufferGeometry).setAttribute(this.inputComponent.shaderName, this.inputComponent.bufferAttribute);
      }

      this.envMaterial.vertexShader = getEnvVertex(this.inputComponent.shaderName);
      this.envMaterial.fragmentShader = getEnvFragment(this.inputComponent.shaderName);
      this.envMaterial.needsUpdate = true;
    }
  }

  get inputDimension () : InputDimension {
    return 1;
  }

  static readonly envMapSize: number = 1024;
  static envMappingTarget: THREE.WebGLRenderTarget = new THREE.WebGLRenderTarget(UnderWater.envMapSize, UnderWater.envMapSize, {type: THREE.FloatType});
  private envMappingMaterial: THREE.ShaderMaterial;
  private envMappingMeshes: THREE.Mesh[];
  private envMeshes: THREE.Mesh[];

  private envMaterial: THREE.ShaderMaterial;
  private _defaultColor: THREE.Color = new THREE.Color(0.951, 1., 0.825);
  private _texture: THREE.Texture | null = null;

  private initialized: boolean = false;
  private inputComponent: Component;

  protected inputs: Component[];

}
