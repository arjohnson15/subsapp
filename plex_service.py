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
    """FIXED: Properly handles cross-server sharing for same account"""
    try:
        log_info(f"Processing {user_email} on {server_config['name']} with libraries: {library_ids}")
        
        # Get account and server with 60 second timeout
        account, server = get_account_and_server_with_timeout(server_config)
        
        # CRITICAL FIX: First check if user exists anywhere on this account
        # This handles cases where user exists on regular server but not 4K server
        log_info(f"Checking if {user_email} exists on main account...")
        account_user = None
        user_status = "not_found"
        
        try:
            signal.alarm(60)  # 60 second timeout
            # First check if user is already a friend on the main account
            friends = account.myPlexAccount().users()
            for friend in friends:
                if friend.email and friend.email.lower() == user_email.lower():
                    account_user = friend
                    user_status = "existing_account_user"
                    log_info(f"Found existing account user: {friend.username} (ID: {friend.id})")
                    break
            signal.alarm(0)
        except Exception as e:
            signal.alarm(0)
            log_error(f"Error checking account users: {str(e)}")
        
        # If not found in account users, check server-specific status
        if user_status == "not_found":
            user_status, user_obj = get_user_object_and_status(account, user_email)
            if user_status == "existing":
                account_user = user_obj
        
        log_info(f"User status: {user_status}")
        
        if user_status == "error":
            return {
                "success": False,
                "error": "Could not determine user status",
                "server": server_config['name']
            }
        
        # Get current access on THIS specific server
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
        
        # Get library objects
        if len(library_ids) > 0:
            libraries_to_share = []
            
            signal.alarm(60)
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
        
        # MAIN FIX: Handle the sharing based on user status
        error_was_404 = False
        action = "unknown"
        
        try:
            if user_status in ["existing", "existing_account_user"] and account_user:
                # User exists on account - update their server access
                log_info(f"User exists on account, updating server access...")
                log_info(f"Updating {account_user.username} (ID: {account_user.id}) with {len(libraries_to_share)} libraries on {server_config['name']}")
                
                signal.alarm(60)
                account.updateFriend(
                    account_user,  # Use the account user object
                    server,        # The specific server (regular or 4K)
                    sections=libraries_to_share,
                    allowSync=True,
                    allowCameraUpload=False,
                    allowChannels=False
                )
                signal.alarm(0)
                action = "updated_existing_account_user"
                log_info(f"✅ Successfully updated account user's server access")
                
            elif user_status == "not_found":
                # User doesn't exist on account - create new invitation
                log_info(f"User not found on account, creating new invitation...")
                
                signal.alarm(60)
                account.inviteFriend(
                    user_email,
                    server,
                    sections=libraries_to_share,
                    allowSync=True,
                    allowCameraUpload=False,
                    allowChannels=False
                )
                signal.alarm(0)
                action = "invited_new_user"
                log_info(f"✅ Successfully invited new user")
                
            else:
                return {
                    "success": False,
                    "error": f"Unknown user status: {user_status}",
                    "server": server_config['name']
                }
                
        except Exception as api_error:
            signal.alarm(0)
            error_msg = str(api_error).lower()
            log_error(f"Plex API error: {str(api_error)}")
            
            # Handle the specific "already sharing" error
            if "400" in error_msg and "already sharing this server" in error_msg:
                log_info(f"Got 'already sharing' error - this shouldn't happen with our new approach")
                log_error(f"The user check may have failed - user exists but wasn't found in account.users()")
                
                return {
                    "success": False,
                    "error": f"Cross-server sharing failed: {str(api_error)}",
                    "server": server_config['name']
                }
            
            # Handle 404 errors that might actually work
            elif "404" in error_msg and ("not found" in error_msg or "does not exist" in error_msg):
                log_info(f"Got 404 error - checking if operation actually succeeded...")
                
                # Verify if the change worked despite 404
                time.sleep(2)  # Brief delay for Plex to update
                new_libs = get_current_library_access_with_timeout(account, server_config, user_email)
                new_set = set(new_libs)
                
                if new_set == target_set:
                    log_info(f"✅ 404 error ignored - operation actually succeeded!")
                    action = "updated_despite_404"
                    error_was_404 = True
                else:
                    log_error(f"❌ 404 error was real - operation failed")
                    return {
                        "success": False,
                        "error": f"Real API error: {str(api_error)}",
                        "server": server_config['name']
                    }
            else:
                # Other real errors
                return {
                    "success": False,
                    "error": f"Plex API error: {str(api_error)}",
                    "server": server_config['name']
                }
        
        # Success
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
    except Exception as e:
        signal.alarm(0)
        log_error(f"Unexpected error: {str(e)}")
        return {
            "success": False,
            "error": str(e)[:200] + "..." if len(str(e)) > 200 else str(e),
            "server": server_config['name']
        }
        
