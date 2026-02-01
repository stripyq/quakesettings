#!/usr/bin/env node
/**
 * Script to apply affiliate links to hardware YAML files
 * Run: node scripts/apply-affiliate-links.js
 */

const fs = require('fs');
const path = require('path');

const CONTENT_DIR = path.join(__dirname, '..', 'src', 'content');
const AFFILIATE_LINKS = require('./affiliate-links.json');

// Collection directories mapped to JSON categories
const COLLECTIONS = {
  mice: 'mice',
  mousepads: 'mousepads',
  keyboards: 'keyboards',
  monitors: 'monitors',
  headsets: 'headsets'
};

// Stats tracking
const stats = {
  updated: 0,
  skipped: 0,
  notFound: []
};

/**
 * Find the best matching affiliate link for a filename
 */
function findAffiliateLink(filename, links) {
  const baseName = filename.replace('.yaml', '');

  // Direct match
  if (links[baseName]) {
    return links[baseName];
  }

  // Try to find a partial match (for files with size/variant suffixes)
  // e.g., "artisan-fx-hayate-otsu-v2-mid-large" should match "artisan-fx-hayate-otsu"
  for (const [key, link] of Object.entries(links)) {
    if (baseName.startsWith(key) || baseName.includes(key)) {
      return link;
    }
  }

  // Try reverse: key contains filename base
  for (const [key, link] of Object.entries(links)) {
    if (key.includes(baseName)) {
      return link;
    }
  }

  return null;
}

/**
 * Add affiliate link to a YAML file if not already present
 */
function updateYamlFile(filePath, affiliateLink) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Check if already has an affiliate link
  if (content.includes('affiliateLink:')) {
    return false; // Already has link
  }

  // Add affiliate link at the end
  content = content.trimEnd() + '\naffiliateLink: "' + affiliateLink + '"\n';
  fs.writeFileSync(filePath, content);
  return true;
}

/**
 * Process a collection directory
 */
function processCollection(collectionName, linksCategory) {
  const collectionDir = path.join(CONTENT_DIR, collectionName);
  const links = AFFILIATE_LINKS[linksCategory];

  if (!links) {
    console.log(`No links found for category: ${linksCategory}`);
    return;
  }

  if (!fs.existsSync(collectionDir)) {
    console.log(`Directory not found: ${collectionDir}`);
    return;
  }

  const files = fs.readdirSync(collectionDir).filter(f => f.endsWith('.yaml'));

  console.log(`\nProcessing ${collectionName} (${files.length} files)...`);

  for (const file of files) {
    const filePath = path.join(collectionDir, file);
    const affiliateLink = findAffiliateLink(file, links);

    if (affiliateLink) {
      const updated = updateYamlFile(filePath, affiliateLink);
      if (updated) {
        console.log(`  ✓ Updated: ${file}`);
        stats.updated++;
      } else {
        console.log(`  - Skipped (already has link): ${file}`);
        stats.skipped++;
      }
    }
  }
}

/**
 * Report which link keys have no matching files
 */
function reportUnmatchedLinks() {
  console.log('\n--- Unmatched affiliate link keys ---');

  for (const [category, links] of Object.entries(AFFILIATE_LINKS)) {
    const collectionDir = path.join(CONTENT_DIR, category);
    if (!fs.existsSync(collectionDir)) continue;

    const files = fs.readdirSync(collectionDir).filter(f => f.endsWith('.yaml'));
    const fileNames = files.map(f => f.replace('.yaml', ''));

    for (const key of Object.keys(links)) {
      const hasMatch = fileNames.some(fn =>
        fn === key || fn.startsWith(key) || fn.includes(key) || key.includes(fn)
      );

      if (!hasMatch) {
        console.log(`  ${category}/${key} - no matching file`);
        stats.notFound.push(`${category}/${key}`);
      }
    }
  }
}

// Main execution
console.log('Applying affiliate links to hardware YAML files...\n');

for (const [dir, category] of Object.entries(COLLECTIONS)) {
  processCollection(dir, category);
}

reportUnmatchedLinks();

console.log('\n--- Summary ---');
console.log(`Updated: ${stats.updated}`);
console.log(`Skipped (already had links): ${stats.skipped}`);
console.log(`Unmatched link keys: ${stats.notFound.length}`);
