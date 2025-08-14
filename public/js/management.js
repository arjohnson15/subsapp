// Simple Working Management System - Fixed Syntax
const Management = {
    tools: [],
    currentTool: null,
    editingId: null,

    async init() {
        console.log('🚀 Loading Management System...');
        await this.loadTools();
        this.renderTools();
        this.updateCount();
        console.log('✅ Management System ready');
    },

    async loadTools() {
        try {
            const response = await fetch('/api/management/tools');
            if (response.ok) {
                const data = await response.json();
                this.tools = data.tools || [];
            } else if (typeof API !== 'undefined' && API.Settings) {
                const settings = await API.Settings.get();
                if (settings.management_tools) {
                    this.tools = Array.isArray(settings.management_tools) ? settings.management_tools : Object.values(settings.management_tools);
                }
            }
        } catch (error) {
            console.error('Error loading tools:', error);
            this.tools = [];
        }
    },

    async saveTools() {
        try {
            const response = await fetch('/api/management/tools', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tools: this.tools })
            });
            if (!response.ok && typeof API !== 'undefined' && API.Settings) {
                await API.Settings.update({ management_tools: this.tools });
            }
        } catch (error) {
            console.error('Error saving tools:', error);
        }
    },

    renderTools() {
        const grid = document.getElementById('managementToolsGrid');
        if (!grid) return;

        if (this.tools.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 60px; background: rgba(255,255,255,0.05); border-radius: 12px;">
                    <h3 style="color: #4fc3f7;">No Tools Configured</h3>
                    <p style="color: #90a4ae;">Add your first management tool to get started</p>
                    <button class="btn" onclick="Management.showAddForm()">Add Your First Tool</button>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.tools.map(tool => `
            <div class="tool-card" style="background: rgba(33, 150, 243, 0.1); border: 1px solid #2196f3; border-radius: 15px; padding: 25px; transition: all 0.3s ease;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                            <span style="font-size: 20px;">🔗</span>
                            <h3 style="color: #4fc3f7; margin: 0; font-size: 1.2em;">${tool.name}</h3>
                            ${tool.category ? `<span style="background: rgba(79,195,247,0.2); color: #4fc3f7; padding: 2px 8px; border-radius: 12px; font-size: 10px;">${tool.category.toUpperCase()}</span>` : ''}
                        </div>
                        <div style="color: #90a4ae; font-size: 0.9em; word-break: break-all;">${tool.url}</div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button onclick="Management.editTool('${tool.id}')" style="background: rgba(76,175,80,0.8); color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Edit</button>
                        <button onclick="Management.deleteTool('${tool.id}')" style="background: rgba(244,67,54,0.8); color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Delete</button>
                    </div>
                </div>

                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <button onclick="Management.openInIframe('${tool.id}')" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #4fc3f7, #29b6f6); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                        📱 Open in App
                    </button>
                    <button onclick="Management.openInNewTab('${tool.id}')" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #66bb6a, #4caf50); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                        ↗️ New Tab
                    </button>
                </div>

                ${tool.notes ? `<div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; font-size: 12px; color: #b0bec5;">${tool.notes}</div>` : ''}
            </div>
        `).join('');
    },

    updateCount() {
        const countEl = document.getElementById('toolCount');
        if (countEl) {
            countEl.textContent = `${this.tools.length} tools configured`;
        }
    },

    showAddForm() {
        this.editingId = null;
        document.getElementById('modalTitle').textContent = 'Add New Tool';
        document.getElementById('toolName').value = '';
        document.getElementById('toolUrl').value = '';
        document.getElementById('toolCategory').value = '';
        document.getElementById('toolNotes').value = '';
        document.getElementById('addToolModal').style.display = 'flex';
        setTimeout(function() {
            document.getElementById('toolName').focus();
        }, 100);
    },

    editTool(toolId) {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool) return;
        
        this.editingId = toolId;
        document.getElementById('modalTitle').textContent = 'Edit Tool';
        document.getElementById('toolName').value = tool.name || '';
        document.getElementById('toolUrl').value = tool.url || '';
        document.getElementById('toolCategory').value = tool.category || '';
        document.getElementById('toolNotes').value = tool.notes || '';
        document.getElementById('addToolModal').style.display = 'flex';
        setTimeout(function() {
            document.getElementById('toolName').focus();
        }, 100);
    },

    async saveTool(event) {
        event.preventDefault();
        
        const toolData = {
            id: this.editingId || 'tool_' + Date.now(),
            name: document.getElementById('toolName').value,
            url: document.getElementById('toolUrl').value,
            category: document.getElementById('toolCategory').value,
            notes: document.getElementById('toolNotes').value
        };

        if (this.editingId) {
            const index = this.tools.findIndex(t => t.id === this.editingId);
            if (index !== -1) {
                this.tools[index] = toolData;
            }
        } else {
            this.tools.push(toolData);
        }

        await this.saveTools();
        this.renderTools();
        this.updateCount();
        this.closeModal();
        this.showNotification(this.editingId ? 'Tool updated' : 'Tool added', 'success');
    },

    async deleteTool(toolId) {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool) return;

        if (confirm(`Delete "${tool.name}"? This cannot be undone.`)) {
            this.tools = this.tools.filter(t => t.id !== toolId);
            await this.saveTools();
            this.renderTools();
            this.updateCount();
            this.showNotification('Tool deleted', 'success');
        }
    },

    openInNewTab(toolId) {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool) return;
        window.open(tool.url, '_blank');
        this.showNotification(`Opening ${tool.name} in new tab`, 'info');
    },

    openInIframe(toolId) {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool) return;

        this.currentTool = tool;
        document.getElementById('iframeTitle').textContent = tool.name;
        document.getElementById('iframeLoader').style.display = 'flex';
        document.getElementById('toolIframe').style.display = 'none';
        document.getElementById('iframeModal').style.display = 'block';

        const iframe = document.getElementById('toolIframe');
        iframe.onload = function() {
            setTimeout(function() {
                document.getElementById('iframeLoader').style.display = 'none';
                iframe.style.display = 'block';
            }, 500);
        };

        // Use proxy for local HTTP URLs
        let iframeUrl = tool.url;
        if (tool.url.startsWith('http://') && window.location.protocol === 'https:') {
            iframeUrl = `/api/management/tools/${tool.id}/proxy`;
        }
        
        iframe.src = iframeUrl;
        this.showNotification(`Loading ${tool.name}...`, 'info');
    },

    refreshIframe() {
        const iframe = document.getElementById('toolIframe');
        if (iframe && iframe.src) {
            document.getElementById('iframeLoader').style.display = 'flex';
            iframe.style.display = 'none';
            iframe.src = iframe.src;
        }
    },

    openCurrentToolInNewTab() {
        if (this.currentTool) {
            window.open(this.currentTool.url, '_blank');
        }
    },

    closeIframeModal() {
        document.getElementById('iframeModal').style.display = 'none';
        const self = this;
        setTimeout(function() {
            const iframe = document.getElementById('toolIframe');
            if (iframe) iframe.src = 'about:blank';
        }, 300);
        this.currentTool = null;
    },

    closeModal() {
        document.getElementById('addToolModal').style.display = 'none';
    },

    async refreshTools() {
        await this.init();
        this.showNotification('Tools refreshed', 'info');
    },

    showNotification(message, type) {
        type = type || 'info';
        if (typeof Utils !== 'undefined' && Utils.showNotification) {
            Utils.showNotification(message, type);
        } else {
            console.log(`${type.toUpperCase()}: ${message}`);
        }
    }
};

// Make globally available
window.Management = Management;

console.log('✅ Management module loaded and ready');

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        Management.init();
    });
} else {
    Management.init();
}