#!/usr/bin/env python3
"""
Fixed Python Plex Service for JohnsonFlix Manager
Handles both new invitations AND updating existing shared users
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

def check_if_user_exists(account, user_email):
    """Check if user is already shared with any servers"""
    try:
        # Try to get the user - this will work if they're already shared
        user = account.user(user_email)
        log_info(f"User {user_email} already exists as {user.username}")
        return user
    except Exception:
        # User doesn't exist yet - but check if there's a pending invite
        try:
            invitations = account.pendingInvites()
            invite = next((invite for invite in invitations if invite.email.lower() == user_email.lower()), None)
            if invite:
                log_info(f"User {user_email} has pending invite")
                return "pending"
            else:
                log_info(f"User {user_email} is completely new")
                return None
        except Exception:
            log_info(f"User {user_email} is new (couldn't check invites)")
            return None

def get_user_current_library_access(account, server_config, user_email):
    """Get current library access for a user on a specific server using Plex.tv API"""
    try:
        # Use the Plex.tv API to get shared servers
        url = f"https://plex.tv/api/servers/{server_config['server_id']}/shared_servers"
        headers = {
            'X-Plex-Token': server_config['token'],
            'Accept': 'application/xml'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            log_info(f"No shared users found on {server_config['name']} (status: {response.status_code})")
            return []
        
        # Parse XML response
        root = ET.fromstring(response.content)
        
        # Find our user by email
        for shared_server in root.findall('SharedServer'):
            if shared_server.get('email', '').lower() == user_email.lower():
                # Get their current libraries
                current_libs = []
                for section in shared_server.findall('Section'):
                    if section.get('shared') == '1':
                        current_libs.append(section.get('key'))
                
                log_info(f"User {user_email} currently has access to {len(current_libs)} libraries on {server_config['name']}: {current_libs}")
                return current_libs
        
        log_info(f"User {user_email} not found in shared users on {server_config['name']}")
        return []
        
    except Exception as e:
        log_error(f"Error checking current access for {server_config['name']}: {str(e)}")
        return []

def update_existing_user_libraries(account, server, server_config, user_email, target_library_ids):
    """Update library access for an existing user"""
    try:
        log_info(f"Updating existing user {user_email} on {server_config['name']}")
        
        # Get current access
        current_libs = get_user_current_library_access(account, server_config, user_email)
        
        # Compare with target
        current_set = set(current_libs)
        target_set = set(target_library_ids)
        
        if current_set == target_set:
            log_info(f"No changes needed - user already has correct access")
            return {
                "success": True,
                "server": server_config['name'],
                "action": "no_changes_needed",
                "current_libraries": current_libs,
                "target_libraries": target_library_ids
            }
        
        # Get the actual library objects
        libraries_to_share = []
        for lib_id in target_library_ids:
            library = None
            for lib in server.library.sections():
                if str(lib.key) == str(lib_id):
                    library = lib
                    break
            
            if library:
                libraries_to_share.append(library)
                log_info(f"Will share library: {library.title} (ID: {lib_id})")
            else:
                log_error(f"Library ID {lib_id} not found on {server_config['name']}")
        
        if not libraries_to_share and len(target_library_ids) > 0:
            return {
                "success": False,
                "error": "No valid libraries found to share",
                "server": server_config['name']
            }
        
        # Update the user's access
        if len(libraries_to_share) > 0:
            log_info(f"Updating {user_email} access to {len(libraries_to_share)} libraries")
            account.updateFriend(
                user_email,
                server,
                sections=libraries_to_share,
                allowSync=True,
                allowCameraUpload=False,
                allowChannels=False,
            )
            action = "updated_access"
        else:
            # Remove all access
            log_info(f"Removing all library access for {user_email}")
            account.updateFriend(
                user_email,
                server,
                sections=[],  # Empty list removes all access
                allowSync=False,
                allowCameraUpload=False,
                allowChannels=False,
            )
            action = "removed_access"
        
        shared_library_names = [lib.title for lib in libraries_to_share]
        log_info(f"Successfully updated libraries for {user_email}: {shared_library_names}")
        
        return {
            "success": True,
            "server": server_config['name'],
            "action": action,
            "libraries_shared": shared_library_names,
            "library_count": len(libraries_to_share),
            "previous_libraries": current_libs,
            "new_libraries": target_library_ids
        }
        
    except PlexApiException as e:
        log_error(f"Plex API error updating user on {server_config['name']}: {str(e)}")
        return {
            "success": False,
            "error": f"Plex API error: {str(e)}",
            "server": server_config['name']
        }
    except Exception as e:
        log_error(f"Error updating user on {server_config['name']}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "server": server_config['name']
        }

def invite_new_user_to_libraries(account, server, server_config, user_email, target_library_ids):
    """Invite a new user to specific libraries"""
    try:
        log_info(f"Inviting new user {user_email} to {server_config['name']}")
        
        # Get the actual library objects
        libraries_to_share = []
        for lib_id in target_library_ids:
            library = None
            for lib in server.library.sections():
                if str(lib.key) == str(lib_id):
                    library = lib
                    break
            
            if library:
                libraries_to_share.append(library)
                log_info(f"Will share library: {library.title} (ID: {lib_id})")
            else:
                log_error(f"Library ID {lib_id} not found on {server_config['name']}")
        
        if not libraries_to_share:
            if len(target_library_ids) > 0:
                return {
                    "success": False,
                    "error": "No valid libraries found to share",
                    "server": server_config['name']
                }
            else:
                # No libraries to share - this is valid
                return {
                    "success": True,
                    "server": server_config['name'],
                    "action": "no_libraries_to_share",
                    "library_count": 0
                }
        
        # Invite the user
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
        log_info(f"Successfully invited {user_email} to libraries: {shared_library_names}")
        
        return {
            "success": True,
            "server": server_config['name'],
            "action": "invited_new_user",
            "libraries_shared": shared_library_names,
            "library_count": len(libraries_to_share)
        }
        
    except PlexApiException as e:
        log_error(f"Plex API error inviting user to {server_config['name']}: {str(e)}")
        return {
            "success": False,
            "error": f"Plex API error: {str(e)}",
            "server": server_config['name']
        }
    except Exception as e:
        log_error(f"Error inviting user to {server_config['name']}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "server": server_config['name']
        }

def share_libraries_on_server_smart(server_config, user_email, library_ids):
    """Smart library sharing that handles new users, existing users, and pending invites"""
    try:
        log_info(f"Smart sharing for {user_email} on {server_config['name']} with libraries: {library_ids}")
        
        account, server = get_plex_server(server_config)
        
        # Check user status
        user_status = check_if_user_exists(account, user_email)
        
        if user_status == "pending":
            # User has pending invite - we can't update them yet
            log_info(f"User {user_email} has pending invite on {server_config['name']} - cannot update until accepted")
            return {
                "success": True,
                "server": server_config['name'],
                "action": "pending_invite",
                "message": "User has pending invite - cannot update library access until invite is accepted",
                "library_count": len(library_ids)
            }
        elif user_status and user_status != "pending":
            # User exists and is active - update their access
            log_info(f"Updating existing user {user_email} on {server_config['name']}")
            return update_existing_user_libraries(account, server, server_config, user_email, library_ids)
        else:
            # New user - invite them
            log_info(f"Inviting new user {user_email} to {server_config['name']}")
            return invite_new_user_to_libraries(account, server, server_config, user_email, library_ids)
            
    except Exception as e:
        log_error(f"Error in smart sharing for {server_config['name']}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "server": server_config['name']
        }

def share_libraries_with_user(user_email, server_group, library_selection):
    """
    Smart library sharing that handles both new and existing users
    
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
        log_info(f"Processing regular server with {len(regular_libs)} libraries")
        result = share_libraries_on_server_smart(group_config['regular'], user_email, regular_libs)
        results['details']['regular'] = result
        if result['success'] and result.get('action') in ['updated_access', 'invited_new_user', 'removed_access']:
            results['changes_made'] += 1
        
        # Handle 4K server
        fourk_libs = library_selection.get('fourk', [])
        log_info(f"Processing 4K server with {len(fourk_libs)} libraries")
        result = share_libraries_on_server_smart(group_config['fourk'], user_email, fourk_libs)
        results['details']['fourk'] = result
        if result['success'] and result.get('action') in ['updated_access', 'invited_new_user', 'removed_access']:
            results['changes_made'] += 1
        
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

