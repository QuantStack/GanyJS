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
  IdentityNode
} from '../utils/Nodes';


export
class RGB extends Effect {

  constructor (parent: Block, input: Input) {
    super(parent, input);

    this.colorNode = new IdentityNode(this.inputNode);

    this.addColorNode(NodeOperation.ASSIGN, this.colorNode);

    this.buildMaterial();

    this.initialized = true;

    // There is no new geometry specific to this effect, we forward the parent event
    this.parent.on('change:geometry', () => { this.trigger('change:geometry'); });

    this.updateMatrix();
  }

  setInput(input?: Input) : void {
    super.setInput(input);

    if (this.initialized) {
      this.colorNode.value = this.inputNode;

      this.buildMaterial();
    }
  }

  get inputDimension () : InputDimension {
    return 3;
  }

  private initialized: boolean = false;

  private colorNode: IdentityNode;

  protected inputs: [Component];
  protected inputNode: Nodes.Node;

}
