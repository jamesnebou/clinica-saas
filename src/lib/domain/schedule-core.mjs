export function totalAppointmentMinutes(items = [], { defaultDuration = 60, includeIntervals = false } = {}) {
  return Math.max(1, items.reduce((total, item) => (
    total
    + Number(item?.duracao_minutos || defaultDuration)
    + (includeIntervals ? Number(item?.intervalo_minutos || 0) : 0)
  ), 0));
}

export function intervalsOverlap(start, end, occupiedStart, occupiedEnd) {
  return Number(start) < Number(occupiedEnd) && Number(end) > Number(occupiedStart);
}
