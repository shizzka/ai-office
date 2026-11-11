/** Public read-only OFFICE-25 projection. Stream responses omit private fields. */
export interface OfficeStatsCounters {
  potsBroken: number;
  pizzas: number;
  shortCircuits: number;
  breakerChecks: number;
  standups: number;
  catChases: number;
  keyboards: number;
  laserGames: number;
  officeNights: number;
  mattressNights: number;
  urgentArrivals: number;
  blackouts: number;
}
export interface OfficeStatsTotals {
  bugsFound: number | null;
  bugsClosed: number | null;
  tasksCreated: number | null;
  tasksDone: number | null;
  regressionsPassed: number | null;
  regressionsFailed: number | null;
  loops: number | null;
  reviews: number | null;
  vacancies?: number;
}
export interface OfficeProjectStats extends OfficeStatsTotals { id: string; name: string }
export interface OfficeStatsSnapshot {
  since: string;
  updatedAt: number;
  counters: OfficeStatsCounters;
  totals: OfficeStatsTotals;
  projects: OfficeProjectStats[];
}
