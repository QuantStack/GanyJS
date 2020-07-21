import { BasicNode } from './BasicNode';

import * as Nodes from 'three/examples/jsm/nodes/Nodes';


export
class BasicNodeMaterial extends Nodes.NodeMaterial {

  // @ts-ignore
  constructor () {
    const node = new BasicNode();

    // @ts-ignore: https://github.com/mrdoob/three.js/pull/19897
    super(node, node);
  }

  color: Node;
  alpha: Node;
  position: Node;

  type: string = "BasicNodeMaterial";

}

// @ts-ignore
Nodes.NodeUtils.addShortcuts(BasicNodeMaterial.prototype, 'fragment', [
  'color',
  'alpha',
  'position',
]);
