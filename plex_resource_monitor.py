#!/usr/bin/env python3
"""
Plex Resource Monitor Script - plex_resource_monitor.py
Gets server resource usage for dashboard display
Designed for Windows development with Docker deployment
"""

import json
import sys
from datetime import datetime

try:
    from plexapi.server import PlexServer
    print("[SUCCESS] PlexAPI module imported", file=sys.stderr)
except ImportError:
    print("[ERROR] PlexAPI not installed. Run: pip install plexapi", file=sys.stderr)
    sys.exit(1)

# Plex server configurations - YOUR ACTUAL SERVERS
PLEX_SERVERS = {
    'plex1': {
        'regular': {
            'name': 'Plex 1',
            'server_id': '3ad72e19d4509a15d9f8253666a03efa78baac44',
            'url': 'http://192.168.10.90:32400',
            'token': 'sxuautpKvoH2aZKG-j95',
            'friendly_name': 'JohnsonFlix'
        },
        'fourk': {
            'name': 'Plex 1 4K',
            'server_id': '90244d9a956da3afad32f85d6b24a9c24649d681',
            'url': 'http://192.168.10.92:32400',
            'token': 'sxuautpKvoH2aZKG-j95',
            'friendly_name': 'JohnsonFlix 4K'
        }
    },
    'plex2': {
        'regular': {
            'name': 'Plex 2',
            'server_id': '3ad72e19d4509a15d9f8253666a03efa78baac44',
            'url': 'http://192.168.10.94:32400',
            'token': 'B1QhFRA-Q2pSm15uxmMA',
            'friendly_name': 'JohnsonFlix'
        },
        'fourk': {
            'name': 'Plex 2 4K',
            'server_id': 'c6448117a95874f18274f31495ff5118fd291089',
            'url': 'http://192.168.10.92:32700',
            'token': 'B1QhFRA-Q2pSm15uxmMA',
            'friendly_name': 'Plex 4K.'
        }
    }
}

def get_server_resource_usage(server_config):
    """Get server resource usage information"""
    try:
        print(f"[TEST] Connecting to {server_config['name']}...", file=sys.stderr)
        plex = PlexServer(server_config['url'], server_config['token'], timeout=10)
        
        resource_data = {
            'success': True,
            'server_name': server_config['name'],
            'server_url': server_config['url'],
            'resources': {}
        }
        
        # Get basic server info
        try:
            resource_data['server_version'] = plex.version
            resource_data['platform'] = plex.platform
            resource_data['platform_version'] = plex.platformVersion
            resource_data['machine_identifier'] = plex.machineIdentifier
            print(f"[SUCCESS] Got server info for {server_config['name']}", file=sys.stderr)
        except Exception as e:
            print(f"[WARNING] Could not get server info: {e}", file=sys.stderr)
            resource_data['server_version'] = 'Unknown'
            resource_data['platform'] = 'Unknown'
            resource_data['platform_version'] = 'Unknown'
        
        # Get session information
        try:
            sessions = plex.sessions()
            transcoding_sessions = 0
            direct_play_sessions = 0
            
            for session in sessions:
                if hasattr(session, 'transcodeSession') and session.transcodeSession:
                    transcoding_sessions += 1
                else:
                    direct_play_sessions += 1
            
            resource_data['resources']['active_sessions'] = len(sessions)
            resource_data['resources']['transcoding_sessions'] = transcoding_sessions
            resource_data['resources']['direct_play_sessions'] = direct_play_sessions
            
            print(f"[SUCCESS] Got {len(sessions)} sessions for {server_config['name']}", file=sys.stderr)
            
        except Exception as e:
            print(f"[ERROR] Session monitoring failed: {e}", file=sys.stderr)
            resource_data['resources']['active_sessions'] = 0
            resource_data['resources']['transcoding_sessions'] = 0
            resource_data['resources']['direct_play_sessions'] = 0
        
        # Get library count
        try:
            library_count = len(plex.library.sections())
            resource_data['resources']['library_count'] = library_count
            print(f"[SUCCESS] Got {library_count} libraries for {server_config['name']}", file=sys.stderr)
        except Exception as e:
            print(f"[ERROR] Library count failed: {e}", file=sys.stderr)
            resource_data['resources']['library_count'] = 0
        
        # Get total media items
        try:
            total_items = 0
            for section in plex.library.sections():
                try:
                    total_items += section.totalSize
                except:
                    pass
            resource_data['resources']['total_media_items'] = total_items
            print(f"[SUCCESS] Got {total_items} total media items for {server_config['name']}", file=sys.stderr)
        except Exception as e:
            print(f"[ERROR] Media items count failed: {e}", file=sys.stderr)
            resource_data['resources']['total_media_items'] = 0
        
        # Estimate CPU and Memory usage based on sessions
        transcoding = resource_data['resources']['transcoding_sessions']
        direct_play = resource_data['resources']['direct_play_sessions']
        
        # Base estimate: 5% CPU + 15% per transcoding + 2% per direct play
        estimated_cpu = min(95, 5 + (transcoding * 15) + (direct_play * 2))
        
        # Base estimate: 20% Memory + 10% per transcoding + 3% per direct play
        estimated_memory = min(90, 20 + (transcoding * 10) + (direct_play * 3))
        
        resource_data['resources']['cpu_usage_percent'] = estimated_cpu
        resource_data['resources']['memory_usage_percent'] = estimated_memory
        resource_data['resources']['server_status'] = 'online'
        resource_data['resources']['estimation_note'] = 'CPU/Memory estimates based on session load'
        
        print(f"[ESTIMATE] {server_config['name']}: CPU {estimated_cpu}%, Memory {estimated_memory}%", file=sys.stderr)
        
        return resource_data
        
    except Exception as e:
        print(f"[ERROR] Connection failed for {server_config['name']}: {e}", file=sys.stderr)
        return {
            'success': False,
            'server_name': server_config['name'],
            'error': str(e),
            'resources': {
                'server_status': 'error',
                'error_message': str(e),
                'active_sessions': 0,
                'transcoding_sessions': 0,
                'direct_play_sessions': 0,
                'cpu_usage_percent': 0,
                'memory_usage_percent': 0,
                'library_count': 0,
                'total_media_items': 0
            }
        }

