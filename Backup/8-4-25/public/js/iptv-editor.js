// public/js/iptv-editor.js
// Frontend JavaScript for IPTV Editor integration

class IPTVEditorManager {
    constructor() {
        this.settings = {};
        this.users = [];
        this.initialized = false;
    }

    async initialize() {
        try {
            await this.loadSettings();
            this.initialized = true;
            console.log('IPTV Editor Manager initialized');
        } catch (error) {
            console.error('Failed to initialize IPTV Editor Manager:', error);
        }
    }

    // Settings Management
    async loadSettings() {
        try {
            const response = await fetch('/api/iptv-editor/settings');
            const result = await response.json();
            
            if (result.success) {
                this.settings = result.data;
                this.updateSettingsUI();
                return true;
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Error loading IPTV Editor settings:', error);
            showNotification('Failed to load IPTV Editor settings', 'error');
            return false;
        }
    }

    async saveSettings(newSettings) {
        try {
            const response = await fetch('/api/iptv-editor/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: newSettings })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.settings = { ...this.settings, ...newSettings };
                showNotification('IPTV Editor settings saved successfully', 'success');
                this.updateSettingsUI();
                return true;
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Error saving IPTV Editor settings:', error);
            showNotification('Failed to save IPTV Editor settings', 'error');
            return false;
        }
    }

    async testConnection() {
        try {
            showNotification('Testing IPTV Editor connection...', 'info');
            
            const response = await fetch('/api/iptv-editor/test-connection', {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('Connection test successful!', 'success');
                return true;
            } else {
                showNotification(`Connection test failed: ${result.message}`, 'error');
                return false;
            }
        } catch (error) {
            console.error('Error testing connection:', error);
            showNotification('Connection test failed', 'error');
            return false;
        }
    }

    updateSettingsUI() {
        // Update settings form fields
        const form = document.getElementById('iptv-editor-settings-form');
        if (!form) return;

        Object.keys(this.settings).forEach(key => {
            const element = form.querySelector(`[name="${key}"]`);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = this.settings[key];
                } else {
                    element.value = this.settings[key] || '';
                }
            }
        });

        // Update status indicators
        this.updateStatusIndicators();
    }

    updateStatusIndicators() {
        const statusElements = {
            'iptv-editor-status': this.settings.sync_enabled ? 'enabled' : 'disabled',
            'iptv-editor-token-status': this.settings.bearer_token ? 'configured' : 'missing',
            'iptv-editor-playlist-status': this.settings.default_playlist_id ? 'configured' : 'missing'
        };

        Object.keys(statusElements).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                const status = statusElements[id];
                element.textContent = status.charAt(0).toUpperCase() + status.slice(1);
                element.className = `status-indicator ${status}`;
            }
        });
    }

    // User Management
    async loadUsers() {
        try {
            const response = await fetch('/api/iptv-editor/users');
            const result = await response.json();
            
            if (result.success) {
                this.users = result.data.local_users || [];
                this.updateUsersTable();
                return true;
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Error loading IPTV Editor users:', error);
            showNotification('Failed to load IPTV Editor users', 'error');
            return false;
        }
    }

    async createUser(userData) {
        try {
            const response = await fetch('/api/iptv-editor/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('IPTV Editor user created successfully', 'success');
                await this.loadUsers();
                return result.data;
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Error creating IPTV Editor user:', error);
            showNotification('Failed to create IPTV Editor user', 'error');
            return null;
        }
    }

    async deleteUser(userId) {
        if (!confirm('Are you sure you want to delete this IPTV Editor user?')) {
            return false;
        }

        try {
            const response = await fetch(`/api/iptv-editor/users/${userId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('IPTV Editor user deleted successfully', 'success');
                await this.loadUsers();
                return true;
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Error deleting IPTV Editor user:', error);
            showNotification('Failed to delete IPTV Editor user', 'error');
            return false;
        }
    }

    async syncUser(userId) {
        try {
            const response = await fetch(`/api/iptv-editor/users/${userId}/sync`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('User synced successfully', 'success');
                await this.loadUsers();
                return true;
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Error syncing user:', error);
            showNotification('Failed to sync user', 'error');
            return false;
        }
    }

    async manualSync() {
        try {
            showNotification('Starting manual sync...', 'info');
            
            const response = await fetch('/api/iptv-editor/manual-sync', {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification(`Manual sync completed: ${result.data.length} users processed`, 'success');
                await this.loadUsers();
                this.showSyncResults(result.data);
                return true;
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Error in manual sync:', error);
            showNotification('Manual sync failed', 'error');
            return false;
        }
    }

    // Playlist and Data Management
    async syncPlaylists() {
        try {
            showNotification('Syncing playlists...', 'info');
            
            const response = await fetch('/api/iptv-editor/sync-playlists', {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('Playlists synced successfully', 'success');
                return true;
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Error syncing playlists:', error);
            showNotification('Failed to sync playlists', 'error');
            return false;
        }
    }

    async loadPlaylists() {
        try {
            const response = await fetch('/api/iptv-editor/playlists');
            const result = await response.json();
            
            if (result.success) {
                this.updatePlaylistsDropdown(result.data);
                return result.data;
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Error loading playlists:', error);
            showNotification('Failed to load playlists', 'error');
            return [];
        }
    }

    // UI Update Methods
    updateUsersTable() {
        const tbody = document.querySelector('#iptv-editor-users-table tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        this.users.forEach(user => {
            const row = document.createElement('tr');
            
            const statusClass = user.sync_status === 'synced' ? 'text-green-600' : 
                               user.sync_status === 'error' ? 'text-red-600' : 'text-yellow-600';
            
            const expiryDate = user.expiry_date ? new Date(user.expiry_date).toLocaleDateString() : 'N/A';
            const lastSync = user.last_sync_time ? new Date(user.last_sync_time).toLocaleString() : 'Never';
            
            row.innerHTML = `
                <td class="px-4 py-2">${user.name}</td>
                <td class="px-4 py-2">${user.email}</td>
                <td class="px-4 py-2">${user.iptv_editor_username || 'N/A'}</td>
                <td class="px-4 py-2">${user.max_connections || 1}</td>
                <td class="px-4 py-2">${expiryDate}</td>
                <td class="px-4 py-2">
                    <span class="${statusClass}">${user.sync_status || 'unknown'}</span>
                </td>
                <td class="px-4 py-2 text-sm text-gray-500">${lastSync}</td>
                <td class="px-4 py-2">
                    <div class="flex space-x-2">
                        <button onclick="iptvEditorManager.syncUser(${user.id})" 
                                class="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
                            Sync
                        </button>
                        <button onclick="iptvEditorManager.deleteUser(${user.id})" 
                                class="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700">
                            Delete
                        </button>
                    </div>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    }

    updatePlaylistsDropdown(playlists) {
        const select = document.getElementById('default_playlist_id');
        if (!select) return;

        select.innerHTML = '<option value="">Select a playlist...</option>';
        
        if (playlists && playlists.length > 0) {
            playlists.forEach(playlist => {
                const option = document.createElement('option');
                option.value = playlist.id;
                option.textContent = playlist.name;
                if (playlist.id === this.settings.default_playlist_id) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        }
    }

    showSyncResults(results) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        
        const content = document.createElement('div');
        content.className = 'bg-white rounded-lg p-6 max-w-2xl max-h-96 overflow-y-auto';
        
        content.innerHTML = `
            <h3 class="text-lg font-bold mb-4">Sync Results</h3>
            <div class="space-y-2">
                ${results.map(result => `
                    <div class="flex justify-between items-center p-2 rounded ${
                        result.status === 'synced' ? 'bg-green-100' :
                        result.status === 'error' ? 'bg-red-100' : 'bg-yellow-100'
                    }">
                        <span>${result.name}</span>
                        <span class="text-sm">${result.status}${result.error ? ': ' + result.error : ''}</span>
                    </div>
                `).join('')}
            </div>
            <button onclick="this.closest('.fixed').remove()" 
                    class="mt-4 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">
                Close
            </button>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
    }

    // Utility Methods
    generateUsername(name) {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(Math.random() * 1000);
    }

    generatePassword() {
        return Math.random().toString(36).substring(2, 10);
    }
}

// Initialize IPTV Editor Manager
const iptvEditorManager = new IPTVEditorManager();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    iptvEditorManager.initialize();
});

// Event Handlers
function saveIPTVEditorSettings() {
    const form = document.getElementById('iptv-editor-settings-form');
    if (!form) return;

    const formData = new FormData(form);
    const settings = {};

    for (const [key, value] of formData.entries()) {
        const input = form.querySelector(`[name="${key}"]`);
        if (input && input.type === 'checkbox') {
            settings[key] = input.checked;
        } else {
            settings[key] = value;
        }
    }

    iptvEditorManager.saveSettings(settings);
}

function testIPTVEditorConnection() {
    iptvEditorManager.testConnection();
}

function syncIPTVEditorPlaylists() {
    iptvEditorManager.syncPlaylists();
}

function manualIPTVEditorSync() {
    iptvEditorManager.manualSync();
}

function loadIPTVEditorPlaylists() {
    iptvEditorManager.loadPlaylists();
}

function createIPTVEditorUser() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 class="text-lg font-bold mb-4">Create IPTV Editor User</h3>
            <form id="create-iptv-user-form" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium mb-1">User</label>
                    <select name="user_id" required class="w-full border rounded px-3 py-2">
                        <option value="">Select user...</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Username</label>
                    <input type="text" name="username" required class="w-full border rounded px-3 py-2">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Password</label>
                    <input type="text" name="password" required class="w-full border rounded px-3 py-2">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Max Connections</label>
                    <input type="number" name="max_connections" value="1" min="1" max="10" class="w-full border rounded px-3 py-2">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Expiry Date</label>
                    <input type="datetime-local" name="expiry_date" class="w-full border rounded px-3 py-2">
                </div>
                <div class="flex space-x-2">
                    <button type="submit" class="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
                        Create User
                    </button>
                    <button type="button" onclick="this.closest('.fixed').remove()" 
                            class="flex-1 bg-gray-600 text-white py-2 rounded hover:bg-gray-700">
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Load available users
    loadUsersForIPTVEditor();
    
    // Set default expiry date (30 days from now)
    const expiryInput = modal.querySelector('[name="expiry_date"]');
    const defaultExpiry = new Date();
    defaultExpiry.setDate(defaultExpiry.getDate() + 30);
    expiryInput.value = defaultExpiry.toISOString().slice(0, 16);
    
    // Handle form submission
    modal.querySelector('#create-iptv-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const userData = {
            user_id: parseInt(formData.get('user_id')),
            username: formData.get('username'),
            password: formData.get('password'),
            max_connections: parseInt(formData.get('max_connections')),
            expiry_date: formData.get('expiry_date')
        };
        
        const result = await iptvEditorManager.createUser(userData);
        if (result) {
            modal.remove();
        }
    });
}

async function loadUsersForIPTVEditor() {
    try {
        const response = await fetch('/api/users');
        const result = await response.json();
        
        if (result.success) {
            const select = document.querySelector('#create-iptv-user-form [name="user_id"]');
            if (select) {
                select.innerHTML = '<option value="">Select user...</option>';
                
                result.data.forEach(user => {
                    // Only show users who don't already have IPTV Editor accounts
                    if (!user.iptv_editor_enabled) {
                        const option = document.createElement('option');
                        option.value = user.id;
                        option.textContent = `${user.name} (${user.email})`;
                        select.appendChild(option);
                    }
                });
                
                // Auto-generate username when user is selected
                select.addEventListener('change', (e) => {
                    if (e.target.value) {
                        const selectedOption = e.target.selectedOptions[0];
                        const userName = selectedOption.textContent.split(' (')[0];
                        const usernameInput = document.querySelector('#create-iptv-user-form [name="username"]');
                        const passwordInput = document.querySelector('#create-iptv-user-form [name="password"]');
                        
                        if (usernameInput && !usernameInput.value) {
                            usernameInput.value = iptvEditorManager.generateUsername(userName);
                        }
                        
                        if (passwordInput && !passwordInput.value) {
                            passwordInput.value = iptvEditorManager.generatePassword();
                        }
                    }
                });
            }
        }
    } catch (error) {
        console.error('Error loading users for IPTV Editor:', error);
    }
}

// Bulk operations
function bulkCreateIPTVEditorUsers() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <h3 class="text-lg font-bold mb-4">Bulk Create IPTV Editor Users</h3>
            <form id="bulk-create-iptv-form" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium mb-1">Select Users</label>
                    <div id="bulk-users-list" class="border rounded p-3 max-h-40 overflow-y-auto space-y-2">
                        <!-- Users will be loaded here -->
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Default Password (optional)</label>
                    <input type="text" name="default_password" placeholder="Leave empty for auto-generated" class="w-full border rounded px-3 py-2">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Max Connections</label>
                    <input type="number" name="max_connections" value="1" min="1" max="10" class="w-full border rounded px-3 py-2">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Expiry Months</label>
                    <input type="number" name="expiry_months" value="1" min="1" max="12" class="w-full border rounded px-3 py-2">
                </div>
                <div class="flex space-x-2">
                    <button type="submit" class="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
                        Create Users
                    </button>
                    <button type="button" onclick="this.closest('.fixed').remove()" 
                            class="flex-1 bg-gray-600 text-white py-2 rounded hover:bg-gray-700">
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Load users for bulk selection
    loadUsersForBulkIPTVEditor();
    
    // Handle form submission
    modal.querySelector('#bulk-create-iptv-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const selectedUsers = Array.from(modal.querySelectorAll('input[name="user_ids"]:checked')).map(cb => parseInt(cb.value));
        
        if (selectedUsers.length === 0) {
            showNotification('Please select at least one user', 'error');
            return;
        }
        
        const formData = new FormData(e.target);
        const bulkData = {
            user_ids: selectedUsers,
            default_password: formData.get('default_password') || null,
            max_connections: parseInt(formData.get('max_connections')),
            expiry_months: parseInt(formData.get('expiry_months'))
        };
        
        try {
            const response = await fetch('/api/iptv-editor/bulk-create-users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bulkData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification(`Bulk operation completed: ${result.data.length} users processed`, 'success');
                iptvEditorManager.showSyncResults(result.data);
                await iptvEditorManager.loadUsers();
                modal.remove();
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Error in bulk create:', error);
            showNotification('Bulk create operation failed', 'error');
        }
    });
}

async function loadUsersForBulkIPTVEditor() {
    try {
        const response = await fetch('/api/users');
        const result = await response.json();
        
        if (result.success) {
            const container = document.getElementById('bulk-users-list');
            if (container) {
                container.innerHTML = '';
                
                const availableUsers = result.data.filter(user => !user.iptv_editor_enabled);
                
                if (availableUsers.length === 0) {
                    container.innerHTML = '<p class="text-gray-500">No users available for IPTV Editor creation</p>';
                    return;
                }
                
                availableUsers.forEach(user => {
                    const div = document.createElement('div');
                    div.className = 'flex items-center space-x-2';
                    div.innerHTML = `
                        <input type="checkbox" name="user_ids" value="${user.id}" class="rounded">
                        <label class="text-sm">${user.name} (${user.email})</label>
                    `;
                    container.appendChild(div);
                });
                
                // Add "Select All" button
                const selectAllDiv = document.createElement('div');
                selectAllDiv.className = 'pt-2 border-t';
                selectAllDiv.innerHTML = `
                    <button type="button" onclick="toggleSelectAllIPTVUsers()" class="text-sm text-blue-600 hover:text-blue-800">
                        Select All / Deselect All
                    </button>
                `;
                container.appendChild(selectAllDiv);
            }
        }
    } catch (error) {
        console.error('Error loading users for bulk IPTV Editor:', error);
    }
}

function toggleSelectAllIPTVUsers() {
    const checkboxes = document.querySelectorAll('input[name="user_ids"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
    });
}

// Logs management
async function loadIPTVEditorLogs() {
    try {
        const response = await fetch('/api/iptv-editor/sync-logs?limit=100');
        const result = await response.json();
        
        if (result.success) {
            updateLogsTable(result.data.logs);
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error loading IPTV Editor logs:', error);
        showNotification('Failed to load sync logs', 'error');
    }
}

function updateLogsTable(logs) {
    const tbody = document.querySelector('#iptv-editor-logs-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    logs.forEach(log => {
        const row = document.createElement('tr');
        
        const statusClass = log.status === 'success' ? 'text-green-600' : 
                           log.status === 'error' ? 'text-red-600' : 'text-yellow-600';
        
        const createdAt = new Date(log.created_at).toLocaleString();
        
        row.innerHTML = `
            <td class="px-4 py-2 text-sm">${createdAt}</td>
            <td class="px-4 py-2">
                <span class="px-2 py-1 rounded text-xs ${log.sync_type === 'user_create' ? 'bg-blue-100 text-blue-800' :
                                                        log.sync_type === 'user_delete' ? 'bg-red-100 text-red-800' :
                                                        log.sync_type === 'user_sync' ? 'bg-green-100 text-green-800' :
                                                        log.sync_type === 'playlist_sync' ? 'bg-purple-100 text-purple-800' :
                                                        'bg-gray-100 text-gray-800'}">
                    ${log.sync_type.replace('_', ' ')}
                </span>
            </td>
            <td class="px-4 py-2">${log.user_name || 'N/A'}</td>
            <td class="px-4 py-2">
                <span class="${statusClass}">${log.status}</span>
            </td>
            <td class="px-4 py-2 text-sm">${log.duration_ms ? log.duration_ms + 'ms' : 'N/A'}</td>
            <td class="px-4 py-2">
                ${log.error_message ? `
                    <button onclick="showLogDetails(${log.id})" class="text-red-600 hover:text-red-800 text-sm">
                        View Error
                    </button>
                ` : ''}
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

function showLogDetails(logId) {
    // This would fetch and display detailed log information
    // Implementation depends on your specific needs
    console.log('Show log details for:', logId);
}

async function clearOldIPTVEditorLogs() {
    if (!confirm('Are you sure you want to clear logs older than 30 days?')) {
        return;
    }

    try {
        const response = await fetch('/api/iptv-editor/sync-logs', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ days_old: 30 })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Cleared ${result.deleted_count} old log entries`, 'success');
            loadIPTVEditorLogs();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error clearing logs:', error);
        showNotification('Failed to clear old logs', 'error');
    }
}

// Export functions for global access
window.iptvEditorManager = iptvEditorManager;
window.saveIPTVEditorSettings = saveIPTVEditorSettings;
window.testIPTVEditorConnection = testIPTVEditorConnection;
window.syncIPTVEditorPlaylists = syncIPTVEditorPlaylists;
window.manualIPTVEditorSync = manualIPTVEditorSync;
window.loadIPTVEditorPlaylists = loadIPTVEditorPlaylists;
window.createIPTVEditorUser = createIPTVEditorUser;
window.bulkCreateIPTVEditorUsers = bulkCreateIPTVEditorUsers;
window.loadIPTVEditorLogs = loadIPTVEditorLogs;
window.clearOldIPTVEditorLogs = clearOldIPTVEditorLogs;
window.toggleSelectAllIPTVUsers = toggleSelectAllIPTVUsers;