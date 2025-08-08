#!/usr/bin/env python3
"""
Plex Daily Sync Script - Optimized for Database Updates
Two approaches: Individual calls (reliable) vs Bulk history (faster but risky)
"""

import json
import sys
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

def approach_1_individual_calls(server_config):
    """APPROACH 1: Individual API calls per user (RELIABLE but slower)"""
    try:
        print(f"[APPROACH 1] Using individual API calls for {server_config['name']}", file=sys.stderr)
        plex = PlexServer(server_config['url'], server_config['token'], timeout=15)
        
        # Get all users
        accounts = plex.systemAccounts()
        print(f"[INFO] Found {len(accounts)} accounts", file=sys.stderr)
        
        results = {}
        
        for i, account in enumerate(accounts, 1):
            try:
                account_id = account.id
                account_name = getattr(account, 'name', f'User {account_id}')
                
                if i % 25 == 0:
                    print(f"[PROGRESS] {i}/{len(accounts)} users processed", file=sys.stderr)
                
                # Get most recent item for this user
                history = plex.history(accountID=account_id, maxresults=1)
                
                if history and len(history) > 0:
                    latest_item = history[0]
                    viewed_at = getattr(latest_item, 'viewedAt', None) or getattr(latest_item, 'lastViewedAt', None)
                    
                    if viewed_at:
                        days_since = (datetime.now() - viewed_at.replace(tzinfo=None)).days
                        results[account_id] = {
                            'account_id': account_id,
                            'account_name': account_name,
                            'days_since_last_watch': days_since,
                            'last_watched_date': viewed_at.isoformat(),
                            'last_watched_title': getattr(latest_item, 'title', 'Unknown')
                        }
                        continue
                
                # No watch history
                results[account_id] = {
                    'account_id': account_id,
                    'account_name': account_name,
                    'days_since_last_watch': None,
                    'last_watched_date': None,
                    'last_watched_title': None
                }
                
            except Exception as e:
                print(f"[ERROR] Failed for user {account.id}: {e}", file=sys.stderr)
                results[account.id] = {
                    'account_id': account.id,
                    'account_name': getattr(account, 'name', f'User {account.id}'),
                    'days_since_last_watch': None,
                    'last_watched_date': None,
                    'last_watched_title': None,
                    'error': str(e)
                }
        
        return results
        
    except Exception as e:
        print(f"[ERROR] Approach 1 failed: {e}", file=sys.stderr)
        return {}

def approach_2_bulk_recent_history(server_config, days_back=30):
    """APPROACH 2: Get recent history in bulk, then process (FASTER but limited)"""
    try:
        print(f"[APPROACH 2] Using bulk history for {server_config['name']} (last {days_back} days)", file=sys.stderr)
        plex = PlexServer(server_config['url'], server_config['token'], timeout=15)
        
        # Get all users first
        accounts = plex.systemAccounts()
        account_lookup = {acc.id: getattr(acc, 'name', f'User {acc.id}') for acc in accounts}
        print(f"[INFO] Found {len(accounts)} accounts", file=sys.stderr)
        
        # Get recent history in bulk (much faster for recent activity)
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
        
        # Build results for all users
        results = {}
        
        for account_id, account_name in account_lookup.items():
            if account_id in user_last_watched:
                watch_data = user_last_watched[account_id]
                days_since = (datetime.now() - watch_data['viewed_at'].replace(tzinfo=None)).days
                
                results[account_id] = {
                    'account_id': account_id,
                    'account_name': account_name,
                    'days_since_last_watch': days_since,
                    'last_watched_date': watch_data['viewed_at'].isoformat(),
                    'last_watched_title': watch_data['title']
                }
            else:
                # No recent activity (or never watched)
                results[account_id] = {
                    'account_id': account_id,
                    'account_name': account_name,
                    'days_since_last_watch': None,  # Could be >30 days or never
                    'last_watched_date': None,
                    'last_watched_title': None
                }
        
        users_with_recent_activity = len([r for r in results.values() if r['days_since_last_watch'] is not None])
        print(f"[SUCCESS] Found recent activity for {users_with_recent_activity}/{len(results)} users", file=sys.stderr)
        
        return results
        
    except Exception as e:
        print(f"[ERROR] Approach 2 failed: {e}", file=sys.stderr)
        return {}

def sync_to_database_format(server_results):
    """Convert results to format suitable for database sync"""
    sync_data = []
    
    for server_name, users in server_results.items():
        for account_id, user_data in users.items():
            sync_data.append({
                'server': server_name,
                'plex_account_id': account_id,
                'plex_account_name': user_data['account_name'],
                'days_since_last_watch': user_data['days_since_last_watch'],
                'last_watched_date': user_data['last_watched_date'],
                'last_watched_title': user_data['last_watched_title'],
                'sync_timestamp': datetime.now().isoformat(),
                'has_recent_activity': user_data['days_since_last_watch'] is not None
            })
    
    return sync_data

def main():
    parser = argparse.ArgumentParser(description='Plex Daily Sync - Get last watched data for database updates')
    parser.add_argument('--approach', choices=['individual', 'bulk'], default='individual',
                       help='individual = slower but gets all data, bulk = faster but only recent activity')
    parser.add_argument('--days', type=int, default=30,
                       help='For bulk approach: how many days back to check (default: 30)')
    parser.add_argument('--output', choices=['json', 'database'], default='database',
                       help='Output format: json for debugging, database for app integration')
    
    args = parser.parse_args()
    
    try:
        start_time = datetime.now()
        print(f"[START] Plex Daily Sync - {args.approach.upper()} approach", file=sys.stderr)
        
        all_server_results = {}
        
        for server_group, servers in PLEX_SERVERS.items():
            if 'regular' in servers:
                server_config = servers['regular']
                
                if args.approach == 'individual':
                    results = approach_1_individual_calls(server_config)
                else:  # bulk
                    results = approach_2_bulk_recent_history(server_config, args.days)
                
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