def get_all_server_resources():
    """Get resource usage from all configured Plex servers"""
    all_resources = {}
    
    for server_group, servers in PLEX_SERVERS.items():
        print(f"[TEST] Processing {server_group} server resources...", file=sys.stderr)
        all_resources[server_group] = {}
        
        # Get regular server resources
        if 'regular' in servers:
            regular_resources = get_server_resource_usage(servers['regular'])
            all_resources[server_group]['regular'] = regular_resources
            
        # Get 4K server resources  
        if 'fourk' in servers:
            fourk_resources = get_server_resource_usage(servers['fourk'])
            all_resources[server_group]['fourk'] = fourk_resources
    
    return all_resources

def main():
    """Main function to collect and output Plex server resource usage"""
    try:
        print("[START] Starting Plex server resource collection...", file=sys.stderr)
        resources = get_all_server_resources()
        
        # Output JSON to stdout for Node.js to consume
        print(json.dumps(resources, indent=2))
        
        # Summary to stderr for logging
        total_sessions = 0
        total_transcoding = 0
        servers_online = 0
        servers_total = 0
        
        for server_group, group_data in resources.items():
            for server_type, server_data in group_data.items():
                servers_total += 1
                if server_data.get('success'):
                    servers_online += 1
                    server_resources = server_data.get('resources', {})
                    total_sessions += server_resources.get('active_sessions', 0)
                    total_transcoding += server_resources.get('transcoding_sessions', 0)
        
        print(f"[SUCCESS] Resource collection complete! {servers_online}/{servers_total} servers online", file=sys.stderr)
        print(f"[SUMMARY] Total sessions: {total_sessions}, Transcoding: {total_transcoding}", file=sys.stderr)
        
    except Exception as e:
        print(f"[FATAL] Fatal error: {str(e)}", file=sys.stderr)
        error_output = {'error': str(e)}
        print(json.dumps(error_output), file=sys.stdout)
        sys.exit(1)

if __name__ == '__main__':
    main()