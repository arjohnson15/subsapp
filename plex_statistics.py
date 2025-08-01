#!/usr/bin/env python3
"""
Plex Statistics Collector
Gets content counts from Plex servers using PlexAPI
"""

import json
import sys
import os
from plexapi.server import PlexServer

# Plex server configurations - matches plex-config.js
PLEX_SERVERS = {
    'plex1': {
        'regular': {
            'name': 'Plex 1',
            'serverId': '3ad72e19d4509a15d9f8253666a03efa78baac44',
            'token': 'sxuautpKvoH2aZKG-j95',
            'url': 'http://192.168.10.90:32400'
        },
        'fourk': {
            'name': 'Plex 1 4K',
            'serverId': '90244d9a956da3afad32f85d6b24a9c24649d681',
            'token': 'sxuautpKvoH2aZKG-j95',
            'url': 'http://192.168.10.92:32400'
        }
    },
    'plex2': {
        'regular': {
            'name': 'Plex 2',
            'serverId': '3ad72e19d4509a15d9f8253666a03efa78baac44',
            'token': 'B1QhFRA-Q2pSm15uxmMA',
            'url': 'http://192.168.10.94:32400'
        },
        'fourk': {
            'name': 'Plex 2 4K',
            'serverId': 'c6448117a95874f18274f31495ff5118fd291089',
            'token': 'B1QhFRA-Q2pSm15uxmMA',
            'url': 'http://192.168.10.92:32700'
        }
    }
}

def get_library_stats(server_config):
    """Get content statistics from a Plex server"""
    try:
        plex = PlexServer(server_config['url'], server_config['token'], timeout=10)
        stats = {
            'movies': 0,
            'shows': 0, 
            'episodes': 0,
            'artists': 0,  # Audio books count as artists
            'albums': 0,
            'tracks': 0
        }
        
        # Get all library sections
        for section in plex.library.sections():
            section_type = section.type
            
            if section_type == 'movie':
                movie_count = len(section.all())
                stats['movies'] += movie_count
                print(f"  📽️ {section.title}: {movie_count} movies", file=sys.stderr)
                
            elif section_type == 'show':
                shows = section.all()
                stats['shows'] += len(shows)
                # Count total episodes across all shows
                episode_count = 0
                for show in shows:
                    episode_count += show.leafCount
                stats['episodes'] += episode_count
                print(f"  📺 {section.title}: {len(shows)} shows, {episode_count} episodes", file=sys.stderr)
                
            elif section_type == 'artist':
                artists = section.all()
                stats['artists'] += len(artists)
                album_count = 0
                track_count = 0
                for artist in artists:
                    albums = artist.albums()
                    album_count += len(albums)
                    for album in albums:
                        track_count += len(album.tracks())
                stats['albums'] += album_count
                stats['tracks'] += track_count
                print(f"  🎵 {section.title}: {len(artists)} artists, {album_count} albums, {track_count} tracks", file=sys.stderr)
        
        return {
            'success': True,
            'stats': stats,
            'server': server_config['name']
        }
        
    except Exception as e:
        print(f"❌ Error connecting to {server_config['name']}: {str(e)}", file=sys.stderr)
        return {
            'success': False,
            'error': str(e),
            'server': server_config['name']
        }

def get_all_plex_stats():
    """Get statistics from all configured Plex servers"""
    all_stats = {}
    
    for server_group, servers in PLEX_SERVERS.items():
        print(f"📊 Processing {server_group} servers...", file=sys.stderr)
        all_stats[server_group] = {}
        
        # Get regular server stats
        if 'regular' in servers:
            print(f"  🔍 Connecting to {servers['regular']['name']}...", file=sys.stderr)
            regular_stats = get_library_stats(servers['regular'])
            all_stats[server_group]['regular'] = regular_stats
            
        # Get 4K server stats  
        if 'fourk' in servers:
            print(f"  🔍 Connecting to {servers['fourk']['name']}...", file=sys.stderr)
            fourk_stats = get_library_stats(servers['fourk'])
            all_stats[server_group]['fourk'] = fourk_stats
    
    return all_stats

def main():
    """Main function to collect and output Plex statistics"""
    try:
        print("🚀 Starting Plex statistics collection...", file=sys.stderr)
        stats = get_all_plex_stats()
        
        # Output JSON to stdout for Node.js to consume
        print(json.dumps(stats, indent=2))
        
        # Summary to stderr for logging
        total_movies = 0
        total_shows = 0
        total_episodes = 0
        total_artists = 0
        
        for server_group, group_data in stats.items():
            for server_type, server_data in group_data.items():
                if server_data.get('success'):
                    server_stats = server_data.get('stats', {})
                    total_movies += server_stats.get('movies', 0)
                    total_shows += server_stats.get('shows', 0)
                    total_episodes += server_stats.get('episodes', 0)
                    total_artists += server_stats.get('artists', 0)
        
        print(f"✅ Collection complete! Total: {total_movies} movies, {total_shows} shows, {total_episodes} episodes, {total_artists} audiobooks", file=sys.stderr)
        
    except Exception as e:
        print(f"❌ Fatal error: {str(e)}", file=sys.stderr)
        error_output = {'error': str(e)}
        print(json.dumps(error_output), file=sys.stdout)
        sys.exit(1)

if __name__ == '__main__':
    main()