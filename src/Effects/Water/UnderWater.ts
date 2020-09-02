import * as THREE from 'three';
import * as Nodes from 'three/examples/jsm/nodes/Nodes';

import {
  Effect, Input, InputDimension
} from '../../EffectBlock';

import {
  Component
} from '../../Data';

import {
  Block, BlockOptions
} from '../../Block';

import {
  NodeMesh, NodeOperation
} from '../../NodeMesh';

import {
  BasicNodeMaterial
} from '../../utils/BasicNodeMaterial';

import {
  IdentityNode
} from '../../utils/Nodes';


export
interface UnderWaterOptions extends BlockOptions {

  defaultColor?: THREE.Color;

  texture?: THREE.Texture;

  textureScale?: number;

}


/**
 * Block that receives the caustics.
 **/
export
class UnderWater extends Effect {

  constructor (parent: Block, input: Input, options?: UnderWaterOptions) {
    super(parent, input, options);

    if (options) {
      this._defaultColor = options.defaultColor !== undefined ? options.defaultColor : this._defaultColor;
      this._texture = options.texture !== undefined ? options.texture : this._texture;
      this._textureScale = options.textureScale !== undefined ? options.textureScale : this._textureScale;
    }

    // Shallow copy the meshes (Geometries are not copied, we only create new Materials)
    this.envMappingMeshes = this.meshes.map((nodeMesh: NodeMesh) => nodeMesh.copy(BasicNodeMaterial));
    this.meshes = this.meshes.map((nodeMesh: NodeMesh) => nodeMesh.copy(BasicNodeMaterial));

    // Setting up environment mapping Material
    const worldPositionVarying = new Nodes.VarNode('vec3');
    const depthVarying = new Nodes.VarNode('float');

    const envMappingVertexNode = new Nodes.FunctionNode(
      `void envMappingFunc${this.id}(vec3 position){
        // Compute world position
        vec4 wPosition = modelMatrix * vec4(position, 1.);
        // Project vertex in the screen coordinates
        vec4 projectedPosition = projectionMatrix * viewMatrix * wPosition;
        // Store worldPosition and vertex depth
        worldPosition = wPosition.xyz;
        depth = projectedPosition.z;
      }`
    );

    envMappingVertexNode.keywords = {
      worldPosition: worldPositionVarying,
      depth: depthVarying,
    };

    const envMappingVertexNodeCall = new Nodes.FunctionCallNode(
      envMappingVertexNode,
      [new Nodes.PositionNode()]
    );

    for (const nodeMesh of this.envMappingMeshes) {
      // Vertex shader
      nodeMesh.addVertexExpressionNode(envMappingVertexNodeCall);

      // Fragment shader
      nodeMesh.addColorNode(NodeOperation.ASSIGN, worldPositionVarying);
      nodeMesh.addAlphaNode(NodeOperation.ASSIGN, depthVarying);

      nodeMesh.buildMaterial();
    }

    // Set environment shader
    // Vertex shader
    // Compute position relative to the light
    const lightPosition = new Nodes.VarNode('vec3');
    const setLightPosition = new Nodes.FunctionNode(
      `void setLightPosition${this.id}(mat4 lightProjectionMatrix, mat4 lightViewMatrix, vec3 position){
        vec4 lightRelativePosition = lightProjectionMatrix * lightViewMatrix * modelMatrix * vec4(position, 1.);
        lightPosition = 0.5 + lightRelativePosition.xyz / lightRelativePosition.w * 0.5;
      }`
    );

    setLightPosition.keywords = { lightPosition };

    this.lightProjectionMatrixNode = new Nodes.Matrix4Node();
    this.lightViewMatrixNode = new Nodes.Matrix4Node();

    const setLightPositionCall = new Nodes.FunctionCallNode(
      setLightPosition,
      [this.lightProjectionMatrixNode, this.lightViewMatrixNode, new Nodes.PositionNode()]
    );

    this.addVertexExpressionNode(setLightPositionCall);

    // Texture blending
    const textureBlending = new Nodes.VarNode('vec3');
    const setTextureBlending = new Nodes.FunctionNode(
      `void setTextureBlending${this.id}(vec3 normal){
        textureBlending = normalize(max(abs(normal), 0.00001)); // Force weights to sum to 1.0
        float b = textureBlending.x + textureBlending.y + textureBlending.z;
        textureBlending /= vec3(b, b, b);
      }`
    );

    setTextureBlending.keywords = { textureBlending };

    const setTextureBlendingCall = new Nodes.FunctionCallNode(setTextureBlending, [new Nodes.NormalNode(Nodes.NormalNode.WORLD)]);

    this.addVertexExpressionNode(setTextureBlendingCall);

    // Fragment shader
    this.useTexturingNode = new Nodes.FloatNode(0);
    this.envTextureNode = new Nodes.TextureNode(new THREE.Texture());
    this.textureScaleNode = new Nodes.FloatNode(this._textureScale);
    this.defaultColorNode = new Nodes.ColorNode(this._defaultColor);

    const rand2 = new Nodes.FunctionNode(
      `vec2 rand2(vec2 st){
        st = vec2(
          dot(st, vec2(127.1, 311.7)),
          dot(st, vec2(269.5, 183.3))
        );

        return -1.0 + 2.0 * fract(sin(st) * 43758.5453123);
      }`
    );

    const noise = new Nodes.FunctionNode(
      `float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);

        vec2 u = f * f * (3.0 - 2.0 * f);

        return mix(
            mix(
                dot(rand2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                dot(rand2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)),
                u.x
            ),
            mix(
                dot(rand2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                dot(rand2(i + vec2(1.0, 1.0) ), f - vec2(1.0, 1.0)),
                u.x
            ),
            u.y
        );
      }`
    );

    noise.keywords = { rand2 };

    const blur = new Nodes.FunctionNode(
      `float blur(sampler2D image, vec2 uv, vec2 resolution, vec2 direction) {
        float intensity = 0.;
        vec2 off1 = vec2(1.3846153846) * direction;
        vec2 off2 = vec2(3.2307692308) * direction;
        intensity += texture2D(image, uv).x * 0.2270270270;
        intensity += texture2D(image, uv + (off1 / resolution)).x * 0.3162162162;
        intensity += texture2D(image, uv - (off1 / resolution)).x * 0.3162162162;
        intensity += texture2D(image, uv + (off2 / resolution)).x * 0.0702702703;
        intensity += texture2D(image, uv - (off2 / resolution)).x * 0.0702702703;
        return intensity;
      }`
    );

    const ifUsetexturing = new Nodes.FunctionNode(
      `vec3 getTextureColor${this.id}(sampler2D envTexture, vec3 worldPosition, float scale, vec3 textureBlending){
        vec3 xaxis = texture2D(envTexture, worldPosition.yz * scale).xyz;
        vec3 yaxis = texture2D(envTexture, worldPosition.xz * scale).xyz;
        vec3 zaxis = texture2D(envTexture, worldPosition.xy * scale).xyz;

        return xaxis * textureBlending.x + yaxis * textureBlending.y + zaxis * textureBlending.z;
      }`
    );

    const ifUsetexturingCall = new Nodes.FunctionCallNode(
      ifUsetexturing,
      [this.envTextureNode, new Nodes.PositionNode(Nodes.PositionNode.WORLD), this.textureScaleNode, textureBlending]
    );

    const elseUsetexturing = new Nodes.FunctionNode(
      `vec3 getNoiseColor${this.id}(vec3 worldPosition, float scale, vec3 defaultColor, vec3 textureBlending){
        vec3 xaxis = vec3(noise(worldPosition.yz * 100. * scale) * 0.2 + 0.9) * defaultColor;
        vec3 yaxis = vec3(noise(worldPosition.xz * 100. * scale) * 0.2 + 0.9) * defaultColor;
        vec3 zaxis = vec3(noise(worldPosition.xy * 100. * scale) * 0.2 + 0.9) * defaultColor;

        return xaxis * textureBlending.x + yaxis * textureBlending.y + zaxis * textureBlending.z;
      }`
    );

    elseUsetexturing.keywords = { noise };

    const elseUsetexturingCall = new Nodes.FunctionCallNode(
      elseUsetexturing,
      [new Nodes.PositionNode(Nodes.PositionNode.WORLD), this.textureScaleNode, this.defaultColorNode, textureBlending]
    );

    this.causticsTextureNode = new Nodes.TextureNode(new THREE.Texture());

    const getColor = new Nodes.FunctionNode(
      `vec3 getColor${this.id}(float isUnderwater, sampler2D caustics, vec3 lightPosition, vec2 resolution, vec3 underwaterColor, vec3 overwaterColor, vec3 texColor){
        float lightIntensity = 1.;

        if (isUnderwater > 0.) {
          // Retrieve caustics information
          vec2 causticsInfo = texture2D(caustics, lightPosition.xy).zw;
          float causticsDepth = causticsInfo.y;

          if (causticsDepth > lightPosition.z - 0.001) {
            float causticsIntensity = 0.5 * (
              blur(caustics, lightPosition.xy, resolution, vec2(0., 0.5)) +
              blur(caustics, lightPosition.xy, resolution, vec2(0.5, 0.))
            );

            lightIntensity = 0.6 + min(causticsIntensity, 0.2);
          }

          return texColor * underwaterColor * lightIntensity;
        } else {
          return texColor * overwaterColor * lightIntensity;
        }
      }`
    );

    getColor.keywords = { blur };

    this.isUnderwaterNode = new IdentityNode(this.inputNode);

    const getColorCall = new Nodes.FunctionCallNode(
      getColor,
      [
        this.isUnderwaterNode, this.causticsTextureNode, lightPosition,
        new Nodes.Vector2Node(new THREE.Vector2(1024., 1024.)), // Resolution
        new Nodes.ColorNode(new THREE.Color(0.4, 0.9, 1.0)), // Underwater color
        new Nodes.ColorNode(new THREE.Color(1., 1., 1.)), // Overwater color
        new Nodes.CondNode(
          this.useTexturingNode, new Nodes.FloatNode(1), Nodes.CondNode.EQUAL,
          ifUsetexturingCall, elseUsetexturingCall
        )
      ]
    );

    this.addColorNode(NodeOperation.ASSIGN, getColorCall);

    this.initialized = true;
  }

