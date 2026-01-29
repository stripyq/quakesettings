import { defineCollection, z } from 'astro:content';

// ============================================
// HARDWARE COLLECTIONS
// ============================================

const miceCollection = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    weight: z.string().optional().default('Unknown'),
    shape: z.string().optional().default('Ambidextrous'),
    dimensions: z.string().optional(),
    sensor: z.string().optional().default('Unknown'),
    dpiRange: z.string().optional().default('Unknown'),
    pollingRate: z.string().optional().default('1000Hz'),
    buttons: z.number().optional().default(5),
    connection: z.string().optional().default('Wired'),
    image: z.string().optional(),
  }),
});

const monitorsCollection = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    size: z.string().optional().default('Unknown'),
    resolution: z.string().optional().default('1920x1080'),
    panelType: z.string().optional().default('TN'),
    panel: z.string().optional(), // Legacy field
    refreshRate: z.string().optional().default('Unknown'),
    responseTime: z.string().optional().default('1ms'),
    adaptiveSync: z.string().optional(),
    image: z.string().optional(),
  }),
});

const keyboardsCollection = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    size: z.string().optional().default('TKL'),
    format: z.string().optional(), // Legacy field
    switches: z.string().optional().default('Mechanical'),
    actuation: z.string().optional(),
    connection: z.string().optional().default('Wired'),
    features: z.string().optional(),
    image: z.string().optional(),
  }),
});

const mousepadsCollection = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    surface: z.string().optional().default('Cloth'),
    speed: z.string().optional().default('Balanced'),
    speedType: z.string().optional(), // Legacy field
    dimensions: z.string().optional().default('Unknown'),
    size: z.string().optional(), // Legacy field
    thickness: z.string().optional(),
    base: z.string().optional(),
    image: z.string().optional(),
  }),
});

const headsetsCollection = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    type: z.string().optional().default('Closed-back'),
    driverSize: z.string().optional().default('Unknown'),
    driver: z.string().optional(), // Legacy field
    frequencyResponse: z.string().optional(),
    impedance: z.string().optional(),
    connection: z.string().optional().default('Wired'),
    microphone: z.union([z.boolean(), z.string()]).optional().default(false),
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
    country: z.string().optional().default('Unknown'),
    team: z.string().optional(),
    rating: z.number().optional(),
    category: z.string().optional().default('duel'),

    // Mouse Settings
    dpi: z.number(),
    sensitivity: z.number(),
    edpi: z.number(),
    cm360: z.number().optional(),
    acceleration: z.boolean().optional().default(false),
    accelValue: z.number().optional(),
    rawInput: z.boolean().optional().default(true),

    // Game Settings
    fov: z.number(),
    crosshair: z.string().optional().default('2'),
    crosshairSize: z.string().optional(),
    invertedMouse: z.boolean().optional().default(false),

    // Key Bindings
    forward: z.string().optional().default('W'),
    back: z.string().optional().default('S'),
    left: z.string().optional().default('A'),
    right: z.string().optional().default('D'),
    jump: z.string().optional().default('Space'),
    crouch: z.string().optional().default('Ctrl'),
    attack: z.string().optional().default('Mouse1'),
    zoom: z.string().optional().default('Mouse2'),
    weaponNext: z.string().optional(),
    weaponPrev: z.string().optional(),

    // Hardware References (filenames without extension)
    mouse: z.string().optional(),
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
