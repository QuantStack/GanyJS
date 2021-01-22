import * as THREE from 'three';

const d3Color = require('d3-color');
const d3Chromatic = require('d3-scale-chromatic');


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
enum ScaleType {
  linear='linear',
  log='log',
}


export
function getColorInterpolator (colorMapName: string): (v: number) => string {
  return colormapsInterpolators[colorMapName];
}


export
function getColorMapTexture (colorInterpolator: (value: number) => string): THREE.DataTexture {
  const nColors = 1024;
  const colorsArray = new Uint8Array(nColors * 3);
  for (let i = 0; i < nColors; i++) {
    const color = d3Color.color(colorInterpolator(i / (nColors - 1)));

    const colorIndex = 3 * i;

    colorsArray[colorIndex] = color.r;
    colorsArray[colorIndex + 1] = color.g;
    colorsArray[colorIndex + 2] = color.b;
  }

  return new THREE.DataTexture(colorsArray, nColors, 1, THREE.RGBFormat);
}


export
function getColorBar (
    colorInterpolator: (v: number) => string,
    range: number[],
    type: ScaleType,
    format: (v: number) => string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');

  updateColorBar(canvas, colorInterpolator, range, type, format);

  return canvas;
}


export
function updateColorBar (
    canvas: HTMLCanvasElement,
    colorInterpolator: (v: number) => string,
    range: number[],
    type: ScaleType,
    format: (v: number) => string): void {
  const ctx = canvas.getContext('2d');

  const width = 1024;

  canvas.width = width;
  canvas.height = 100;

  if (ctx === null) {
    throw 'Failed to create canvas context for the colorbar';
  }

  ctx.save();

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'black';
  ctx.font = '35px Open Sans';

  ctx.textAlign = 'start'
  ctx.fillText(format(range[0]), 0, 100);

  ctx.textAlign = 'center';
  if (type == ScaleType.linear) {
    ctx.fillText(format(range[1] + (range[0] - range[1]) * 0.75), width / 4, 100);
    ctx.fillText(format(range[1] + (range[0] - range[1]) * 0.5), width / 2, 100);
    ctx.fillText(format(range[1] + (range[0] - range[1]) * 0.25), width * 3 / 4, 100);
  } else {
    ctx.fillText(format(Math.pow(Math.E, (Math.log(range[0])+(Math.log(range[1])-Math.log(range[0]))*0.25))), width / 4, 100);
    ctx.fillText(format(Math.pow(Math.E, (Math.log(range[0])+(Math.log(range[1])-Math.log(range[0]))*0.5))), width / 2, 100);
    ctx.fillText(format(Math.pow(Math.E, (Math.log(range[0])+(Math.log(range[1])-Math.log(range[0]))*0.75))), width * 3 / 4, 100);
  }

  ctx.textAlign = 'end'
  ctx.fillText(format(range[1]), width, 100);

  for (let i = 0; i < width; ++i) {
    ctx.fillStyle = colorInterpolator(i / (width - 1));
    ctx.fillRect(i, 0, 1, 60);
  }

  // Draw outline and tick lines
  ctx.lineWidth = 4;
  ctx.fillStyle = 'black';
  ctx.strokeRect(0, 0, width, 60);

  ctx.beginPath();
  ctx.moveTo(0, 52);
  ctx.lineTo(0, 68);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width / 4, 52);
  ctx.lineTo(width / 4, 68);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width / 2, 52);
  ctx.lineTo(width / 2, 68);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width * 3 / 4, 52);
  ctx.lineTo(width * 3 / 4, 68);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width, 52);
  ctx.lineTo(width, 68);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}
