#!/usr/bin/env python3
"""
Python Plex Service for JohnsonFlix Manager
Handles all library sharing, invitations, and user management via PlexAPI
"""

import sys
import json
import requests
import xml.etree.ElementTree as ET
from plexapi.myplex import MyPlexAccount
from plexapi.exceptions import PlexApiException

# Server configurations (matches your Node.js config)
PLEX_SERVERS = {
    "plex1": {
        "regular": {
            "name": "Plex 1",
            "server_id": "3ad72e19d4509a15d9f8253666a03efa78baac44",
            "token": "sxuautpKvoH2aZKG-j95",
            "friendly_name": "JohnsonFlix"
        },
        "fourk": {
            "name": "Plex 1 4K",
            "server_id": "90244d9a956da3afad32f85d6b24a9c24649d681",
            "token": "sxuautpKvoH2aZKG-j95",
            "friendly_name": "JohnsonFlix 4K"
        }
    },
    "plex2": {
        "regular": {
            "name": "Plex 2",
            "server_id": "3ad72e19d4509a15d9f8253666a03efa78baac44",  # Same server, different token
            "token": "B1QhFRA-Q2pSm15uxmMA",
            "friendly_name": "JohnsonFlix"
        },
        "fourk": {
            "name": "Plex 2 4K",
            "server_id": "c6448117a95874f18274f31495ff5118fd291089",
            "token": "B1QhFRA-Q2pSm15uxmMA",
            "friendly_name": "Plex 4K."
        }
    }
}

def log_error(message):
    """Log errors to stderr for Node.js to capture"""
    print(f"ERROR: {message}", file=sys.stderr)

def log_info(message):
    """Log info to stderr for Node.js to capture"""
    print(f"INFO: {message}", file=sys.stderr)

def get_plex_server(server_config):
    """Get a connected Plex server instance"""
    try:
        account = MyPlexAccount(token=server_config["token"])
        server = next(
            (res.connect() for res in account.resources() 
             if res.clientIdentifier == server_config["server_id"]), 
            None
        )
        if not server:
            raise Exception(f"Server {server_config['server_id']} not found")
        return account, server
    except Exception as e:
        raise Exception(f"Failed to connect to {server_config['name']}: {str(e)}")

def share_libraries_with_user(user_email, server_group, library_selection):
    """
    Share specific libraries with a user on a server group
    
    Args:
        user_email: Email of the user to share with
        server_group: 'plex1' or 'plex2'
        library_selection: {
            'regular': ['22', '1', '13', ...],  # Library IDs for regular server
            'fourk': ['1']                      # Library IDs for 4K server
        }
    """
    try:
        results = {
            "success": True,
            "server_group": server_group,
            "changes_made": 0,
            "details": {}
        }
        
        if server_group not in PLEX_SERVERS:
            raise Exception(f"Invalid server group: {server_group}")
        
        group_config = PLEX_SERVERS[server_group]
        
        # Handle regular server
        regular_libs = library_selection.get('regular', [])
        if regular_libs:
            log_info(f"Sharing {len(regular_libs)} regular libraries with {user_email} on {server_group}")
            result = share_libraries_on_server(user_email, group_config['regular'], regular_libs)
            results['details']['regular'] = result
            if result['success']:
                results['changes_made'] += 1
        else:
            log_info(f"No regular libraries specified for {user_email} on {server_group}")
            # Remove access if no libraries specified
            result = remove_user_from_server(user_email, group_config['regular'])
            results['details']['regular'] = result
        
        # Handle 4K server
        fourk_libs = library_selection.get('fourk', [])
        if fourk_libs:
            log_info(f"Sharing {len(fourk_libs)} 4K libraries with {user_email} on {server_group}")
            result = share_libraries_on_server(user_email, group_config['fourk'], fourk_libs)
            results['details']['fourk'] = result
            if result['success']:
                results['changes_made'] += 1
        else:
            log_info(f"No 4K libraries specified for {user_email} on {server_group}")
            # Remove access if no libraries specified
            result = remove_user_from_server(user_email, group_config['fourk'])
            results['details']['fourk'] = result
        
        # Check if any operations failed
        if not results['details']['regular']['success'] or not results['details']['fourk']['success']:
            results['success'] = False
        
        return results
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "server_group": server_group,
            "changes_made": 0
        }

