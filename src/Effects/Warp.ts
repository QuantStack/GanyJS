import * as Nodes from 'three/examples/jsm/nodes/Nodes';

import {
  Effect, Input, InputDimension
} from '../EffectBlock';

import {
  Block
} from '../Block';

import {
  NodeOperation
} from '../NodeMesh';


export
class Warp extends Effect {

  constructor (parent: Block, input: Input, factor: number) {
    super(parent, input);

    this.factorNode = new Nodes.FloatNode(factor);

    this.transformNode = new Nodes.OperatorNode(
      this.inputNode,
      this.factorNode,
      Nodes.OperatorNode.MUL
    );

    this.addTransformNode(NodeOperation.ADD, this.transformNode);

    this.buildMaterial();

    this.initialized = true;
  }

  setInput(input?: Input) : void {
    super.setInput(input);

    if (this.initialized) {
      this.transformNode.a = this.inputNode;

      this.buildMaterial();
    }
  }

  set factor (value: number) {
    this.factorNode.value = value;
  }

  get factor () {
    return this.factorNode.value;
  }

  get inputDimension () : InputDimension {
    return 3;
  }

  private initialized: boolean = false;

  private factorNode: Nodes.FloatNode;
  private transformNode: Nodes.OperatorNode;

  protected inputNode: Nodes.Node;

}
