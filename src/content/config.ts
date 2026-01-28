import { defineCollection, reference, z } from 'astro:content';

const mice = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    shape: z.string().optional(),
    weight: z.string().optional(),
    connection: z.enum(['wired', 'wireless', 'both']).optional(),
    amazonUrl: z.string().url().optional(),
  }),
});

const monitors = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    size: z.string().optional(),
    refreshRate: z.string().optional(),
    panel: z.string().optional(),
    resolution: z.string().optional(),
    amazonUrl: z.string().url().optional(),
  }),
});

const keyboards = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    size: z.enum(['full', 'tkl', '75%', '65%', '60%']).optional(),
    switches: z.string().optional(),
    amazonUrl: z.string().url().optional(),
  }),
});

const mousepads = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    surface: z.enum(['cloth', 'hybrid', 'glass', 'hard']).optional(),
    size: z.string().optional(),
    amazonUrl: z.string().url().optional(),
  }),
});

const headphones = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    type: z.enum(['over-ear', 'on-ear', 'in-ear', 'speakers']).optional(),
    connection: z.enum(['wired', 'wireless', 'both']).optional(),
    amazonUrl: z.string().url().optional(),
  }),
});

const players = defineCollection({
  type: 'data',
  schema: z.object({
    nickname: z.string(),
    mouse: reference('mice').optional(),
    mousepad: reference('mousepads').optional(),
    keyboard: reference('keyboards').optional(),
    monitor: reference('monitors').optional(),
    headphones: reference('headphones').optional(),
    invertedMouse: z.boolean().default(false),
    mouseDPI: z.number().optional(),
    inGameSensitivity: z.number().optional(),
    eDPI: z.number().optional(),
    cm360: z.number().optional(),
    acceleration: z.number().optional(),
    fov: z.number().optional(),
    crosshair: z.string().optional(),
    crosshairColor: z.string().optional(),
    movementBinds: z.string().optional(),
    cfgLinks: z.string().optional(),
  }),
});

export const collections = {
  mice,
  monitors,
  keyboards,
  mousepads,
  headphones,
  players,
};
