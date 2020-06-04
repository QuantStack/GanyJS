import {
  SpecialEffect
} from '../EffectBlock';

import {
  Block
} from '../Block';


/**
 * Displays beautiful water with real-time caustics.
 **/
// TODO Inherit from something else than Effect
export
class Water extends Effect {

  constructor (parent: Block) {
    super(parent, input);



    this.initialized = true;
  }

  /**
   * Add the effect to a given scene
   */
  addToScene (scene: THREE.Scene) {
    super.addToScene(scene);

    // TODO Add the water mesh
  }

  private initialized: boolean = false;

}
