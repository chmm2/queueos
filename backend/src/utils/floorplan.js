/**
 * Floor-plan geometry.
 *
 * A branch's floor plan is a fixed grid; a room sits on it as a rectangle
 * measured in grid cells. Nothing in the queue logic reads these numbers —
 * they exist so an admin can SEE the branch — which is exactly why they are
 * validated strictly here: a bad layout must never be able to hurt anything
 * else, and must never be stored in a shape the page can't draw.
 */
const FLOOR = { cols: 24, rows: 14 };
const MIN_SIZE = 2; // a room smaller than 2x2 cells can't hold its own label

/**
 * Turn untrusted input into a layout that is guaranteed to sit on the grid,
 * or return null if it isn't a layout at all.
 *
 * Out-of-range values are clamped rather than rejected, so dragging a room a
 * little past the edge pins it to the edge instead of throwing an error at
 * someone mid-drag.
 */
function sanitizeLayout(input, floor = FLOOR) {
  if (!input || typeof input !== 'object') return null;

  const nums = {};
  for (const key of ['x', 'y', 'w', 'h']) {
    const n = Number(input[key]);
    if (!Number.isFinite(n)) return null;
    nums[key] = Math.round(n);
  }

  const w = Math.min(Math.max(nums.w, MIN_SIZE), floor.cols);
  const h = Math.min(Math.max(nums.h, MIN_SIZE), floor.rows);
  // Clamp the position AFTER the size, so the whole rectangle stays on the grid.
  const x = Math.min(Math.max(nums.x, 0), floor.cols - w);
  const y = Math.min(Math.max(nums.y, 0), floor.rows - h);
  return { x, y, w, h };
}

module.exports = { FLOOR, MIN_SIZE, sanitizeLayout };
