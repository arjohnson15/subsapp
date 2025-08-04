const Management = {
    authenticated: false,
    tools: [],
    editingToolId: null,
    
    async init() {
        console.log('?? Initializing Management Panel...');
        
        // Check if user is already authenticated (session storage)
        const authToken = sessionStorage.getItem('managementAuth');
        const authTime = sessionStorage.getItem('managementAuthTime');
        
        // Authentication expires after 4 hours
        if (authToken && authTime) {
            const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
            if (parseInt(authTime) > fourHoursAgo && authToken === 'authenticated') {
                this.authenticated = true;
                console.log('? User already authenticated via session');
            }
        }
        
        if (!this.authenticated) {
            this.showPasswordModal();
            return;
        }
        
        try {
            await this.loadTools();
            this.renderTools();
            console.log('? Management Panel initialized');
        } catch (error) {
            console.error('? Management initialization failed:', error);
            Utils.handleError(error, 'Management initialization');
        }
    },
    
    showPasswordModal() {
        const modal = document.getElementById('managementPasswordModal');
        if (modal) {
            modal.style.display = 'flex';
            
            // Focus on password field
            setTimeout(() => {
                const passwordField = document.getElementById('managementPassword');
                if (passwordField) {
                    passwordField.focus();
                    
                    // Handle Enter key - remove any existing listeners first
                    passwordField.removeEventListener('keypress', this.handlePasswordKeypress);
                    passwordField.addEventListener('keypress', this.handlePasswordKeypress.bind(this));
                }
            }, 100);
        }
    },
    
    handlePasswordKeypress(e) {
        if (e.key === 'Enter') {
            this.verifyPassword();
        }
    },
    
    verifyPassword() {
        const passwordInput = document.getElementById('managementPassword');
        const errorDiv = document.getElementById('passwordError');
        
        if (!passwordInput) {
            console.error('Password input not found');
            return;
        }
        
        const enteredPassword = passwordInput.value.trim();
        
        if (!enteredPassword) {
            if (errorDiv) {
                errorDiv.textContent = 'Please enter a password';
                errorDiv.style.display = 'block';
            }
            return;
        }
        
        console.log('?? Verifying password...');
        
        // CLIENT-SIDE PASSWORD CHECK - NO API CALL
        if (enteredPassword === 'Gunshy@1') {
            // Correct password
            console.log('? Password correct, granting access');
            this.authenticated = true;
            
            // Store authentication in session (expires in 4 hours)
            sessionStorage.setItem('managementAuth', 'authenticated');
            sessionStorage.setItem('managementAuthTime', Date.now().toString());
            
            // Hide modal and clear error
            const modal = document.getElementById('managementPasswordModal');
            if (modal) {
                modal.style.display = 'none';
            }
            if (errorDiv) {
                errorDiv.style.display = 'none';
            }
            
            // Load and render management tools
            this.loadAndRenderTools();
            
            Utils.showNotification('Management access granted', 'success');
        } else {
            // Wrong password
            console.log('? Incorrect password entered');
            if (errorDiv) {
                errorDiv.textContent = 'Incorrect password. Please try again.';
                errorDiv.style.display = 'block';
                
                // Hide error after 3 seconds
                setTimeout(() => {
                    errorDiv.style.display = 'none';
                }, 3000);
            }
            
            // Clear input and refocus
            passwordInput.value = '';
            passwordInput.focus();
        }
    },
    
    async loadAndRenderTools() {
        try {
            await this.loadTools();
            this.renderTools();
        } catch (error) {
            console.error('? Error loading tools:', error);
            Utils.handleError(error, 'Loading management tools');
        }
    },
    
    async loadTools() {
        try {
            console.log('?? Loading management tools...');
            
            const settings = await API.Settings.getAll();
            const toolsData = settings.management_tools;
            
            if (toolsData && typeof toolsData === 'object') {
                this.tools = Array.isArray(toolsData) ? toolsData : Object.values(toolsData);
            } else {
                // Initialize with default tools
                this.tools = this.getDefaultTools();
                await this.saveTools();
            }
            
            console.log(`?? Loaded ${this.tools.length} management tools`);
        } catch (error) {
            console.error('? Error loading management tools:', error);
            this.tools = this.getDefaultTools();
        }
    },
    
    getDefaultTools() {
        return [
            {
                id: 'radarr',
                name: 'Radarr',
                url: 'http://192.168.10.92:7878',
                username: '',
                password: '',
                api_key: '',
                notes: 'Movies downloader and manager (add API key from settings).',
                access_type: 'both'
            },
            {
                id: 'sonarr',
                name: 'Sonarr',
                url: 'http://192.168.10.92:8989',
                username: '',
                password: '',
                api_key: '',
                notes: 'TV Shows downloader and manager (add API key from settings).',
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
            console.log('?? Saving management tools...');
            
            await API.Settings.update({
                management_tools: this.tools
            });
            
            console.log('? Management tools saved');
        } catch (error) {
            console.error('? Error saving management tools:', error);
            Utils.handleError(error, 'Saving management tools');
        }
    },
    
    renderTools() {
        const grid = document.getElementById('managementToolsGrid');
        if (!grid) {
            console.error('Management tools grid not found');
            return;
        }
        
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
            // Generate access buttons based on access_type
            let accessButtons = '';
            const accessType = tool.access_type || 'new_tab';
            
            if (accessType === 'iframe' || accessType === 'both') {
                accessButtons += `
                    <button class="tool-button tool-button-iframe" onclick="Management.openInIframe('${tool.id}')" title="Open in embedded iframe">
                        ?? Open in App
                    </button>
                `;
            }
            
            if (accessType === 'new_tab' || accessType === 'both') {
                accessButtons += `
                    <button class="tool-button tool-button-newtab" onclick="Management.openInNewTab('${tool.id}')" title="Open in new browser tab">
                        ?? Open in New Tab
                    </button>
                `;
            }
            
            return `
                <div class="management-tool" data-tool-id="${tool.id}">
                    <div class="tool-header">
                        <h3 class="tool-name">${tool.name}</h3>
                        <div class="tool-actions">
                            <button class="btn btn-small btn-tool-edit" onclick="Management.editTool('${tool.id}')" title="Edit tool settings">Edit</button>
                            <button class="btn btn-small btn-tool-delete" onclick="Management.deleteTool('${tool.id}')" title="Delete this tool">Delete</button>
                        </div>
                    </div>
                    
                    <div class="tool-access-buttons">
                        ${accessButtons}
                    </div>
                    
                    <!-- Collapsible Credentials Toggle -->
                    <div class="credentials-toggle" onclick="Management.toggleCredentials('${tool.id}')">
                        <span class="credentials-toggle-text">Show Details</span>
                        <span class="credentials-toggle-icon">?</span>
                    </div>
                    
                    <!-- Collapsible Credentials Section -->
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
                            <span class="credential-label">Access:</span>
                            <span class="credential-value access-type-${accessType}">
                                ${accessType === 'both' ? '???? Both Methods' : 
                                  accessType === 'iframe' ? '?? iframe Only' : 
                                  '?? New Tab Only'}
                            </span>
                        </div>
                        
                        ${tool.notes ? `
                            <div class="tool-notes">
                                <strong>Notes:</strong>
                                <p>${tool.notes}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        console.log(`? Rendered ${this.tools.length} management tools`);
    },
    
    openInNewTab(toolId) {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool) {
            Utils.showNotification('Tool not found', 'error');
            return;
        }
        
        console.log(`?? Opening ${tool.name} in new tab: ${tool.url}`);
        window.open(tool.url, '_blank');
        Utils.showNotification(`Opening ${tool.name} in new tab`, 'info');
    },
    
    openInIframe(toolId) {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool) {
            Utils.showNotification('Tool not found', 'error');
            return;
        }
        
        // Check if tool supports iframe access
        if (tool.access_type !== 'iframe' && tool.access_type !== 'both') {
            Utils.showNotification('This tool only supports opening in new tab', 'warning');
            this.openInNewTab(toolId);
            return;
        }
        
        console.log(`?? Opening ${tool.name} in iframe: ${tool.url}`);
        this.showIframeModal(tool);
    },
    
