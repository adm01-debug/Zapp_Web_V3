export type ScheduleMessageResult = boolean | void;

export function buildScheduledLocalDate(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  const [y, mo, d] = date.split('-').map(Number);
  if (
    !Number.isInteger(y) ||
    !Number.isInteger(mo) ||
    !Number.isInteger(d) ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes)
  ) {
    return null;
  }

  const scheduled = new Date(y, mo - 1, d, hours, minutes);
  if (Number.isNaN(scheduled.getTime())) return null;

  if (
    scheduled.getFullYear() !== y ||
    scheduled.getMonth() !== mo - 1 ||
    scheduled.getDate() !== d ||
    scheduled.getHours() !== hours ||
    scheduled.getMinutes() !== minutes
  ) {
    return null;
  }

  return scheduled;
}
