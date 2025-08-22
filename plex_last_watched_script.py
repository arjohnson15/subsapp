#!/usr/bin/env python3
"""
Plex Users API Last Watched Script
Uses the Plex Users API that has both emails and correct account IDs
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

# Server configurations
PLEX_SERVERS = {
    'plex1': {
        'name': 'Plex 1',
        'url': 'http://192.168.10.90:32400',
        'token': 'sxuautpKvoH2aZKG-j95'
    },
    'plex2': {
        'name': 'Plex 2',
        'url': 'http://192.168.10.94:32400',
        'token': 'B1QhFRA-Q2pSm15uxmMA'
    }
}

def get_users_with_emails_and_ids(server_config):
    """Get users using the Plex Users API - has both emails and account IDs"""
    try:
        print(f"[INFO] Getting users from {server_config['name']} using Users API", file=sys.stderr)
        
        url = f"https://plex.tv/api/users/?X-Plex-Token={server_config['token']}"
        headers = {'Accept': 'application/xml'}
        
        response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code != 200:
            print(f"[ERROR] Users API failed: HTTP {response.status_code}", file=sys.stderr)
            return []
        
        # Parse XML response
        root = ET.fromstring(response.text)
        users = []
        
        for user in root.findall('.//User'):
            user_id = user.get('id')
            username = user.get('username')
            email = user.get('email')
            
            if email and username and user_id:
                users.append({
                    'email': email.lower(),
                    'username': username,
                    'account_id': int(user_id)
                })
                print(f"[USER] {username} ({email}) -> Account ID: {user_id}", file=sys.stderr)
        
        print(f"[SUCCESS] Found {len(users)} users with emails and account IDs", file=sys.stderr)
        return users
        
    except Exception as e:
        print(f"[ERROR] Failed to get users: {e}", file=sys.stderr)
        return []

def get_last_watched_for_account(plex_server, account_id, username):
    """Get last watched date for a specific account ID"""
    try:
        # Get the most recent watch history entry
        history = plex_server.history(accountID=account_id, maxresults=1)
        
        if history and len(history) > 0:
            latest_item = history[0]
            viewed_at = getattr(latest_item, 'viewedAt', None) or getattr(latest_item, 'lastViewedAt', None)
            
            if viewed_at:
                days_since = (datetime.now() - viewed_at.replace(tzinfo=None)).days
                title = getattr(latest_item, 'title', 'Unknown')
                
                print(f"[WATCH] {username}: {days_since} days ago - {title}", file=sys.stderr)
                return {
                    'days_since_last_watch': days_since,
                    'last_watched_date': viewed_at.isoformat(),
                    'last_watched_title': title
                }
        
        print(f"[NO_WATCH] {username}: No watch history found", file=sys.stderr)
        return {
            'days_since_last_watch': None,
            'last_watched_date': None,
            'last_watched_title': None
        }
        
    except Exception as e:
        print(f"[ERROR] Failed to get watch history for {username} (ID: {account_id}): {e}", file=sys.stderr)
        return {
            'days_since_last_watch': None,
            'last_watched_date': None,
            'last_watched_title': None
        }

def process_server(server_key, server_config):
    """Process one server and return email + watch data"""
    results = []
    
    # Get users with emails and account IDs
    users = get_users_with_emails_and_ids(server_config)
    if not users:
        return results
    
    # Connect to Plex server
    try:
        plex = PlexServer(server_config['url'], server_config['token'], timeout=30)
    except Exception as e:
        print(f"[ERROR] Failed to connect to {server_config['name']}: {e}", file=sys.stderr)
        return results
    
    # Process each user
    for i, user in enumerate(users, 1):
        email = user['email']
        username = user['username']
        account_id = user['account_id']
        
        print(f"[PROCESSING] {i}/{len(users)}: {username} ({email}) -> Account ID: {account_id}", file=sys.stderr)
        
        # Get watch history using the account ID
        watch_data = get_last_watched_for_account(plex, account_id, username)
        
        results.append({
            'email': email,
            'username': username,
            'server': server_config['name'],
            'days_since_last_watch': watch_data['days_since_last_watch'],
            'last_watched_date': watch_data['last_watched_date'],
            'last_watched_title': watch_data['last_watched_title'],
            'plex_account_id': account_id,
            'sync_timestamp': datetime.now().isoformat()
        })
        
        # Small delay to avoid rate limiting
        if i % 20 == 0:
            print(f"[PROGRESS] Processed {i}/{len(users)} users", file=sys.stderr)
    
    return results

def main():
    parser = argparse.ArgumentParser(description='Plex Users API Last Watched Script')
    parser.add_argument('--servers', nargs='+', choices=['plex1', 'plex2'], default=['plex1', 'plex2'],
                       help='Which servers to check (default: plex1)')
    parser.add_argument('--format', choices=['json', 'simple'], default='json',
                       help='Output format')
    
    args = parser.parse_args()
    
    try:
        start_time = datetime.now()
        print(f"[START] Processing servers: {', '.join(args.servers)}", file=sys.stderr)
        
        all_results = []
        
        for server_key in args.servers:
            if server_key in PLEX_SERVERS:
                server_config = PLEX_SERVERS[server_key]
                results = process_server(server_key, server_config)
                all_results.extend(results)
        
        # Output results
        if args.format == 'simple':
            # Simple format: email, days_since_last_watch
            for result in all_results:
                days = result['days_since_last_watch']
                print(f"{result['email']},{days if days is not None else 'NULL'}")
        else:
            # JSON format
            print(json.dumps(all_results, indent=2))
        
        # Stats
        end_time = datetime.now()
        processing_time = (end_time - start_time).total_seconds()
        
        total_users = len(all_results)
        users_with_data = len([r for r in all_results if r['days_since_last_watch'] is not None])
        
        print(f"[COMPLETE] Processed {total_users} users in {processing_time:.2f} seconds", file=sys.stderr)
        print(f"[STATS] Success rate: {users_with_data}/{total_users} ({users_with_data/max(total_users,1)*100:.1f}%)", file=sys.stderr)
        print(f"[STATS] Average: {processing_time/max(total_users,1):.3f} seconds per user", file=sys.stderr)
        
    except Exception as e:
        print(f"[FATAL] Script failed: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()