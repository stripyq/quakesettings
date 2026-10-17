#!/usr/bin/env python3
"""Generate Steam ID matching report for players."""

import json
import urllib.request
import os
import re
from pathlib import Path

def fetch_json(url):
    """Fetch JSON from URL."""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'http://88.214.20.58/',
        })
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return []

def get_player_name_from_yaml(filepath):
    """Extract player name from YAML file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('name:'):
                name = line.split(':', 1)[1].strip()
                # Remove quotes if present
                if name.startswith('"') and name.endswith('"'):
                    name = name[1:-1]
                elif name.startswith("'") and name.endswith("'"):
                    name = name[1:-1]
                return name
    return None

def normalize_name(name):
    """Normalize name for comparison."""
    return name.lower().strip()

def find_matches(player_name, json_players):
    """Find potential matches for a player name."""
    exact = []
    partial = []
    similar = []

    player_norm = normalize_name(player_name)
    player_prefix = player_norm[:4] if len(player_norm) >= 4 else player_norm

    for p in json_players:
        json_name = p.get('name', '')
        json_norm = normalize_name(json_name)
        steam_id = p.get('_id', '')
        ctf_rating = p.get('ctf_rating')
        tdm_rating = p.get('tdm_rating')

        # Exact match
        if player_norm == json_norm:
            exact.append({
                'name': json_name,
                'steam_id': steam_id,
                'ctf': ctf_rating,
                'tdm': tdm_rating,
                'type': 'exact'
            })
        # Partial match (one contains the other)
        elif player_norm in json_norm or json_norm in player_norm:
            if len(player_norm) >= 3 and len(json_norm) >= 3:  # Avoid tiny matches
                partial.append({
                    'name': json_name,
                    'steam_id': steam_id,
                    'ctf': ctf_rating,
                    'tdm': tdm_rating,
                    'type': 'partial'
                })
        # Similar (prefix match)
        elif len(json_norm) >= 4 and json_norm.startswith(player_prefix):
            similar.append({
                'name': json_name,
                'steam_id': steam_id,
                'ctf': ctf_rating,
                'tdm': tdm_rating,
                'type': 'similar'
            })

    return exact, partial, similar

def format_rating(ctf, tdm):
    """Format rating string."""
    parts = []
    if ctf is not None:
        parts.append(f"CTF: {ctf:.1f}")
    if tdm is not None:
        parts.append(f"TDM: {tdm:.1f}")
    return ', '.join(parts) if parts else 'No ratings'

def main():
    print("Fetching CTF data...")
    ctf_data = fetch_json("http://88.214.20.58/export_rating/ctf.json")
    print(f"  Got {len(ctf_data)} CTF players")

    print("Fetching TDM data...")
    tdm_data = fetch_json("http://88.214.20.58/export_rating/tdm.json")
    print(f"  Got {len(tdm_data)} TDM players")

    # Combine players by _id
    players_by_id = {}
    for p in ctf_data:
        pid = p.get('_id', '')
        if pid:
            players_by_id[pid] = {
                '_id': pid,
                'name': p.get('name', ''),
                'ctf_rating': p.get('rating'),
                'tdm_rating': None
            }

    for p in tdm_data:
        pid = p.get('_id', '')
        if pid:
            if pid in players_by_id:
                players_by_id[pid]['tdm_rating'] = p.get('rating')
            else:
                players_by_id[pid] = {
                    '_id': pid,
                    'name': p.get('name', ''),
                    'ctf_rating': None,
                    'tdm_rating': p.get('rating')
                }

    json_players = list(players_by_id.values())
    print(f"Combined: {len(json_players)} unique players")

    # Get all player YAML files
    players_dir = Path('src/content/players')
    yaml_files = sorted(players_dir.glob('*.yaml'))

    # Generate report
    report = []
    report.append("# Steam ID Matching Report\n")
    report.append(f"Generated from CTF ({len(ctf_data)} players) and TDM ({len(tdm_data)} players) data.\n")
    report.append(f"Total unique players in JSON: {len(json_players)}\n")
    report.append(f"Total player YAMLs: {len(yaml_files)}\n\n")
    report.append("---\n\n")

    matched = 0
    needs_manual = 0

    for i, yaml_file in enumerate(yaml_files, 1):
        player_name = get_player_name_from_yaml(yaml_file)
        if not player_name:
            continue

        exact, partial, similar = find_matches(player_name, json_players)

        report.append(f"## {i}. {player_name}\n\n")
        report.append(f"**YAML file:** `{yaml_file.name}`\n\n")
        report.append("**Potential matches:**\n\n")

        if exact:
            matched += 1
            for m in exact:
                ratings = format_rating(m['ctf'], m['tdm'])
                report.append(f"- ✅ **EXACT:** \"{m['name']}\" → `{m['steam_id']}` ({ratings})\n")

        if partial:
            for m in partial[:5]:  # Limit to 5
                ratings = format_rating(m['ctf'], m['tdm'])
                report.append(f"- ⚠️ PARTIAL: \"{m['name']}\" → `{m['steam_id']}` ({ratings})\n")

        if similar:
            for m in similar[:5]:  # Limit to 5
                ratings = format_rating(m['ctf'], m['tdm'])
                report.append(f"- 🔍 SIMILAR: \"{m['name']}\" → `{m['steam_id']}` ({ratings})\n")

        if not exact and not partial and not similar:
            report.append("- ❌ No matches found\n")
            needs_manual += 1

        # QLStats link
        qlstats_name = player_name.replace(' ', '%20')
        report.append(f"\n**QLStats search:** https://qlstats.net/player/{qlstats_name}\n\n")

        # Decision
        if exact and len(exact) == 1:
            report.append(f"**Recommended:** `{exact[0]['steam_id']}`\n\n")
        elif exact:
            report.append(f"**Decision:** MULTIPLE_EXACT_MATCHES - Review needed\n\n")
        elif partial and len(partial) == 1:
            report.append(f"**Possible:** `{partial[0]['steam_id']}` (verify name: \"{partial[0]['name']}\")\n\n")
        else:
            report.append("**Decision:** `MANUAL_LOOKUP_NEEDED`\n\n")

        report.append("---\n\n")

    # Summary
    summary = f"""
## Summary

- **Exact matches:** {matched} players
- **Need manual lookup:** {needs_manual} players
- **Total:** {len(yaml_files)} players

"""
    report.insert(5, summary)

    # Write report
    output_path = Path('steam_id_matching_report.md')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(''.join(report))

    print(f"\nReport written to: {output_path}")
    print(f"Exact matches: {matched}")
    print(f"Need manual lookup: {needs_manual}")

if __name__ == '__main__':
    main()
