#!/usr/bin/env python3
"""
Plex Statistics Collector
Gets content counts from Plex servers using PlexAPI
"""

import json
import sys
import os
from plexapi.server import PlexServer

# Plex server configurations - ONLY PLEX 1 SERVERS (no doubling)
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
    }
    # REMOVED plex2 to avoid doubling counts
}

def get_library_stats(server_config):
    """Get detailed content statistics from a Plex server with proper library combining"""
    try:
        plex = PlexServer(server_config['url'], server_config['token'], timeout=10)
        stats = {
            'hd_movies': 0,      # All non-anime movies
            'anime_movies': 0,   # Only anime movies
            'total_shows': 0,    # All TV show libraries combined
            'total_seasons': 0,  # All seasons across all show libraries
            'total_episodes': 0, # All episodes across all show libraries
            'audio_artists': 0,  # Artists (audiobooks)
            'audio_albums': 0,   # Albums
            'audio_tracks': 0,   # Tracks
            'library_breakdown': {}
        }
        
        print(f"🔍 Connecting to {server_config['name']}...", file=sys.stderr)
        
        # Get all library sections
        for section in plex.library.sections():
            section_type = section.type
            section_title = section.title
            
            print(f"  📚 Processing: {section_title} ({section_type})", file=sys.stderr)
            
            if section_type == 'movie':
                movie_count = len(section.all())
                stats['library_breakdown'][section_title] = {
                    'type': 'movie',
                    'count': movie_count
                }
                
                # Check if this is anime movies
                if 'anime' in section_title.lower():
                    stats['anime_movies'] += movie_count
                    print(f"  🎌 {section_title}: {movie_count} anime movies", file=sys.stderr)
                else:
                    stats['hd_movies'] += movie_count
                    print(f"  📽️ {section_title}: {movie_count} HD movies", file=sys.stderr)
                
            elif section_type == 'show':
                shows = section.all()
                show_count = len(shows)
                
                # Count seasons and episodes for this library
                library_seasons = 0
                library_episodes = 0
                
                for show in shows:
                    library_seasons += show.childCount    # Seasons in this show
                    library_episodes += show.leafCount    # Episodes in this show
                
                # Add to totals
                stats['total_shows'] += show_count
                stats['total_seasons'] += library_seasons
                stats['total_episodes'] += library_episodes
                
                stats['library_breakdown'][section_title] = {
                    'type': 'show',
                    'shows': show_count,
                    'seasons': library_seasons, 
                    'episodes': library_episodes
                }
                
                print(f"  📺 {section_title}: {show_count} shows, {library_seasons} seasons, {library_episodes} episodes", file=sys.stderr)
                
            elif section_type == 'artist':
                artists = section.all()
                artist_count = len(artists)
                stats['audio_artists'] += artist_count
                
                library_albums = 0
                library_tracks = 0
                
                for artist in artists:
                    albums = artist.albums()
                    library_albums += len(albums)
                    for album in albums:
                        library_tracks += len(album.tracks())
                        
                stats['audio_albums'] += library_albums
                stats['audio_tracks'] += library_tracks
                
                stats['library_breakdown'][section_title] = {
                    'type': 'artist',
                    'artists': artist_count,
                    'albums': library_albums,
                    'tracks': library_tracks
                }
                
                print(f"  🎵 {section_title}: {artist_count} artists, {library_albums} albums, {library_tracks} tracks", file=sys.stderr)
        
        print(f"✅ {server_config['name']} totals: Movies({stats['hd_movies']}+{stats['anime_movies']}), Shows({stats['total_shows']}/{stats['total_seasons']}/{stats['total_episodes']}), Audio({stats['audio_artists']}/{stats['audio_albums']})", file=sys.stderr)
        
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