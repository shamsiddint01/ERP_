import { Injectable, Optional } from '@nestjs/common';
import { DEFAULT_GRADING_SCALE, gradeForPercentage, type GradingBand } from './grading-scale.js';

/**
 * Thin injectable wrapper around the pure gradeForPercentage function — so
 * AssessmentsService depends on a swappable provider (DI token) rather than
 * a hardcoded function call. Replacing the grading system for the whole app
 * is then a one-line change: provide a different GradingScaleService (or
 * construct this one with a different scale) in ExamsModule, nothing in
 * AssessmentsService itself needs to change.
 *
 * `@Optional()` matters here, not just style: without it, Nest's DI tries to
 * resolve a provider for the constructor parameter's design type (a bare
 * `Array`) and fails hard at bootstrap ("Nest can't resolve dependencies of
 * the GradingScaleService... Array") — a real crash this surfaced, not a
 * theoretical one. With `@Optional()`, Nest passes `undefined` when nothing
 * provides that token, which — same as calling `new GradingScaleService()`
 * directly in a unit test — falls through to the default parameter value.
 */
@Injectable()
export class GradingScaleService {
  constructor(@Optional() private readonly scale: readonly GradingBand[] = DEFAULT_GRADING_SCALE) {}

  gradeFor(percentage: number): string {
    return gradeForPercentage(percentage, this.scale);
  }
}
