import * as THREE from 'three';
import * as Nodes from 'three/examples/jsm/nodes/Nodes';

import {
  Effect, Input, InputDimension
} from '../EffectBlock';

import {
  Block
} from '../Block';

import {
  Component
} from '../Data';

import {
  NodeOperation
} from '../NodeMesh';

import {
  getColorMapTexture
} from '../utils/colormaps';


export
class IsoColor extends Effect {

  constructor (parent: Block, input: Input, min: number, max: number, colorMap: string = 'Viridis') {
    super(parent, input);

    this.texture = getColorMapTexture(colorMap);

    this.textureNode = new Nodes.TextureNode(this.texture);

    const functionNode = new Nodes.FunctionNode(
      `vec3 isoColorFunc${this.id}(sampler2D textureMap, float min, float max, float data){
        vec2 colorPosition = vec2((data - min) / (max - min), 0.0);

        return vec3(texture2D(textureMap, colorPosition));
      }`
    );

    this.minNode = new Nodes.FloatNode(min);
    this.maxNode = new Nodes.FloatNode(max);

    this.functionCallNode = new Nodes.FunctionCallNode(functionNode, [this.textureNode, this.minNode, this.maxNode, this.inputNode]);

    this.addColorNode(NodeOperation.ASSIGN, this.functionCallNode);

    this.buildMaterial();

    this.initialized = true;

    // There is no new geometry specific to this effect, we forward the parent event
    this.parent.on('change:geometry', () => { this.trigger('change:geometry'); });

    this.updateMatrix();
  }

  setInput(input?: Input) : void {
    super.setInput(input);

    if (this.initialized) {
      this.functionCallNode.inputs = [this.textureNode, this.minNode, this.maxNode, this.inputNode];

      this.buildMaterial();
    }
  }

  set min (value: number) {
    this.minNode.value = value;
  }

  get min () {
    return this.minNode.value;
  }

  set max (value: number) {
    this.maxNode.value = value;
  }

  get max () {
    return this.maxNode.value;
  }

  get inputDimension () : InputDimension {
    return 1;
  }

  set colorMap (colorMap: string) {
    this.texture = getColorMapTexture(colorMap);
    this.textureNode.value = this.texture;
  }

  private initialized: boolean = false;

  private functionCallNode: Nodes.FunctionCallNode;

  private minNode: Nodes.FloatNode;
  private maxNode: Nodes.FloatNode;

  private texture: THREE.DataTexture;
  private textureNode: Nodes.TextureNode;

  protected inputs: [Component];
  protected inputNode: Nodes.Node;

}
