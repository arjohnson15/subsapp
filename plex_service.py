#!/usr/bin/env python3
"""
CORRECTED Python Plex Service for JohnsonFlix Manager
Uses proper PlexAPI methods: updateFriend() for existing users, inviteFriend() for new users
FIXED: Ignores 404 errors from updateFriend since the operation actually works
UPDATED: 60 second timeouts for all operations - if it takes longer, something is wrong
"""

import sys
import json
import requests
import xml.etree.ElementTree as ET
from plexapi.myplex import MyPlexAccount
from plexapi.exceptions import PlexApiException, NotFound
import signal
import time

# Timeout handler
class TimeoutError(Exception):
    pass

def timeout_handler(signum, frame):
    raise TimeoutError("Operation timed out")

signal.signal(signal.SIGALRM, timeout_handler)

# Server configurations
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
            "server_id": "3ad72e19d4509a15d9f8253666a03efa78baac44",
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

def get_account_and_server_with_timeout(server_config):
    """Get MyPlex account and connected server with 60 second timeout"""
    signal.alarm(60)
    try:
        log_info(f"Connecting to {server_config['name']} (60s timeout)...")
        account = MyPlexAccount(token=server_config["token"])
        
        # Find server by clientIdentifier
        server_resource = None
        for resource in account.resources():
            if resource.clientIdentifier == server_config["server_id"]:
                server_resource = resource
                break
        
        if not server_resource:
            raise Exception(f"Server {server_config['server_id']} not found in account resources")
        
        server = server_resource.connect()
        signal.alarm(0)  # Cancel timeout
        log_info(f"Successfully connected to {server_config['name']}")
        return account, server
        
    except TimeoutError:
        signal.alarm(0)
        raise Exception(f"Timeout connecting to {server_config['name']} (>60s)")
    except Exception as e:
        signal.alarm(0)
        raise Exception(f"Failed to connect to {server_config['name']}: {str(e)}")

def get_user_object_and_status(account, user_email):
    """
    Get the actual user object and status - this is KEY for updateFriend()
    Returns (status, user_object_or_none)
    """
    try:
        # Try to get existing user object - this is what updateFriend() needs
        signal.alarm(60)
        user_obj = account.user(user_email)
        signal.alarm(0)
        log_info(f"Found existing user object: {user_obj.username} (ID: {user_obj.id})")
        return "existing", user_obj
        
    except NotFound:
        signal.alarm(0)
        # User doesn't exist, check for pending invites
        try:
            signal.alarm(60)
            invitations = account.pendingInvites()
            signal.alarm(0)
            
            for invite in invitations:
                if invite.email.lower() == user_email.lower():
                    log_info(f"User {user_email} has pending invite")
                    return "pending", invite
            
            log_info(f"User {user_email} is completely new")
            return "new", None
            
        except Exception:
            signal.alarm(0)
            log_info(f"User {user_email} is new (couldn't check invites)")
            return "new", None
            
    except TimeoutError:
        signal.alarm(0)
        log_error("Timeout getting user object (>60s)")
        return "error", None
    except Exception as e:
        signal.alarm(0)
        log_error(f"Error getting user object: {str(e)}")
        return "error", None

def get_current_library_access_with_timeout(account, server_config, user_email):
    """Get user's current library access using Plex.tv API with 60 second timeout"""
    signal.alarm(60)
    try:
        url = f"https://plex.tv/api/servers/{server_config['server_id']}/shared_servers"
        headers = {
            'X-Plex-Token': server_config['token'],
            'Accept': 'application/xml'
        }
        
        response = requests.get(url, headers=headers, timeout=30)
        signal.alarm(0)
        
        if response.status_code != 200:
            log_info(f"No shared users found on {server_config['name']} (HTTP {response.status_code})")
            return []
        
        root = ET.fromstring(response.content)
        
        # Find user by email
        for shared_server in root.findall('SharedServer'):
            if shared_server.get('email', '').lower() == user_email.lower():
                current_libs = []
                for section in shared_server.findall('Section'):
                    if section.get('shared') == '1':
                        current_libs.append(section.get('key'))
                
                log_info(f"User {user_email} has access to {len(current_libs)} libraries on {server_config['name']}: {current_libs}")
                return current_libs
        
        log_info(f"User {user_email} not found in shared users on {server_config['name']}")
        return []
        
    except TimeoutError:
        signal.alarm(0)
        log_error(f"Timeout checking current access (>60s)")
        return []
    except Exception as e:
        signal.alarm(0)
        log_error(f"Error checking current access: {str(e)}")
        return []