def get_all_pending_invites_by_account():
    """Get ALL pending invites from both Plex accounts in just 2 API calls"""
    try:
        log_info("Getting ALL pending invites from both Plex accounts...")
        
        results = {}
        total_invites = 0
        api_calls = 0
        
        # Process each server group (each has its own account)
        for server_group_name, server_group in PLEX_SERVERS.items():
            log_info(f"Getting pending invites for {server_group_name} account...")
            
            # Use the regular server token for this account
            account_token = server_group['regular']["token"]
            account_name = server_group['regular']["name"]
            
            try:
                signal.alarm(60)
                account = MyPlexAccount(token=account_token)
                
                # ONE API CALL per account - gets ALL invites for this account
                invitations = account.pendingInvites(includeSent=True, includeReceived=False)
                signal.alarm(0)
                api_calls += 1
                
                invite_list = []
                for invite in invitations:
                    try:
                        invite_id = getattr(invite, 'id', None)
                        if invite_id is None or str(invite_id) == 'nan':
                            invite_id = None
                        
                        # Handle datetime conversion properly
                        created_at = getattr(invite, 'createdAt', None)
                        if created_at and hasattr(created_at, 'isoformat'):
                            created_at = created_at.isoformat()
                        elif created_at:
                            created_at = str(created_at)
                        
                        invite_data = {
                            "email": invite.email,
                            "invite_id": invite_id,
                            "created_at": created_at,
                            "server_group": server_group_name,
                            "account_name": account_name
                        }
                        invite_list.append(invite_data)
                        
                    except Exception as e:
                        log_error(f"Error processing invite: {str(e)}")
                        continue
                
                results[server_group_name] = {
                    "success": True,
                    "invites": invite_list,
                    "count": len(invite_list),
                    "account_name": account_name
                }
                
                total_invites += len(invite_list)
                log_info(f"Found {len(invite_list)} pending invites for {server_group_name} account")
                
            except Exception as e:
                signal.alarm(0)
                log_error(f"Error getting invites for {server_group_name}: {str(e)}")
                results[server_group_name] = {
                    "success": False,
                    "error": str(e),
                    "invites": [],
                    "account_name": account_name
                }
        
        return {
            "success": True,
            "accounts": results,
            "total_invites": total_invites,
            "api_calls": api_calls
        }
        
    except Exception as e:
        signal.alarm(0)
        return {
            "success": False,
            "error": str(e),
            "accounts": {},
            "total_invites": 0,
            "api_calls": 0
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
        
def check_invite_status_all_servers(user_email):
    """Check invite status across all Plex servers"""
    try:
        results = {}
        for server_group_name, server_group in PLEX_SERVERS.items():
            results[server_group_name] = {}
            
            for server_type, server_config in server_group.items():
                try:
                    log_info(f"Checking invites for {server_config['name']}")
                    
                    signal.alarm(60)  # 60 second timeout
                    account = MyPlexAccount(token=server_config["token"])
                    invitations = account.pendingInvites()
                    signal.alarm(0)
                    
                    # Find invite for this user
                    invite = next((invite for invite in invitations if invite.email.lower() == user_email.lower()), None)
                    
                    if invite:
                        invite_id = getattr(invite, 'id', None)
                        if invite_id is None or str(invite_id) == 'nan':
                            invite_id = None
                        
                        results[server_group_name][server_type] = {
                            "status": "pending",
                            "server": server_config['name'],
                            "email": user_email,
                            "invite_id": invite_id
                        }
                        log_info(f"Found pending invite for {user_email} on {server_config['name']}")
                    else:
                        # Check if user exists (accepted)
                        try:
                            signal.alarm(30)
                            user = account.user(user_email)
                            signal.alarm(0)
                            if user:
                                results[server_group_name][server_type] = {
                                    "status": "accepted",
                                    "server": server_config['name'],
                                    "email": user_email
                                }
                            else:
                                results[server_group_name][server_type] = {
                                    "status": "none",
                                    "server": server_config['name'],
                                    "email": user_email
                                }
                        except NotFound:
                            signal.alarm(0)
                            results[server_group_name][server_type] = {
                                "status": "none",
                                "server": server_config['name'],
                                "email": user_email
                            }
                        except Exception:
                            signal.alarm(0)
                            results[server_group_name][server_type] = {
                                "status": "error",
                                "server": server_config['name'],
                                "email": user_email
                            }
                            
                except Exception as e:
                    signal.alarm(0)
                    log_error(f"Error checking invites for {server_config['name']}: {str(e)}")
                    results[server_group_name][server_type] = {
                        "status": "error",
                        "server": server_config['name'],
                        "email": user_email,
                        "error": str(e)
                    }
        
        # Create summary
        has_pending_invites = False
        pending_servers = []
        for server_group, servers in results.items():
            for server_type, server_info in servers.items():
                if server_info.get("status") == "pending":
                    has_pending_invites = True
                    pending_servers.append(f"{server_group} {server_type}")
        
        return {
            "success": True,
            "email": user_email,
            "servers": results,
            "summary": {
                "has_pending_invites": has_pending_invites,
                "pending_servers": pending_servers,
                "total_servers_checked": len(results) * 2
            }
        }
        
    except Exception as e:
        signal.alarm(0)
        return {
            "success": False,
            "error": str(e),
            "email": user_email
        }

def cancel_pending_invite(server_config, user_email):
    """Cancel a pending invite for a user on a specific server"""
    try:
        signal.alarm(60)
        account = MyPlexAccount(token=server_config["token"])
        invitations = account.pendingInvites()
        signal.alarm(0)
        
        # Find the invite for this user
        invite = next((invite for invite in invitations if invite.email.lower() == user_email.lower()), None)
        
        if invite:
            signal.alarm(30)
            # TRY MULTIPLE METHODS TO CANCEL THE INVITE
            try:
                # Method 1: Use the invite ID with cancelInvite
                if hasattr(invite, 'id') and invite.id:
                    account.cancelInvite(invite.id)
                    log_info(f"Cancelled pending invite for {user_email} on {server_config['name']} using invite ID")
                else:
                    # Method 2: Use email with cancelInvite  
                    account.cancelInvite(user_email)
                    log_info(f"Cancelled pending invite for {user_email} on {server_config['name']} using email")
            except Exception as cancel_error:
                # Method 3: Try direct API call
                log_info(f"cancelInvite failed ({str(cancel_error)}), trying direct API...")
                try:
                    import requests
                    url = f"https://plex.tv/api/servers/{server_config.get('server_id', '')}/shared_servers/{invite.id}"
                    headers = {'X-Plex-Token': server_config['token']}
                    response = requests.delete(url, headers=headers, timeout=30)
                    if response.status_code in [200, 204]:
                        log_info(f"Cancelled pending invite for {user_email} on {server_config['name']} using direct API")
                    else:
                        raise Exception(f"Direct API cancel failed: HTTP {response.status_code}")
                except Exception as api_error:
                    signal.alarm(0)
                    log_error(f"All cancellation methods failed for {user_email}: {str(api_error)}")
                    return {
                        "success": False,
                        "error": f"Failed to cancel invite: {str(cancel_error)}",
                        "server": server_config['name']
                    }
            
            signal.alarm(0)
            return {
                "success": True,
                "action": "invite_cancelled",
                "server": server_config['name']
            }
        else:
            log_info(f"No pending invite found for {user_email} on {server_config['name']}")
            return {
                "success": True,
                "action": "no_invite_found",
                "server": server_config['name']
            }
            
    except Exception as e:
        signal.alarm(0)
        log_error(f"Error cancelling invite for {user_email} on {server_config['name']}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "server": server_config['name']
        }

def remove_user_from_server_enhanced(server_config, user_email):
    """Enhanced removal that handles both pending invites and existing users"""
    try:
        log_info(f"Enhanced removal for {user_email} from {server_config['name']}")
        
        signal.alarm(60)
        account = MyPlexAccount(token=server_config["token"])
        
        # First, cancel any pending invites
        invite_result = cancel_pending_invite(server_config, user_email)
        
        # Then try to remove the user if they exist
        user_removed = False
        try:
            signal.alarm(30)
            user = account.user(user_email)
            if user:
                account.removeFriend(user_email)
                user_removed = True
                log_info(f"Removed user {user_email} from {server_config['name']}")
            signal.alarm(0)
        except NotFound:
            signal.alarm(0)
            log_info(f"User {user_email} not found on {server_config['name']} (normal if they had pending invite)")
        except Exception as e:
            signal.alarm(0)
            log_error(f"Error removing user from {server_config['name']}: {str(e)}")
        
        return {
            "success": True,
            "server": server_config['name'],
            "invite_cancelled": invite_result.get("action") == "invite_cancelled",
            "user_removed": user_removed,
            "actions": [
                invite_result.get("action", "no_action"),
                "user_removed" if user_removed else "user_not_found"
            ]
        }
        
    except Exception as e:
        signal.alarm(0)
        log_error(f"Error in enhanced removal from {server_config['name']}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "server": server_config['name']
        }

def remove_user_completely(user_email, server_groups):
    """Completely remove user from specified server groups with invite cancellation"""
    try:
        log_info(f"Complete removal for {user_email} from server groups: {server_groups}")
        
        results = {
            "success": True,
            "user_email": user_email,
            "server_groups": server_groups,
            "details": {},
            "summary": {
                "invites_cancelled": 0,
                "users_removed": 0,
                "servers_processed": 0
            }
        }
        
        for server_group in server_groups:
            if server_group not in PLEX_SERVERS:
                results["details"][server_group] = {
                    "success": False,
                    "error": f"Invalid server group: {server_group}"
                }
                results["success"] = False
                continue
            
            group_config = PLEX_SERVERS[server_group]
            results["details"][server_group] = {}
            
            # Remove from regular server
            regular_result = remove_user_from_server_enhanced(group_config['regular'], user_email)
            results["details"][server_group]['regular'] = regular_result
            
            if regular_result.get("invite_cancelled"):
                results["summary"]["invites_cancelled"] += 1
            if regular_result.get("user_removed"):
                results["summary"]["users_removed"] += 1
            results["summary"]["servers_processed"] += 1
            
            # Remove from 4K server
            fourk_result = remove_user_from_server_enhanced(group_config['fourk'], user_email)
            results["details"][server_group]['fourk'] = fourk_result
            
            if fourk_result.get("invite_cancelled"):
                results["summary"]["invites_cancelled"] += 1
            if fourk_result.get("user_removed"):
                results["summary"]["users_removed"] += 1
            results["summary"]["servers_processed"] += 1
            
            if not regular_result['success'] or not fourk_result['success']:
                results['success'] = False
        
        log_info(f"Complete removal summary: {results['summary']}")
        return results
        
    except Exception as e:
        signal.alarm(0)
        return {
            "success": False,
            "error": str(e),
            "user_email": user_email,
            "server_groups": server_groups
        }        

# ADD these functions to your existing plex_service.py file
# Place them before the main() function

def check_invite_status_all_servers(user_email):
    """Check invite status across all Plex servers"""
    try:
        results = {}
        for server_group_name, server_group in PLEX_SERVERS.items():
            results[server_group_name] = {}
            
            for server_type, server_config in server_group.items():
                try:
                    log_info(f"Checking invites for {server_config['name']}")
                    
                    signal.alarm(60)  # 60 second timeout
                    account = MyPlexAccount(token=server_config["token"])
                    invitations = account.pendingInvites()
                    signal.alarm(0)
                    
                    # Find invite for this user
                    invite = next((invite for invite in invitations if invite.email.lower() == user_email.lower()), None)
                    
                    if invite:
                        # FIX: Properly handle invite_id to avoid NaN in JSON
                        invite_id = getattr(invite, 'id', None)
                        if invite_id is not None:
                            try:
                                # Ensure invite_id is a valid JSON-serializable value
                                invite_id = str(invite_id) if invite_id != 'nan' else None
                            except:
                                invite_id = None
                        
                        results[server_group_name][server_type] = {
                            "status": "pending",
                            "server": server_config['name'],
                            "email": user_email,
                            "invite_id": invite_id  # This will be None or a string, never NaN
                        }
                        log_info(f"Found pending invite for {user_email} on {server_config['name']}")
                    else:
                        # Check if user exists (accepted)
                        try:
                            signal.alarm(30)
                            user = account.user(user_email)
                            signal.alarm(0)
                            if user:
                                results[server_group_name][server_type] = {
                                    "status": "accepted",
                                    "server": server_config['name'],
                                    "email": user_email
                                }
                            else:
                                results[server_group_name][server_type] = {
                                    "status": "none",
                                    "server": server_config['name'],
                                    "email": user_email
                                }
                        except NotFound:
                            signal.alarm(0)
                            results[server_group_name][server_type] = {
                                "status": "none",
                                "server": server_config['name'],
                                "email": user_email
                            }
                        except Exception:
                            signal.alarm(0)
                            results[server_group_name][server_type] = {
                                "status": "error",
                                "server": server_config['name'],
                                "email": user_email
                            }
                            
                except Exception as e:
                    signal.alarm(0)
                    log_error(f"Error checking invites for {server_config['name']}: {str(e)}")
                    results[server_group_name][server_type] = {
                        "status": "error",
                        "server": server_config['name'],
                        "email": user_email,
                        "error": str(e)
                    }
        
        # Create summary
        has_pending_invites = False
        pending_servers = []
        for server_group, servers in results.items():
            for server_type, server_info in servers.items():
                if server_info.get("status") == "pending":
                    has_pending_invites = True
                    pending_servers.append(f"{server_group} {server_type}")
        
        return {
            "success": True,
            "email": user_email,
            "servers": results,
            "summary": {
                "has_pending_invites": has_pending_invites,
                "pending_servers": pending_servers,
                "total_servers_checked": len(results) * 2
            }
        }
        
    except Exception as e:
        signal.alarm(0)
        return {
            "success": False,
            "error": str(e),
            "email": user_email
        }


def remove_user_from_server_enhanced(server_config, user_email):
    """Enhanced removal that handles both pending invites and existing users"""
    try:
        log_info(f"Enhanced removal for {user_email} from {server_config['name']}")
        
        signal.alarm(60)
        account = MyPlexAccount(token=server_config["token"])
        
        # First, cancel any pending invites
        invite_result = cancel_pending_invite(server_config, user_email)
        
        # Then try to remove the user if they exist
        user_removed = False
        try:
            signal.alarm(30)
            user = account.user(user_email)
            if user:
                account.removeFriend(user_email)
                user_removed = True
                log_info(f"Removed user {user_email} from {server_config['name']}")
            signal.alarm(0)
        except NotFound:
            signal.alarm(0)
            log_info(f"User {user_email} not found on {server_config['name']} (normal if they had pending invite)")
        except Exception as e:
            signal.alarm(0)
            log_error(f"Error removing user from {server_config['name']}: {str(e)}")
        
        return {
            "success": True,
            "server": server_config['name'],
            "invite_cancelled": invite_result.get("action") == "invite_cancelled",
            "user_removed": user_removed,
            "actions": [
                invite_result.get("action", "no_action"),
                "user_removed" if user_removed else "user_not_found"
            ]
        }
        
    except Exception as e:
        signal.alarm(0)
        log_error(f"Error in enhanced removal from {server_config['name']}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "server": server_config['name']
        }

def remove_user_completely(user_email, server_groups):
    """Completely remove user from specified server groups with invite cancellation"""
    try:
        log_info(f"Complete removal for {user_email} from server groups: {server_groups}")
        
        results = {
            "success": True,
            "user_email": user_email,
            "server_groups": server_groups,
            "details": {},
            "summary": {
                "invites_cancelled": 0,
                "users_removed": 0,
                "servers_processed": 0
            }
        }
        
        for server_group in server_groups:
            if server_group not in PLEX_SERVERS:
                results["details"][server_group] = {
                    "success": False,
                    "error": f"Invalid server group: {server_group}"
                }
                results["success"] = False
                continue
            
            group_config = PLEX_SERVERS[server_group]
            results["details"][server_group] = {}
            
            # Remove from regular server
            regular_result = remove_user_from_server_enhanced(group_config['regular'], user_email)
            results["details"][server_group]['regular'] = regular_result
            
            if regular_result.get("invite_cancelled"):
                results["summary"]["invites_cancelled"] += 1
            if regular_result.get("user_removed"):
                results["summary"]["users_removed"] += 1
            results["summary"]["servers_processed"] += 1
            
            # Remove from 4K server
            fourk_result = remove_user_from_server_enhanced(group_config['fourk'], user_email)
            results["details"][server_group]['fourk'] = fourk_result
            
            if fourk_result.get("invite_cancelled"):
                results["summary"]["invites_cancelled"] += 1
            if fourk_result.get("user_removed"):
                results["summary"]["users_removed"] += 1
            results["summary"]["servers_processed"] += 1
            
            if not regular_result['success'] or not fourk_result['success']:
                results['success'] = False
        
        log_info(f"Complete removal summary: {results['summary']}")
        return results
        
    except Exception as e:
        signal.alarm(0)
        return {
            "success": False,
            "error": str(e),
            "user_email": user_email,
            "server_groups": server_groups
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
            
        # NEW COMMANDS - ADD THESE:
        elif command == "check_invite_status" and len(sys.argv) >= 3:
            user_email = sys.argv[2]
            
            result = check_invite_status_all_servers(user_email)
            print(json.dumps(result, indent=2))
            
        elif command == "get_all_pending_invites_batch":
            result = get_all_pending_invites_by_account()
            print(json.dumps(result, indent=2))
            
        elif command == "remove_user_completely" and len(sys.argv) >= 4:
            user_email = sys.argv[2]
            server_groups = json.loads(sys.argv[3])  # Array of server groups
            
            result = remove_user_completely(user_email, server_groups)
            print(json.dumps(result, indent=2))
            
        else:
            print(json.dumps({
                "error": "Invalid command or arguments",
                "usage": {
                    "share_libraries": "python plex_service.py share_libraries user@email.com plex1 '{\"regular\":[\"22\",\"1\"],\"fourk\":[\"1\"]}'",
                    "remove_user": "python plex_service.py remove_user user@email.com plex1",
                    "check_invite_status": "python plex_service.py check_invite_status user@email.com",
                    "remove_user_completely": "python plex_service.py remove_user_completely user@email.com '[\"plex1\", \"plex2\"]'"
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