def remove_user_from_server(user_email, server_config):
    """Remove a user's access from a specific server"""
    try:
        log_info(f"Removing {user_email} from {server_config['name']}...")
        account, server = get_plex_server(server_config)
        
        # Check user status
        user_status = check_if_user_exists(account, user_email)
        
        if user_status == "pending":
            # Cancel pending invite
            try:
                invitations = account.pendingInvites()
                invite = next((invite for invite in invitations if invite.email.lower() == user_email.lower()), None)
                if invite:
                    # There's no direct way to cancel invites in PlexAPI, but we can note it
                    log_info(f"User {user_email} has pending invite on {server_config['name']} - invite still pending")
                    return {
                        "success": True,
                        "server": server_config['name'],
                        "action": "pending_invite_noted",
                        "message": "User has pending invite that cannot be cancelled via API"
                    }
            except Exception:
                pass
        elif user_status and user_status != "pending":
            # User exists - remove them
            account.removeFriend(user_email)
            log_info(f"Removed {user_email} from {server_config['name']}")
            return {
                "success": True,
                "server": server_config['name'],
                "action": "removed"
            }
        
        # User not found
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

def check_invite_status_all_servers(user_email):
    """Check invite status for a user across all configured servers"""
    try:
        log_info(f"Checking invite status for {user_email} across all servers")
        
        results = {}
        
        for server_group, group_config in PLEX_SERVERS.items():
            results[server_group] = {}
            
            # Check regular server
            try:
                account, _ = get_plex_server(group_config['regular'])
                user_status = check_if_user_exists(account, user_email)
                
                if user_status == "pending":
                    results[server_group]['regular'] = {"status": "pending", "server": group_config['regular']['name']}
                elif user_status:
                    results[server_group]['regular'] = {"status": "accepted", "server": group_config['regular']['name']}
                else:
                    results[server_group]['regular'] = {"status": "none", "server": group_config['regular']['name']}
            except Exception as e:
                results[server_group]['regular'] = {"status": "error", "server": group_config['regular']['name'], "error": str(e)}
            
            # Check 4K server
            try:
                account, _ = get_plex_server(group_config['fourk'])
                user_status = check_if_user_exists(account, user_email)
                
                if user_status == "pending":
                    results[server_group]['fourk'] = {"status": "pending", "server": group_config['fourk']['name']}
                elif user_status:
                    results[server_group]['fourk'] = {"status": "accepted", "server": group_config['fourk']['name']}
                else:
                    results[server_group]['fourk'] = {"status": "none", "server": group_config['fourk']['name']}
            except Exception as e:
                results[server_group]['fourk'] = {"status": "error", "server": group_config['fourk']['name'], "error": str(e)}
        
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
    """Test updating a user's library access and return before/after comparison"""
    try:
        log_info(f"Testing library update for {user_email} on {server_group}")
        
        # Get current access before update
        current_access = {}
        if server_group in PLEX_SERVERS:
            group_config = PLEX_SERVERS[server_group]
            try:
                account, _ = get_plex_server(group_config['regular'])
                current_access['regular'] = get_user_current_library_access(account, group_config['regular'], user_email)
            except:
                current_access['regular'] = []
            
            try:
                account, _ = get_plex_server(group_config['fourk'])
                current_access['fourk'] = get_user_current_library_access(account, group_config['fourk'], user_email)
            except:
                current_access['fourk'] = []
        
        log_info("Performing library update...")
        
        # Perform the update
        result = share_libraries_with_user(user_email, server_group, library_selection)
        
        return {
            "success": result['success'],
            "user_email": user_email,
            "server_group": server_group,
            "previous_access": current_access,
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
            
        elif command == "check_invite_status" and len(sys.argv) >= 3:
            # python plex_service.py check_invite_status user@email.com
            user_email = sys.argv[2]
            
            result = check_invite_status_all_servers(user_email)
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
                    "check_invite_status": "python plex_service.py check_invite_status user@email.com",
                    "test_update": "python plex_service.py test_update user@email.com plex1 '{\"regular\":[\"22\",\"1\"],\"fourk\":[\"1\"]}'"
                }
            }))
            
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON in arguments: {str(e)}"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}"))

if __name__ == "__main__":
    main()