def verify_library_change_after_404(server_config, user_email, expected_library_ids, original_libs):
    """Verify that library changes actually took effect after a 404 error"""
    try:
        # Wait a moment for changes to propagate
        log_info("Waiting 5 seconds for changes to propagate...")
        time.sleep(5)
        
        # Check current access
        new_libs = get_current_library_access_with_timeout(None, server_config, user_email)
        new_set = set(new_libs)
        expected_set = set(expected_library_ids)
        original_set = set(original_libs)
        
        log_info(f"Verification after 404 error:")
        log_info(f"  Original: {original_libs}")
        log_info(f"  Expected: {expected_library_ids}")
        log_info(f"  Actual:   {new_libs}")
        
        if new_set == expected_set:
            log_info(f"? 404 error ignored successfully - libraries updated correctly!")
            return True
        elif new_set != original_set:
            log_info(f"?? Libraries changed but not exactly as expected - partial success")
            return True
        else:
            log_error(f"? No library changes detected - 404 error was real failure")
            return False
            
    except Exception as e:
        log_error(f"Error verifying library changes: {str(e)}")
        return False

def share_libraries_with_user_on_server(server_config, user_email, library_ids):
    """CORRECTED library sharing with proper API usage and 404 error handling"""
    try:
        log_info(f"Processing {user_email} on {server_config['name']} with libraries: {library_ids}")
        
        # Get account and server with 60 second timeout
        account, server = get_account_and_server_with_timeout(server_config)
        
        # Get user object and status - CRITICAL for updateFriend()
        user_status, user_obj = get_user_object_and_status(account, user_email)
        
        if user_status == "error":
            return {
                "success": False,
                "error": "Could not determine user status",
                "server": server_config['name']
            }
        
        # Get current access with 60 second timeout
        current_libs = get_current_library_access_with_timeout(account, server_config, user_email)
        current_set = set(current_libs)
        target_set = set(library_ids)
        
        # Check if changes are needed
        if current_set == target_set:
            log_info(f"No changes needed - user already has correct access")
            return {
                "success": True,
                "server": server_config['name'],
                "action": "no_changes_needed",
                "library_count": len(library_ids)
            }
        
        log_info(f"Changes needed: {current_libs} -> {library_ids}")
        
        # Handle pending invites
        if user_status == "pending":
            log_info(f"User has pending invite - cannot update until accepted")
            return {
                "success": True,
                "server": server_config['name'],
                "action": "pending_invite",
                "message": "User has pending invite - cannot update library access"
            }
        
        # Get library objects with 60 second timeout
        if len(library_ids) > 0:
            libraries_to_share = []
            
            signal.alarm(60)  # 60 second timeout for library lookup
            all_libraries = server.library.sections()
            signal.alarm(0)
            
            for lib_id in library_ids:
                library = None
                for lib in all_libraries:
                    if str(lib.key) == str(lib_id):
                        library = lib
                        break
                
                if library:
                    libraries_to_share.append(library)
                    log_info(f"Found library: {library.title} (ID: {lib_id})")
                else:
                    log_error(f"Library ID {lib_id} not found on {server_config['name']}")
            
            if not libraries_to_share and len(library_ids) > 0:
                return {
                    "success": False,
                    "error": "No valid libraries found",
                    "server": server_config['name']
                }
        else:
            libraries_to_share = []
        
        # CORRECTED: Use the right method for the right scenario
        error_was_404 = False
        action = "unknown"
        
        if user_status == "existing":
            # For existing users, use updateFriend() with the user OBJECT (not email)
            log_info(f"Updating existing user {user_obj.username} (ID: {user_obj.id}) with {len(libraries_to_share)} libraries")
            
            try:
                signal.alarm(60)  # 60 second timeout
                account.updateFriend(
                    user_obj,  # Pass the USER OBJECT, not email string
                    server,
                    sections=libraries_to_share,
                    allowSync=True,
                    allowCameraUpload=False,
                    allowChannels=False
                )
                signal.alarm(0)
                action = "updated_existing_user"
                log_info(f"? updateFriend() completed successfully")
                
            except PlexApiException as e:
                signal.alarm(0)
                error_str = str(e).lower()
                
                # FIXED: Check for the specific 404 sharing error that we know still works
                if "404" in error_str and ("sharing" in error_str or "not_found" in error_str):
                    log_info(f"?? Got expected 404 error from updateFriend() - verifying if changes took effect...")
                    error_was_404 = True
                    action = "updated_existing_user_with_404"
                    
                    # Verify the changes actually happened despite the 404 error
                    if verify_library_change_after_404(server_config, user_email, library_ids, current_libs):
                        log_info(f"? 404 error ignored - updateFriend() actually worked!")
                    else:
                        log_error(f"? 404 error was a real failure")
                        return {
                            "success": False,
                            "error": f"updateFriend failed with 404 and no changes detected: {str(e)[:200]}",
                            "server": server_config['name']
                        }
                else:
                    # Real error, not the ignorable 404
                    log_error(f"Real Plex API error (not ignorable 404): {str(e)}")
                    return {
                        "success": False,
                        "error": f"Plex API error: {str(e)[:200]}",
                        "server": server_config['name']
                    }
            
        elif user_status == "new":
            # For new users, use inviteFriend() with email
            log_info(f"Inviting new user {user_email} with {len(libraries_to_share)} libraries")
            
            signal.alarm(60)  # 60 second timeout
            account.inviteFriend(
                user_email,  # Email is fine for new users
                server,
                sections=libraries_to_share,
                allowSync=True,
                allowCameraUpload=False,
                allowChannels=False
            )
            signal.alarm(0)
            action = "invited_new_user"
        
        else:
            return {
                "success": False,
                "error": f"Unexpected user status: {user_status}",
                "server": server_config['name']
            }
        
        shared_library_names = [lib.title for lib in libraries_to_share]
        result_message = f"Successfully processed {user_email}: {shared_library_names}"
        
        if error_was_404:
            result_message += " (ignored 404 error)"
        
        log_info(result_message)
        
        return {
            "success": True,
            "server": server_config['name'],
            "action": action,
            "libraries_shared": shared_library_names,
            "library_count": len(libraries_to_share),
            "ignored_404_error": error_was_404
        }
        
    except TimeoutError:
        return {
            "success": False,
            "error": "Operation timed out after 60 seconds",
            "server": server_config['name']
        }
    except PlexApiException as e:
        log_error(f"Plex API error on {server_config['name']}: {str(e)}")
        return {
            "success": False,
            "error": f"Plex API error: {str(e)[:200]}...",
            "server": server_config['name']
        }
    except Exception as e:
        log_error(f"Error on {server_config['name']}: {str(e)}")
        return {
            "success": False,
            "error": str(e)[:200] + "..." if len(str(e)) > 200 else str(e),
            "server": server_config['name']
        }

