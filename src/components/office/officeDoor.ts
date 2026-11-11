/** CHOICE.json → office-v8-sanya-merged.png, registered at [0,32,960,536].
 * The brown entrance door with a silver handle is at the bottom right,
 * immediately right of Sanya's desk, below the blanket bed (not the cooler).
 */
export const OFFICE_DOOR_RECT = { x: 754, y: 478, width: 98, height: 90 } as const;
// Nearest 4px floor cell to the middle of the upper door jamb [803,478].
// Feet stop just above the painted jamb; the door itself is not walkable.
export const OFFICE_DOOR = { x: 804, y: 476 } as const;
// The blue bottle/dispenser is on the right wall, above the coffee machine.
export const OFFICE_COOLER_RECT = { x: 889, y: 320, width: 44, height: 138 } as const;
export const DOOR_FADE_SECONDS = .3;
