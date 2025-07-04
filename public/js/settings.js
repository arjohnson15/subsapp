// Enhanced Settings Management Functions with Subscription Management + File Upload
console.log('📋 Loading enhanced Settings.js...');

const Settings = {
    editingSubscriptionId: null,
    currentSortField: 'name',
    currentSortDirection: 'asc',
	currentEditingSchedule: null,        
    availableTemplates: [],              
    availableTags: [], 
    
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
            // Load branding settings into form fields
            this.loadBrandingSettings(settings);
            
            // FIXED: Apply branding to the page immediately after loading
            this.applyBranding(settings);
            
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
        const plex1Status = document.getElementById('plex1Status');
        const plex2Status = document.getElementById('plex2Status');
        
        if (plex1Status) {
            plex1Status.textContent = '';
            plex1Status.className = 'connection-status';
        }
        
        if (plex2Status) {
            plex2Status.textContent = '';
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
        if (!tbody) {
            console.log('⚠️ Owners table body not found - probably not on management page');
            return;
        }
        
        if (owners.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No owners found</td></tr>';
            return;
        }
        
        tbody.innerHTML = owners.map(owner => `
            <tr>
                <td>${owner.name}</td>
                <td>${owner.email}</td>
                <td>
                    <span class="status-badge ${owner.active ? 'status-active' : 'status-inactive'}">
                        ${owner.active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>${new Date(owner.created_at).toLocaleDateString()}</td>
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
        const active = document.getElementById('ownerActive')?.checked;
        
        if (!name || !email) {
            Utils.showNotification('Please enter both name and email', 'error');
            return;
        }
        
        try {
            await API.Owner.create({ name, email, active });
            
            // Clear form
            document.getElementById('ownerName').value = '';
            document.getElementById('ownerEmail').value = '';
            document.getElementById('ownerActive').checked = true;
            
            await this.loadOwners();
            this.hideOwnerForm();
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
    
    // Owner form management
    showOwnerForm() {
        console.log('📝 Showing owner form...');
        const formContainer = document.getElementById('ownerFormContainer');
        const formTitle = document.getElementById('ownerFormTitle');
        
        if (formContainer) formContainer.style.display = 'block';
        if (formTitle) formTitle.textContent = 'Add New Owner';
        
        // Clear form
        const form = document.getElementById('ownerForm');
        if (form) form.reset();
        
        // Scroll to form
        if (formContainer) formContainer.scrollIntoView({ behavior: 'smooth' });
    },

    hideOwnerForm() {
        console.log('❌ Hiding owner form...');
        const formContainer = document.getElementById('ownerFormContainer');
        if (formContainer) formContainer.style.display = 'none';
    },

    async saveOwner(event) {
        event.preventDefault();
        return await this.addOwner();
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
    },
	
	// Email Schedule Management
async loadEmailSchedules() {
    try {
        const schedules = await API.EmailSchedules.getAll();
        this.renderSchedulesTable(schedules);
    } catch (error) {
        Utils.handleError(error, 'Loading email schedules');
    }
},

async loadEmailTemplates() {
    try {
        this.availableTemplates = await API.Email.getTemplates();
        this.populateTemplateSelect();
    } catch (error) {
        Utils.handleError(error, 'Loading email templates');
    }
},


populateTemplateSelect() {
    const select = document.getElementById('emailTemplate');
    if (!select) return;

    select.innerHTML = '<option value="">Select Template</option>';
    this.availableTemplates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.name;
        select.appendChild(option);
    });
},

showScheduleForm(schedule = null) {
    // Schedule form management logic
    const container = document.getElementById('scheduleFormContainer');
    const title = document.getElementById('scheduleFormTitle');
    const form = document.getElementById('scheduleForm');

    if (schedule) {
        title.textContent = 'Edit Email Schedule';
        this.populateScheduleForm(schedule);
    } else {
        title.textContent = 'Add New Email Schedule';
        form.reset();
        document.getElementById('scheduleId').value = '';
    }

    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth' });
    this.toggleScheduleFields();
},

hideScheduleForm() {
    document.getElementById('scheduleFormContainer').style.display = 'none';
},

toggleScheduleFields() {
    const scheduleType = document.getElementById('scheduleType').value;
    const expirationFields = document.getElementById('expirationFields');
    const specificDateFields = document.getElementById('specificDateFields');

    if (scheduleType === 'expiration_reminder') {
        expirationFields.style.display = 'block';
        specificDateFields.style.display = 'none';
    } else if (scheduleType === 'specific_date') {
        expirationFields.style.display = 'none';
        specificDateFields.style.display = 'block';
    } else {
        expirationFields.style.display = 'none';
        specificDateFields.style.display = 'none';
    }
},

async saveSchedule(event) {
    event.preventDefault();
    
    try {
        const formData = new FormData(event.target);
        const scheduleData = Object.fromEntries(formData.entries());
        
        const isEditing = scheduleData.id && scheduleData.id !== '';
        const url = isEditing ? `/email-schedules/${scheduleData.id}` : '/email-schedules';
        const method = isEditing ? 'PUT' : 'POST';

        const response = await fetch(`/api${url}`, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(scheduleData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save schedule');
        }

        Utils.showNotification(`Email schedule ${isEditing ? 'updated' : 'created'} successfully!`, 'success');
        this.hideScheduleForm();
        await this.loadEmailSchedules();
    } catch (error) {
        Utils.handleError(error, 'Saving email schedule');
    }
}

// ADD these methods inside your Settings object, after your existing scheduler methods

renderSchedulesTable(schedules) {
    const tbody = document.getElementById('schedulesTableBody');
    if (!tbody) return;

    if (schedules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No email schedules found</td></tr>';
        return;
    }

    tbody.innerHTML = schedules.map(schedule => {
        let details = '';
        if (schedule.schedule_type === 'expiration_reminder') {
            details = `${schedule.days_before_expiration} days before ${schedule.subscription_type} expiration`;
        } else {
            details = `${schedule.scheduled_date} at ${schedule.scheduled_time}`;
        }

        let targetInfo = '';
        if (schedule.target_tags && schedule.target_tags.length > 0) {
            targetInfo = ` (Tags: ${schedule.target_tags.join(', ')})`;
        }

        return `
            <tr>
                <td>${schedule.name}</td>
                <td><span class="status-badge ${schedule.schedule_type === 'expiration_reminder' ? 'status-info' : 'status-warning'}">${schedule.schedule_type.replace('_', ' ').toUpperCase()}</span></td>
                <td>${details}${targetInfo}</td>
                <td>${schedule.template_name || 'Unknown'}</td>
                <td>
                    <span class="status-badge ${schedule.active ? 'status-active' : 'status-inactive'}">
                        ${schedule.active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>${schedule.last_run ? new Date(schedule.last_run).toLocaleDateString() : 'Never'}</td>
                <td class="actions">
                    <button onclick="Settings.editSchedule(${schedule.id})" class="btn-icon" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="Settings.toggleSchedule(${schedule.id})" class="btn-icon" title="Toggle Status">
                        <i class="fas fa-power-off"></i>
                    </button>
                    <button onclick="Settings.testSchedule(${schedule.id})" class="btn-icon" title="Test Run">
                        <i class="fas fa-play"></i>
                    </button>
                    <button onclick="Settings.deleteSchedule(${schedule.id})" class="btn-icon" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
},

async editSchedule(id) {
    try {
        const schedules = await API.EmailSchedules.getAll();
        const schedule = schedules.find(s => s.id === id);
        if (schedule) {
            this.showScheduleForm(schedule);
        }
    } catch (error) {
        Utils.handleError(error, 'Loading schedule for editing');
    }
},

async toggleSchedule(id) {
    try {
        await API.EmailSchedules.test(id); // Using test endpoint for toggle
        Utils.showNotification('Schedule status toggled successfully!', 'success');
        await this.loadEmailSchedules();
    } catch (error) {
        Utils.handleError(error, 'Toggling schedule status');
    }
},

async testSchedule(id) {
    try {
        const result = await API.EmailSchedules.test(id);
        Utils.showNotification(`Test run completed! Found ${result.target_users_count || 0} target users`, 'success');
    } catch (error) {
        Utils.handleError(error, 'Testing schedule');
    }
},

async deleteSchedule(id) {
    if (!confirm('Are you sure you want to delete this email schedule? This cannot be undone.')) {
        return;
    }

    try {
        await API.EmailSchedules.delete(id);
        Utils.showNotification('Email schedule deleted successfully!', 'success');
        await this.loadEmailSchedules();
    } catch (error) {
        Utils.handleError(error, 'Deleting email schedule');
    }
},

populateScheduleForm(schedule) {
    document.getElementById('scheduleId').value = schedule.id;
    document.getElementById('scheduleName').value = schedule.name;
    document.getElementById('scheduleType').value = schedule.schedule_type;
    document.getElementById('emailTemplate').value = schedule.email_template_id;
    document.getElementById('excludeAutomated').checked = schedule.exclude_users_with_setting;
    document.getElementById('scheduleActive').checked = schedule.active;

    if (schedule.schedule_type === 'expiration_reminder') {
        document.getElementById('daysBefore').value = schedule.days_before_expiration;
        document.getElementById('subscriptionTypeFilter').value = schedule.subscription_type;
    } else {
        document.getElementById('scheduledDate').value = schedule.scheduled_date;
        document.getElementById('scheduledTime').value = schedule.scheduled_time;
    }

    // Set target tags if they exist
    if (schedule.target_tags && schedule.target_tags.length > 0) {
        const checkboxes = document.querySelectorAll('#targetTagsContainer input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = schedule.target_tags.includes(checkbox.value);
        });
    }
},

async loadAvailableTags() {
    try {
        const users = await API.User.getAll();
        const allTags = new Set();
        
        users.forEach(user => {
            if (user.tags && Array.isArray(user.tags)) {
                user.tags.forEach(tag => allTags.add(tag));
            }
        });
        
        this.availableTags = Array.from(allTags).sort();
        this.populateTagsContainer();
    } catch (error) {
        console.warn('Could not load available tags:', error);
        this.availableTags = ['Plex 1', 'Plex 2', 'IPTV']; // Fallback
        this.populateTagsContainer();
    }
},

populateTagsContainer() {
    const container = document.getElementById('targetTagsContainer');
    if (!container) return;

    container.innerHTML = '';
    this.availableTags.forEach(tag => {
        const label = document.createElement('label');
        label.style.display = 'block';
        label.style.marginBottom = '5px';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = tag;
        checkbox.style.marginRight = '8px';
        
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(tag));
        container.appendChild(label);
    });
},

// ADD to the init() method:
// Change your existing init() method to include:
async init() {
    await this.loadSettings();
    await this.loadOwners();
    await this.loadSubscriptions();
    await this.loadEmailSchedules();  
    await this.loadEmailTemplates();
	await this.loadAvailableTags();	
    this.loadPlexStatus();
    this.setupSubscriptionEventListeners();
},
    
    renderSubscriptionsTable() {
        const tbody = document.getElementById('subscriptionsTableBody');
        if (!tbody) {
            console.log('⚠️ Subscriptions table body not found - probably not on management page');
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
    
// Test email connection  
async testEmailConnection() {
    try {
        // Get the SMTP user email to send test to
        const smtpUser = document.getElementById('smtpUser')?.value;
        
        if (!smtpUser) {
            Utils.showNotification('Please enter your email address in the SMTP configuration first', 'error');
            return;
        }
        
        const button = event.target;
        const originalText = button.textContent;
        button.textContent = 'Sending Test...';
        button.disabled = true;
        
        // FIXED: Use the correct API function
        const result = await API.Email.sendTestEmail(smtpUser);
        
        button.textContent = originalText;
        button.disabled = false;
        
        if (result.success) {
            Utils.showNotification(`Test email sent successfully to ${smtpUser}!`, 'success');
        } else {
            Utils.showNotification(`Email test failed: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error testing email:', error);
        const button = event.target;
        button.textContent = 'Send Test Email';
        button.disabled = false;
        Utils.showNotification('Error testing email: ' + error.message, 'error');
    }
},

    // Test Plex Connection
    async testPlexConnection(serverGroup) {
        // Look for the settings page status elements first
        const statusElement = document.getElementById(`${serverGroup}ServerStatus`) || 
                             document.getElementById(`${serverGroup}Status`);
        
        if (statusElement) {
            statusElement.textContent = 'Testing...';
            statusElement.className = 'connection-status';
        }
        
        try {
            const result = await API.Plex.testConnection(serverGroup);
            
            if (statusElement) {
                if (result.success) {
                    statusElement.textContent = 'Connected';
                    statusElement.className = 'connection-status status-connected';
                } else {
                    statusElement.textContent = 'Failed';
                    statusElement.className = 'connection-status status-disconnected';
                }
            }
            
            if (result.success) {
                Utils.showNotification(`${serverGroup.toUpperCase()} connection successful!`, 'success');
            } else {
                Utils.showNotification(`${serverGroup.toUpperCase()} connection failed: ${result.error}`, 'error');
            }
            
            return result;
        } catch (error) {
            console.error(`Error testing ${serverGroup} connection:`, error);
            if (statusElement) {
                statusElement.textContent = 'Error';
                statusElement.className = 'connection-status status-disconnected';
            }
            Utils.showNotification(`Connection test failed: ${error.message}`, 'error');
            throw error;
        }
    },

    async saveAllSettings() {
        try {
            // First upload any pending files
            await this.uploadPendingFiles();
            
            const settingsData = {
                // Branding settings (text only - files already uploaded above)
                app_title: document.getElementById('appTitle')?.value?.trim() || '',
                app_subtitle: document.getElementById('appSubtitle')?.value?.trim() || '',
                
                // Email settings
                smtp_host: document.getElementById('smtpHost')?.value || 'smtp.gmail.com',
                smtp_port: parseInt(document.getElementById('smtpPort')?.value) || 587,
                smtp_user: document.getElementById('smtpUser')?.value || '',
                smtp_pass: document.getElementById('smtpPass')?.value || '',
                
                // Payment settings
                paypal_link: document.getElementById('paypalLink')?.value || '',
                venmo_link: document.getElementById('venmoLink')?.value || '',
                cashapp_link: document.getElementById('cashappLink')?.value || ''
            };
            
            // Save text settings (only if there are any changes)
            if (Object.values(settingsData).some(value => value !== '')) {
                await API.Settings.update(settingsData);
            }
            
            Utils.showNotification('Settings saved successfully!', 'success');
            
            // Apply branding immediately
            const allSettings = await API.Settings.getAll();
            this.applyBranding(allSettings);
            
        } catch (error) {
            Utils.handleError(error, 'Saving settings');
        }
    },

    // NEW: Upload pending files
    async uploadPendingFiles() {
        const logoFile = document.getElementById('logoFile')?.files[0];
        const faviconFile = document.getElementById('faviconFile')?.files[0];
        
        if (!logoFile && !faviconFile) {
            return; // No files to upload
        }

        const formData = new FormData();
        if (logoFile) {
            formData.append('logo', logoFile);
        }
        if (faviconFile) {
            formData.append('favicon', faviconFile);
        }

        try {
            const response = await fetch('/api/settings/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('✅ Files uploaded successfully:', result);
            
            // Clear file inputs
            if (document.getElementById('logoFile')) document.getElementById('logoFile').value = '';
            if (document.getElementById('faviconFile')) document.getElementById('faviconFile').value = '';
            
            // Refresh the settings to show new files
            await this.loadSettings();
            
        } catch (error) {
            console.error('❌ Error uploading files:', error);
            throw error;
        }
    },

    // NEW: Preview file before upload
    previewFile(type) {
        const fileInput = document.getElementById(`${type}File`);
        const file = fileInput?.files[0];
        
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            Utils.showNotification('Please select an image file', 'error');
            fileInput.value = '';
            return;
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            Utils.showNotification('File size must be less than 5MB', 'error');
            fileInput.value = '';
            return;
        }

        // Update button text to show selected file
        const buttonText = document.getElementById(`${type}ButtonText`);
        if (buttonText) {
            buttonText.textContent = `Selected: ${file.name}`;
        }

        console.log(`📁 ${type} file selected:`, file.name);
    },

    // NEW: Delete branding file
    async deleteBrandingFile(type) {
        try {
            const response = await fetch(`/api/settings/upload/${type}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`Delete failed: ${response.statusText}`);
            }

            Utils.showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully!`, 'success');
            
            // Refresh settings to hide preview
            await this.loadSettings();
            
            // Apply branding to remove deleted file
            const settings = await API.Settings.getAll();
            this.applyBranding(settings);
            
        } catch (error) {
            Utils.handleError(error, `Deleting ${type}`);
        }
    },

    // UPDATED: Load branding settings with file upload support
    loadBrandingSettings(settings) {
        const brandingFields = {
            'appTitle': 'app_title',
            'appSubtitle': 'app_subtitle'
        };
        
        Object.keys(brandingFields).forEach(fieldId => {
            const element = document.getElementById(fieldId);
            const settingKey = brandingFields[fieldId];
            if (element && settings[settingKey] !== undefined) {
                element.value = settings[settingKey] || '';
            }
        });

        // Handle logo preview
        this.updateFilePreview('logo', settings.app_logo);
        
        // Handle favicon preview
        this.updateFilePreview('favicon', settings.app_favicon);
    },

    // NEW: Update file preview display
    updateFilePreview(type, filePath) {
        const previewDiv = document.getElementById(`${type}Preview`);
        const imageElement = document.getElementById(`${type}Image`);
        const buttonText = document.getElementById(`${type}ButtonText`);
        
        if (filePath && filePath.trim()) {
            // Show preview
            if (previewDiv) previewDiv.style.display = 'flex';
            if (imageElement) imageElement.src = filePath;
            if (buttonText) buttonText.textContent = `Change ${type.charAt(0).toUpperCase() + type.slice(1)}`;
            
            // For favicon, also update the filename display
            if (type === 'favicon') {
                const fileNameElement = document.getElementById('faviconFileName');
                if (fileNameElement) {
                    const fileName = filePath.split('/').pop();
                    fileNameElement.textContent = fileName;
                }
            }
        } else {
            // Hide preview
            if (previewDiv) previewDiv.style.display = 'none';
            if (buttonText) buttonText.textContent = `Choose ${type.charAt(0).toUpperCase() + type.slice(1)}${type === 'logo' ? ' Image' : ''}`;
        }
    },

    // Apply branding to the page
    applyBranding(settings) {
        // Update page title
        if (settings.app_title && settings.app_subtitle) {
            document.title = `${settings.app_title} - ${settings.app_subtitle}`;
        } else if (settings.app_title) {
            document.title = settings.app_title;
        }
        
        // Update favicon
        if (settings.app_favicon) {
            this.updateFavicon(settings.app_favicon);
        }
        
        // Update logo/title in header
        const logoElement = document.querySelector('.logo');
        if (logoElement) {
            if (settings.app_logo) {
                logoElement.innerHTML = `<img src="${settings.app_logo}" alt="${settings.app_title || 'Logo'}" style="max-height: 60px; max-width: 300px; object-fit: contain;">`;
            } else if (settings.app_title) {
                logoElement.textContent = settings.app_title;
            }
        }
        
        // Update subtitle
        const subtitleElement = document.querySelector('.subtitle');
        if (subtitleElement && settings.app_subtitle) {
            subtitleElement.textContent = settings.app_subtitle;
        }
    },

    // Update favicon
    updateFavicon(faviconUrl) {
        // Remove existing favicon links
        const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
        existingFavicons.forEach(link => link.remove());
        
        // Add new favicon
        const favicon = document.createElement('link');
        favicon.rel = 'icon';
        favicon.type = 'image/x-icon';
        favicon.href = faviconUrl;
        document.head.appendChild(favicon);
    },

    // Sync all Plex libraries
    async syncAllPlexLibraries() {
        try {
            const button = event.target;
            const originalText = button.textContent;
            button.textContent = 'Syncing...';
            button.disabled = true;
            
            const result = await API.Plex.syncLibraries();
            
            button.textContent = originalText;
            button.disabled = false;
            
            if (result.success) {
                Utils.showNotification('Libraries synced successfully!', 'success');
                await this.loadSettings(); // Reload to update last sync time
            } else {
                Utils.showNotification(`Sync failed: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error syncing libraries:', error);
            const button = event.target;
            button.textContent = 'Sync All Libraries';
            button.disabled = false;
            Utils.showNotification('Error syncing libraries: ' + error.message, 'error');
        }
    },
	
	// Add this function after syncAllPlexLibraries
    async syncPlexLibraries() {
        // This is an alias for syncAllPlexLibraries to match the HTML onclick
        return await this.syncAllPlexLibraries();
    },

    // Email alias
    async sendTestEmail() {
        return await this.testEmailConnection();
    }
};

// CRITICAL FIX: Assign to window AFTER the object is created
window.Settings = Settings;

// Make functions globally available for onclick handlers
window.addOwner = Settings.addOwner.bind(Settings);
window.saveSettings = Settings.saveAllSettings.bind(Settings);
window.testEmailConnection = Settings.testEmailConnection.bind(Settings);

// Owner management functions
window.showOwnerForm = Settings.showOwnerForm.bind(Settings);
window.hideOwnerForm = Settings.hideOwnerForm.bind(Settings);
window.saveOwner = Settings.saveOwner.bind(Settings);

// Subscription management functions  
window.sortSubscriptions = Settings.sortSubscriptions.bind(Settings);
window.showSubscriptionForm = Settings.showSubscriptionForm.bind(Settings);
window.hideSubscriptionForm = Settings.hideSubscriptionForm.bind(Settings);
window.saveSubscription = Settings.saveSubscription.bind(Settings);

// Plex functions that don't conflict with plex.js
window.syncAllPlexLibraries = Settings.syncAllPlexLibraries.bind(Settings);

// File upload functions
window.uploadLogo = (input) => Settings.uploadFile && Settings.uploadFile(input, 'logo');
window.uploadFavicon = (input) => Settings.uploadFile && Settings.uploadFile(input, 'favicon');

// Email function alias
window.sendTestEmail = Settings.sendTestEmail.bind(Settings);

console.log('✅ Enhanced Settings.js with file upload support loaded successfully');