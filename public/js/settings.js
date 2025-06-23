// Settings Management Functions

window.Settings = {
    async init() {
        await this.loadSettings();
        await this.loadOwners();
        this.loadPlexStatus();
    },
    
    async loadSettings() {
        try {
            const settings = await API.Settings.getAll();
            
            // Load existing settings into form fields
            this.populateSettingFields(settings);
            
            // Load last sync time
            if (settings.last_plex_sync) {
                const syncDate = new Date(settings.last_plex_sync);
                const lastSyncElement = document.getElementById('lastSyncTime');
                if (lastSyncElement) {
                    lastSyncElement.textContent = syncDate.toLocaleString();
                }
            } else {
                const lastSyncElement = document.getElementById('lastSyncTime');
                if (lastSyncElement) {
                    lastSyncElement.textContent = 'Never';
                }
            }
        } catch (error) {
            Utils.handleError(error, 'Loading settings');
        }
    },
    
    populateSettingFields(settings) {
        const fieldMapping = {
            'smtpHost': 'smtp_host',
            'smtpPort': 'smtp_port',
            'smtpUser': 'smtp_user',
            'smtpPass': 'smtp_pass',
            'paypalLink': 'paypal_link',
            'venmoLink': 'venmo_link',
            'cashappLink': 'cashapp_link'
        };
        
        Object.keys(fieldMapping).forEach(fieldId => {
            const element = document.getElementById(fieldId);
            const settingKey = fieldMapping[fieldId];
            
            if (element && settings[settingKey] !== undefined) {
                if (fieldId === 'smtpHost' && !settings[settingKey]) {
                    element.value = 'smtp.gmail.com'; // Default
                } else if (fieldId === 'smtpPort' && !settings[settingKey]) {
                    element.value = '587'; // Default
                } else {
                    element.value = settings[settingKey] || '';
                }
            }
        });
    },
    
    loadPlexStatus() {
        // Just set initial status text, don't auto-test connections
        const plex1Status = document.getElementById('plex1ServerStatus');
        const plex2Status = document.getElementById('plex2ServerStatus');
        
        if (plex1Status) {
            plex1Status.textContent = 'Click Test Connection';
            plex1Status.className = 'connection-status';
        }
        
        if (plex2Status) {
            plex2Status.textContent = 'Click Test Connection';
            plex2Status.className = 'connection-status';
        }
    },
    
    async loadOwners() {
        try {
            const owners = await API.Owner.getAll();
            this.renderOwnersTable(owners);
        } catch (error) {
            Utils.handleError(error, 'Loading owners');
        }
    },
    
    renderOwnersTable(owners) {
        const tbody = document.getElementById('ownersTableBody');
        if (!tbody) return;
        
        if (owners.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No owners found</td></tr>';
            return;
        }
        
        tbody.innerHTML = owners.map(owner => `
            <tr>
                <td>${owner.name}</td>
                <td>${owner.email}</td>
                <td>${owner.user_count || 0}</td>
                <td>
                    <button class="btn btn-small btn-edit" onclick="Settings.editOwner(${owner.id})">Edit</button>
                    <button class="btn btn-small btn-delete" onclick="Settings.deleteOwner(${owner.id})">Delete</button>
                </td>
            </tr>
        `).join('');
    },
    
    async addOwner() {
        const name = document.getElementById('ownerName')?.value;
        const email = document.getElementById('ownerEmail')?.value;
        
        if (!name || !email) {
            Utils.showNotification('Please enter both name and email', 'error');
            return;
        }
        
        try {
            await API.Owner.create({ name, email });
            
            // Clear form
            document.getElementById('ownerName').value = '';
            document.getElementById('ownerEmail').value = '';
            
            await this.loadOwners();
            Utils.showNotification('Owner added successfully', 'success');
        } catch (error) {
            Utils.handleError(error, 'Adding owner');
        }
    },
    
    async editOwner(ownerId) {
        const newName = prompt('Enter new name:');
        if (!newName) return;
        
        const newEmail = prompt('Enter new email:');
        if (!newEmail) return;
        
        try {
            await API.Owner.update(ownerId, { name: newName, email: newEmail });
            await this.loadOwners();
            Utils.showNotification('Owner updated successfully', 'success');
        } catch (error) {
            Utils.handleError(error, 'Updating owner');
        }
    },
    
    async deleteOwner(ownerId) {
        if (!confirm('Are you sure you want to delete this owner?')) return;
        
        try {
            await API.Owner.delete(ownerId);
            await this.loadOwners();
            Utils.showNotification('Owner deleted successfully', 'success');
        } catch (error) {
            Utils.handleError(error, 'Deleting owner');
        }
    },
    
    async saveSettings() {
        try {
            const settingsData = {
                smtp_host: document.getElementById('smtpHost')?.value || 'smtp.gmail.com',
                smtp_port: parseInt(document.getElementById('smtpPort')?.value) || 587,
                smtp_user: document.getElementById('smtpUser')?.value || '',
                smtp_pass: document.getElementById('smtpPass')?.value || '',
                paypal_link: document.getElementById('paypalLink')?.value || '',
                venmo_link: document.getElementById('venmoLink')?.value || '',
                cashapp_link: document.getElementById('cashappLink')?.value || ''
            };
            
            await API.Settings.update(settingsData);
            Utils.showNotification('Settings saved successfully!', 'success');
        } catch (error) {
            Utils.handleError(error, 'Saving settings');
        }
    }
};

// Make functions globally available for onclick handlers
window.addOwner = window.Settings.addOwner.bind(window.Settings);
window.saveSettings = window.Settings.saveSettings.bind(window.Settings);