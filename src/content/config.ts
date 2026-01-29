import { defineCollection, z } from 'astro:content';

// ============================================
// HARDWARE COLLECTIONS
// ============================================

const miceCollection = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    weight: z.string(),
    shape: z.enum(['Ambidextrous', 'Ergonomic (Right)', 'Ergonomic (Left)']),
    dimensions: z.string().optional(),
    sensor: z.string(),
    dpiRange: z.string(),
    pollingRate: z.string().default('1000Hz'),
    buttons: z.number(),
    connection: z.enum(['Wired', 'Wireless', 'Both']),
    image: z.string().optional(),
  }),
});

const monitorsCollection = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    size: z.string(),
    resolution: z.string(),
    panel: z.enum(['TN', 'IPS', 'VA', 'OLED']),
    refreshRate: z.string(),
    responseTime: z.string(),
    adaptiveSync: z.string().optional(),
    image: z.string().optional(),
  }),
});

const keyboardsCollection = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    format: z.enum(['60%', '65%', '75%', 'TKL', 'Full Size']),
    switches: z.string(),
    connection: z.string(),
    features: z.string().optional(),
    image: z.string().optional(),
  }),
});

const mousepadsCollection = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    size: z.string(),
    surface: z.string(),
    base: z.string(),
    speedType: z.enum(['Speed', 'Control', 'Balanced']),
    image: z.string().optional(),
  }),
});

const headsetsCollection = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    type: z.string(),
    driver: z.string(),
    connection: z.string(),
    microphone: z.string(),
    features: z.string().optional(),
    image: z.string().optional(),
  }),
});

// ============================================
// PLAYERS COLLECTION
// ============================================

const playersCollection = defineCollection({
  type: 'data',
  schema: z.object({
    // Basic Info
    name: z.string(),
    realName: z.string().optional(),
    country: z.string(),
    team: z.string().optional(),
    rating: z.number().optional(),
    category: z.enum(['duel', 'ctf', 'tdm', 'sacrifice']).default('duel'),

    // Mouse Settings
    dpi: z.number(),
    sensitivity: z.number(),
    edpi: z.number(),
    cm360: z.number().optional(),
    acceleration: z.boolean().default(false),
    rawInput: z.boolean().default(true),

    // Game Settings
    fov: z.number().min(90).max(130),
    crosshair: z.string(),
    crosshairSize: z.string().optional(),
    invertedMouse: z.boolean().default(false),

    // Key Bindings
    forward: z.string().default('W'),
    back: z.string().default('S'),
    left: z.string().default('A'),
    right: z.string().default('D'),
    jump: z.string().default('Space'),
    crouch: z.string().default('Ctrl'),
    attack: z.string().default('Mouse1'),
    zoom: z.string().default('Mouse2'),
    weaponNext: z.string().optional(),
    weaponPrev: z.string().optional(),

    // Hardware References (filenames without extension)
    mouse: z.string(),
    mousepad: z.string().optional(),
    keyboard: z.string().optional(),
    monitor: z.string().optional(),
    headset: z.string().optional(),

    // Config file path
    configFile: z.string().optional(),
  }),
});

// ============================================
// EXPORT ALL COLLECTIONS
// ============================================

export const collections = {
  'players': playersCollection,
  'mice': miceCollection,
  'monitors': monitorsCollection,
  'keyboards': keyboardsCollection,
  'mousepads': mousepadsCollection,
  'headsets': headsetsCollection,
};
