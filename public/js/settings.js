// Enhanced Settings Management Functions with Subscription Management
console.log('📋 Loading enhanced Settings.js...');

window.Settings = {
    editingSubscriptionId: null,
    currentSortField: 'name',
    currentSortDirection: 'asc',
    
    async init() {
        await this.loadSettings();
        await this.loadOwners();
        await this.loadSubscriptions();
        this.loadPlexStatus();
        this.setupSubscriptionEventListeners();
    },
    
    setupSubscriptionEventListeners() {
        // Type change listener to show/hide streams field
        const typeSelect = document.getElementById('subscriptionType');
        if (typeSelect) {
            typeSelect.addEventListener('change', this.handleSubscriptionTypeChange.bind(this));
        }
    },
    
    handleSubscriptionTypeChange() {
        const type = document.getElementById('subscriptionType')?.value;
        const streamGroup = document.getElementById('streamCountGroup');
        
        if (streamGroup) {
            streamGroup.style.display = type === 'iptv' ? 'block' : 'none';
            
            // Clear streams value if switching away from IPTV
            if (type !== 'iptv') {
                const streamsInput = document.getElementById('subscriptionStreams');
                if (streamsInput) streamsInput.value = '';
            }
        }
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
    
    // Subscription Management Functions
async loadSubscriptions() {
    try {
        console.log('📊 Loading subscriptions from API...');
        const subscriptions = await API.Subscription.getAll();
        console.log('📊 Subscriptions loaded:', subscriptions.length);
        
        // Store in global state
        window.AppState.subscriptionTypes = subscriptions;
        
        this.renderSubscriptionsTable();
        // Note: updateSubscriptionStats() removed since we removed the stats section
    } catch (error) {
        console.error('❌ Error loading subscriptions:', error);
        Utils.handleError(error, 'Loading subscriptions');
    }
}
    
    renderSubscriptionsTable() {
        const tbody = document.getElementById('subscriptionsTableBody');
        if (!tbody) {
            console.log('⚠️ Subscriptions table body not found');
            return;
        }
        
        const subscriptions = window.AppState.subscriptionTypes || [];
        console.log('🎨 Rendering', subscriptions.length, 'subscriptions');
        
        if (subscriptions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No subscription types found</td></tr>';
            return;
        }
        
        tbody.innerHTML = subscriptions.map(sub => `
            <tr>
                <td>${sub.name}</td>
                <td>
                    <span class="tag tag-${sub.type}">${sub.type.toUpperCase()}</span>
                </td>
                <td>${sub.duration_months} month${sub.duration_months > 1 ? 's' : ''}</td>
                <td>${sub.streams || 'N/A'}</td>
                <td>$${parseFloat(sub.price).toFixed(2)}</td>
                <td>
                    <span class="tag ${sub.active ? 'tag-plex1' : 'tag-free'}">
                        ${sub.active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-small btn-edit" onclick="Settings.editSubscription(${sub.id})">Edit</button>
                    <button class="btn btn-small btn-delete" onclick="Settings.toggleSubscription(${sub.id})">
                        ${sub.active ? 'Deactivate' : 'Activate'}
                    </button>
                </td>
            </tr>
        `).join('');
        
        console.log('✅ Subscriptions table rendered');
    },
    
    sortSubscriptions(field) {
        if (this.currentSortField === field) {
            this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSortField = field;
            this.currentSortDirection = 'asc';
        }
        
        window.AppState.subscriptionTypes = Utils.sortArray(
            window.AppState.subscriptionTypes, 
            field, 
            this.currentSortDirection
        );
        
        this.renderSubscriptionsTable();
    },
    
    showSubscriptionForm() {
        console.log('📝 Showing subscription form...');
        this.editingSubscriptionId = null;
        this.resetSubscriptionForm();
        
        const titleElement = document.getElementById('subscriptionFormTitle');
        const containerElement = document.getElementById('subscriptionFormContainer');
        
        if (titleElement) titleElement.textContent = 'Create Subscription Type';
        if (containerElement) {
            containerElement.style.display = 'block';
            containerElement.scrollIntoView({ behavior: 'smooth' });
        }
    },
    
    hideSubscriptionForm() {
        console.log('❌ Hiding subscription form...');
        const containerElement = document.getElementById('subscriptionFormContainer');
        if (containerElement) {
            containerElement.style.display = 'none';
        }
        this.resetSubscriptionForm();
        this.editingSubscriptionId = null;
    },
    
    resetSubscriptionForm() {
        const form = document.getElementById('subscriptionForm');
        if (form) {
            form.reset();
            
            // Reset active checkbox to checked
            const activeCheckbox = document.getElementById('subscriptionActive');
            if (activeCheckbox) activeCheckbox.checked = true;
            
            // Hide streams group
            const streamGroup = document.getElementById('streamCountGroup');
            if (streamGroup) streamGroup.style.display = 'none';
        }
    },
    
    async editSubscription(subscriptionId) {
        try {
            console.log('📝 Editing subscription:', subscriptionId);
            const subscription = window.AppState.subscriptionTypes.find(sub => sub.id === subscriptionId);
            if (!subscription) {
                Utils.showNotification('Subscription not found', 'error');
                return;
            }
            
            this.editingSubscriptionId = subscriptionId;
            
            // Populate form
            const fields = {
                'subscriptionName': subscription.name,
                'subscriptionType': subscription.type,
                'subscriptionDuration': subscription.duration_months,
                'subscriptionPrice': subscription.price,
                'subscriptionStreams': subscription.streams || '',
                'subscriptionActive': subscription.active
            };
            
            Object.keys(fields).forEach(fieldId => {
                const element = document.getElementById(fieldId);
                if (element) {
                    if (element.type === 'checkbox') {
                        element.checked = fields[fieldId];
                    } else {
                        element.value = fields[fieldId];
                    }
                }
            });
            
            // Show streams field if IPTV
            this.handleSubscriptionTypeChange();
            
            // Update form title and show
            const titleElement = document.getElementById('subscriptionFormTitle');
            const containerElement = document.getElementById('subscriptionFormContainer');
            
            if (titleElement) titleElement.textContent = 'Edit Subscription Type';
            if (containerElement) {
                containerElement.style.display = 'block';
                containerElement.scrollIntoView({ behavior: 'smooth' });
            }
            
        } catch (error) {
            Utils.handleError(error, 'Loading subscription for editing');
        }
    },
    
    async saveSubscription(event) {
        event.preventDefault();
        
        try {
            Utils.showLoading();
            console.log('💾 Saving subscription...');
            
            const formData = Utils.collectFormData('subscriptionForm');
            
            // Handle special fields
            formData.active = document.getElementById('subscriptionActive')?.checked || false;
            formData.duration_months = parseInt(formData.duration_months);
            formData.price = parseFloat(formData.price);
            
            // Handle streams - only for IPTV
            if (formData.type === 'iptv' && formData.streams) {
                formData.streams = parseInt(formData.streams);
            } else {
                formData.streams = null;
            }
            
            console.log('💾 Subscription form data:', formData);
            
            if (this.editingSubscriptionId) {
                // Update existing
                await API.Subscription.update(this.editingSubscriptionId, formData);
                Utils.showNotification('Subscription type updated successfully', 'success');
            } else {
                // Create new
                await API.Subscription.create(formData);
                Utils.showNotification('Subscription type created successfully', 'success');
            }
            
            // Reload data and hide form
            await this.loadSubscriptions();
            this.hideSubscriptionForm();
            
        } catch (error) {
            Utils.handleError(error, 'Saving subscription type');
        } finally {
            Utils.hideLoading();
        }
    },
    
    async toggleSubscription(subscriptionId) {
        try {
            const subscription = window.AppState.subscriptionTypes.find(sub => sub.id === subscriptionId);
            if (!subscription) return;
            
            const action = subscription.active ? 'deactivate' : 'activate';
            const newStatus = !subscription.active;
            
            if (!confirm(`Are you sure you want to ${action} this subscription type?`)) return;
            
            Utils.showLoading();
            
            // Update the active status
            await API.Subscription.update(subscriptionId, { 
                ...subscription, 
                active: newStatus 
            });
            
            Utils.showNotification(
                `Subscription type ${action}d successfully`, 
                'success'
            );
            
            // Reload data
            await this.loadSubscriptions();
            
        } catch (error) {
            Utils.handleError(error, 'Updating subscription status');
        } finally {
            Utils.hideLoading();
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

console.log('✅ Enhanced Settings.js loaded successfully');