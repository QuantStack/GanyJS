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


/**
 * Transform the vertices positions. The new vertice position is equal to `factor * (offset + input) + initialPosition`
 **/
export
class Warp extends Effect {

  constructor (parent: Block, input: Input, factor: THREE.Vector3, offset: THREE.Vector3) {
    super(parent, input);

    this.offsetNode = new Nodes.Vector3Node(offset.x, offset.y, offset.z);
    this.factorNode = new Nodes.Vector3Node(factor.x, factor.y, factor.z);

    this.intermediateTransformNode = new Nodes.OperatorNode(this.offsetNode, this.inputNode, Nodes.OperatorNode.ADD);

    this.transformNode = new Nodes.OperatorNode(
      this.intermediateTransformNode,
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
      this.intermediateTransformNode.b = this.inputNode;

      this.buildMaterial();
    }
  }

  set offset (value: THREE.Vector3) {
    this.offsetNode.value = value;
  }

  get offset () {
    return this.offsetNode.value;
  }

  set factor (value: THREE.Vector3) {
    this.factorNode.value = value;
  }

  get factor () {
    return this.factorNode.value;
  }

  get inputDimension () : InputDimension {
    return 3;
  }

  private initialized: boolean = false;

  private offsetNode: Nodes.Vector3Node;
  private factorNode: Nodes.Vector3Node;
  private intermediateTransformNode: Nodes.OperatorNode;
  private transformNode: Nodes.OperatorNode;

  protected inputNode: Nodes.Node;

}
