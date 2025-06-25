#!/usr/bin/env python3
"""
Clean Python Plex Service for JohnsonFlix Manager
Based on PlexAPI documentation best practices
"""

import sys
import json
import requests
import xml.etree.ElementTree as ET
from plexapi.myplex import MyPlexAccount
from plexapi.exceptions import PlexApiException, NotFound

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

def get_account_and_server(server_config):
    """Get MyPlex account and connected server"""
    try:
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
        return account, server
        
    except Exception as e:
        raise Exception(f"Failed to connect to {server_config['name']}: {str(e)}")

def get_user_status(account, user_email):
    """
    Check user status: 'existing', 'pending', or 'new'
    Returns (status, user_object_or_none)
    """
    try:
        # Try to get existing user
        user = account.user(user_email)
        log_info(f"User {user_email} exists as {user.username}")
        return "existing", user
    except NotFound:
        # User doesn't exist, check for pending invites
        try:
            invitations = account.pendingInvites()
            for invite in invitations:
                if invite.email.lower() == user_email.lower():
                    log_info(f"User {user_email} has pending invite")
                    return "pending", invite
            
            log_info(f"User {user_email} is completely new")
            return "new", None
            
        except Exception:
            log_info(f"User {user_email} is new (couldn't check invites)")
            return "new", None
    except Exception as e:
        log_error(f"Error checking user status: {str(e)}")
        return "error", None

def get_current_library_access(account, server_config, user_email):
    """Get user's current library access using Plex.tv API"""
    try:
        url = f"https://plex.tv/api/servers/{server_config['server_id']}/shared_servers"
        headers = {
            'X-Plex-Token': server_config['token'],
            'Accept': 'application/xml'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
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
        
    except Exception as e:
        log_error(f"Error checking current access: {str(e)}")
        return []

def share_libraries_with_user_on_server(server_config, user_email, library_ids):
    """Share specific libraries with a user on one server"""
    try:
        log_info(f"Processing {user_email} on {server_config['name']} with libraries: {library_ids}")
        
        # Get account and server
        account, server = get_account_and_server(server_config)
        
        # Check user status
        user_status, user_obj = get_user_status(account, user_email)
        
        # Get current access
        current_libs = get_current_library_access(account, server_config, user_email)
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
        
        # Handle different user statuses
        if user_status == "pending":
            log_info(f"User has pending invite - cannot update until accepted")
            return {
                "success": True,
                "server": server_config['name'],
                "action": "pending_invite",
                "message": "User has pending invite - cannot update library access"
            }
        
        # Get library objects for target libraries
        libraries_to_share = []
        if len(library_ids) > 0:
            all_libraries = server.library.sections()
            
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
            
            if not libraries_to_share:
                return {
                    "success": False,
                    "error": "No valid libraries found",
                    "server": server_config['name']
                }
        
        # Choose the right method based on user status
        if user_status == "existing":
            # For existing users, use updateFriend
            log_info(f"Updating existing user {user_email} access to {len(libraries_to_share)} libraries")
            account.updateFriend(
                user_email,
                server,
                sections=libraries_to_share,
                allowSync=True,
                allowCameraUpload=False,
                allowChannels=False
            )
            
            if len(libraries_to_share) > 0:
                action = "updated_access"
            else:
                action = "removed_all_access"
        else:
            # For new users, use inviteFriend
            log_info(f"Inviting new user {user_email} to {len(libraries_to_share)} libraries")
            account.inviteFriend(
                user_email,
                server,
                sections=libraries_to_share,
                allowSync=True,
                allowCameraUpload=False,
                allowChannels=False
            )
            action = "invited_new_user"
        
        shared_library_names = [lib.title for lib in libraries_to_share]
        log_info(f"Successfully processed {user_email}: {shared_library_names}")
        
        return {
            "success": True,
            "server": server_config['name'],
            "action": action,
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
        log_error(f"Error on {server_config['name']}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "server": server_config['name']
        }

def share_libraries_with_user(user_email, server_group, library_selection):
    """
    Share libraries with a user across a server group
    
    Args:
        user_email: User's email address
        server_group: 'plex1' or 'plex2'
        library_selection: {
            'regular': ['22', '1', '13'],  # Library IDs for regular server
            'fourk': ['1']                 # Library IDs for 4K server
        }
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
            'updated_access', 'invited_new_user', 'removed_all_access'
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
            'updated_access', 'invited_new_user', 'removed_all_access'
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
        
        account, server = get_account_and_server(server_config)
        user_status, user_obj = get_user_status(account, user_email)
        
        if user_status == "existing":
            account.removeFriend(user_email)
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
            "error": str(e),
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

def check_invite_status_all_servers(user_email):
    """Check user status across all servers"""
    try:
        log_info(f"Checking status for {user_email} across all servers")
        
        results = {}
        
        for server_group, group_config in PLEX_SERVERS.items():
            results[server_group] = {}
            
            # Check regular server
            try:
                account, _ = get_account_and_server(group_config['regular'])
                status, _ = get_user_status(account, user_email)
                results[server_group]['regular'] = {
                    "status": status,
                    "server": group_config['regular']['name']
                }
            except Exception as e:
                results[server_group]['regular'] = {
                    "status": "error",
                    "server": group_config['regular']['name'],
                    "error": str(e)
                }
            
            # Check 4K server
            try:
                account, _ = get_account_and_server(group_config['fourk'])
                status, _ = get_user_status(account, user_email)
                results[server_group]['fourk'] = {
                    "status": status,
                    "server": group_config['fourk']['name']
                }
            except Exception as e:
                results[server_group]['fourk'] = {
                    "status": "error",
                    "server": group_config['fourk']['name'],
                    "error": str(e)
                }
        
        return {
            "success": True,
            "user_email": user_email,
            "invite_status": results
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "user_email": user_email
        }

def test_library_update(user_email, server_group, library_selection):
    """Test library update with before/after comparison"""
    try:
        log_info(f"Testing library update for {user_email} on {server_group}")
        
        # Get current access before update
        current_access = {}
        if server_group in PLEX_SERVERS:
            group_config = PLEX_SERVERS[server_group]
            
            try:
                account, _ = get_account_and_server(group_config['regular'])
                current_access['regular'] = get_current_library_access(
                    account, group_config['regular'], user_email
                )
            except:
                current_access['regular'] = []
            
            try:
                account, _ = get_account_and_server(group_config['fourk'])
                current_access['fourk'] = get_current_library_access(
                    account, group_config['fourk'], user_email
                )
            except:
                current_access['fourk'] = []
        
        # Perform the update
        result = share_libraries_with_user(user_email, server_group, library_selection)
        
        return {
            "success": result['success'],
            "user_email": user_email,
            "server_group": server_group,
            "previous_access": current_access,
            "requested_libraries": library_selection,
            "update_result": result
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
            
        elif command == "check_invite_status" and len(sys.argv) >= 3:
            user_email = sys.argv[2]
            
            result = check_invite_status_all_servers(user_email)
            print(json.dumps(result, indent=2))
            
        elif command == "test_update" and len(sys.argv) >= 5:
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
                    "check_invite_status": "python plex_service.py check_invite_status user@email.com",
                    "test_update": "python plex_service.py test_update user@email.com plex1 '{\"regular\":[\"22\",\"1\"],\"fourk\":[\"1\"]}'"
                }
            }))
            
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON in arguments: {str(e)}"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()