import * as THREE from 'three';

const d3Color = require('d3-color');
const d3Chromatic = require('d3-scale-chromatic');
const d3Scale = require('d3-scale');


const colormapsInterpolators: { [name: string]: any } = {
  BrBG: d3Chromatic.interpolateBrBG,
  PRGn: d3Chromatic.interpolatePRGn,
  PiYG: d3Chromatic.interpolatePiYG,
  PuOr: d3Chromatic.interpolatePuOr,
  RdBu: d3Chromatic.interpolateRdBu,
  RdGy: d3Chromatic.interpolateRdGy,
  RdYlBu: d3Chromatic.interpolateRdYlBu,
  RdYlGn: d3Chromatic.interpolateRdYlGn,
  Spectral: d3Chromatic.interpolateSpectral,
  BuGn: d3Chromatic.interpolateBuGn,
  BuPu: d3Chromatic.interpolateBuPu,
  GnBu: d3Chromatic.interpolateGnBu,
  OrRd: d3Chromatic.interpolateOrRd,
  PuBuGn: d3Chromatic.interpolatePuBuGn,
  PuBu: d3Chromatic.interpolatePuBu,
  PuRd: d3Chromatic.interpolatePuRd,
  RdPu: d3Chromatic.interpolateRdPu,
  YlGnBu: d3Chromatic.interpolateYlGnBu,
  YlGn: d3Chromatic.interpolateYlGn,
  YlOrBr: d3Chromatic.interpolateYlOrBr,
  YlOrRd: d3Chromatic.interpolateYlOrRd,
  Blues: d3Chromatic.interpolateBlues,
  Greens: d3Chromatic.interpolateGreens,
  Greys: d3Chromatic.interpolateGreys,
  Purples: d3Chromatic.interpolatePurples,
  Reds: d3Chromatic.interpolateReds,
  Oranges: d3Chromatic.interpolateOranges,
  Cividis: d3Chromatic.interpolateCividis,
  CubehelixDefault: d3Chromatic.interpolateCubehelixDefault,
  Rainbow: d3Chromatic.interpolateRainbow,
  Warm: d3Chromatic.interpolateWarm,
  Cool: d3Chromatic.interpolateCool,
  Sinebow: d3Chromatic.interpolateSinebow,
  Turbo: d3Chromatic.interpolateTurbo,
  Viridis: d3Chromatic.interpolateViridis,
  Magma: d3Chromatic.interpolateMagma,
  Inferno: d3Chromatic.interpolateInferno,
  Plasma: d3Chromatic.interpolatePlasma
}


export
function getColorMapTexture (colorMapName: string): THREE.DataTexture {
  // Add support for log scales scaleSequentialLog
  const colorScale = d3Scale.scaleSequential(colormapsInterpolators[colorMapName]);

  const nColors = 1024;
  const colorsArray = new Uint8Array(nColors * 3);
  for (let i = 0; i < nColors; i++) {
    const color = d3Color.color(colorScale(i / (nColors - 1)));

    const colorIndex = 3 * i;

    colorsArray[colorIndex] = color.r;
    colorsArray[colorIndex + 1] = color.g;
    colorsArray[colorIndex + 2] = color.b;
  }

  return new THREE.DataTexture(colorsArray, nColors, 1, THREE.RGBFormat);
}
