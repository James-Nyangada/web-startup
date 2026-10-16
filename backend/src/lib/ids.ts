import { v7 } from 'uuid';

/** Time-ordered UUID v7, generated in the app (spec 0.1). */
export const newId = (): string => v7();