showIframeModal(tool) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('iframeModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'iframeModal';
        modal.className = 'modal iframe-modal';
        modal.style.display = 'none';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="iframe-header">
                <h3>${tool.name}</h3>
                <div class="iframe-controls">
                    <button class="btn btn-small" onclick="Management.refreshIframe()" title="Refresh">
                        🔄 Refresh
                    </button>
                    <button class="btn btn-small" onclick="Management.openInNewTab('${tool.id}')" title="Open in new tab">
                        ↗️ New Tab
                    </button>
                    <button class="btn btn-small btn-secondary" onclick="Management.closeIframeModal()" title="Close">
                        ✕ Close
                    </button>
                </div>
            </div>
            <div class="iframe-container">
                <div class="iframe-loader" id="iframeLoader">
                    <div class="loader-content">
                        <div class="spinner"></div>
                        <p>Loading ${tool.name}...</p>
                        <small>This may take a few moments</small>
                    </div>
                </div>
                <iframe id="toolIframe" src="/api/management/tools/${tool.id}/proxy" style="display: none;"></iframe>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
    
    // Prevent body scrolling
    document.body.style.overflow = 'hidden';
    
    // Handle iframe load
    const iframe = document.getElementById('toolIframe');
    const loader = document.getElementById('iframeLoader');
    
    iframe.onload = () => {
        loader.style.display = 'none';
        iframe.style.display = 'block';
        console.log(`✅ ${tool.name} loaded in iframe`);
    };
    
    iframe.onerror = () => {
        loader.innerHTML = `
            <div class="loader-content">
                <p style="color: #f44336;">Failed to load ${tool.name}</p>
                <small>This service may not support iframe embedding</small>
                <div style="margin-top: 15px;">
                    <button class="btn" onclick="Management.openInNewTab('${tool.id}')">
                        Open in New Tab Instead
                    </button>
                </div>
            </div>
        `;
    };
    
    // Add escape key handler
    const keyHandler = (event) => {
        if (event.key === 'Escape') {
            Management.closeIframeModal();
        }
    };
    document.addEventListener('keydown', keyHandler);
    
    // Store handler for cleanup
    modal.keyHandler = keyHandler;
    
    Utils.showNotification(`Opening ${tool.name} in iframe`, 'info');
},
    
    refreshIframe() {
        const iframe = document.getElementById('toolIframe');
        if (iframe) {
            const loader = document.getElementById('iframeLoader');
            if (loader) {
                loader.style.display = 'flex';
                iframe.style.display = 'none';
            }
            iframe.src = iframe.src; // Refresh iframe
        }
    },
    
