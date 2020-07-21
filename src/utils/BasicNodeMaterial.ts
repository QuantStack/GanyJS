import { BasicNode } from './BasicNode';

import * as Nodes from 'three/examples/jsm/nodes/Nodes';


export
class BasicNodeMaterial extends Nodes.NodeMaterial {

  // @ts-ignore
  constructor () {
    const node = new BasicNode();

    super(node, node);
  }

  type: string = "BasicNodeMaterial";

}

Nodes.NodeUtils.addShortcuts(BasicNodeMaterial.prototype, 'fragment', [
  'color',
  'alpha',
  'position',
]);
