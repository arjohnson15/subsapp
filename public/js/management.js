// Management Tools JavaScript Module - SIMPLIFIED VERSION (NEW TAB ONLY)
console.log('📋 Loading Management.js...');

window.Management = {
    isAuthenticated: false,
    editingToolId: null,
    tools: [],
    
    async init() {
        console.log('🔧 Initializing Management module...');
        
        // Check if user should be authenticated (based on session storage)
        const authToken = sessionStorage.getItem('managementAuth');
        const authTime = sessionStorage.getItem('managementAuthTime');
        
        // Authentication expires after 4 hours
        if (authToken && authTime) {
            const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
            if (parseInt(authTime) > fourHoursAgo && authToken === 'authenticated') {
                this.isAuthenticated = true;
                console.log('✅ User already authenticated via session');
            }
        }
        
        if (!this.isAuthenticated) {
            this.showPasswordModal();
            return;
        }
        
        await this.loadTools();
        this.renderTools();
        console.log('✅ Management module initialized');
    },
    
    showPasswordModal() {
        const modal = document.getElementById('managementPasswordModal');
        if (modal) {
            modal.classList.add('active');
            
            // Focus on password input
            setTimeout(() => {
                const passwordInput = document.getElementById('managementPassword');
                if (passwordInput) {
                    passwordInput.focus();
                    
                    // Allow Enter key to submit
                    passwordInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            this.verifyPassword();
                        }
                    });
                }
            }, 100);
        }
    },
    
    async verifyPassword() {
        const passwordInput = document.getElementById('managementPassword');
        const errorDiv = document.getElementById('passwordError');
        
        if (!passwordInput) return;
        
        const enteredPassword = passwordInput.value;
        
        if (enteredPassword === 'Gunshy@1') {
            // Correct password
            this.isAuthenticated = true;
            
            // Store authentication in session
            sessionStorage.setItem('managementAuth', 'authenticated');
            sessionStorage.setItem('managementAuthTime', Date.now().toString());
            
            // Hide modal
            document.getElementById('managementPasswordModal').classList.remove('active');
            
            // Load management tools
            await this.loadTools();
            this.renderTools();
            
            Utils.showNotification('Management access granted', 'success');
        } else {
            // Wrong password
            if (errorDiv) {
                errorDiv.style.display = 'block';
                setTimeout(() => {
                    errorDiv.style.display = 'none';
                }, 3000);
            }
            passwordInput.value = '';
            passwordInput.focus();
        }
    },
    
    logout() {
        if (confirm('Are you sure you want to logout from the management panel?')) {
            this.isAuthenticated = false;
            sessionStorage.removeItem('managementAuth');
            sessionStorage.removeItem('managementAuthTime');
            
            Utils.showNotification('Logged out of management panel', 'info');
            showPage('dashboard');
        }
    },
    
    async loadTools() {
        try {
            console.log('📊 Loading management tools...');
            
            // Get tools from settings
            const settings = await API.Settings.getAll();
            const toolsData = settings.management_tools;
            
            if (toolsData && typeof toolsData === 'object') {
                this.tools = Array.isArray(toolsData) ? toolsData : Object.values(toolsData);
            } else {
                // Initialize with default tools
                this.tools = this.getDefaultTools();
                await this.saveTools();
            }
            
            console.log('📊 Management tools loaded:', this.tools.length);
        } catch (error) {
            console.error('❌ Error loading management tools:', error);
            
            // Use default tools on error
            this.tools = this.getDefaultTools();
        }
    },
    
    getDefaultTools() {
        return [
            {
                id: 'radarr-main',
                name: 'Radarr Main',
                url: 'http://192.168.10.92:9390',
                username: '',
                password: '',
                api_key: '3209f1c4db0d45fa853347db0bf757be',
                notes: 'Main Radarr instance for movie management.',
                access_type: 'both'
            },
            {
                id: 'radarr-4k',
                name: 'Radarr 4K',
                url: 'http://192.168.10.92:9391',
                username: '',
                password: '',
                api_key: '',
                notes: '4K Radarr instance (add API key from settings).',
                access_type: 'both'
            },
            {
                id: 'radarr-anime',
                name: 'Radarr Anime',
                url: 'http://192.168.10.92:9392',
                username: '',
                password: '',
                api_key: '',
                notes: 'Anime Radarr instance (add API key from settings).',
                access_type: 'both'
            },
            {
                id: 'sonarr-main',
                name: 'Sonarr Main',
                url: 'http://192.168.10.92:8989',
                username: '',
                password: '',
                api_key: '',
                notes: 'Main Sonarr instance for TV shows (add API key from settings).',
                access_type: 'both'
            },
            {
                id: 'sonarr-anime',
                name: 'Sonarr Anime',
                url: 'http://192.168.10.92:8990',
                username: '',
                password: '',
                api_key: '',
                notes: 'Anime Sonarr instance (add API key from settings).',
                access_type: 'both'
            }
        ];
    },
    
    async saveTools() {
        try {
            console.log('💾 Saving management tools...');
            
            await API.Settings.update({
                management_tools: this.tools
            });
            
            console.log('✅ Management tools saved');
        } catch (error) {
            console.error('❌ Error saving management tools:', error);
            Utils.handleError(error, 'Saving management tools');
        }
    },
    
    renderTools() {
        const grid = document.getElementById('managementToolsGrid');
        if (!grid) return;
        
        if (this.tools.length === 0) {
            grid.innerHTML = `
                <div class="card" style="text-align: center; color: #4fc3f7;">
                    <h3>No Management Tools</h3>
                    <p>Click "Add New Tool" to create your first management tool.</p>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = this.tools.map(tool => {
            return `
                <div class="management-tool">
                    <div class="tool-header">
                        <h3 class="tool-name">${tool.name}</h3>
                        <div class="tool-actions">
                            <button class="btn btn-small btn-tool-edit" onclick="Management.editTool('${tool.id}')">Edit</button>
                            <button class="btn btn-small btn-tool-delete" onclick="Management.deleteTool('${tool.id}')">Delete</button>
                        </div>
                    </div>
                    
                    <div class="tool-access-buttons">
                        <button class="tool-button tool-button-newtab" onclick="Management.openInNewTab('${tool.id}')" style="width: 100%;">
                            ↗️ Open ${tool.name}
                        </button>
                    </div>
                    
                    <div class="tool-credentials">
                        <div class="credential-row">
                            <span class="credential-label">URL:</span>
                            <span class="credential-value url-value" onclick="Management.copyToClipboard('${tool.url}')" title="Click to copy">
                                ${tool.url}
                            </span>
                        </div>
                        ${tool.api_key ? `
                        <div class="credential-row">
                            <span class="credential-label">API Key:</span>
                            <span class="credential-value" onclick="Management.copyToClipboard('${tool.api_key}')" title="Click to copy">
                                ${tool.api_key.substring(0, 8)}...${tool.api_key.substring(tool.api_key.length - 4)}
                            </span>
                        </div>
                        ` : ''}
                        ${tool.username ? `
                        <div class="credential-row">
                            <span class="credential-label">Username:</span>
                            <span class="credential-value" onclick="Management.copyToClipboard('${tool.username}')" title="Click to copy">
                                ${tool.username}
                            </span>
                        </div>
                        ` : ''}
                        ${tool.password ? `
                        <div class="credential-row">
                            <span class="credential-label">Password:</span>
                            <span class="credential-value" onclick="Management.copyToClipboard('${tool.password}')" title="Click to copy">
                                ••••••••
                            </span>
                        </div>
                        ` : ''}
                        <div class="credential-row">
                            <span class="credential-label">Status:</span>
                            <button class="btn btn-small" onclick="Management.testTool('${tool.id}')" style="padding: 4px 8px; font-size: 11px;">
                                🧪 Test Connection
                            </button>
                        </div>
                    </div>
                    
                    ${tool.notes ? `
                        <div class="tool-notes">
                            <strong>Notes:</strong>
                            <p>${tool.notes}</p>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    },
    
    openInNewTab(toolId) {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool) {
            Utils.showNotification('Tool not found', 'error');
            return;
        }
        
        console.log(`↗️ Opening ${tool.name} in new tab: ${tool.url}`);
        window.open(tool.url, '_blank');
        Utils.showNotification(`Opening ${tool.name} in new tab`, 'info');
    },
    
    showAddForm() {
        this.editingToolId = null;
        document.getElementById('toolFormTitle').textContent = 'Add New Tool';
        document.getElementById('toolForm').reset();
        document.getElementById('toolFormContainer').style.display = 'block';
        
        // Set default access type to new_tab for now
        document.getElementById('toolAccessType').value = 'new_tab';
        
        // Scroll to form
        document.getElementById('toolFormContainer').scrollIntoView({ behavior: 'smooth' });
        
        // Focus on name field
        setTimeout(() => {
            document.getElementById('toolName').focus();
        }, 100);
    },
    
    hideForm() {
        document.getElementById('toolFormContainer').style.display = 'none';
        this.editingToolId = null;
    },
    
    editTool(toolId) {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool) return;
        
        this.editingToolId = toolId;
        document.getElementById('toolFormTitle').textContent = 'Edit Tool';
        
        // Populate form
        document.getElementById('toolName').value = tool.name;
        document.getElementById('toolUrl').value = tool.url;
        document.getElementById('toolUsername').value = tool.username || '';
        document.getElementById('toolPassword').value = tool.password || '';
        document.getElementById('toolApiKey').value = tool.api_key || '';
        document.getElementById('toolNotes').value = tool.notes || '';
        document.getElementById('toolAccessType').value = tool.access_type || 'new_tab';
        
        document.getElementById('toolFormContainer').style.display = 'block';
        
        // Scroll to form
        document.getElementById('toolFormContainer').scrollIntoView({ behavior: 'smooth' });
    },
    
    async saveTool(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const toolData = {
            name: formData.get('name'),
            url: formData.get('url'),
            username: formData.get('username'),
            password: formData.get('password'),
            api_key: formData.get('api_key'),
            notes: formData.get('notes'),
            access_type: formData.get('access_type') || 'new_tab'
        };
        
        // Validate required fields
        if (!toolData.name || !toolData.url) {
            Utils.showNotification('Name and URL are required', 'error');
            return;
        }
        
        try {
            if (this.editingToolId) {
                // Update existing tool
                const toolIndex = this.tools.findIndex(t => t.id === this.editingToolId);
                if (toolIndex !== -1) {
                    this.tools[toolIndex] = { ...this.tools[toolIndex], ...toolData };
                    console.log(`✏️ Updated tool: ${toolData.name}`);
                    Utils.showNotification(`Updated ${toolData.name}`, 'success');
                }
            } else {
                // Add new tool
                const newTool = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    ...toolData
                };
                this.tools.push(newTool);
                console.log(`➕ Added new tool: ${toolData.name}`);
                Utils.showNotification(`Added ${toolData.name}`, 'success');
            }
            
            await this.saveTools();
            this.renderTools();
            this.hideForm();
            
        } catch (error) {
            console.error('❌ Error saving tool:', error);
            Utils.handleError(error, 'Saving tool');
        }
    },
    
    async deleteTool(toolId) {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool) return;
        
        if (confirm(`Are you sure you want to delete "${tool.name}"? This action cannot be undone.`)) {
            try {
                this.tools = this.tools.filter(t => t.id !== toolId);
                await this.saveTools();
                this.renderTools();
                
                console.log(`🗑️ Deleted tool: ${tool.name}`);
                Utils.showNotification(`Deleted ${tool.name}`, 'success');
            } catch (error) {
                console.error('❌ Error deleting tool:', error);
                Utils.handleError(error, 'Deleting tool');
            }
        }
    },
    
    copyToClipboard(text) {
        if (!text) return;
        
        navigator.clipboard.writeText(text).then(() => {
            Utils.showNotification('Copied to clipboard', 'success');
        }).catch(err => {
            console.error('Failed to copy to clipboard:', err);
            Utils.showNotification('Failed to copy to clipboard', 'error');
        });
    },
    
    // Test tool connectivity
    async testTool(toolId) {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool) {
            Utils.showNotification('Tool not found', 'error');
            return;
        }
        
        try {
            console.log(`🧪 Testing connectivity for ${tool.name}...`);
            Utils.showNotification(`Testing ${tool.name} connectivity...`, 'info');
            
            const response = await fetch(`/api/management/tools/${toolId}/test`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const result = await response.json();
            
            if (result.success && result.accessible) {
                Utils.showNotification(`✅ ${tool.name} is accessible (${result.responseTime})`, 'success');
                console.log(`✅ Test result for ${tool.name}:`, result);
            } else {
                Utils.showNotification(`❌ ${tool.name} is not accessible: ${result.error || 'Unknown error'}`, 'error');
                console.error(`❌ Test failed for ${tool.name}:`, result);
            }
            
        } catch (error) {
            console.error(`❌ Error testing ${tool.name}:`, error);
            Utils.showNotification(`❌ Failed to test ${tool.name}: ${error.message}`, 'error');
        }
    }
};

// Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('📋 Management module ready for initialization');
    });
} else {
    console.log('📋 Management module loaded');
}