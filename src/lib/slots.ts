export const EXAM_TIMINGS = [
  { label: 'Slot 1 – 07:30 AM', value: '07:30' },
  { label: 'Slot 2 – 10:30 AM', value: '10:30' },
  { label: 'Slot 3 – 01:00 PM', value: '13:00' },
  { label: 'Slot 4 – 03:30 PM', value: '15:30' },
];

export const SLOT_LABEL_MAP = Object.fromEntries(EXAM_TIMINGS.map((t) => [t.value, t.label]));

export function slotLabel(time: string): string {
  return SLOT_LABEL_MAP[time] || time;
}
