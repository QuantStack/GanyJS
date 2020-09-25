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
 * Transform the vertices positions. The new vertice position is equal to `factor * input * normal + initialPosition`
 **/
export
class WarpByScalar extends Effect {

  constructor (parent: Block, input: Input, factor: number) {
    super(parent, input);

    this.factorNode = new Nodes.FloatNode(factor);

    this.intermediateTransformNode = new Nodes.OperatorNode(
      this.factorNode,
      this.inputNode,
      Nodes.OperatorNode.MUL
    );

    this.transformNode = new Nodes.OperatorNode(
      this.intermediateTransformNode,
      new Nodes.NormalNode(Nodes.NormalNode.WORLD),
      Nodes.OperatorNode.MUL
    );

    this.addTransformNode(NodeOperation.ADD, this.transformNode);

    this.buildMaterial();

    this.initialized = true;

    // There is no new geometry specific to this effect, we forward the parent event
    this.parent.on('change:geometry', () => { this.trigger('change:geometry'); });

    this.updateMatrix();
  }

  setInput(input?: Input) : void {
    super.setInput(input);

    if (this.initialized) {
      this.intermediateTransformNode.b = this.inputNode;

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
    return 1;
  }

  private initialized: boolean = false;

  private factorNode: Nodes.FloatNode;
  private intermediateTransformNode: Nodes.OperatorNode;
  private transformNode: Nodes.OperatorNode;

  protected inputNode: Nodes.Node;

}
