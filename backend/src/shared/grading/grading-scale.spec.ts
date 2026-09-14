import { describe, expect, it } from 'vitest';
import { DEFAULT_GRADING_SCALE, gradeForPercentage, type GradingBand } from './grading-scale.js';
import { GradingScaleService } from './grading-scale.service.js';

describe('gradeForPercentage (default scale)', () => {
  it.each([
    [100, 'A'],
    [90, 'A'],
    [89.99, 'B'],
    [80, 'B'],
    [79.99, 'C'],
    [70, 'C'],
    [69.99, 'D'],
    [60, 'D'],
    [59.99, 'F'],
    [0, 'F'],
  ])('%s%% -> %s', (percentage, expected) => {
    expect(gradeForPercentage(percentage)).toBe(expected);
  });

  it('is a pure function of the given scale — never mutates DEFAULT_GRADING_SCALE', () => {
    const before = [...DEFAULT_GRADING_SCALE];
    gradeForPercentage(85);
    expect(DEFAULT_GRADING_SCALE).toEqual(before);
  });
});

describe('gradeForPercentage (custom scale — proves the system is configurable, not hardcoded)', () => {
  const passFailScale: GradingBand[] = [
    { min: 50, grade: 'PASS' },
    { min: 0, grade: 'FAIL' },
  ];

  it('grades entirely differently under a different scale', () => {
    expect(gradeForPercentage(60, passFailScale)).toBe('PASS');
    expect(gradeForPercentage(40, passFailScale)).toBe('FAIL');
  });

  it('does not care about the order bands are declared in', () => {
    const reversed = [...passFailScale].reverse();
    expect(gradeForPercentage(60, reversed)).toBe('PASS');
  });
});

describe('GradingScaleService', () => {
  it('defaults to DEFAULT_GRADING_SCALE when constructed with no arguments', () => {
    const service = new GradingScaleService();
    expect(service.gradeFor(95)).toBe('A');
    expect(service.gradeFor(55)).toBe('F');
  });

  it('can be constructed with a wholly different scale, proving the grading system is replaceable', () => {
    const service = new GradingScaleService([
      { min: 95, grade: 'Excellent' },
      { min: 0, grade: 'Needs improvement' },
    ]);
    expect(service.gradeFor(96)).toBe('Excellent');
    expect(service.gradeFor(50)).toBe('Needs improvement');
  });
});