  setLight (light: THREE.Vector3, lightProjectionMatrix: THREE.Matrix4, lightViewMatrix: THREE.Matrix4) {
    this.lightProjectionMatrixNode.value = lightProjectionMatrix;
    this.lightViewMatrixNode.value = lightViewMatrix;
  }

  setCausticsTexture (causticsTexture: THREE.Texture) {
    this.causticsTextureNode.value = causticsTexture;
  }

  set defaultColor (value: THREE.Color) {
    this._defaultColor = value;
    this.defaultColorNode.value = value;
  }

  set texture (texture: THREE.Texture | null) {
    this._texture = texture;

    if (this._texture === null) {
      this.useTexturingNode.value = 0;
    } else {
      this.useTexturingNode.value = 1;

      this._texture.wrapS = THREE.RepeatWrapping;
      this._texture.wrapT = THREE.RepeatWrapping;

      this.envTextureNode.value = this._texture;
    }
  }

  set textureScale (textureScale: number) {
    this._textureScale = textureScale;
    this.textureScaleNode.value = this._textureScale;
  }

  renderEnvMap (renderer: THREE.WebGLRenderer, lightCamera: THREE.Camera) {
    for (const nodeMesh of this.envMappingMeshes) {
      renderer.render(nodeMesh.mesh, lightCamera);
    }
  }

