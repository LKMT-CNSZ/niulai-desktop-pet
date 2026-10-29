'use strict';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampBoundsToWorkArea(bounds, workArea, size = 300) {
  const maxX = workArea.x + Math.max(0, workArea.width - size);
  const maxY = workArea.y + Math.max(0, workArea.height - size);
  return {
    x: Math.round(clamp(bounds.x, workArea.x, maxX)),
    y: Math.round(clamp(bounds.y, workArea.y, maxY)),
    width: size,
    height: size
  };
}

function stepHorizontal(bounds, workArea, direction, distance, size = 300) {
  const clamped = clampBoundsToWorkArea(bounds, workArea, size);
  const minX = workArea.x;
  const maxX = workArea.x + Math.max(0, workArea.width - size);
  let nextDirection = direction >= 0 ? 1 : -1;
  let x = clamped.x + nextDirection * Math.max(0, distance);
  if (x >= maxX) {
    x = maxX;
    nextDirection = -1;
  } else if (x <= minX) {
    x = minX;
    nextDirection = 1;
  }
  return {
    bounds: { x: Math.round(x), y: clamped.y, width: size, height: size },
    direction: nextDirection
  };
}

function pointInLocalRegion(screenPoint, windowBounds, localRegion) {
  const localX = screenPoint.x - windowBounds.x;
  const localY = screenPoint.y - windowBounds.y;
  return localX >= localRegion.x &&
    localY >= localRegion.y &&
    localX < localRegion.x + localRegion.width &&
    localY < localRegion.y + localRegion.height;
}

function quoteSideForWindow(bounds, workArea, size = 300, edgeGuard = 132) {
  const safeBounds = clampBoundsToWorkArea(bounds, workArea, size);
  const leftRoom = safeBounds.x - workArea.x;
  const rightRoom = workArea.x + workArea.width - (safeBounds.x + size);
  if (leftRoom < edgeGuard && rightRoom >= leftRoom) return 'right';
  if (rightRoom < edgeGuard && leftRoom > rightRoom) return 'left';
  const windowCenter = safeBounds.x + size / 2;
  const workAreaCenter = workArea.x + workArea.width / 2;
  return windowCenter <= workAreaCenter ? 'right' : 'left';
}

module.exports = {
  clampBoundsToWorkArea,
  pointInLocalRegion,
  quoteSideForWindow,
  stepHorizontal
};
