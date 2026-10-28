// Deliberately excludes red, green and amber workflow/status hues.
export const employeePalette = ["#b8cafa","#cab7ef","#afd4ed","#d5bddf","#b7c0d2","#afd2d9","#c1bfe7","#c5ccdc"];
export function employeeColor(id: number | string, configured?: string | null) {
  if (configured && employeePalette.includes(configured)) return configured;
  let hash=0; for(const ch of String(id)) hash=(hash*31+ch.charCodeAt(0))>>>0;
  return employeePalette[hash % employeePalette.length];
}