  setMatrix (matrix: THREE.Matrix4) {
    for (const nodeMesh of this.envMappingMeshes) {
      nodeMesh.matrix = matrix;
    }
    for (const mesh of this.meshes) {
      mesh.matrix = matrix;
    }
  }

  setInput(input?: Input) : void {
    super.setInput(input);

    if (this.initialized) {
      this.isUnderwaterNode.value = this.inputNode;
    }
  }

  get inputDimension () : InputDimension {
    return 1;
  }

  static readonly envMapSize: number = 1024;
  static envMappingTarget: THREE.WebGLRenderTarget = new THREE.WebGLRenderTarget(UnderWater.envMapSize, UnderWater.envMapSize, {type: THREE.FloatType});
  private envMappingMeshes: NodeMesh[];

  private useTexturingNode: Nodes.FloatNode;
  private envTextureNode: Nodes.TextureNode;
  private textureScaleNode: Nodes.FloatNode;
  private defaultColorNode: Nodes.ColorNode;
  private causticsTextureNode: Nodes.TextureNode;
  private isUnderwaterNode: IdentityNode;

  private lightProjectionMatrixNode: Nodes.Matrix4Node;
  private lightViewMatrixNode: Nodes.Matrix4Node;

  private _defaultColor: THREE.Color = new THREE.Color(0.951, 1., 0.825);
  private _texture: THREE.Texture | null = null;
  private _textureScale: number = 2;

  private initialized: boolean = false;

  protected inputs: [Component];
  protected inputNode: Nodes.Node;

}
