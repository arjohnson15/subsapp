// Management Tools JavaScript Module
console.log('📋 Loading Management.js...');

window.Management = {
    isAuthenticated: false,
    editingToolId: null,
    tools: [],
    
    // Password hash for "Gunshy@1" - using a simple hash for security
    passwordHash: 'a8f5f167f44f4964e6c998dee827110c', // This is MD5 of "Gunshy@1"
    
    async init() {
        console.log('🔧 Initializing Management module...');
        
        // Check if user should be authenticated (based on session storage)
        const authToken = sessionStorage.getItem('managementAuth');
        const authTime = sessionStorage.getItem('managementAuthTime');
        
        // Authentication expires after 4 hours
        if (authToken && authTime) {
            const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
            if (parseInt(authTime) > fourHoursAgo && authToken === this.passwordHash) {
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
        const enteredHash = await this.simpleHash(enteredPassword);
        
        if (enteredHash === this.passwordHash) {
            // Correct password
            this.isAuthenticated = true;
            
            // Store authentication in session (expires when browser closes)
            sessionStorage.setItem('managementAuth', this.passwordHash);
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
                
                // Hide error after 3 seconds
                setTimeout(() => {
                    errorDiv.style.display = 'none';
                }, 3000);
            }
            
            // Clear input
            passwordInput.value = '';
            passwordInput.focus();
        }
    },
    
    // Simple hash function for password verification
    async simpleHash(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hash = await crypto.subtle.digest('MD5', data).catch(() => {
            // Fallback for older browsers
            return this.fallbackHash(str);
        });
        
        if (hash instanceof ArrayBuffer) {
            return Array.from(new Uint8Array(hash))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        }
        
        return hash;
    },
    
    // Fallback hash for browsers without crypto.subtle.digest MD5
    fallbackHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16);
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
                id: 'xui-panel',
                name: 'XUI IPTV Panel',
                url: 'https://example.com/xui',
                username: 'admin',
                password: 'password123',
                notes: 'Main IPTV management panel for user accounts and streaming configuration.'
            },
            {
                id: 'iptv-editor',
                name: 'IPTV Editor',
                url: 'https://example.com/editor',
                username: 'editor',
                password: 'edit123',
                notes: 'Tool for editing and managing IPTV playlists and channel configurations.'
            },
            {
                id: 'implayer',
                name: 'iMPlayer',
                url: 'https://example.com/implayer',
                username: 'player',
                password: 'player456',
                notes: 'iMPlayer management for device codes and user streaming settings.'
            },
            {
                id: 'roku-panel',
                name: 'Roku Player Panel',
                url: 'https://example.com/roku',
                username: 'roku_admin',
                password: 'roku789',
                notes: 'Roku device management and channel configuration panel.'
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
        
        grid.innerHTML = this.tools.map(tool => `
            <div class="management-tool">
                <div class="tool-header">
                    <h3 class="tool-name">${tool.name}</h3>
                    <div class="tool-actions">
                        <button class="btn btn-small btn-tool-edit" onclick="Management.editTool('${tool.id}')">Edit</button>
                        <button class="btn btn-small btn-tool-delete" onclick="Management.deleteTool('${tool.id}')">Delete</button>
                    </div>
                </div>
                
                <a href="${tool.url}" target="_blank" class="tool-button">
                    🚀 Open ${tool.name}
                </a>
                
                <div class="tool-credentials">
                    <div class="credential-row">
                        <span class="credential-label">Username:</span>
                        <span class="credential-value" onclick="Management.copyToClipboard('${tool.username}')" title="Click to copy">
                            ${tool.username || 'Not set'}
                        </span>
                    </div>
                    <div class="credential-row">
                        <span class="credential-label">Password:</span>
                        <span class="credential-value" onclick="Management.copyToClipboard('${tool.password}')" title="Click to copy">
                            ${tool.password ? '••••••••' : 'Not set'}
                        </span>
                    </div>
                </div>
                
                ${tool.notes ? `
                    <div class="tool-notes">
                        <strong>Notes:</strong><br>
                        ${tool.notes}
                    </div>
                ` : ''}
            </div>
        `).join('');
    },
    
    showAddForm() {
        this.editingToolId = null;
        this.resetForm();
        
        const titleElement = document.getElementById('toolFormTitle');
        const containerElement = document.getElementById('toolFormContainer');
        
        if (titleElement) titleElement.textContent = 'Add New Tool';
        if (containerElement) {
            containerElement.style.display = 'block';
            containerElement.scrollIntoView({ behavior: 'smooth' });
        }
    },
    
    hideForm() {
        const containerElement = document.getElementById('toolFormContainer');
        if (containerElement) {
            containerElement.style.display = 'none';
        }
        this.resetForm();
        this.editingToolId = null;
    },
    
    resetForm() {
        const form = document.getElementById('toolForm');
        if (form) {
            form.reset();
        }
    },
    
    editTool(toolId) {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool) {
            Utils.showNotification('Tool not found', 'error');
            return;
        }
        
        this.editingToolId = toolId;
        
        // Populate form
        const fields = {
            'toolName': tool.name,
            'toolUrl': tool.url,
            'toolUsername': tool.username || '',
            'toolPassword': tool.password || '',
            'toolNotes': tool.notes || ''
        };
        
        Object.keys(fields).forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) {
                element.value = fields[fieldId];
            }
        });
        
        // Show form
        const titleElement = document.getElementById('toolFormTitle');
        const containerElement = document.getElementById('toolFormContainer');
        
        if (titleElement) titleElement.textContent = 'Edit Tool';
        if (containerElement) {
            containerElement.style.display = 'block';
            containerElement.scrollIntoView({ behavior: 'smooth' });
        }
    },
    
    async saveTool(event) {
        event.preventDefault();
        
        try {
            const formData = Utils.collectFormData('toolForm');
            
            // Validate required fields
            if (!formData.name || !formData.url) {
                Utils.showNotification('Name and URL are required', 'error');
                return;
            }
            
            if (this.editingToolId) {
                // Update existing tool
                const toolIndex = this.tools.findIndex(t => t.id === this.editingToolId);
                if (toolIndex !== -1) {
                    this.tools[toolIndex] = {
                        ...this.tools[toolIndex],
                        name: formData.name,
                        url: formData.url,
                        username: formData.username || '',
                        password: formData.password || '',
                        notes: formData.notes || ''
                    };
                }
                Utils.showNotification('Tool updated successfully', 'success');
            } else {
                // Create new tool
                const newTool = {
                    id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    name: formData.name,
                    url: formData.url,
                    username: formData.username || '',
                    password: formData.password || '',
                    notes: formData.notes || ''
                };
                
                this.tools.push(newTool);
                Utils.showNotification('Tool created successfully', 'success');
            }
            
            // Save to database
            await this.saveTools();
            
            // Re-render and hide form
            this.renderTools();
            this.hideForm();
            
        } catch (error) {
            Utils.handleError(error, 'Saving tool');
        }
    },
    
    async deleteTool(toolId) {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool) return;
        
        if (!confirm(`Are you sure you want to delete "${tool.name}"?`)) return;
        
        try {
            // Remove from array
            this.tools = this.tools.filter(t => t.id !== toolId);
            
            // Save to database
            await this.saveTools();
            
            // Re-render
            this.renderTools();
            
            Utils.showNotification(`"${tool.name}" deleted successfully`, 'success');
        } catch (error) {
            Utils.handleError(error, 'Deleting tool');
        }
    },
    
    async copyToClipboard(text) {
        if (!text || text === 'Not set') {
            Utils.showNotification('No value to copy', 'warning');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(text);
            Utils.showNotification('Copied to clipboard', 'success');
        } catch (error) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            Utils.showNotification('Copied to clipboard', 'success');
        }
    }
};

// Make functions globally available for onclick handlers
window.addManagementTool = window.Management.showAddForm.bind(window.Management);

console.log('✅ Management.js loaded successfully');