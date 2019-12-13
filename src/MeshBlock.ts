import * as THREE from 'three';

import {
  NodeMesh
} from './NodeMesh';

import {
  Block, BlockOptions
} from './Block';

import {
  Data
} from './Data';


/**
 * PolyMesh class
 */
export
class PolyMesh extends Block {

  constructor (vertices: Float32Array, triangleIndices: Uint32Array, data: Data[], options?: BlockOptions) {
    super(vertices, data, options);

    this._triangleIndices = triangleIndices;

    this.geometry = new THREE.BufferGeometry();

    const vertexBuffer = new THREE.BufferAttribute(vertices, 3);
    const indexBuffer = new THREE.BufferAttribute(triangleIndices, 1);

    this.geometry.setAttribute('position', vertexBuffer);
    this.geometry.setIndex(indexBuffer);

    this.mesh = new NodeMesh(THREE.Mesh, this.geometry, this.data);
    this.meshes.push(this.mesh);

    this.buildMaterial();
  }

  /**
   * Update vertices buffers
   */
  handleVerticesChange () {
    super.handleVerticesChange();

    this.mesh.vertices = this.vertices;
  }

  /**
   * Update index buffers
   */
  handleTriangleIndicesChange () {
    super.handleTriangleIndicesChange();

    if (this.triangleIndices == null) {
      this.geometry.copy(this.geometry.toNonIndexed());
    } else {
      const indexBuffer = new THREE.BufferAttribute(this.triangleIndices, 1);
      this.geometry.setIndex(indexBuffer);
    }

  }

  get boundingSphere () : THREE.Sphere {
    this.geometry.computeBoundingSphere();
    return this.geometry.boundingSphere;
  }

  _triangleIndices: Uint32Array;

  geometry: THREE.BufferGeometry;

  mesh: NodeMesh;

}


/**
 * TetraMesh class
 */
export
class TetraMesh extends PolyMesh {

  constructor (vertices: Float32Array, triangleIndices: Uint32Array, tetrahedronIndices: Uint32Array, data: Data[], options?: BlockOptions) {
    super(vertices, triangleIndices, data, options);

    this.tetrahedronIndices = tetrahedronIndices;
  }

  tetrahedronIndices: Uint32Array;

}


/**
 * PointCloud class
 */
export
class PointCloud extends Block {

  constructor (vertices: Float32Array, data: Data[], options?: BlockOptions) {
    super(vertices, data, options);

    this.geometry = new THREE.BufferGeometry();

    const vertexBuffer = new THREE.BufferAttribute(vertices, 3);

    this.geometry.setAttribute('position', vertexBuffer);

    this.mesh = new NodeMesh(THREE.Points, this.geometry, this.data);
    this.meshes.push(this.mesh);

    this.buildMaterial();
  }

  /**
   * Update vertices buffers
   */
  handleVerticesChange () {
    super.handleVerticesChange();

    this.mesh.vertices = this.vertices;
  }

  get boundingSphere () : THREE.Sphere {
    this.geometry.computeBoundingSphere();
    return this.geometry.boundingSphere;
  }

  geometry: THREE.BufferGeometry;

  mesh: NodeMesh;

}
