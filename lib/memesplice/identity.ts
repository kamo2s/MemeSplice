import {z} from 'zod';

// Shared by AI output, editable drafts, and the final Pump metadata review.
export const IDENTITY_LIMITS={nameBytes:32,ticker:13,lore:600} as const;
export const nameBytes=(value:string)=>new TextEncoder().encode(value.trim()).length;
export const offspringName=z.string().trim().min(1).max(IDENTITY_LIMITS.nameBytes)
 .refine(value=>nameBytes(value)<=IDENTITY_LIMITS.nameBytes,'Use at most 32 UTF-8 bytes for the name.');
export const offspringTicker=z.string().trim().regex(/^[A-Za-z0-9]{1,13}$/);
export const offspringLore=z.string().trim().min(1).max(IDENTITY_LIMITS.lore);
