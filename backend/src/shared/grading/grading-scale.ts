/**
 * A single grading band: a student scoring `min` percent or higher (and
 * below the next band's `min`) earns `grade`. Bands don't need to be
 * pre-sorted — gradeForPercentage sorts a defensive copy before evaluating.
 */
export interface GradingBand {
  min: number;
  grade: string;
}

/**
 * The default grading scale — deliberately NOT hardcoded inline anywhere a
 * score is evaluated (AssessmentsService only ever calls gradeForPercentage,
 * never compares a percentage to 90/80/70/... itself). Swap this array (or
 * pass a different `scale` into gradeForPercentage / construct
 * GradingScaleService with one) to change the grading system without
 * touching any assessment logic. A natural next step, if this ever needs to
 * vary per course/branch rather than being one global default, is to store a
 * scale like this as JSON on CompanySettings or Course and load it before
 * calling gradeForPercentage — the function itself already accepts any scale.
 */
export const DEFAULT_GRADING_SCALE: readonly GradingBand[] = [
  { min: 90, grade: 'A' },
  { min: 80, grade: 'B' },
  { min: 70, grade: 'C' },
  { min: 60, grade: 'D' },
  { min: 0, grade: 'F' },
];

/**
 * Highest band whose `min` the percentage meets or exceeds. Falls back to
 * the lowest band in the scale if percentage is somehow below every band's
 * min (only possible with a caller-supplied scale that doesn't bottom out at
 * 0) rather than throwing — grading a valid 0-100 score should never fail.
 */
export function gradeForPercentage(percentage: number, scale: readonly GradingBand[] = DEFAULT_GRADING_SCALE): string {
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  const band = sorted.find((b) => percentage >= b.min);
  return (band ?? sorted[sorted.length - 1])?.grade ?? 'F';
}