closeIframeModal() {
    const modal = document.getElementById('iframeModal');
    if (modal) {
        modal.style.display = 'none';
        
        // Clean up event listener
        if (modal.keyHandler) {
            document.removeEventListener('keydown', modal.keyHandler);
            delete modal.keyHandler;
        }
    }
    
    // Restore body scrolling
    document.body.style.overflow = '';
},
    
    handleIframeKeydown(event) {
        if (event.key === 'Escape') {
            Management.closeIframeModal();
        }
    },
    
    showAddForm() {
        this.editingToolId = null;
        document.getElementById('toolFormTitle').textContent = 'Add New Tool';
        document.getElementById('toolForm').reset();
        document.getElementById('toolFormContainer').style.display = 'block';
        
        // Set default access type to both
        document.getElementById('toolAccessType').value = 'both';
        
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
        document.getElementById('toolAccessType').value = tool.access_type || 'both';
        
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
            access_type: formData.get('access_type') || 'both'
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
                    console.log(`?? Updated tool: ${toolData.name}`);
                    Utils.showNotification(`Updated ${toolData.name}`, 'success');
                }
            } else {
                // Add new tool
                const newTool = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    ...toolData
                };
                this.tools.push(newTool);
                console.log(`? Added new tool: ${toolData.name}`);
                Utils.showNotification(`Added ${toolData.name}`, 'success');
            }
            
            await this.saveTools();
            this.renderTools();
            this.hideForm();
            
        } catch (error) {
            console.error('? Error saving tool:', error);
            Utils.handleError(error, 'Saving tool');
        }
    },
    
    async deleteTool(toolId) {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool) return;
        
        if (confirm(`Are you sure you want to delete "${tool.name}"?\n\nThis action cannot be undone.`)) {
            try {
                this.tools = this.tools.filter(t => t.id !== toolId);
                await this.saveTools();
                this.renderTools();
                
                console.log(`??? Deleted tool: ${tool.name}`);
                Utils.showNotification(`Deleted ${tool.name}`, 'success');
            } catch (error) {
                console.error('? Error deleting tool:', error);
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
    
    toggleCredentials(toolId) {
        const toggle = document.querySelector(`[data-tool-id="${toolId}"] .credentials-toggle`);
        const credentials = document.querySelector(`[data-tool-id="${toolId}"] .tool-credentials`);
        
        if (!toggle || !credentials) {
            console.error('Toggle or credentials element not found for tool:', toolId);
            return;
        }
        
        const isExpanded = toggle.classList.contains('expanded');
        
        if (isExpanded) {
            // Collapse
            toggle.classList.remove('expanded');
            credentials.classList.remove('expanded');
        } else {
            // Expand
            toggle.classList.add('expanded');
            credentials.classList.add('expanded');
        }
    },
    
    logout() {
        if (confirm('Are you sure you want to logout of the management panel?')) {
            this.authenticated = false;
            this.tools = [];
            
            // Clear session storage
            sessionStorage.removeItem('managementAuth');
            sessionStorage.removeItem('managementAuthTime');
            
            // Clear the grid
            const grid = document.getElementById('managementToolsGrid');
            if (grid) {
                grid.innerHTML = `
                    <div class="card" style="text-align: center; color: #4fc3f7;">
                        <h3>Management Panel Locked</h3>
                        <p>Please authenticate to access management tools.</p>
                    </div>
                `;
            }
            
            // Show password modal
            this.showPasswordModal();
            
            Utils.showNotification('Logged out of management panel', 'info');
        }
    }
};

window.addEventListener('message', (event) => {
    // Security check - only accept messages from our proxy
    if (!event.origin.includes(window.location.origin)) {
        return;
    }
    
    if (event.data && event.data.type === 'OPEN_IN_NEW_TAB') {
        console.log('🚪 Received request to break out of iframe:', event.data.url);
        
        // Close the iframe modal
        Management.closeIframeModal();
        
        // Open in new tab
        window.open(event.data.url, '_blank');
        
        // Show notification
        Utils.showNotification('Opening in new tab for better compatibility', 'info');
    }
}, false);

// Expose Management to window for app.js to access
window.Management = Management;

// Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('?? Management module ready for initialization');
    });
} else {
    console.log('?? Management module loaded');
}