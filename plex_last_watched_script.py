#!/usr/bin/env python3
"""
Plex Daily Sync Script - Using Plex.tv API for consistent username matching
UPDATED: Now uses same API as existing plex-service.js for consistent usernames
"""

import json
import sys
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
import argparse

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

def get_shared_users_from_server(server_config):
    """Get shared users using Plex.tv API - same as plex-service.js"""
    try:
        print(f"[INFO] Getting shared users from {server_config['name']} using Plex.tv API...", file=sys.stderr)
        
        url = f"https://plex.tv/api/servers/{server_config['server_id']}/shared_servers"
        headers = {
            'X-Plex-Token': server_config['token'],
            'Accept': 'application/xml'
        }
        
        response = requests.get(url, headers=headers, timeout=15)
        
        if response.status_code != 200:
            print(f"[WARNING] No shared users found on {server_config['name']} (HTTP {response.status_code})", file=sys.stderr)
            return {}
        
        # Parse XML response
        root = ET.fromstring(response.text)
        users = {}
        
        # Find SharedServer elements
        for shared_server in root.findall('.//SharedServer'):
            email = shared_server.get('email')
            username = shared_server.get('username')
            
            if email and username:
                # Map by email for consistent lookup
                users[email.lower()] = {
                    'email': email,
                    'username': username,
                    'display_name': shared_server.get('name', username)
                }
                print(f"[USER] Found: {username} ({email})", file=sys.stderr)
        
        print(f"[SUCCESS] Found {len(users)} shared users on {server_config['name']}", file=sys.stderr)
        return users
        
    except Exception as e:
        print(f"[ERROR] Failed to get shared users from {server_config['name']}: {e}", file=sys.stderr)
        return {}

def get_user_activity_individual(server_config, shared_users):
    """Get activity for each user individually"""
    try:
        print(f"[APPROACH 1] Getting individual activity for {server_config['name']}", file=sys.stderr)
        plex = PlexServer(server_config['url'], server_config['token'], timeout=15)
        
        # Get system accounts to map IDs
        accounts = plex.systemAccounts()
        account_map = {acc.id: acc for acc in accounts}
        
        results = {}
        
        for i, (email, user_info) in enumerate(shared_users.items(), 1):
            try:
                if i % 25 == 0:
                    print(f"[PROGRESS] {i}/{len(shared_users)} users processed", file=sys.stderr)
                
                # Find account by email or username
                account = None
                for acc in accounts:
                    if (hasattr(acc, 'email') and acc.email and acc.email.lower() == email) or \
                       (hasattr(acc, 'name') and acc.name == user_info['username']):
                        account = acc
                        break
                
                if not account:
                    print(f"[WARNING] Could not find account for {user_info['username']}", file=sys.stderr)
                    results[email] = {
                        'account_id': None,
                        'account_name': user_info['display_name'],
                        'account_username': user_info['username'],
                        'account_email': email,
                        'days_since_last_watch': None,
                        'last_watched_date': None,
                        'last_watched_title': None
                    }
                    continue
                
                # Get most recent item for this user
                history = plex.history(accountID=account.id, maxresults=1)
                
                if history and len(history) > 0:
                    latest_item = history[0]
                    viewed_at = getattr(latest_item, 'viewedAt', None) or getattr(latest_item, 'lastViewedAt', None)
                    
                    if viewed_at:
                        days_since = (datetime.now() - viewed_at.replace(tzinfo=None)).days
                        results[email] = {
                            'account_id': account.id,
                            'account_name': user_info['display_name'],
                            'account_username': user_info['username'],
                            'account_email': email,
                            'days_since_last_watch': days_since,
                            'last_watched_date': viewed_at.isoformat(),
                            'last_watched_title': getattr(latest_item, 'title', 'Unknown')
                        }
                        continue
                
                # No watch history
                results[email] = {
                    'account_id': account.id,
                    'account_name': user_info['display_name'],
                    'account_username': user_info['username'],
                    'account_email': email,
                    'days_since_last_watch': None,
                    'last_watched_date': None,
                    'last_watched_title': None
                }
                
            except Exception as e:
                print(f"[ERROR] Failed for user {user_info['username']}: {e}", file=sys.stderr)
                results[email] = {
                    'account_id': None,
                    'account_name': user_info['display_name'],
                    'account_username': user_info['username'],
                    'account_email': email,
                    'days_since_last_watch': None,
                    'last_watched_date': None,
                    'last_watched_title': None,
                    'error': str(e)
                }
        
        return results
        
    except Exception as e:
        print(f"[ERROR] Individual approach failed: {e}", file=sys.stderr)
        return {}

