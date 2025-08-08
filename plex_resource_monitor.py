#!/usr/bin/env python3
"""
Plex Resource Monitor Script - Gets REAL CPU/Memory from Plex API
The same data that shows in Plex web dashboard
"""

import json
import sys
import requests
from datetime import datetime
import xml.etree.ElementTree as ET

try:
    from plexapi.server import PlexServer
    print("[SUCCESS] PlexAPI module imported", file=sys.stderr)
except ImportError:
    print("[ERROR] PlexAPI not installed. Run: pip install plexapi", file=sys.stderr)
    sys.exit(1)

# Your existing server configurations
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
            'friendly_name': 'Plex 4K'
        }
    }
}

def get_real_plex_resources(server_config):
    """Get real CPU/Memory resources from Plex server using /statistics/resources endpoint"""
    try:
        # Use the documented /statistics/resources endpoint
        url = f"{server_config['url']}/statistics/resources"
        headers = {'X-Plex-Token': server_config['token']}
        
        print(f"[DEBUG] Calling /statistics/resources for {server_config['name']}", file=sys.stderr)
        
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            print(f"[SUCCESS] Got statistics/resources response", file=sys.stderr)
            
            # Try to parse as JSON first
            try:
                data = response.json()
                print(f"[DEBUG] JSON response: {str(data)[:300]}...", file=sys.stderr)
                
                # Look for MediaContainer -> StatisticsResources structure
                media_container = data.get('MediaContainer', {})
                statistics_resources = media_container.get('StatisticsResources', [])
                
                if statistics_resources and len(statistics_resources) > 0:
                    # Get the most recent resource entry
                    latest_stats = statistics_resources[-1]  # Last entry is most recent
                    
                    # Extract the values from the API response
                    host_cpu = float(latest_stats.get('hostCpuUtilization', 0))
                    host_memory = float(latest_stats.get('hostMemoryUtilization', 0))
                    
                    print(f"[REAL] {server_config['name']}: CPU {host_cpu:.1f}%, Memory {host_memory:.1f}% (from statistics/resources)", file=sys.stderr)
                    
                    return {
                        'cpu_usage_percent': round(host_cpu, 1),
                        'memory_usage_percent': round(host_memory, 1),
                        'source': 'statistics_resources_json',
                        'found_data': True,
                        'timestamp': latest_stats.get('at', 0)
                    }
                else:
                    print(f"[INFO] No StatisticsResources found in JSON response", file=sys.stderr)
                    
            except Exception as json_error:
                print(f"[DEBUG] JSON parsing failed: {json_error}", file=sys.stderr)
                
                # Try parsing as XML
                try:
                    root = ET.fromstring(response.text)
                    print(f"[DEBUG] Parsed as XML, root tag: {root.tag}", file=sys.stderr)
                    
                    # Look for StatisticsResources elements
                    for stats_elem in root.findall('.//StatisticsResources'):
                        host_cpu = float(stats_elem.get('hostCpuUtilization', 0))
                        host_memory = float(stats_elem.get('hostMemoryUtilization', 0))
                        
                        print(f"[REAL] {server_config['name']}: CPU {host_cpu:.1f}%, Memory {host_memory:.1f}% (from statistics/resources XML)", file=sys.stderr)
                        
                        return {
                            'cpu_usage_percent': round(host_cpu, 1),
                            'memory_usage_percent': round(host_memory, 1),
                            'source': 'statistics_resources_xml',
                            'found_data': True,
                            'timestamp': int(stats_elem.get('at', 0))
                        }
                        
                except ET.ParseError as xml_error:
                    print(f"[ERROR] Could not parse response as JSON or XML: {xml_error}", file=sys.stderr)
                    print(f"[DEBUG] Raw response: {response.text[:500]}...", file=sys.stderr)
        
        else:
            print(f"[ERROR] /statistics/resources returned {response.status_code}", file=sys.stderr)
            print(f"[DEBUG] Error response: {response.text[:200]}", file=sys.stderr)
        
        # If we get here, the endpoint didn't work
        print(f"[INFO] Could not get resource data from {server_config['name']}", file=sys.stderr)
        return {
            'cpu_usage_percent': 0,
            'memory_usage_percent': 0,
            'source': 'not_available',
            'found_data': False
        }
        
    except Exception as e:
        print(f"[ERROR] Resource monitoring failed for {server_config['name']}: {e}", file=sys.stderr)
        return {
            'cpu_usage_percent': 0,
            'memory_usage_percent': 0,
            'source': 'error',
            'error_message': str(e),
            'found_data': False
        }

def get_server_resource_usage(server_config):
    """Get server resource usage information with REAL monitoring"""
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
        
        # GET REAL SYSTEM RESOURCES from Plex API
        print(f"[SEARCH] Looking for CPU/Memory endpoints on {server_config['name']}...", file=sys.stderr)
        system_resources = get_real_plex_resources(server_config)
        
        resource_data['resources']['cpu_usage_percent'] = system_resources['cpu_usage_percent']
        resource_data['resources']['memory_usage_percent'] = system_resources['memory_usage_percent']
        resource_data['resources']['server_status'] = 'online'
        resource_data['resources']['monitoring_source'] = system_resources.get('source', 'unknown')
        resource_data['resources']['found_real_data'] = system_resources.get('found_data', False)
        
        if 'error_message' in system_resources:
            resource_data['resources']['monitoring_error'] = system_resources['error_message']
        
        if system_resources.get('found_data'):
            print(f"[REAL] {server_config['name']}: CPU {system_resources['cpu_usage_percent']:.1f}%, Memory {system_resources['memory_usage_percent']:.1f}%", file=sys.stderr)
        else:
            print(f"[SEARCH] {server_config['name']}: Still looking for resource endpoints...", file=sys.stderr)
        
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
        print("[START] Searching for Plex resource monitoring endpoints...", file=sys.stderr)
        resources = get_all_server_resources()
        
        # Output JSON to stdout for Node.js to consume
        print(json.dumps(resources, indent=2))
        
        # Summary to stderr for logging
        total_sessions = 0
        total_transcoding = 0
        servers_online = 0
        servers_total = 0
        servers_with_resources = 0
        
        for server_group, group_data in resources.items():
            for server_type, server_data in group_data.items():
                servers_total += 1
                if server_data.get('success'):
                    servers_online += 1
                    server_resources = server_data.get('resources', {})
                    total_sessions += server_resources.get('active_sessions', 0)
                    total_transcoding += server_resources.get('transcoding_sessions', 0)
                    
                    if server_resources.get('found_real_data'):
                        servers_with_resources += 1
        
        print(f"[SUCCESS] Resource collection complete! {servers_online}/{servers_total} servers online", file=sys.stderr)
        print(f"[SUCCESS] Found real resource data on {servers_with_resources}/{servers_online} servers", file=sys.stderr)
        print(f"[SUMMARY] Total sessions: {total_sessions}, Transcoding: {total_transcoding}", file=sys.stderr)
        
    except Exception as e:
        print(f"[FATAL] Fatal error: {str(e)}", file=sys.stderr)
        error_output = {'error': str(e)}
        print(json.dumps(error_output), file=sys.stdout)
        sys.exit(1)

if __name__ == '__main__':
    main()