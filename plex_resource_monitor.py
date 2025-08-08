#!/usr/bin/env python3
"""
Plex Resource Monitor Script - Gets REAL CPU/Memory from Plex API
Using the correct PlexAPI resources() method
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

def get_plex_resources(server_config):
    """Get real CPU/Memory resources using PlexAPI's resources() method"""
    try:
        # Use PlexAPI to get the server object
        plex = PlexServer(server_config['url'], server_config['token'], timeout=10)
        
        print(f"[DEBUG] Getting resource statistics for {server_config['name']}", file=sys.stderr)
        
        # Use the correct PlexAPI method: plex.resources()
        try:
            print(f"[DEBUG] Calling plex.resources() for {server_config['name']}", file=sys.stderr)
            
            # This is the correct method from the PlexAPI documentation
            resources = plex.resources()
            
            print(f"[DEBUG] plex.resources() returned: {type(resources)}", file=sys.stderr)
            print(f"[DEBUG] Number of resource entries: {len(resources) if resources else 0}", file=sys.stderr)
            
            if resources and len(resources) > 0:
                # Get the most recent resource data (last entry)
                latest_resource = resources[-1]
                
                print(f"[DEBUG] Latest resource object: {latest_resource}", file=sys.stderr)
                print(f"[DEBUG] Resource object type: {type(latest_resource)}", file=sys.stderr)
                print(f"[DEBUG] Resource attributes: {[attr for attr in dir(latest_resource) if not attr.startswith('_')]}", file=sys.stderr)
                
                # Extract CPU and memory data using the documented attributes
                host_cpu = getattr(latest_resource, 'hostCpuUtilization', 0)
                host_memory = getattr(latest_resource, 'hostMemoryUtilization', 0)
                process_cpu = getattr(latest_resource, 'processCpuUtilization', 0)
                process_memory = getattr(latest_resource, 'processMemoryUtilization', 0)
                timestamp = getattr(latest_resource, 'at', None)
                
                print(f"[DEBUG] Extracted values:", file=sys.stderr)
                print(f"[DEBUG] - Host CPU: {host_cpu}", file=sys.stderr)
                print(f"[DEBUG] - Host Memory: {host_memory}", file=sys.stderr)
                print(f"[DEBUG] - Process CPU: {process_cpu}", file=sys.stderr)
                print(f"[DEBUG] - Process Memory: {process_memory}", file=sys.stderr)
                print(f"[DEBUG] - Timestamp: {timestamp}", file=sys.stderr)
                
                if host_cpu > 0 or host_memory > 0:
                    print(f"[REAL] {server_config['name']}: CPU {host_cpu:.1f}%, Memory {host_memory:.1f}% (resources method)", file=sys.stderr)
                    
                    return {
                        'cpu_usage_percent': round(host_cpu, 1),
                        'memory_usage_percent': round(host_memory, 1),
                        'source': 'plexapi_resources',
                        'found_data': True,
                        'process_cpu': round(process_cpu, 1),
                        'process_memory': round(process_memory, 1),
                        'timestamp': str(timestamp) if timestamp else None
                    }
                else:
                    print(f"[INFO] {server_config['name']}: Got resource data but CPU/Memory are 0", file=sys.stderr)
            else:
                print(f"[INFO] {server_config['name']}: plex.resources() returned empty list", file=sys.stderr)
                
        except Exception as resources_error:
            print(f"[ERROR] plex.resources() failed: {resources_error}", file=sys.stderr)
            print(f"[DEBUG] Error type: {type(resources_error)}", file=sys.stderr)
            print(f"[DEBUG] Error details: {str(resources_error)[:500]}", file=sys.stderr)
        
        # If we get here, the resources() method didn't work
        print(f"[INFO] Could not get resource data from {server_config['name']} using resources() method", file=sys.stderr)
        return {
            'cpu_usage_percent': 0,
            'memory_usage_percent': 0,
            'source': 'resources_method_failed',
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

def estimate_resources_from_sessions(transcoding_sessions, direct_play_sessions):
    """Estimate CPU/Memory usage based on active sessions"""
    # Base estimate: 5% CPU + 15% per transcoding + 2% per direct play
    estimated_cpu = min(95, 5 + (transcoding_sessions * 15) + (direct_play_sessions * 2))
    
    # Base estimate: 20% Memory + 10% per transcoding + 3% per direct play
    estimated_memory = min(90, 20 + (transcoding_sessions * 10) + (direct_play_sessions * 3))
    
    return estimated_cpu, estimated_memory

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
        system_resources = get_plex_resources(server_config)
        
        # If we got real data, use it
        if system_resources.get('found_data'):
            resource_data['resources']['cpu_usage_percent'] = system_resources['cpu_usage_percent']
            resource_data['resources']['memory_usage_percent'] = system_resources['memory_usage_percent']
            resource_data['resources']['monitoring_source'] = system_resources.get('source', 'unknown')
            resource_data['resources']['found_real_data'] = True
            
            # Also include process-specific data if available
            if 'process_cpu' in system_resources:
                resource_data['resources']['process_cpu_percent'] = system_resources['process_cpu']
                resource_data['resources']['process_memory_percent'] = system_resources['process_memory']
            
            print(f"[REAL] {server_config['name']}: CPU {system_resources['cpu_usage_percent']:.1f}%, Memory {system_resources['memory_usage_percent']:.1f}%", file=sys.stderr)
        else:
            # Fall back to estimation based on sessions
            transcoding = resource_data['resources']['transcoding_sessions']
            direct_play = resource_data['resources']['direct_play_sessions']
            
            estimated_cpu, estimated_memory = estimate_resources_from_sessions(transcoding, direct_play)
            
            resource_data['resources']['cpu_usage_percent'] = estimated_cpu
            resource_data['resources']['memory_usage_percent'] = estimated_memory
            resource_data['resources']['monitoring_source'] = 'session_estimation'
            resource_data['resources']['found_real_data'] = False
            resource_data['resources']['estimation_note'] = f'Estimates based on {transcoding} transcoding + {direct_play} direct play sessions'
            
            print(f"[ESTIMATE] {server_config['name']}: CPU {estimated_cpu}%, Memory {estimated_memory}% (based on sessions)", file=sys.stderr)
        
        resource_data['resources']['server_status'] = 'online'
        
        if 'error_message' in system_resources:
            resource_data['resources']['monitoring_error'] = system_resources['error_message']
        
        # ADD DETAILED DEBUG OF FINAL RESOURCE DATA
        print(f"[DEBUG] Final resource data for {server_config['name']}:", file=sys.stderr)
        print(f"[DEBUG] - CPU: {resource_data['resources']['cpu_usage_percent']}", file=sys.stderr)
        print(f"[DEBUG] - Memory: {resource_data['resources']['memory_usage_percent']}", file=sys.stderr)
        print(f"[DEBUG] - Status: {resource_data['resources']['server_status']}", file=sys.stderr)
        print(f"[DEBUG] - Source: {resource_data['resources']['monitoring_source']}", file=sys.stderr)
        print(f"[DEBUG] - Found real data: {resource_data['resources']['found_real_data']}", file=sys.stderr)
        
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