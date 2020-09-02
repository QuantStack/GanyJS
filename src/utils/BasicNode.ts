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

      const vertexExpressions: Flow[] = this.vertexExpressions.map((expr) => expr.analyzeAndFlow(builder, 'void') as Flow);

      // @ts-ignore
      builder.addParsCode( [
        "varying vec3 vViewPosition;",

        "#ifndef FLAT_SHADED",

        " varying vec3 vNormal;",

        "#endif",
      ].join( "\n" ) );

      const output = [
        "#include <beginnormal_vertex>",
        "#include <defaultnormal_vertex>",

        "#ifndef FLAT_SHADED", // Normal computed with derivatives when FLAT_SHADED

        " vNormal = normalize( transformedNormal );",

        "#endif",

        "#include <begin_vertex>",
      ];

      for (const expr of vertexExpressions) {
        output.push(expr.code);
      }

      if (position) {
        output.push(
          position.code,
          position.result ? "transformed = " + position.result + ";" : ''
        );
      }

      output.push(
        "#include <project_vertex>",

        " vViewPosition = - mvPosition.xyz;",

        "#include <worldpos_vertex>",
      );

      for (const expr of vertexExpressions) {
        output.push(expr.result + ';');
      }

      code = output.join("\n");
    } else {
      // Analyze all nodes to reuse generate codes
      if ( this.mask ) this.mask.analyze( builder );

      this.color.analyze(builder, { slot: 'color' });

      if (this.alpha) this.alpha.analyze( builder );

      // Build code
      // @ts-ignore: https://github.com/mrdoob/three.js/pull/19896
      const mask: Flow = this.mask ? this.mask.flow( builder, 'b' ) : undefined;
      // @ts-ignore: https://github.com/mrdoob/three.js/pull/19896
      const color: Flow = this.color.flow(builder, 'c', { slot: 'color' });
      // @ts-ignore: https://github.com/mrdoob/three.js/pull/19896
      const alpha: Flow | undefined = this.alpha ? this.alpha.flow( builder, 'f' ) : undefined;

      // @ts-ignore: See https://github.com/mrdoob/three.js/pull/19895
      // builder.requires.transparent = alpha !== undefined;

      // @ts-ignore
      builder.addParsCode( [
        "varying vec3 vViewPosition;",

        "#ifndef FLAT_SHADED",

        " varying vec3 vNormal;",

        "#endif",
      ].join( "\n" ) );

      const output = [
        // add before: prevent undeclared normal
        " #include <normal_fragment_begin>",
      ];

      if ( mask ) {
        output.push(
          mask.code,
          'if ( ! ' + mask.result + ' ) discard;'
        );
      }

      output.push(color.code);

      if (alpha) {
        output.push(
          alpha.code,
          // '#ifdef ALPHATEST',

          // ' if ( ' + alpha.result + ' <= ALPHATEST ) discard;',

          // '#endif'
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
  mask: Nodes.Node | null;

  vertexExpressions: Nodes.FunctionCallNode[] = [];
  fragmentExpressions: Nodes.FunctionCallNode[] = [];

  static nodeType: string = 'Basic';

}
