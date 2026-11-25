// The three courses, their palettes and unlock rules.

import { meadow } from './meadow.js';
import { seaside } from './seaside.js';
import { attic } from './attic.js';

export const UNLOCK_THIMBLES = 15; // thimbles needed in a course to open the next one

export const COURSES = [
  {
    id: 'meadow',
    name: 'Meadow Quilt',
    blurb: 'Rolling felt hills, a pond and the first elastic bands.',
    theme: 'meadow',
    holes: meadow,
  },
  {
    id: 'seaside',
    name: 'Seaside Bunting',
    blurb: 'Button ferries, zip piers and ribbon bridges over a denim sea.',
    theme: 'seaside',
    holes: seaside,
  },
  {
    id: 'attic',
    name: 'Attic Sewing Box',
    blurb: 'Needles, cotton reels, loose threads and a draughty fan.',
    theme: 'attic',
    holes: attic,
  },
];

for (const c of COURSES) c.holes.forEach((h, i) => Object.assign(h, { course: c.id, theme: h.theme || c.theme, number: i + 1 }));

export const ALL_HOLES = COURSES.flatMap((c) => c.holes);

export function findHole(id) {
  return ALL_HOLES.find((h) => h.id === id) || null;
}

/** 3 thimbles at or under par, 2 at one over, 1 for finishing. */
export function thimblesFor(strokes, par) {
  if (strokes <= par) return 3;
  if (strokes === par + 1) return 2;
  return 1;
}

export function courseThimbles(course, store) {
  return course.holes.reduce((n, h) => n + (store.hole(h.id)?.thimbles || 0), 0);
}

export function courseUnlocked(index, store) {
  if (index === 0) return true;
  return courseThimbles(COURSES[index - 1], store) >= UNLOCK_THIMBLES && courseUnlocked(index - 1, store);
}
