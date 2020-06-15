import * as THREE from 'three';

export
function uuid() : string {
  return 'v' + THREE.MathUtils.generateUUID().replace(/-/gi, '');
}
