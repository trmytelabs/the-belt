export type ScoreState = {
  score: number;
  combo: number;
  errors: number;
  sortedCount: number;
  missedCount: number;
  bulkSortedCount: number;
};

export class ScoreSystem {
  private state: ScoreState = {
    score: 0,
    combo: 0,
    errors: 0,
    sortedCount: 0,
    missedCount: 0,
    bulkSortedCount: 0,
  };

  public addScore(n: number): number {
    this.state.score += n;
    return this.state.score;
  }

  public incrementCombo(): number {
    this.state.combo += 1;
    return this.state.combo;
  }

  public resetCombo(): void {
    this.state.combo = 0;
  }

  public addError(): number {
    this.state.errors += 1;
    return this.state.errors;
  }

  public addSorted(): void {
    this.state.sortedCount += 1;
  }

  public addMissedCorrect(): void {
    this.state.missedCount += 1;
    this.state.sortedCount += 1;
  }

  public addBulkSorted(): void {
    this.state.bulkSortedCount += 1;
    this.state.sortedCount += 1;
  }

  public getState(): ScoreState {
    return { ...this.state };
  }

  public reset(): void {
    this.state = {
      score: 0,
      combo: 0,
      errors: 0,
      sortedCount: 0,
      missedCount: 0,
      bulkSortedCount: 0,
    };
  }
}
