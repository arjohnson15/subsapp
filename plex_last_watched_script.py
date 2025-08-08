#!/usr/bin/env python3
"""
Plex All Users Last Watched Date Script
Gets the last watched date for EVERY user, no matter how far back
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

# Your existing server configurations
PLEX_SERVERS = {
    'plex1': {
        'regular': {
            'name': 'Plex 1',
            'server_id': '3ad72e19d4509a15d9f8253666a03efa78baac44',
            'url': 'http://192.168.10.90:32400',
            'token': 'sxuautpKvoH2aZKG-j95',
            'friendly_name': 'JohnsonFlix'
        }
    },
    'plex2': {
        'regular': {
            'name': 'Plex 2',
            'server_id': '3ad72e19d4509a15d9f8253666a03efa78baac44',
            'url': 'http://192.168.10.94:32400',
            'token': 'B1QhFRA-Q2pSm15uxmMA',
            'friendly_name': 'JohnsonFlix'
        }
    }
}

def get_all_users_last_watched(server_config):
    """Get last watched date for ALL users on a server - no time limits"""
    try:
        print(f"[INFO] Connecting to {server_config['name']}...", file=sys.stderr)
        plex = PlexServer(server_config['url'], server_config['token'], timeout=15)
        
        result = {
            'server_name': server_config['name'],
            'server_url': server_config['url'],
            'success': True,
            'users': {},
            'total_history_items': 0
        }
        
        # First, get all user accounts
        print(f"[INFO] Getting all user accounts...", file=sys.stderr)
        try:
            accounts = plex.systemAccounts()
            account_info = {}
            for account in accounts:
                account_info[account.id] = {
                    'name': getattr(account, 'name', f'User {account.id}'),
                    'email': getattr(account, 'email', None),
                    'id': account.id
                }
            print(f"[INFO] Found {len(account_info)} user accounts", file=sys.stderr)
        except Exception as e:
            print(f"[ERROR] Could not load user accounts: {e}", file=sys.stderr)
            account_info = {}
        
        # Get ALL watch history - no date restrictions
        print(f"[INFO] Getting complete watch history (this may take a while)...", file=sys.stderr)
        
        # Use history() with no mindate to get everything
        try:
            history = plex.history()  # Gets everything, no date limit
            print(f"[INFO] Retrieved {len(history)} total history entries", file=sys.stderr)
            result['total_history_items'] = len(history)
        except Exception as e:
            print(f"[ERROR] Could not get history: {e}", file=sys.stderr)
            result['success'] = False
            result['error'] = str(e)
            return result
        
        # Process all history to find each user's most recent watch
        user_last_watched = {}
        processed_items = 0
        
        print(f"[INFO] Processing history to find last watched dates...", file=sys.stderr)
        
        for item in history:
            try:
                processed_items += 1
                if processed_items % 1000 == 0:
                    print(f"[PROGRESS] Processed {processed_items}/{len(history)} history items", file=sys.stderr)
                
                # Get the account ID from the history item
                if hasattr(item, 'accountID'):
                    item_account_id = item.accountID
                else:
                    continue
                
                # Get the viewed date
                viewed_at = None
                if hasattr(item, 'viewedAt') and item.viewedAt:
                    viewed_at = item.viewedAt
                elif hasattr(item, 'lastViewedAt') and item.lastViewedAt:
                    viewed_at = item.lastViewedAt
                else:
                    continue
                
                # Track the most recent view for each user
                if item_account_id not in user_last_watched or viewed_at > user_last_watched[item_account_id]['last_watched']:
                    user_last_watched[item_account_id] = {
                        'last_watched': viewed_at,
                        'last_item_title': getattr(item, 'title', 'Unknown'),
                        'last_item_type': getattr(item, 'type', 'Unknown'),
                        'account_id': item_account_id,
                        'last_item_year': getattr(item, 'year', None),
                        'last_item_rating_key': getattr(item, 'ratingKey', None)
                    }
                    
            except Exception as e:
                # Don't let one bad item stop the whole process
                continue
        
        print(f"[INFO] Finished processing {processed_items} history items", file=sys.stderr)
        
        # Create results for all known users
        for account_id, account_data in account_info.items():
            user_result = {
                'account_id': account_id,
                'name': account_data['name'],
                'email': account_data['email'],
                'has_watch_history': account_id in user_last_watched
            }
            
            if account_id in user_last_watched:
                watch_data = user_last_watched[account_id]
                user_result.update({
                    'last_watched_date': watch_data['last_watched'].isoformat() if watch_data['last_watched'] else None,
                    'last_watched_title': watch_data['last_item_title'],
                    'last_watched_type': watch_data['last_item_type'],
                    'last_watched_year': watch_data['last_item_year'],
                    'days_since_last_watch': (datetime.now() - watch_data['last_watched'].replace(tzinfo=None)).days if watch_data['last_watched'] else None
                })
            else:
                user_result.update({
                    'last_watched_date': None,
                    'last_watched_title': None,
                    'last_watched_type': None,
                    'last_watched_year': None,
                    'days_since_last_watch': None
                })
            
            result['users'][str(account_id)] = user_result
        
        # Also add any users found in history but not in accounts (shouldn't happen but just in case)
        for account_id, watch_data in user_last_watched.items():
            if account_id not in account_info:
                result['users'][str(account_id)] = {
                    'account_id': account_id,
                    'name': f'Unknown User {account_id}',
                    'email': None,
                    'has_watch_history': True,
                    'last_watched_date': watch_data['last_watched'].isoformat() if watch_data['last_watched'] else None,
                    'last_watched_title': watch_data['last_item_title'],
                    'last_watched_type': watch_data['last_item_type'],
                    'last_watched_year': watch_data['last_item_year'],
                    'days_since_last_watch': (datetime.now() - watch_data['last_watched'].replace(tzinfo=None)).days if watch_data['last_watched'] else None
                }
        
        users_with_history = len([u for u in result['users'].values() if u['has_watch_history']])
        users_without_history = len(result['users']) - users_with_history
        
        print(f"[SUCCESS] Found {len(result['users'])} total users:", file=sys.stderr)
        print(f"[SUCCESS] - {users_with_history} users with watch history", file=sys.stderr)
        print(f"[SUCCESS] - {users_without_history} users with no watch history", file=sys.stderr)
        
        return result
        
    except Exception as e:
        print(f"[ERROR] Error getting watch history from {server_config['name']}: {e}", file=sys.stderr)
        return {
            'server_name': server_config['name'],
            'success': False,
            'error': str(e),
            'users': {}
        }

def get_all_servers_user_data():
    """Get last watched data from all Plex servers"""
    all_results = {}
    
    for server_group, servers in PLEX_SERVERS.items():
        print(f"[INFO] Checking {server_group} servers...", file=sys.stderr)
        all_results[server_group] = {}
        
        # Check regular server (skip 4K servers to avoid duplicates)
        if 'regular' in servers:
            regular_result = get_all_users_last_watched(servers['regular'])
            all_results[server_group]['regular'] = regular_result
    
    return all_results

def main():
    """Main function"""
    try:
        print(f"[START] Getting complete last watched data for ALL users (no time limits)...", file=sys.stderr)
        print(f"[WARNING] This may take several minutes for servers with lots of history...", file=sys.stderr)
        
        results = get_all_servers_user_data()
        
        # Output JSON to stdout for consumption
        print(json.dumps(results, indent=2))
        
        # Summary to stderr
        total_users = 0
        total_with_history = 0
        total_history_items = 0
        
        for server_group, group_data in results.items():
            for server_type, server_data in group_data.items():
                if server_data.get('success'):
                    server_users = server_data.get('users', {})
                    total_users += len(server_users)
                    total_with_history += len([u for u in server_users.values() if u.get('has_watch_history')])
                    total_history_items += server_data.get('total_history_items', 0)
        
        print(f"[FINAL] Complete summary:", file=sys.stderr)
        print(f"[FINAL] - Total users found: {total_users}", file=sys.stderr)
        print(f"[FINAL] - Users with watch history: {total_with_history}", file=sys.stderr)
        print(f"[FINAL] - Users never watched anything: {total_users - total_with_history}", file=sys.stderr)
        print(f"[FINAL] - Total history items processed: {total_history_items}", file=sys.stderr)
        
    except Exception as e:
        print(f"[FATAL] Fatal error: {str(e)}", file=sys.stderr)
        error_output = {'error': str(e)}
        print(json.dumps(error_output))
        sys.exit(1)

if __name__ == '__main__':
    main()