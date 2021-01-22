import * as THREE from 'three';
import * as Nodes from 'three/examples/jsm/nodes/Nodes';

const d3Format = require('d3-format');

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
  ScaleType, getColorMapTexture, getColorInterpolator, getColorBar, updateColorBar
} from '../utils/colormaps';


export
class IsoColor extends Effect {

  constructor (parent: Block, input: Input, min: number, max: number, colorMap: string = 'Viridis', type: ScaleType = ScaleType.linear) {
    super(parent, input);

    this.format = d3Format.format('.2e');
    this._type = type;
    this.colorInterpolator = getColorInterpolator(colorMap);
    this.colorBar = getColorBar(this.colorInterpolator, [min, max], type, this.format);
    this.texture = getColorMapTexture(this.colorInterpolator);

    this.textureNode = new Nodes.TextureNode(this.texture);

    const functionNode = this.getFunctionNode();

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
    updateColorBar(this.colorBar, this.colorInterpolator, [value, this.maxNode.value], this._type, this.format);
    this.minNode.value = value;

    this.trigger('change:colorbar');
  }

  get min () {
    return this.minNode.value;
  }

  set max (value: number) {
    updateColorBar(this.colorBar, this.colorInterpolator, [this.minNode.value, value], this._type, this.format);
    this.maxNode.value = value;

    this.trigger('change:colorbar');
  }

  get max () {
    return this.maxNode.value;
  }

  get inputDimension () : InputDimension {
    return 1;
  }

  set colorMap (colorMap: string) {
    this.colorInterpolator = getColorInterpolator(colorMap);
    updateColorBar(this.colorBar, this.colorInterpolator, [this.minNode.value, this.maxNode.value], this._type, this.format);
    this.texture = getColorMapTexture(this.colorInterpolator);
    this.textureNode.value = this.texture;

    this.trigger('change:colorbar');
  }

  set type (type: ScaleType) {
    this._type = type;

    updateColorBar(this.colorBar, this.colorInterpolator, [this.minNode.value, this.maxNode.value], this._type, this.format);

    const functionNode = this.getFunctionNode();
    this.functionCallNode.setFunction(functionNode, [this.textureNode, this.minNode, this.maxNode, this.inputNode]);

    this.buildMaterial();

    this.trigger('change:colorbar');
  }

  private getFunctionNode () {
    if (this._type == ScaleType.linear) {
      return new Nodes.FunctionNode(
        `vec3 isoColorFunc${this.id}(sampler2D textureMap, float min, float max, float data){
          vec2 colorPosition = vec2((data - min) / (max - min), 0.0);

          return vec3(texture2D(textureMap, colorPosition));
        }`
      );
    } else {
      return new Nodes.FunctionNode(
        `vec3 isoColorFunc${this.id}(sampler2D textureMap, float min, float max, float data){
          vec2 colorPosition = vec2((log(data) - log(min)) / (log(max) - log(min)), 0.0);

          return vec3(texture2D(textureMap, colorPosition));
        }`
      );
    }
  }

  colorBar: HTMLCanvasElement;

  private initialized: boolean = false;

  private functionCallNode: Nodes.FunctionCallNode;

  private colorInterpolator: (v: number) => string;
  private format: (v: number) => string;
  private _type: ScaleType;

  private minNode: Nodes.FloatNode;
  private maxNode: Nodes.FloatNode;

  private texture: THREE.DataTexture;
  private textureNode: Nodes.TextureNode;

  protected inputs: [Component];
  protected inputNode: Nodes.Node;

}
