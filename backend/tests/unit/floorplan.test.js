const { FLOOR, sanitizeLayout } = require('../../src/utils/floorplan');

describe('sanitizeLayout', () => {
  test('passes a valid rectangle through unchanged', () => {
    expect(sanitizeLayout({ x: 3, y: 2, w: 5, h: 4 })).toEqual({ x: 3, y: 2, w: 5, h: 4 });
  });

  test('rejects anything that is not four finite numbers', () => {
    expect(sanitizeLayout(null)).toBeNull();
    expect(sanitizeLayout('nope')).toBeNull();
    expect(sanitizeLayout({ x: 1, y: 1, w: 4 })).toBeNull(); // missing h
    expect(sanitizeLayout({ x: 'a', y: 1, w: 4, h: 4 })).toBeNull();
    expect(sanitizeLayout({ x: 1, y: 1, w: Infinity, h: 4 })).toBeNull();
    expect(sanitizeLayout({ x: NaN, y: 1, w: 4, h: 4 })).toBeNull();
  });

  test('rounds fractional cells to whole cells', () => {
    expect(sanitizeLayout({ x: 2.6, y: 1.2, w: 4.4, h: 3.5 })).toEqual({ x: 3, y: 1, w: 4, h: 4 });
  });

  test('pins a room dragged past the edge back onto the grid', () => {
    const r = sanitizeLayout({ x: 99, y: 99, w: 5, h: 4 });
    expect(r.x + r.w).toBeLessThanOrEqual(FLOOR.cols);
    expect(r.y + r.h).toBeLessThanOrEqual(FLOOR.rows);
    expect(r).toEqual({ x: FLOOR.cols - 5, y: FLOOR.rows - 4, w: 5, h: 4 });
  });

  test('never lets a position go negative', () => {
    expect(sanitizeLayout({ x: -7, y: -2, w: 4, h: 4 })).toEqual({ x: 0, y: 0, w: 4, h: 4 });
  });

  test('enforces a minimum size so the label always fits', () => {
    const r = sanitizeLayout({ x: 0, y: 0, w: 0, h: -3 });
    expect(r.w).toBe(2);
    expect(r.h).toBe(2);
  });

  test('caps a room at the size of the whole floor', () => {
    const r = sanitizeLayout({ x: 0, y: 0, w: 500, h: 500 });
    expect(r).toEqual({ x: 0, y: 0, w: FLOOR.cols, h: FLOOR.rows });
  });

  test('clamps position after size, so a grown room still fits', () => {
    // 20 wide starting at x=10 would overflow a 24-column floor: slide it left.
    expect(sanitizeLayout({ x: 10, y: 0, w: 20, h: 4 })).toEqual({ x: 4, y: 0, w: 20, h: 4 });
  });
});