def get_user_activity_bulk(server_config, shared_users, days_back=30):
    """Get activity using bulk history approach"""
    try:
        print(f"[APPROACH 2] Getting bulk activity for {server_config['name']} (last {days_back} days)", file=sys.stderr)
        plex = PlexServer(server_config['url'], server_config['token'], timeout=15)
        
        # Get recent history in bulk
        min_date = datetime.now() - timedelta(days=days_back)
        print(f"[INFO] Getting bulk history since {min_date.strftime('%Y-%m-%d')}", file=sys.stderr)
        
        history = plex.history(mindate=min_date)
        print(f"[INFO] Retrieved {len(history)} recent history entries", file=sys.stderr)
        
        # Process bulk history to find most recent per user
        user_last_watched = {}
        
        for item in history:
            try:
                account_id = getattr(item, 'accountID', None)
                viewed_at = getattr(item, 'viewedAt', None) or getattr(item, 'lastViewedAt', None)
                
                if account_id and viewed_at:
                    # Keep only the most recent for each user
                    if account_id not in user_last_watched or viewed_at > user_last_watched[account_id]['viewed_at']:
                        user_last_watched[account_id] = {
                            'viewed_at': viewed_at,
                            'title': getattr(item, 'title', 'Unknown')
                        }
            except:
                continue
        
        # Get system accounts to map IDs to emails
        accounts = plex.systemAccounts()
        account_id_to_email = {}
        
        for acc in accounts:
            for email, user_info in shared_users.items():
                if (hasattr(acc, 'email') and acc.email and acc.email.lower() == email) or \
                   (hasattr(acc, 'name') and acc.name == user_info['username']):
                    account_id_to_email[acc.id] = email
                    break
        
        # Build results for all shared users
        results = {}
        
        for email, user_info in shared_users.items():
            # Find account ID for this email
            account_id = None
            for aid, mapped_email in account_id_to_email.items():
                if mapped_email == email:
                    account_id = aid
                    break
            
            if account_id and account_id in user_last_watched:
                watch_data = user_last_watched[account_id]
                days_since = (datetime.now() - watch_data['viewed_at'].replace(tzinfo=None)).days
                
                results[email] = {
                    'account_id': account_id,
                    'account_name': user_info['display_name'],
                    'account_username': user_info['username'],
                    'account_email': email,
                    'days_since_last_watch': days_since,
                    'last_watched_date': watch_data['viewed_at'].isoformat(),
                    'last_watched_title': watch_data['title']
                }
            else:
                # No recent activity (or never watched)
                results[email] = {
                    'account_id': account_id,
                    'account_name': user_info['display_name'],
                    'account_username': user_info['username'],
                    'account_email': email,
                    'days_since_last_watch': None,
                    'last_watched_date': None,
                    'last_watched_title': None
                }
        
        users_with_recent_activity = len([r for r in results.values() if r['days_since_last_watch'] is not None])
        print(f"[SUCCESS] Found recent activity for {users_with_recent_activity}/{len(results)} users", file=sys.stderr)
        
        return results
        
    except Exception as e:
        print(f"[ERROR] Bulk approach failed: {e}", file=sys.stderr)
        return {}

def sync_to_database_format(server_results):
    """Convert results to format suitable for database sync"""
    sync_data = []
    
    for server_name, users in server_results.items():
        for email, user_data in users.items():
            sync_data.append({
                'server': server_name,
                'plex_account_id': user_data['account_id'],
                'plex_account_name': user_data['account_name'],
                'plex_account_username': user_data['account_username'],
                'plex_account_email': user_data['account_email'],
                'days_since_last_watch': user_data['days_since_last_watch'],
                'last_watched_date': user_data['last_watched_date'],
                'last_watched_title': user_data['last_watched_title'],
                'sync_timestamp': datetime.now().isoformat(),
                'has_recent_activity': user_data['days_since_last_watch'] is not None
            })
    
    return sync_data

def main():
    parser = argparse.ArgumentParser(description='Plex Daily Sync - Get last watched data using Plex.tv API')
    parser.add_argument('--approach', choices=['individual', 'bulk'], default='individual',
                       help='individual = slower but gets all data, bulk = faster but only recent activity')
    parser.add_argument('--days', type=int, default=30,
                       help='For bulk approach: how many days back to check (default: 30)')
    parser.add_argument('--output', choices=['json', 'database'], default='database',
                       help='Output format: json for debugging, database for app integration')
    
    args = parser.parse_args()
    
    try:
        start_time = datetime.now()
        print(f"[START] Plex Daily Sync - {args.approach.upper()} approach using Plex.tv API", file=sys.stderr)
        
        all_server_results = {}
        
        for server_group, servers in PLEX_SERVERS.items():
            if 'regular' in servers:
                server_config = servers['regular']
                
                # First, get shared users using Plex.tv API
                shared_users = get_shared_users_from_server(server_config)
                
                if not shared_users:
                    print(f"[WARNING] No shared users found for {server_config['name']}", file=sys.stderr)
                    all_server_results[server_config['name']] = {}
                    continue
                
                # Then get activity data
                if args.approach == 'individual':
                    results = get_user_activity_individual(server_config, shared_users)
                else:  # bulk
                    results = get_user_activity_bulk(server_config, shared_users, args.days)
                
                all_server_results[server_config['name']] = results
        
        end_time = datetime.now()
        processing_time = (end_time - start_time).total_seconds()
        
        if args.output == 'json':
            # Full JSON output for debugging
            print(json.dumps(all_server_results, indent=2))
        else:
            # Database-ready format
            sync_data = sync_to_database_format(all_server_results)
            print(json.dumps(sync_data, indent=2))
        
        # Stats to stderr
        total_users = sum(len(users) for users in all_server_results.values())
        users_with_data = sum(len([u for u in users.values() if u['days_since_last_watch'] is not None]) 
                             for users in all_server_results.values())
        
        print(f"[COMPLETE] Sync finished in {processing_time:.2f} seconds", file=sys.stderr)
        print(f"[STATS] {total_users} total users, {users_with_data} with watch history", file=sys.stderr)
        print(f"[STATS] Average: {processing_time/max(total_users,1):.3f} seconds per user", file=sys.stderr)
        
    except Exception as e:
        print(f"[FATAL] Sync failed: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()