/**
 * Mousepad grouping utility
 * Groups mousepads by model, stripping size suffixes
 */

// Size suffixes to strip from model names (order matters - check longer ones first)
const SIZE_SUFFIXES = [
  ' 3XL', ' XXL', ' XL', ' Large', ' Medium', ' Small', ' L', ' M', ' S',
  ' 3xl', ' xxl', ' xl', ' large', ' medium', ' small', ' l', ' m', ' s'
];

// Size display order for badges
const SIZE_ORDER = ['S', 'Small', 'M', 'Medium', 'L', 'Large', 'XL', 'XXL', '3XL'];

/**
 * Extract the base model name by stripping size suffix
 */
export function getBaseModelName(name: string): string {
  let baseName = name;
  for (const suffix of SIZE_SUFFIXES) {
    if (baseName.endsWith(suffix)) {
      baseName = baseName.slice(0, -suffix.length);
      break;
    }
  }
  return baseName;
}

/**
 * Extract the size from a mousepad name
 */
export function getSizeFromName(name: string): string | null {
  for (const suffix of SIZE_SUFFIXES) {
    if (name.endsWith(suffix)) {
      return suffix.trim();
    }
  }
  return null;
}

/**
 * Normalize size to standard format for display
 */
export function normalizeSize(size: string): string {
  const upper = size.toUpperCase();
  if (upper === 'S' || upper === 'SMALL') return 'S';
  if (upper === 'M' || upper === 'MEDIUM') return 'M';
  if (upper === 'L' || upper === 'LARGE') return 'L';
  if (upper === 'XL') return 'XL';
  if (upper === 'XXL') return 'XXL';
  if (upper === '3XL') return '3XL';
  return size;
}

/**
 * Sort sizes in logical order
 */
export function sortSizes(sizes: string[]): string[] {
  return sizes.sort((a, b) => {
    const aIndex = SIZE_ORDER.findIndex(s => s.toUpperCase() === a.toUpperCase());
    const bIndex = SIZE_ORDER.findIndex(s => s.toUpperCase() === b.toUpperCase());
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

/**
 * Represents a size variant of a mousepad
 */
export interface SizeVariant {
  id: string;
  size: string;
  normalizedSize: string;
  dimensions: string;
  players: any[];
}

/**
 * Represents a grouped mousepad model
 */
export interface GroupedMousepad {
  baseModel: string;
  brand: string;
  surface: string;
  speed: string;
  variants: SizeVariant[];
  totalUsage: number;
  allPlayers: any[];
}

/**
 * Group mousepads by base model name
 * @param mousepads - Array of mousepad data objects with id, data, usage, players
 * @returns Map of base model name to grouped mousepad data
 */
export function groupMousepadsByModel<T extends { id: string; data: { name: string; brand: string; surface?: string; speed?: string; speedType?: string; dimensions?: string; size?: string }; usage: number; players: any[] }>(
  mousepads: T[]
): Map<string, GroupedMousepad> {
  const groups = new Map<string, GroupedMousepad>();

  for (const pad of mousepads) {
    const baseName = getBaseModelName(pad.data.name);
    const size = getSizeFromName(pad.data.name);

    if (!groups.has(baseName)) {
      groups.set(baseName, {
        baseModel: baseName,
        brand: pad.data.brand,
        surface: pad.data.surface || '',
        speed: pad.data.speed || pad.data.speedType || '',
        variants: [],
        totalUsage: 0,
        allPlayers: []
      });
    }

    const group = groups.get(baseName)!;

    // Add this variant
    group.variants.push({
      id: pad.id,
      size: size || 'One Size',
      normalizedSize: size ? normalizeSize(size) : '',
      dimensions: pad.data.dimensions || pad.data.size || '',
      players: pad.players
    });

    // Aggregate usage
    group.totalUsage += pad.usage;
    group.allPlayers.push(...pad.players);
  }

  // Sort variants within each group by size
  for (const group of groups.values()) {
    group.variants.sort((a, b) => {
      const aIndex = SIZE_ORDER.findIndex(s => s.toUpperCase() === a.size.toUpperCase());
      const bIndex = SIZE_ORDER.findIndex(s => s.toUpperCase() === b.size.toUpperCase());
      if (aIndex === -1 && bIndex === -1) return a.size.localeCompare(b.size);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }

  return groups;
}

/**
 * Check if a mousepad model has multiple size variants
 */
export function hasMultipleSizes(group: GroupedMousepad): boolean {
  return group.variants.length > 1;
}

/**
 * Get size badges string for display (e.g., "L / XL / XXL")
 */
export function getSizeBadges(group: GroupedMousepad): string {
  if (group.variants.length === 1 && group.variants[0].size === 'One Size') {
    return '';
  }
  return group.variants
    .map(v => v.normalizedSize || v.size)
    .join(' / ');
}
