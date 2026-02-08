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
    buttons: z.number().nullable().optional().default(5),
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
    country: z.string().optional().default('Unknown'),
    team: z.string().optional(),
    category: z.string().optional().default('duel'),
    lastUpdated: z.string().optional(), // Date string YYYY-MM

    // Player Identity (for external data matching)
    steamId: z.string().optional(), // Steam64 ID (e.g., "76561198012345678")
    qlstatsNick: z.string().optional(), // Nickname on QLStats if different from name

    // Ratings by game mode (cached from external sources)
    // Duel: Glicko rating from QLStats (integer, e.g., 1777)
    duelRating: z.number().nullable().optional(),
    duelRatingSource: z.string().optional().default('qlstats'), // "qlstats"
    duelRatingUpdated: z.coerce.string().optional(), // YYYY-MM-DD (coerce handles YAML dates)

    // CTF: TrueSkill rating from community tracker (decimal, e.g., 34.3)
    ctfRating: z.number().nullable().optional(),
    ctfRatingSource: z.string().optional().default('community'), // "88.214.20.58"
    ctfRatingUpdated: z.coerce.string().optional(), // YYYY-MM-DD (coerce handles YAML dates)

    // TDM: TrueSkill rating from community tracker (decimal, e.g., 34.3)
    tdmRating: z.number().nullable().optional(),
    tdmRatingSource: z.string().optional().default('community'), // "88.214.20.58"
    tdmRatingUpdated: z.coerce.string().optional(), // YYYY-MM-DD (coerce handles YAML dates)
    tdmGames: z.number().nullable().optional(), // Number of games played

    // CA (Clan Arena): TrueSkill rating from community tracker (decimal, e.g., 25.56)
    caRating: z.number().nullable().optional(),
    caRatingSource: z.string().optional().default('community'), // "88.214.20.58"
    caRatingUpdated: z.coerce.string().optional(), // YYYY-MM-DD (coerce handles YAML dates)
    caGames: z.number().nullable().optional(), // Number of games played

    // QLLR CTF ratings (from qllr.xyz)
    qllrCtfRating: z.number().nullable().optional(),
    qllrCtfGames: z.number().nullable().optional(),

    // Games played counts
    duelGames: z.number().nullable().optional(),
    ctfGames: z.number().nullable().optional(),

    // Rating History - Peak/Low tracking
    duelRatingPeak: z.number().nullable().optional(),
    duelRatingPeakDate: z.string().optional(), // YYYY-MM-DD
    duelRatingLow: z.number().nullable().optional(),
    duelRatingLowDate: z.string().optional(), // YYYY-MM-DD

    ctfRatingPeak: z.number().nullable().optional(),
    ctfRatingPeakDate: z.string().optional(), // YYYY-MM-DD
    ctfRatingLow: z.number().nullable().optional(),
    ctfRatingLowDate: z.string().optional(), // YYYY-MM-DD

    tdmRatingPeak: z.number().nullable().optional(),
    tdmRatingPeakDate: z.string().optional(), // YYYY-MM-DD
    tdmRatingLow: z.number().nullable().optional(),
    tdmRatingLowDate: z.string().optional(), // YYYY-MM-DD

    // Timestamp of last ratings fetch
    ratingsUpdated: z.string().optional(), // ISO timestamp

    // Data Source
    dataSource: z.enum(['player', 'verified', 'collected']).optional().default('collected'),
    // player = self-submitted by the player
    // verified = confirmed/verified by the player
    // collected = gathered from public sources (streams, interviews, etc.)
    source: z.string().optional(), // Description of source e.g., "Player submission", "Interview", "Stream"
    sourceUrl: z.string().optional(), // Link to source (stream VOD, interview, etc.)

    // Mouse Settings
    dpi: z.number(),
    sensitivity: z.number(),
    edpi: z.number(),
    cm360: z.number().nullable().optional(),
    m_cpi: z.number().nullable().optional(), // Custom CPI setting - if set, cm360 = 360 / sensitivity
    acceleration: z.boolean().optional().default(false),
    accelValue: z.number().nullable().optional(),
    rawInput: z.boolean().optional().default(true),
    grip: z.string().optional(), // Grip style: Palm, Claw, Fingertip, Hybrid

    // Game Settings
    fov: z.number(),
    crosshair: z.string().optional().default('2'),
    crosshairSize: z.string().optional(),
    crosshairColor: z.string().optional(),
    enemyModel: z.string().optional(),
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
    skates: z.string().optional(),

    // System Hardware
    gpuBrand: z.string().optional(), // NVIDIA, AMD, INTEL
    cpuBrand: z.string().optional(), // Intel, AMD
    gpu: z.string().optional(), // Alias for gpuBrand (legacy)
    cpu: z.string().optional(), // Alias for cpuBrand (legacy)

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
