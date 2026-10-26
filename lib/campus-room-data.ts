/**
 * Campus room data for the 3D holographic route.
 *
 * Verified findings (research, Sep 2026):
 *  - ALL B.Tech first-year classes are in Academic Block-1 (AB1).
 *    Source: student campus experience (GeeksforGeeks) + multiple reviews.
 *  - AB1: first-year + CSE + Applied Science + Central Library.
 *  - AB2 (9-floor tower): ECE/ME/Civil/IT/EEE/MBA.
 *  - Room numbers encode the floor (e.g. 416 = 4th floor; real timetable
 *    shows "Room 704 AB-2" for 7th floor Block-2; LinkedIn events show
 *    "Room no. 322, AB-1" and "GLBCRI, 2nd Floor, AB-1").
 *
 * AB1 real geometry from the actual campus GLB model (face nodes AB1 F/L/R/B):
 *  - Building envelope: x 68.5..131.5, y -0.4..26.2 (4 floors), z -95.4..-8.5.
 *  - Entrance facade (Left face, faces the gate at z=44): x 74.7..125.3,
 *    z -33.9..-14.8, ~50.5m wide. Rooms open onto this face.
 */

export const AB1_GEOM = {
  minX: 68.5,
  maxX: 131.5,
  minY: -0.4,
  maxY: 26.2,
  minZ: -95.4,
  maxZ: -8.5,
  floors: 4,
};

export const AB1_FACADE = {
  minX: 74.7,
  maxX: 125.3,
  z: -24.4,
};

export function floorHeight(): number {
  return (AB1_GEOM.maxY - AB1_GEOM.minY) / AB1_GEOM.floors;
}

export function floorOfRoom(room: string | number): number {
  const n = Number(room);
  return Number.isFinite(n) && n >= 100 ? Math.floor(n / 100) : 1;
}

/**
 * X position on a facade for a room, spread by its number (last two digits).
 * Rooms 4xx are spread across AB1's ~50m facade so each section's marker
 * sits in a distinct bay.
 */
export function facadeSlotX(room: string | number, minX: number, maxX: number, pad = 3): number {
  const n = Number(room) || 0;
  const frac = n > 0 ? ((n % 100) - 1) / 99 : 0.5;
  return minX + pad + (maxX - minX - pad * 2) * frac;
}

/** Vertical center of a floor across a building's height. */
export function floorCenterY(floor: number, minY: number, maxY: number, floors: number): number {
  const h = (maxY - minY) / floors;
  return minY + (Math.min(Math.max(floor, 1), floors) - 0.5) * h;
}

/**
 * Model-space position of a room on AB1's entrance facade.
 * The exact door is estimated — the model does not encode individual room
 * numbers — but building + floor + facade are real.
 */
export function roomModelPosition(room: string | number): { x: number; y: number; z: number } {
  const x = facadeSlotX(room, AB1_FACADE.minX, AB1_FACADE.maxX);
  const y = floorCenterY(floorOfRoom(room), AB1_GEOM.minY, AB1_GEOM.maxY, AB1_GEOM.floors);
  const z = AB1_FACADE.z;
  return { x, y, z };
}