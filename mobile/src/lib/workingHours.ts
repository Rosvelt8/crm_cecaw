import { WORKING_DAYS, WORKING_HOURS } from '../config';

/**
 * Le tracking en arriere-plan ne doit tourner que sur le temps de travail :
 * hors de cette plage, la position n'est ni relevee ni transmise.
 */
export function isWithinWorkingHours(date = new Date()): boolean {
  if (!WORKING_DAYS.includes(date.getDay())) return false;
  const hour = date.getHours();
  return hour >= WORKING_HOURS.start && hour < WORKING_HOURS.end;
}

export function workingHoursLabel(): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(WORKING_HOURS.start)}h00 - ${two(WORKING_HOURS.end)}h00, du lundi au samedi`;
}