def share_libraries_with_user(user_email, server_group, library_selection):
    """
    Share libraries with a user across a server group
    """
    try:
        if server_group not in PLEX_SERVERS:
            raise Exception(f"Invalid server group: {server_group}")
        
        group_config = PLEX_SERVERS[server_group]
        results = {
            "success": True,
            "server_group": server_group,
            "changes_made": 0,
            "details": {}
        }
        
        # Process regular server
        regular_libs = library_selection.get('regular', [])
        log_info(f"Processing regular server with {len(regular_libs)} libraries")
        
        regular_result = share_libraries_with_user_on_server(
            group_config['regular'], 
            user_email, 
            regular_libs
        )
        results['details']['regular'] = regular_result
        
        if regular_result['success'] and regular_result.get('action') in [
            'updated_existing_user', 'invited_new_user', 'updated_existing_user_with_404'
        ]:
            results['changes_made'] += 1
        
        # Process 4K server
        fourk_libs = library_selection.get('fourk', [])
        log_info(f"Processing 4K server with {len(fourk_libs)} libraries")
        
        fourk_result = share_libraries_with_user_on_server(
            group_config['fourk'], 
            user_email, 
            fourk_libs
        )
        results['details']['fourk'] = fourk_result
        
        if fourk_result['success'] and fourk_result.get('action') in [
            'updated_existing_user', 'invited_new_user', 'updated_existing_user_with_404'
        ]:
            results['changes_made'] += 1
        
        # Overall success check
        if not regular_result['success'] or not fourk_result['success']:
            results['success'] = False
        
        return results
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "server_group": server_group,
            "changes_made": 0
        }

