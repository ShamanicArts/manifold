// Small, renderer-neutral building blocks for authored physical interfaces.
// Coordinates are measured from the image's top-left; world Y points upward.
export function imagePixelPoint(x, y, imageWidth, imageHeight, worldWidth, worldHeight) {
  if (![x,y,imageWidth,imageHeight,worldWidth,worldHeight].every(Number.isFinite)
      || imageWidth <= 0 || imageHeight <= 0 || worldWidth <= 0 || worldHeight <= 0)
    throw new RangeError('Image and world dimensions must be positive finite numbers');
  return {x:(x/imageWidth-.5)*worldWidth, y:(.5-y/imageHeight)*worldHeight};
}

export function imagePixelRect(x, y, width, height, imageWidth, imageHeight, worldWidth, worldHeight) {
  const center=imagePixelPoint(x+width/2,y+height/2,imageWidth,imageHeight,worldWidth,worldHeight);
  return {...center,width:width/imageWidth*worldWidth,height:height/imageHeight*worldHeight};
}

// Use measured audio analysis for presentation only; the graph owns audio time.
export function followTelemetry(current, target, elapsedSeconds, responsePerSecond) {
  return current+(target-current)*(1-Math.exp(-Math.max(0,elapsedSeconds)*responsePerSecond));
}
