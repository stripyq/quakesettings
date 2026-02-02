/**
 * Player Registry Types
 *
 * This registry contains all known players from competitive rankings (2,287 total).
 * Only players with hasProfile=true have full profiles displayed on the site.
 *
 * Use this for:
 * - Form autocomplete when players submit their settings
 * - Pre-filling steam ID and ratings when creating new profiles
 * - Validating player identity
 */

export interface PlayerRegistryEntry {
  /** Steam64 ID (e.g., "76561198012345678") */
  steamId: string;
  /** Display name from rankings */
  name: string;
  /** Profile slug if player has a full profile (e.g., "rapha"), null otherwise */
  slug: string | null;
  /** Whether this player has a full profile in src/content/players/ */
  hasProfile: boolean;
  /** Competitive ratings by game mode */
  ratings: {
    /** CTF TrueSkill rating */
    ctf: number | null;
    /** TDM TrueSkill rating */
    tdm: number | null;
    /** 2v2 TrueSkill rating */
    '2v2': number | null;
  };
  /** Games played by mode */
  gamesPlayed: {
    ctf: number | null;
    tdm: number | null;
    '2v2': number | null;
  };
}

export interface PlayerRegistry {
  /** Schema version */
  version: string;
  /** Date registry was generated (YYYY-MM-DD) */
  generatedAt: string;
  /** Total number of players in registry */
  totalPlayers: number;
  /** Number of players with full profiles */
  playersWithProfiles: number;
  /** All players sorted alphabetically by name */
  players: PlayerRegistryEntry[];
}

/**
 * Import the registry:
 *
 * ```typescript
 * import registry from './player-registry.json';
 * import type { PlayerRegistry } from './player-registry.d.ts';
 *
 * const data = registry as PlayerRegistry;
 *
 * // Find player by name (for autocomplete)
 * const matches = data.players.filter(p =>
 *   p.name.toLowerCase().includes(searchTerm.toLowerCase())
 * );
 *
 * // Find player by steam ID
 * const player = data.players.find(p => p.steamId === steamId);
 * ```
 */
