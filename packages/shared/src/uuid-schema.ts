import { z } from 'zod';
// Use Zod's built‑in UUID validator to enforce RFC‑4122 format (v4 or other standard versions).
export const uuidSchema = z.string().uuid();
export type UUID = string;