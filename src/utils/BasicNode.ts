import * as Nodes from 'three/examples/jsm/nodes/Nodes';


// TODO Remove this when we use https://github.com/mrdoob/three.js/pull/19896
interface Flow {
  result: string;
  code: string;
  extra: string;
}


export
class BasicNode extends Nodes.Node {

  constructor () {
    super();

    this.color = new Nodes.ColorNode(0xFFFFFF);
  }

  build (builder: Nodes.NodeBuilder): string {
    let code: string;

    builder.extensions = {
      derivatives: true
    };

    if (builder.isShader('vertex')) {

      // @ts-ignore: https://github.com/mrdoob/three.js/pull/19896
      const position: Flow | undefined = this.position ? this.position.analyzeAndFlow(builder, 'v3', { cache: 'position' }) : undefined;

      const output = [
        "#include <begin_vertex>"
      ];

      if (position) {
        output.push(
          position.code,
          position.result ? "transformed = " + position.result + ";" : ''
        );
      }

      output.push(
        "#include <worldpos_vertex>",
      );

      code = output.join( "\n" );
    } else {
      // Analyze all nodes to reuse generate codes
      this.color.analyze(builder, { slot: 'color' });

      if (this.alpha) this.alpha.analyze( builder );

      // Build code
      // @ts-ignore: https://github.com/mrdoob/three.js/pull/19896
      const color: Flow = this.color.flow(builder, 'c', { slot: 'color' });
      // @ts-ignore: https://github.com/mrdoob/three.js/pull/19896
      const alpha: Flow | undefined = this.alpha ? this.alpha.flow( builder, 'f' ) : undefined;

      // @ts-ignore: See https://github.com/mrdoob/three.js/pull/19895
      builder.requires.transparent = alpha !== undefined;

      const output = [
        color.code,
      ];

      if (alpha) {
        output.push(
          alpha.code,
          '#ifdef ALPHATEST',

          ' if ( ' + alpha.result + ' <= ALPHATEST ) discard;',

          '#endif'
        );
      }

      if (alpha) {
        output.push( "gl_FragColor = vec4(" + color.result + ", " + alpha.result + " );");
      } else {
        output.push( "gl_FragColor = vec4(" + color.result + ", 1.0 );");
      }

      code = output.join( "\n" );
    }

    return code;
  }

  alpha: Nodes.Node | null;
  position: Nodes.Node | null;
  color: Nodes.Node;

  static nodeType: string = 'Basic';

}

// StandardNode.prototype.copy = function ( source ) {

//   Node.prototype.copy.call( this, source );

//   // vertex

//   if ( source.position ) this.position = source.position;

//   // fragment

//   this.color = source.color;
//   this.roughness = source.roughness;
//   this.metalness = source.metalness;

//   if ( source.mask ) this.mask = source.mask;

//   if ( source.alpha ) this.alpha = source.alpha;

//   if ( source.normal ) this.normal = source.normal;

//   if ( source.clearcoat ) this.clearcoat = source.clearcoat;
//   if ( source.clearcoatRoughness ) this.clearcoatRoughness = source.clearcoatRoughness;
//   if ( source.clearcoatNormal ) this.clearcoatNormal = source.clearcoatNormal;

//   if ( source.reflectivity ) this.reflectivity = source.reflectivity;

//   if ( source.light ) this.light = source.light;
//   if ( source.shadow ) this.shadow = source.shadow;

//   if ( source.ao ) this.ao = source.ao;

//   if ( source.emissive ) this.emissive = source.emissive;
//   if ( source.ambient ) this.ambient = source.ambient;

//   if ( source.environment ) this.environment = source.environment;

//   if ( source.sheen ) this.sheen = source.sheen;

//   return this;

// };

// StandardNode.prototype.toJSON = function ( meta ) {

//   var data = this.getJSONNode( meta );

//   if ( ! data ) {

//     data = this.createJSONNode( meta );

//     // vertex

//     if ( this.position ) data.position = this.position.toJSON( meta ).uuid;

//     // fragment

//     data.color = this.color.toJSON( meta ).uuid;
//     data.roughness = this.roughness.toJSON( meta ).uuid;
//     data.metalness = this.metalness.toJSON( meta ).uuid;

//     if ( this.mask ) data.mask = this.mask.toJSON( meta ).uuid;

//     if ( this.alpha ) data.alpha = this.alpha.toJSON( meta ).uuid;

//     if ( this.normal ) data.normal = this.normal.toJSON( meta ).uuid;

//     if ( this.clearcoat ) data.clearcoat = this.clearcoat.toJSON( meta ).uuid;
//     if ( this.clearcoatRoughness ) data.clearcoatRoughness = this.clearcoatRoughness.toJSON( meta ).uuid;
//     if ( this.clearcoatNormal ) data.clearcoatNormal = this.clearcoatNormal.toJSON( meta ).uuid;

//     if ( this.reflectivity ) data.reflectivity = this.reflectivity.toJSON( meta ).uuid;

//     if ( this.light ) data.light = this.light.toJSON( meta ).uuid;
//     if ( this.shadow ) data.shadow = this.shadow.toJSON( meta ).uuid;

//     if ( this.ao ) data.ao = this.ao.toJSON( meta ).uuid;

//     if ( this.emissive ) data.emissive = this.emissive.toJSON( meta ).uuid;
//     if ( this.ambient ) data.ambient = this.ambient.toJSON( meta ).uuid;

//     if ( this.environment ) data.environment = this.environment.toJSON( meta ).uuid;

//     if ( this.sheen ) data.sheen = this.sheen.toJSON( meta ).uuid;

//   }

//   return data;

// };