def remove_user_from_server(server_config, user_email):
    """Remove user from a specific server"""
    try:
        log_info(f"Removing {user_email} from {server_config['name']}")
        
        account, server = get_account_and_server_with_timeout(server_config)
        user_status, user_obj = get_user_object_and_status(account, user_email)
        
        if user_status == "existing" and user_obj:
            # Use the user object for removal
            signal.alarm(60)
            account.removeFriend(user_obj)  # Pass user object, not email
            signal.alarm(0)
            log_info(f"Removed {user_email} from {server_config['name']}")
            return {
                "success": True,
                "server": server_config['name'],
                "action": "removed"
            }
        elif user_status == "pending":
            log_info(f"User {user_email} has pending invite on {server_config['name']}")
            return {
                "success": True,
                "server": server_config['name'],
                "action": "pending_invite_exists"
            }
        else:
            log_info(f"User {user_email} not found on {server_config['name']}")
            return {
                "success": True,
                "server": server_config['name'],
                "action": "not_found"
            }
            
    except Exception as e:
        log_error(f"Error removing user from {server_config['name']}: {str(e)}")
        return {
            "success": False,
            "error": str(e)[:200] + "..." if len(str(e)) > 200 else str(e),
            "server": server_config['name']
        }

def remove_user_from_server_group(user_email, server_group):
    """Remove user from all servers in a group"""
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
        regular_result = remove_user_from_server(group_config['regular'], user_email)
        results['details']['regular'] = regular_result
        
        # Remove from 4K server
        fourk_result = remove_user_from_server(group_config['fourk'], user_email)
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

def main():
    """Main CLI interface with global timeout"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command provided"}))
        return
    
    command = sys.argv[1]
    
    # Set global timeout for entire operation - 2 minutes max
    signal.alarm(120)  # 120 second max for any operation
    
    try:
        if command == "share_libraries" and len(sys.argv) >= 5:
            user_email = sys.argv[2]
            server_group = sys.argv[3]
            library_selection = json.loads(sys.argv[4])
            
            result = share_libraries_with_user(user_email, server_group, library_selection)
            print(json.dumps(result, indent=2))
            
        elif command == "remove_user" and len(sys.argv) >= 4:
            user_email = sys.argv[2]
            server_group = sys.argv[3]
            
            result = remove_user_from_server_group(user_email, server_group)
            print(json.dumps(result, indent=2))
            
        else:
            print(json.dumps({
                "error": "Invalid command or arguments",
                "usage": {
                    "share_libraries": "python plex_service.py share_libraries user@email.com plex1 '{\"regular\":[\"22\",\"1\"],\"fourk\":[\"1\"]}'",
                    "remove_user": "python plex_service.py remove_user user@email.com plex1"
                }
            }))
            
    except TimeoutError:
        print(json.dumps({
            "error": "Operation timed out after 2 minutes",
            "success": False
        }))
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON in arguments: {str(e)}"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
    finally:
        signal.alarm(0)  # Cancel any remaining alarms

if __name__ == "__main__":
    main()