def share_libraries_on_server(user_email, server_config, library_ids):
    """Share specific libraries with a user on a single server"""
    try:
        log_info(f"Connecting to {server_config['name']}...")
        account, server = get_plex_server(server_config)
        
        # Get the actual library objects
        libraries_to_share = []
        for lib_id in library_ids:
            library = None
            for lib in server.library.sections():
                if str(lib.key) == str(lib_id):
                    library = lib
                    break
            
            if library:
                libraries_to_share.append(library)
                log_info(f"Found library: {library.title} (ID: {lib_id})")
            else:
                log_error(f"Library ID {lib_id} not found on {server_config['name']}")
        
        if not libraries_to_share:
            return {
                "success": False,
                "error": "No valid libraries found to share",
                "server": server_config['name']
            }
        
        # Use inviteFriend to share libraries (this handles existing users correctly)
        log_info(f"Inviting {user_email} to {len(libraries_to_share)} libraries on {server_config['name']}")
        account.inviteFriend(
            user_email,
            server,
            sections=libraries_to_share,
            allowSync=True,
            allowCameraUpload=False,
            allowChannels=False,
        )
        
        shared_library_names = [lib.title for lib in libraries_to_share]
        log_info(f"Successfully shared libraries with {user_email}: {shared_library_names}")
        
        return {
            "success": True,
            "server": server_config['name'],
            "libraries_shared": shared_library_names,
            "library_count": len(libraries_to_share)
        }
        
    except PlexApiException as e:
        log_error(f"Plex API error on {server_config['name']}: {str(e)}")
        return {
            "success": False,
            "error": f"Plex API error: {str(e)}",
            "server": server_config['name']
        }
    except Exception as e:
        log_error(f"Error sharing libraries on {server_config['name']}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "server": server_config['name']
        }

def remove_user_from_server(user_email, server_config):
    """Remove a user's access from a specific server"""
    try:
        log_info(f"Removing {user_email} from {server_config['name']}...")
        account, server = get_plex_server(server_config)
        
        # Check if user exists
        try:
            user = account.user(user_email)
            if user:
                account.removeFriend(user_email)
                log_info(f"Removed {user_email} from {server_config['name']}")
                return {
                    "success": True,
                    "server": server_config['name'],
                    "action": "removed"
                }
            else:
                log_info(f"User {user_email} not found on {server_config['name']}")
                return {
                    "success": True,
                    "server": server_config['name'],
                    "action": "not_found"
                }
        except Exception as e:
            log_info(f"User {user_email} not found on {server_config['name']}: {str(e)}")
            return {
                "success": True,
                "server": server_config['name'],
                "action": "not_found"
            }
            
    except Exception as e:
        log_error(f"Error removing user from {server_config['name']}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "server": server_config['name']
        }

def remove_user_from_server_group(user_email, server_group):
    """Remove a user from all servers in a group"""
    try:
        if server_group not in PLEX_SERVERS:
            raise Exception(f"Invalid server group: {server_group}")
        
        group_config = PLEX_SERVERS[server_group]
        results = {
            "success": True,
            "server_group": server_group,
            "details": {}
        }
        
        # Remove from regular server
        regular_result = remove_user_from_server(user_email, group_config['regular'])
        results['details']['regular'] = regular_result
        
        # Remove from 4K server
        fourk_result = remove_user_from_server(user_email, group_config['fourk'])
        results['details']['fourk'] = fourk_result
        
        if not regular_result['success'] or not fourk_result['success']:
            results['success'] = False
        
        return results
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "server_group": server_group
        }

def test_library_update(user_email, server_group, library_selection):
    """Test updating a user's library access and return before/after comparison"""
    try:
        log_info(f"Testing library update for {user_email} on {server_group}")
        
        # Get current access (we'll get this from Node.js side since it's working)
        log_info("Performing library update...")
        
        # Perform the update
        result = share_libraries_with_user(user_email, server_group, library_selection)
        
        return {
            "success": result['success'],
            "user_email": user_email,
            "server_group": server_group,
            "requested_libraries": library_selection,
            "update_result": result,
            "note": "Library update completed via Python PlexAPI"
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "user_email": user_email,
            "server_group": server_group
        }

def main():
    """Main CLI interface"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command provided"}))
        return
    
    command = sys.argv[1]
    
    try:
        if command == "share_libraries" and len(sys.argv) >= 5:
            # python plex_service.py share_libraries user@email.com plex1 '{"regular":["22","1"],"fourk":["1"]}'
            user_email = sys.argv[2]
            server_group = sys.argv[3]
            library_selection = json.loads(sys.argv[4])
            
            result = share_libraries_with_user(user_email, server_group, library_selection)
            print(json.dumps(result, indent=2))
            
        elif command == "remove_user" and len(sys.argv) >= 4:
            # python plex_service.py remove_user user@email.com plex1
            user_email = sys.argv[2]
            server_group = sys.argv[3]
            
            result = remove_user_from_server_group(user_email, server_group)
            print(json.dumps(result, indent=2))
            
        elif command == "test_update" and len(sys.argv) >= 5:
            # python plex_service.py test_update user@email.com plex1 '{"regular":["22","1"],"fourk":["1"]}'
            user_email = sys.argv[2]
            server_group = sys.argv[3]
            library_selection = json.loads(sys.argv[4])
            
            result = test_library_update(user_email, server_group, library_selection)
            print(json.dumps(result, indent=2))
            
        else:
            print(json.dumps({
                "error": "Invalid command or arguments",
                "usage": {
                    "share_libraries": "python plex_service.py share_libraries user@email.com plex1 '{\"regular\":[\"22\",\"1\"],\"fourk\":[\"1\"]}'",
                    "remove_user": "python plex_service.py remove_user user@email.com plex1",
                    "test_update": "python plex_service.py test_update user@email.com plex1 '{\"regular\":[\"22\",\"1\"],\"fourk\":[\"1\"]}'"
                }
            }))
            
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON in arguments: {str(e)}"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()