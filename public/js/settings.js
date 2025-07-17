// Enhanced Settings Management Functions with Fixed Initialization and Sorting
console.log('📋 Loading enhanced Settings.js...');

const Settings = {
    editingSubscriptionId: null,
    currentSortField: 'name',
    currentSortDirection: 'asc',
    currentEditingSchedule: null,        
    availableTemplates: [],              
    availableTags: [], 
	iptvEditorSettings: {},
    iptvEditorUsers: [],
    
async init() {
    try {
        console.log('⚙️ Initializing Settings page...');
        
        // Load essential data first (these should always work)
        await this.loadSettings();
        await this.loadOwners();
        await this.loadSubscriptions();
        this.loadPlexStatus();
        this.setupSubscriptionEventListeners();
        
        // Initialize channel groups section if it exists
        if (document.getElementById('channelGroupsTableBody')) {
            try {
                console.log('📺 Initializing IPTV channel groups...');
                await this.loadChannelGroups();
                await this.populateDefaultGroupDropdowns();
            } catch (error) {
                console.warn('Channel groups initialization failed:', error);
            }
        }
        
        // Only try to load email schedules if the table exists on the page
        if (document.getElementById('schedulesTableBody')) {
            try {
                console.log('📧 Loading email schedules...');
                await this.loadEmailSchedules();
            } catch (error) {
                console.warn('Email schedules not available:', error);
                // Show message in table instead of failing silently
                const tbody = document.getElementById('schedulesTableBody');
                if (tbody) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Email scheduling not available</td></tr>';
                }
            }
        }
        
        // Only try to load email templates if needed
        if (document.getElementById('emailTemplate')) {
            try {
                console.log('📧 Loading email templates...');
                await this.loadEmailTemplates();
            } catch (error) {
                console.warn('Email templates not available:', error);
            }
        }
        
        // Only try to load tags if the container exists
        if (document.getElementById('targetTagsContainer')) {
            try {
                console.log('🏷️ Loading available tags...');
                await this.loadAvailableTags();
                this.populateTagsContainer();
            } catch (error) {
                console.warn('Could not load available tags:', error);
                // Set fallback tags
                this.availableTags = ['Plex 1', 'Plex 2', 'IPTV'];
                this.populateTagsContainer();
            }
        }
        
        // Initialize IPTV statistics section - LOAD DATABASE VALUES
        try {
            console.log('📊 Initializing IPTV statistics...');
            if (typeof SettingsIPTV !== 'undefined' && SettingsIPTV.initializeIPTVSection) {
                await SettingsIPTV.initializeIPTVSection();
            }
        } catch (error) {
            console.warn('IPTV statistics initialization failed:', error);
        }
        
        // Initialize IPTV Editor if elements exist on page
        if (document.getElementById('iptvBearerToken') && document.getElementById('iptvPlaylistSelect')) {
            try {
                console.log('🎬 Initializing IPTV Editor...');
                await this.loadIPTVEditorSettings();
            } catch (error) {
                console.warn('IPTV Editor initialization failed:', error);
            }
        }
        
        console.log('✅ Settings initialization complete');
        
    } catch (error) {
        console.error('❌ Settings initialization failed:', error);
        Utils.handleError(error, 'Initializing settings');
    }
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

        // IPTV Panel Settings
        if (settings.iptv_panel_base_url) {
            const element = document.getElementById('iptvPanelBaseUrl');
            if (element) element.value = settings.iptv_panel_base_url;
        }
        if (settings.iptv_panel_login_url) {
            const element = document.getElementById('iptvPanelLoginUrl');
            if (element) element.value = settings.iptv_panel_login_url;
        }
        if (settings.iptv_panel_username) {
            const element = document.getElementById('iptvPanelUsername');
            if (element) element.value = settings.iptv_panel_username;
        }
        if (settings.iptv_panel_password) {
            const element = document.getElementById('iptvPanelPassword');
            if (element) element.value = settings.iptv_panel_password;
        }
        if (settings.iptv_package_id_for_bouquets) {
            const element = document.getElementById('iptvPackageIdForBouquets');
            if (element) element.value = settings.iptv_package_id_for_bouquets;
        }
        if (settings.iptv_credits_balance) {
            const element = document.getElementById('currentCreditBalance');
            if (element) element.textContent = settings.iptv_credits_balance;
        }
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
        
        if (!owners || owners.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No owners found</td></tr>';
            return;
        }
        
        tbody.innerHTML = owners.map(owner => `
            <tr>
                <td>${owner.name}</td>
                <td>${owner.email}</td>
                <td>
                    <span class="status-badge ${owner.active !== false ? 'status-active' : 'status-inactive'}">
                        ${owner.active !== false ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>${Utils.formatDate(owner.created_at)}</td>
                <td>
                    <button class="btn btn-small" onclick="Settings.editOwner(${owner.id})">Edit</button>
                    <button class="btn btn-small btn-danger" onclick="Settings.deleteOwner(${owner.id})">Delete</button>
                </td>
            </tr>
        `).join('');
        
        console.log(`✅ Rendered ${owners.length} owners`);
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
    
    // Subscription Management Functions - FIXED SORTING
    async loadSubscriptions() {
        try {
            console.log('📊 Loading subscriptions from API...');
            const subscriptions = await API.Subscription.getAll();
            console.log('📊 Subscriptions loaded:', subscriptions.length);
            
            // FIXED: Sort by type first (plex before iptv), then alphabetically by name
            const sortedSubscriptions = subscriptions.sort((a, b) => {
                // First sort by type (plex comes before iptv)
                if (a.type !== b.type) {
                    if (a.type === 'plex' && b.type === 'iptv') return -1;
                    if (a.type === 'iptv' && b.type === 'plex') return 1;
                }
                // Then sort alphabetically by name
                return a.name.localeCompare(b.name);
            });
            
            // Store in global state
            window.AppState.subscriptionTypes = sortedSubscriptions;
            
            this.renderSubscriptionsTable(sortedSubscriptions);
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
            Utils.showLoading();
            
            // Collect form data manually to handle complex fields
            const form = event.target;
            const formData = new FormData(form);
            
            // Get basic form data
            const scheduleData = {
                name: formData.get('name'),
                schedule_type: formData.get('schedule_type'),
                email_template_id: parseInt(formData.get('email_template_id')),
                exclude_users_with_setting: formData.get('exclude_users_with_setting') === 'on',
                active: formData.get('active') === 'on'
            };
            
            // Handle conditional fields
            if (scheduleData.schedule_type === 'expiration_reminder') {
                scheduleData.days_before_expiration = parseInt(formData.get('days_before_expiration'));
                scheduleData.subscription_type = formData.get('subscription_type');
            } else if (scheduleData.schedule_type === 'specific_date') {
                scheduleData.scheduled_date = formData.get('scheduled_date');
                scheduleData.scheduled_time = formData.get('scheduled_time');
            }
            
            // Collect selected target tags
            const targetTags = [];
            const tagCheckboxes = document.querySelectorAll('#targetTagsContainer input[type="checkbox"]:checked');
            tagCheckboxes.forEach(checkbox => {
                targetTags.push(checkbox.value);
            });
            scheduleData.target_tags = targetTags;
            
            console.log('📅 Saving schedule data:', scheduleData);
            
            // Determine if editing
            const scheduleId = formData.get('id');
            const isEditing = scheduleId && scheduleId !== '';
            
            const url = isEditing ? `/email-schedules/${scheduleId}` : '/email-schedules';
            const method = isEditing ? 'PUT' : 'POST';

            const response = await fetch(`/api${url}`, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(scheduleData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('❌ Server validation errors:', errorData);
                
                // Show specific validation errors if available
                if (errorData.errors && Array.isArray(errorData.errors)) {
                    const errorMessages = errorData.errors.map(err => err.msg || err.message).join('\n');
                    throw new Error(`Validation errors:\n${errorMessages}`);
                } else {
                    throw new Error(errorData.error || 'Failed to save schedule');
                }
            }

            Utils.showNotification(`Email schedule ${isEditing ? 'updated' : 'created'} successfully!`, 'success');
            this.hideScheduleForm();
            await this.loadEmailSchedules();
            
        } catch (error) {
            console.error('❌ Error saving schedule:', error);
            Utils.handleError(error, 'Saving email schedule');
        } finally {
            Utils.hideLoading();
        }
    },

    renderSchedulesTable(schedules) {
        const tbody = document.getElementById('schedulesTableBody');
        if (!tbody) return;

        if (schedules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No email schedules found</td></tr>';
            return;
        }

        tbody.innerHTML = schedules.map(schedule => {
            let details = '';
            if (schedule.schedule_type === 'specific_date' && schedule.next_run) {
                // Convert UTC time to Central Time for display
                const utcDate = new Date(schedule.next_run);
                const centralTime = utcDate.toLocaleString('en-US', {
                    timeZone: 'America/Chicago',
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
                details = `${centralTime} <span style="color: #888; font-size: 0.9em;">(Central Time)</span>`;
            } else if (schedule.schedule_type === 'expiration_reminder') {
                details = `${schedule.days_before_expiration} days before ${schedule.subscription_type} expiration`;
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
                    <td>${schedule.last_run ? new Date(schedule.last_run).toLocaleString('en-US', {timeZone: 'America/Chicago'}) : 'Never'}</td>
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

        // Define available tags with nice display names
        const availableTags = [
            { value: 'IPTV', label: 'IPTV', class: 'tag-iptv' },
            { value: 'Plex 1', label: 'Plex 1', class: 'tag-plex1' },
            { value: 'Plex 2', label: 'Plex 2', class: 'tag-plex2' }
        ];

        container.innerHTML = availableTags.map(tag => {
            return `
                <div class="tag-checkbox-item ${tag.class}">
                    <input type="checkbox" 
                           id="targetTag_${tag.value.replace(/\s+/g, '')}" 
                           name="target_tags" 
                           value="${tag.value}">
                    <label for="targetTag_${tag.value.replace(/\s+/g, '')}">${tag.label}</label>
                </div>
            `;
        }).join('');
    },
    
    renderSubscriptionsTable(subscriptions) {
        const tbody = document.getElementById('subscriptionsTableBody');
        if (!tbody) {
            console.log('⚠️ Subscriptions table body not found - probably not on management page');
            return;
        }
        
        if (!subscriptions || subscriptions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No subscription types found</td></tr>';
            return;
        }
        
        tbody.innerHTML = subscriptions.map(sub => `
            <tr>
                <td>${sub.name}</td>
                <td>
                    <span class="status-badge ${sub.type === 'plex' ? 'status-info' : 'status-warning'}">
                        ${sub.type.toUpperCase()}
                    </span>
                </td>
                <td>${sub.duration_months} month${sub.duration_months > 1 ? 's' : ''}</td>
                <td>${sub.streams ? `${sub.streams} streams` : 'N/A'}</td>
                <td>$${parseFloat(sub.price || 0).toFixed(2)}</td>
                <td>
                    <span class="status-badge ${sub.active ? 'status-active' : 'status-inactive'}">
                        ${sub.active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-small" onclick="Settings.editSubscription(${sub.id})">Edit</button>
                    <button class="btn btn-small btn-danger" onclick="Settings.deleteSubscription(${sub.id})">Delete</button>
                </td>
            </tr>
        `).join('');
        
        console.log(`✅ Rendered ${subscriptions.length} subscription types`);
    },
        
    // FIXED: Remove sortSubscriptions function that was breaking the table
    // The table headers should not be clickable for sorting to prevent breaking display
    
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
	
    async deleteSubscription(subscriptionId) {
        try {
            const subscription = window.AppState.subscriptionTypes.find(sub => sub.id === subscriptionId);
            if (!subscription) return;
            
            if (!confirm(`Are you sure you want to delete "${subscription.name}"? This cannot be undone.`)) return;
            
            Utils.showLoading();
            
            await API.Subscription.delete(subscriptionId);
            Utils.showNotification('Subscription type deleted successfully', 'success');
            
            // Reload data
            await this.loadSubscriptions();
            
        } catch (error) {
            Utils.handleError(error, 'Deleting subscription type');
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
            const result = await API.Email.testConnection();
            
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
            cashapp_link: document.getElementById('cashappLink')?.value || '',
            
            // IPTV Panel Configuration
            iptv_panel_base_url: document.getElementById('iptvPanelBaseUrl')?.value || '',
            iptv_panel_login_url: document.getElementById('iptvPanelLoginUrl')?.value || '',
            iptv_panel_username: document.getElementById('iptvPanelUsername')?.value || '',
            iptv_panel_password: document.getElementById('iptvPanelPassword')?.value || '',
            iptv_package_id_for_bouquets: document.getElementById('iptvPackageIdForBouquets')?.value || ''
        };
        
        // Save text settings (only if there are any changes)
        if (Object.values(settingsData).some(value => value !== '')) {
            await API.Settings.update(settingsData);
        }
        
        // Save IPTV Editor settings if elements exist
        if (document.getElementById('iptvBearerToken')) {
            await this.saveIPTVEditorSettings();
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
    },
    
    // IPTV Panel Functions
    async testIPTVConnection() {
        try {
            const button = document.getElementById('testConnectionText');
            const statusDiv = document.getElementById('iptvConnectionStatus');
            const statusText = document.getElementById('connectionStatusText');
            const statusIcon = document.getElementById('connectionStatusIcon');

            if (button) button.textContent = 'Testing...';
            if (statusDiv) statusDiv.style.display = 'block';
            if (statusText) statusText.textContent = 'Testing connection...';
            if (statusIcon) statusIcon.textContent = '🔄';

            // First save current settings to ensure they're available for the test
            await this.saveCurrentIPTVSettings();

            const response = await fetch('/api/iptv/test-connection', { method: 'POST' });
            const data = await response.json();

            if (data.success) {
                if (statusText) statusText.textContent = 'Connection successful!';
                if (statusIcon) statusIcon.textContent = '✅';
                Utils.showNotification('IPTV panel connection successful', 'success');
            } else {
                if (statusText) statusText.textContent = `Connection failed: ${data.message}`;
                if (statusIcon) statusIcon.textContent = '❌';
                Utils.showNotification('IPTV panel connection failed', 'error');
            }
        } catch (error) {
            console.error('❌ Connection test failed:', error);
            const statusText = document.getElementById('connectionStatusText');
            const statusIcon = document.getElementById('connectionStatusIcon');
            if (statusText) statusText.textContent = 'Connection test failed';
            if (statusIcon) statusIcon.textContent = '❌';
            Utils.showNotification('Connection test failed', 'error');
        } finally {
            const button = document.getElementById('testConnectionText');
            if (button) button.textContent = 'Test Connection';
        }
    },

    async saveCurrentIPTVSettings() {
        try {
            const iptvSettings = {
                iptv_panel_base_url: document.getElementById('iptvPanelBaseUrl')?.value || '',
                iptv_panel_login_url: document.getElementById('iptvPanelLoginUrl')?.value || '',
                iptv_panel_username: document.getElementById('iptvPanelUsername')?.value || '',
                iptv_panel_password: document.getElementById('iptvPanelPassword')?.value || '',
                iptv_package_id_for_bouquets: document.getElementById('iptvPackageIdForBouquets')?.value || ''
            };

            // Only save if there are actual values
            if (Object.values(iptvSettings).some(value => value !== '')) {
                await API.Settings.update(iptvSettings);
            }
        } catch (error) {
            console.error('Failed to save IPTV settings:', error);
        }
    },
    
    // IPTV Channel Groups Functions (moved from IPTV.js for settings page)
    async showChannelGroupForm() {
        console.log('📋 Opening channel group form...');
        
        const form = document.getElementById('channelGroupForm');
        if (form) {
            form.style.display = 'block';
            document.getElementById('channelGroupFormTitle').textContent = 'Create New Channel Group';
            
            // Clear the form
            document.getElementById('channelGroupName').value = '';
            document.getElementById('channelGroupDescription').value = '';
            
            // Load bouquets for selection
            await this.loadBouquetsForSelection();
            
            // Scroll to form
            form.scrollIntoView({ behavior: 'smooth' });
        } else {
            console.error('❌ Channel group form not found in settings page');
            Utils.showNotification('Channel group form not found', 'error');
        }
    },

    hideChannelGroupForm() {
        const form = document.getElementById('channelGroupForm');
        if (form) {
            form.style.display = 'none';
        }
    },

async loadBouquetsForSelection() {
    try {
        console.log('📺 Loading bouquets for selection...');
        
        const response = await fetch('/api/iptv/bouquets');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const bouquets = data.bouquets || data;
        
        console.log(`✅ Loaded bouquets for selection:`, bouquets);
        
        // Use the correct container ID from the HTML (bouquetSelector)
        const container = document.getElementById('bouquetSelector');
        if (!container) {
            console.error('❌ Bouquet selector container not found');
            return;
        }
        
        // Clear existing content
        container.innerHTML = '';
        
        // Check if we have bouquets
        if (!bouquets || Object.keys(bouquets).length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #f44336; padding: 20px;">No bouquets found. Please sync bouquets first.</div>';
            return;
        }
        
        // Add select all/clear buttons at the top
        const controlsDiv = document.createElement('div');
        controlsDiv.style.cssText = 'display: flex; gap: 10px; margin-bottom: 15px; padding: 12px; background: rgba(79, 195, 247, 0.1); border-radius: 6px; border: 1px solid rgba(79, 195, 247, 0.3);';
        controlsDiv.innerHTML = `
            <button type="button" class="btn btn-sm" style="background: #4fc3f7; color: #000; padding: 8px 16px; font-size: 0.85rem; border-radius: 4px; font-weight: 500;" onclick="Settings.selectAllBouquets()">
                <i class="fas fa-check-double"></i> Select All
            </button>
            <button type="button" class="btn btn-sm" style="background: #666; color: #fff; padding: 8px 16px; font-size: 0.85rem; border-radius: 4px; font-weight: 500;" onclick="Settings.clearAllBouquets()">
                <i class="fas fa-times"></i> Clear All
            </button>
        `;
        container.appendChild(controlsDiv);
        
        // Create bouquet selection interface
        Object.keys(bouquets).forEach(category => {
            const categoryDiv = document.createElement('div');
            categoryDiv.style.cssText = 'margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden;';
            
            // Category header with select all button
            const categoryHeader = document.createElement('div');
            categoryHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: linear-gradient(45deg, rgba(0,0,0,0.6), rgba(79, 195, 247, 0.1)); border-bottom: 1px solid rgba(255,255,255,0.1);';
            categoryHeader.innerHTML = `
                <div>
                    <span style="color: #4fc3f7; font-weight: bold; font-size: 1rem;">${category}</span>
                    <span style="color: #ccc; font-size: 0.85rem; margin-left: 8px;">(${bouquets[category].length} bouquets)</span>
                </div>
                <button type="button" class="btn btn-sm" style="background: rgba(79, 195, 247, 0.8); color: #000; padding: 6px 12px; font-size: 0.75rem; border-radius: 4px; font-weight: 500;" onclick="Settings.selectCategoryBouquets('${category}')">
                    <i class="fas fa-check"></i> Select All
                </button>
            `;
            categoryDiv.appendChild(categoryHeader);
            
            // Bouquets container with better spacing
            const bouquetsContainer = document.createElement('div');
            bouquetsContainer.style.cssText = 'padding: 15px;';
            
            // Bouquets grid with improved layout
            const bouquetsGrid = document.createElement('div');
            bouquetsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px;';
            
            bouquets[category].forEach(bouquet => {
                const bouquetDiv = document.createElement('div');
                bouquetDiv.style.cssText = `
                    display: flex; 
                    align-items: flex-start; 
                    gap: 12px; 
                    padding: 12px; 
                    background: rgba(255,255,255,0.03); 
                    border: 1px solid rgba(255,255,255,0.1); 
                    border-radius: 6px; 
                    transition: all 0.2s ease;
                    min-height: 60px;
                `;
                
                // Add hover effect
                bouquetDiv.addEventListener('mouseenter', function() {
                    this.style.background = 'rgba(79, 195, 247, 0.1)';
                    this.style.borderColor = 'rgba(79, 195, 247, 0.3)';
                });
                
                bouquetDiv.addEventListener('mouseleave', function() {
                    this.style.background = 'rgba(255,255,255,0.03)';
                    this.style.borderColor = 'rgba(255,255,255,0.1)';
                });
                
                bouquetDiv.innerHTML = `
                    <div style="margin-top: 2px;">
                        <input type="checkbox" id="bouquet_${bouquet.id}" value="${bouquet.id}" data-category="${category}" 
                               style="width: 16px; height: 16px; margin: 0; cursor: pointer; accent-color: #4fc3f7;">
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <label for="bouquet_${bouquet.id}" style="color: #fff; cursor: pointer; font-size: 0.9rem; margin: 0; line-height: 1.4; display: block; word-wrap: break-word; overflow-wrap: break-word;">
                            <div style="font-weight: 500; margin-bottom: 4px;">
                                ${bouquet.name}
                            </div>
                            <div style="color: #888; font-size: 0.75rem; font-family: 'Courier New', monospace;">
                                ID: ${bouquet.id} • ${category}
                            </div>
                        </label>
                    </div>
                `;
                
                bouquetsGrid.appendChild(bouquetDiv);
            });
            
            bouquetsContainer.appendChild(bouquetsGrid);
            categoryDiv.appendChild(bouquetsContainer);
            container.appendChild(categoryDiv);
        });
        
    } catch (error) {
        console.error('❌ Failed to load bouquets for selection:', error);
        const container = document.getElementById('bouquetSelector');
        if (container) {
            container.innerHTML = '<div style="text-align: center; color: #f44336; padding: 20px;">Failed to load bouquets. Please try syncing bouquets first.</div>';
        }
    }
},

selectCategoryBouquets(category) {
    const checkboxes = document.querySelectorAll(`input[data-category="${category}"]`);
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
    Utils.showNotification(`Selected all ${category} bouquets`, 'success');
},

selectAllBouquets() {
    // Fixed: Changed from #bouquetSelectionContainer to #bouquetSelector
    const checkboxes = document.querySelectorAll('#bouquetSelector input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
    Utils.showNotification('Selected all bouquets', 'success');
},

clearAllBouquets() {
    // Fixed: Changed from #bouquetSelectionContainer to #bouquetSelector
    const checkboxes = document.querySelectorAll('#bouquetSelector input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    Utils.showNotification('Cleared all selections', 'info');
},

async saveChannelGroup(event) {
    if (event) {
        event.preventDefault();
    }
    
    try {
        const form = document.getElementById('channelGroupForm');
        const editingId = form.getAttribute('data-editing-id');
        const isEditing = !!editingId;
        
        const name = document.getElementById('channelGroupName').value.trim();
        const description = document.getElementById('channelGroupDescription').value.trim();
        
        // Fixed: Changed from #bouquetSelectionContainer to #bouquetSelector
        const selectedCheckboxes = document.querySelectorAll('#bouquetSelector input[type="checkbox"]:checked');
        const bouquetIds = Array.from(selectedCheckboxes).map(cb => cb.value);
        
        // Debug logging
        console.log('🔍 Debug info:', {
            container: document.getElementById('bouquetSelector'),
            allCheckboxes: document.querySelectorAll('#bouquetSelector input[type="checkbox"]').length,
            selectedCheckboxes: selectedCheckboxes.length,
            bouquetIds: bouquetIds
        });
        
        // Validation
        if (!name) {
            Utils.showNotification('Please enter a group name', 'error');
            return;
        }
        
        if (bouquetIds.length === 0) {
            Utils.showNotification('Please select at least one bouquet', 'error');
            return;
        }
        
        console.log(`💾 ${isEditing ? 'Updating' : 'Creating'} channel group:`, { 
            name, 
            description, 
            bouquet_count: bouquetIds.length,
            bouquet_ids: bouquetIds 
        });
        
        const url = isEditing ? `/api/iptv/channel-groups/${editingId}` : '/api/iptv/channel-groups';
        const method = isEditing ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                description: description,
                bouquet_ids: bouquetIds,
                is_active: true
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            Utils.showNotification(`Channel group ${isEditing ? 'updated' : 'created'} successfully!`, 'success');
            this.hideChannelGroupForm();
            await this.loadChannelGroups(); // Refresh the table
        } else {
            throw new Error(result.message || 'Failed to save channel group');
        }
        
    } catch (error) {
        console.error('❌ Failed to save channel group:', error);
        Utils.showNotification('Failed to save channel group: ' + error.message, 'error');
    }
},

    async viewBouquetDetails() {
        try {
            console.log('📺 Loading all bouquets for viewing...');
            
            const response = await fetch('/api/iptv/bouquets');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            const bouquets = data.bouquets || data;
            
            // Create a modal-like overlay for viewing bouquets
            const modalHTML = `
                <div id="bouquetViewModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px;">
                    <div style="background: #1a1a1a; color: #fff; border-radius: 8px; border: 1px solid #333; max-width: 90%; max-height: 90%; overflow: hidden; display: flex; flex-direction: column;">
                        <div style="padding: 20px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;">
                            <h3 style="margin: 0; color: #4fc3f7;">All Available Bouquets</h3>
                            <button onclick="document.getElementById('bouquetViewModal').remove()" style="background: #f44336; color: #fff; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;">
                                <i class="fas fa-times"></i> Close
                            </button>
                        </div>
                        <div style="padding: 20px; overflow-y: auto; flex: 1;">
                            <div id="bouquetViewContent">Loading...</div>
                        </div>
                    </div>
                </div>
            `;
            
            // Remove existing modal and add new one
            const existingModal = document.getElementById('bouquetViewModal');
            if (existingModal) {
                existingModal.remove();
            }
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            
            // Populate with bouquet data
            const content = document.getElementById('bouquetViewContent');
            let html = '';
            
            Object.keys(bouquets).forEach(category => {
                html += `
                    <div style="margin-bottom: 25px;">
                        <h4 style="color: #4fc3f7; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 8px;">
                            ${category} (${bouquets[category].length} bouquets)
                        </h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px;">
                `;
                
                bouquets[category].forEach(bouquet => {
                    html += `
                        <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 4px; border: 1px solid #333;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: #fff; font-weight: 500;">${bouquet.name}</span>
                                <span style="color: #4fc3f7; font-family: monospace; font-size: 0.9rem;">ID: ${bouquet.id}</span>
                            </div>
                        </div>
                    `;
                });
                
                html += '</div></div>';
            });
            
            content.innerHTML = html;
            
        } catch (error) {
            console.error('❌ Failed to load bouquet details:', error);
            Utils.showNotification('Failed to load bouquet details: ' + error.message, 'error');
        }
    },

    async loadChannelGroups() {
        try {
            console.log('📋 Loading channel groups...');
            
            const response = await fetch('/api/iptv/channel-groups');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            const groups = data.channelGroups || data;
            console.log(`✅ Loaded ${groups.length} channel groups`);
            
            // Update the table
            const tableBody = document.getElementById('channelGroupsTableBody');
            if (tableBody) {
                this.renderChannelGroupsTable(groups, tableBody);
            }
            
            return groups;
            
        } catch (error) {
            console.error('❌ Failed to load channel groups:', error);
            Utils.showNotification('Failed to load channel groups: ' + error.message, 'error');
            
            const tableBody = document.getElementById('channelGroupsTableBody');
            if (tableBody) {
                tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #f44336;">Failed to load channel groups</td></tr>';
            }
            return [];
        }
    },

    renderChannelGroupsTable(groups, tableBody) {
        if (groups.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; color: #666;">
                        <p>No channel groups created yet.</p>
                        <button class="btn btn-primary" onclick="Settings.showChannelGroupForm()">
                            <i class="fas fa-plus"></i> Create Your First Group
                        </button>
                    </td>
                </tr>
            `;
            return;
        }
        
        const rows = groups.map(group => {
            const bouquetIds = Array.isArray(group.bouquet_ids) ? 
                group.bouquet_ids : 
                (typeof group.bouquet_ids === 'string' ? JSON.parse(group.bouquet_ids || '[]') : []);
            
            const bouquetCount = bouquetIds.length;
            const status = group.is_active ? 
                '<span class="badge badge-success">Active</span>' : 
                '<span class="badge badge-secondary">Inactive</span>';
            
            const createdDate = new Date(group.created_at).toLocaleDateString();
            
            return `
                <tr>
                    <td style="font-weight: bold; color: #4fc3f7;">${group.name}</td>
                    <td>${group.description || 'No description'}</td>
                    <td>
                        <span class="badge badge-info">${bouquetCount} bouquets</span>
                    </td>
                    <td>${status}</td>
                    <td>${createdDate}</td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-info" onclick="Settings.viewChannelGroup(${group.id})" title="View">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn btn-outline-warning" onclick="Settings.editChannelGroup(${group.id})" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-outline-danger" onclick="Settings.deleteChannelGroup(${group.id})" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
        tableBody.innerHTML = rows;
    },


async viewChannelGroup(groupId) {
    try {
        // Fetch both group data and bouquets data
        const [groupResponse, bouquetsResponse] = await Promise.all([
            fetch(`/api/iptv/channel-groups/${groupId}`),
            fetch('/api/iptv/bouquets')
        ]);
        
        if (!groupResponse.ok) {
            throw new Error(`HTTP ${groupResponse.status}`);
        }
        
        const groupData = await groupResponse.json();
        const bouquetsData = await bouquetsResponse.json();
        const group = groupData.channelGroup || groupData;
        
        console.log('📋 Group data received:', group);
        console.log('📺 Bouquets data received:', bouquetsData);
        
        // FIXED: Handle bouquet_ids properly - it might already be an array
        let groupBouquetIds = group.bouquet_ids;
        if (typeof groupBouquetIds === 'string') {
            try {
                groupBouquetIds = JSON.parse(groupBouquetIds);
            } catch (e) {
                console.warn('Failed to parse bouquet_ids as JSON, treating as array:', e);
                groupBouquetIds = [];
            }
        } else if (!Array.isArray(groupBouquetIds)) {
            groupBouquetIds = [];
        }
        
        console.log('📋 Processed bouquet IDs:', groupBouquetIds);
        
        // Get bouquet details for this group
        const allBouquets = bouquetsData.bouquets || {};
        
        // Find bouquets that match this group's IDs
        const groupBouquets = [];
        for (const category in allBouquets) {
            allBouquets[category].forEach(bouquet => {
                // Convert both to strings for comparison
                if (groupBouquetIds.includes(bouquet.id.toString()) || groupBouquetIds.includes(bouquet.id)) {
                    groupBouquets.push({
                        ...bouquet,
                        category: category
                    });
                }
            });
        }
        
        console.log('📺 Found matching bouquets:', groupBouquets);
        
        // Sort bouquets by category then name
        groupBouquets.sort((a, b) => {
            if (a.category !== b.category) {
                return a.category.localeCompare(b.category);
            }
            return a.name.localeCompare(b.name);
        });
        
        // FIXED: Declare categorizedBouquets in proper scope
        const categorizedBouquets = {};
        
        // Create bouquets HTML
        let bouquetsHTML = '';
        if (groupBouquets.length === 0) {
            bouquetsHTML = '<div style="text-align: center; color: #666; padding: 20px;">No bouquets found in this group</div>';
        } else {
            // Group by category for display
            groupBouquets.forEach(bouquet => {
                if (!categorizedBouquets[bouquet.category]) {
                    categorizedBouquets[bouquet.category] = [];
                }
                categorizedBouquets[bouquet.category].push(bouquet);
            });
            
            // Generate HTML by category
            for (const category in categorizedBouquets) {
                bouquetsHTML += `
                    <div style="margin-bottom: 25px;">
                        <h4 style="color: #4fc3f7; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 1px solid #333;">
                            ${category} (${categorizedBouquets[category].length} bouquets)
                        </h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px;">
                `;
                
                categorizedBouquets[category].forEach(bouquet => {
                    bouquetsHTML += `
                        <div style="background: rgba(79, 195, 247, 0.1); padding: 12px; border-radius: 6px; border: 1px solid #4fc3f7;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: #fff; font-weight: 500;">${bouquet.name}</span>
                                <span style="color: #4fc3f7; font-size: 0.9rem; font-family: monospace;">ID: ${bouquet.id}</span>
                            </div>
                        </div>
                    `;
                });
                
                bouquetsHTML += '</div></div>';
            }
        }
        
        // Show group details in a modal
        const modalHTML = `
            <div id="groupViewModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px;">
                <div style="background: #1a1a1a; color: #fff; border-radius: 8px; border: 1px solid #333; max-width: 900px; width: 100%; max-height: 90%; overflow: hidden; display: flex; flex-direction: column;">
                    <div style="padding: 20px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h3 style="margin: 0; color: #4fc3f7;">${group.name}</h3>
                            <p style="margin: 5px 0 0 0; color: #ccc; font-size: 0.9rem;">${group.description || 'No description'}</p>
                        </div>
                        <button onclick="document.getElementById('groupViewModal').remove()" style="background: #f44336; color: #fff; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>
                    
                    <div style="padding: 20px; overflow-y: auto; flex: 1;">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px;">
                            <div style="background: rgba(76, 175, 80, 0.1); padding: 15px; border-radius: 6px; border: 1px solid #4caf50;">
                                <div style="color: #4caf50; font-size: 1.2rem; font-weight: bold;">${groupBouquets.length}</div>
                                <div style="color: #fff; font-size: 0.9rem;">Total Bouquets</div>
                            </div>
                            <div style="background: rgba(33, 150, 243, 0.1); padding: 15px; border-radius: 6px; border: 1px solid #2196f3;">
                                <div style="color: #2196f3; font-size: 1.2rem; font-weight: bold;">${Object.keys(categorizedBouquets).length}</div>
                                <div style="color: #fff; font-size: 0.9rem;">Categories</div>
                            </div>
                            <div style="background: rgba(255, 152, 0, 0.1); padding: 15px; border-radius: 6px; border: 1px solid #ff9800;">
                                <div style="color: #ff9800; font-size: 1.2rem; font-weight: bold;">${group.is_active ? 'Active' : 'Inactive'}</div>
                                <div style="color: #fff; font-size: 0.9rem;">Status</div>
                            </div>
                            <div style="background: rgba(156, 39, 176, 0.1); padding: 15px; border-radius: 6px; border: 1px solid #9c27b0;">
                                <div style="color: #9c27b0; font-size: 1.2rem; font-weight: bold;">${new Date(group.created_at).toLocaleDateString()}</div>
                                <div style="color: #fff; font-size: 0.9rem;">Created</div>
                            </div>
                        </div>
                        
                        <h4 style="color: #4fc3f7; margin-bottom: 15px;">Included Bouquets:</h4>
                        ${bouquetsHTML}
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal and add new one
        const existingModal = document.getElementById('groupViewModal');
        if (existingModal) {
            existingModal.remove();
        }
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
    } catch (error) {
        console.error('❌ Failed to view channel group:', error);
        Utils.showNotification('Failed to load channel group details', 'error');
    }
},

    async editChannelGroup(groupId) {
        try {
            // Load the group data
            const response = await fetch(`/api/iptv/channel-groups/${groupId}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            const group = data.channelGroup || data;
            
            // Show the form with existing data
            const form = document.getElementById('channelGroupForm');
            if (form) {
                form.style.display = 'block';
                document.getElementById('channelGroupFormTitle').textContent = 'Edit Channel Group';
                
                // Fill form with existing data
                document.getElementById('channelGroupName').value = group.name;
                document.getElementById('channelGroupDescription').value = group.description || '';
                
                // Load bouquets and pre-select the ones in this group
                await this.loadBouquetsForSelection();
                
                // Pre-select bouquets
                const bouquetIds = Array.isArray(group.bouquet_ids) ? 
                    group.bouquet_ids : 
                    JSON.parse(group.bouquet_ids || '[]');
                
                bouquetIds.forEach(id => {
                    const checkbox = document.getElementById(`bouquet_${id}`);
                    if (checkbox) {
                        checkbox.checked = true;
                    }
                });
                
                // Store the group ID for updating
                form.setAttribute('data-editing-id', groupId);
                
                // Scroll to form
                form.scrollIntoView({ behavior: 'smooth' });
            }
            
        } catch (error) {
            console.error('❌ Failed to load channel group for editing:', error);
            Utils.showNotification('Failed to load channel group for editing', 'error');
        }
    },

    async deleteChannelGroup(groupId) {
        if (!confirm('Are you sure you want to delete this channel group?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/iptv/channel-groups/${groupId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            Utils.showNotification('Channel group deleted successfully', 'success');
            this.loadChannelGroups(); // Refresh the list
            
        } catch (error) {
            console.error('❌ Failed to delete channel group:', error);
            Utils.showNotification('Failed to delete channel group', 'error');
        }
    },

    async populateDefaultGroupDropdowns() {
        try {
            const groups = await this.loadChannelGroups();
            
            const trialSelect = document.getElementById('defaultTrialGroup');
            const paidSelect = document.getElementById('defaultPaidGroup');
            
            if (trialSelect && paidSelect) {
                // Clear existing options (except first)
                trialSelect.innerHTML = '<option value="">None selected</option>';
                paidSelect.innerHTML = '<option value="">None selected</option>';
                
                // Add groups as options
                groups.forEach(group => {
                    const option1 = new Option(group.name, group.id);
                    const option2 = new Option(group.name, group.id);
                    trialSelect.add(option1);
                    paidSelect.add(option2);
                });
                
                // Load current settings
                await this.loadDefaultGroupSettings();
            }
        } catch (error) {
            console.error('❌ Failed to populate default group dropdowns:', error);
        }
    },

    async loadDefaultGroupSettings() {
        try {
            const response = await fetch('/api/settings');
            if (!response.ok) return;
            
            const data = await response.json();
            const settings = data.settings || data;
            
            // Find default group settings
            const trialGroupSetting = settings.find ? settings.find(s => s.setting_key === 'iptv_default_trial_group') : 
                                     settings.iptv_default_trial_group ? {setting_value: settings.iptv_default_trial_group} : null;
            const paidGroupSetting = settings.find ? settings.find(s => s.setting_key === 'iptv_default_paid_group') : 
                                    settings.iptv_default_paid_group ? {setting_value: settings.iptv_default_paid_group} : null;
            
            // Populate dropdowns
            const trialSelect = document.getElementById('defaultTrialGroup');
            const paidSelect = document.getElementById('defaultPaidGroup');
            
            if (trialSelect && trialGroupSetting) {
                trialSelect.value = trialGroupSetting.setting_value || '';
            }
            
            if (paidSelect && paidGroupSetting) {
                paidSelect.value = paidGroupSetting.setting_value || '';
            }
            
        } catch (error) {
            console.error('❌ Failed to load default group settings:', error);
        }
    },

async saveDefaultGroups() {
    try {
        const trialGroupId = document.getElementById('defaultTrialGroup').value;
        const paidGroupId = document.getElementById('defaultPaidGroup').value;
        
        const settings = {};
        if (trialGroupId) {
            settings.iptv_default_trial_group = trialGroupId;
        }
        if (paidGroupId) {
            settings.iptv_default_paid_group = paidGroupId;
        }
        
        // Changed from POST to PUT
        const response = await fetch('/api/settings', {
            method: 'PUT',  // FIXED: Changed from POST to PUT
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        Utils.showNotification('Default group settings saved successfully', 'success');
        
    } catch (error) {
        console.error('❌ Failed to save default group settings:', error);
        Utils.showNotification('Failed to save default group settings', 'error');
    }
},

// =============================================================================
// IPTV EDITOR SETTINGS MANAGEMENT - SIMPLIFIED AND FIXED
// =============================================================================

// Save IPTV Editor Bearer Token
async saveIPTVEditorToken(token) {
    try {
        const response = await fetch('/api/iptv-editor/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bearer_token: token
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message);
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Failed to save IPTV Editor token:', error);
        throw error;
    }
},

// Sync IPTV Editor Playlists
async syncIPTVEditorPlaylists() {
    const syncButton = document.querySelector('[onclick="syncIPTVEditorPlaylists()"]');
    const playlistSelect = document.getElementById('iptvPlaylistSelect');
    
    try {
        if (syncButton) {
            syncButton.disabled = true;
            syncButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
        }
        
        // First test connection
        const connectionOk = await Settings.testIPTVEditorConnection();
        if (!connectionOk) {
            throw new Error('Connection test failed - cannot sync playlists');
        }
        
        // Sync playlists (this will store them in database)
        const response = await fetch('/api/iptv-editor/sync-playlists', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        console.log('🔍 Sync result:', result);
        
        if (result.success) {
            Utils.showNotification(`Synced ${result.count} playlists successfully`, 'success');
            
            // Reload the dropdown with newly stored playlists
            await Settings.loadStoredPlaylists();
            
        } else {
            throw new Error(result.message || 'Sync failed');
        }
        
    } catch (error) {
        console.error('❌ Failed to sync IPTV Editor playlists:', error);
        Utils.showNotification(`Failed to sync playlists: ${error.message}`, 'error');
        
    } finally {
        if (syncButton) {
            syncButton.disabled = false;
            syncButton.innerHTML = '<i class="fas fa-sync"></i> Sync Playlists';
        }
    }
},



// Load IPTV Editor Settings
async loadIPTVEditorSettings() {
    console.log('🎬 Loading IPTV Editor settings...');
    try {
        const response = await fetch('/api/iptv-editor/settings');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('📥 IPTV Editor settings response:', result);
        
        if (result.success && result.settings) {
            const settings = result.settings;
            
            // Safely populate form fields only if elements exist
            const bearerTokenField = document.getElementById('iptvBearerToken');
            if (bearerTokenField && settings.bearer_token) {
                bearerTokenField.value = settings.bearer_token;
                console.log('✅ Set bearer token');
            }
            
            // Load stored playlists into dropdown first
            await this.loadStoredPlaylists();
            
            // Set default playlist selection AFTER loading playlists
            const playlistSelect = document.getElementById('iptvPlaylistSelect');
            if (playlistSelect && settings.default_playlist_id) {
                playlistSelect.value = settings.default_playlist_id;
                console.log('✅ Set default playlist');
            }
            
            // REMOVED: sync_enabled checkbox handling
            
            console.log('✅ IPTV Editor settings loaded successfully');
            return true;
        } else {
            console.log('⚠️ No IPTV Editor settings found or unsuccessful response');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Failed to load IPTV Editor settings:', error);
        
        if (error.message.includes('404')) {
            console.warn('🔧 IPTV Editor API endpoints not found - need to set up backend routes');
            Utils.showNotification('IPTV Editor backend not configured. Please set up API routes.', 'warning');
        } else {
            Utils.showNotification(`Failed to load IPTV Editor settings: ${error.message}`, 'error');
        }
        
        return false;
    }
},

// Load stored playlists into dropdown - NEW FUNCTION
async loadStoredPlaylists() {
    try {
        const response = await fetch('/api/iptv-editor/playlists');
        const result = await response.json();
        
        const playlistSelect = document.getElementById('iptvPlaylistSelect');
        if (!playlistSelect) {
            console.warn('Playlist select element not found');
            return;
        }
        
        // Clear existing options
        playlistSelect.innerHTML = '<option value="">Select a playlist...</option>';
        
        if (result.success && result.data && result.data.length > 0) {
            result.data.forEach(playlist => {
                const option = document.createElement('option');
                option.value = playlist.playlist_id;
                option.textContent = `${playlist.name} (${playlist.customer_count} users)`;
                playlistSelect.appendChild(option);
            });
            
            console.log(`✅ Loaded ${result.data.length} stored playlists into dropdown`);
        } else {
            console.log('ℹ️ No stored playlists found - use sync button first');
            
            // Add informational option
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No playlists available - click Sync first';
            option.disabled = true;
            playlistSelect.appendChild(option);
        }
        
    } catch (error) {
        console.error('❌ Failed to load stored playlists:', error);
    }
},

// Save IPTV Editor Settings (called by main save button)
async saveIPTVEditorSettings() {
    try {
        const bearerToken = document.getElementById('iptvBearerToken').value;
        const playlistSelect = document.getElementById('iptvPlaylistSelect');
        const defaultPlaylistId = playlistSelect ? playlistSelect.value : '';
        const defaultPlaylistName = playlistSelect && playlistSelect.selectedOptions[0] ? 
                                   playlistSelect.selectedOptions[0].textContent : '';
        
        // REMOVED: syncEnabled checkbox handling
        
        const settings = {
            bearer_token: bearerToken,
            default_playlist_id: defaultPlaylistId,
            default_playlist_name: defaultPlaylistName
            // REMOVED: sync_enabled
        };
        
        const response = await fetch('/api/iptv-editor/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        const result = await response.json();
        
        if (result.success) {
            Utils.showNotification('IPTV Editor settings saved successfully', 'success');
        } else {
            throw new Error(result.message || 'Save failed');
        }
        
    } catch (error) {
        console.error('❌ Failed to save IPTV Editor settings:', error);
        Utils.showNotification(`Failed to save settings: ${error.message}`, 'error');
    }
},

// Sync IPTV Editor Categories
async syncIPTVEditorCategories() {
    try {
        const response = await fetch('/api/iptv-editor/sync-categories', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            Utils.showNotification(
                `Categories synced: ${result.data.channels_synced} channels, ${result.data.vods_synced} VODs, ${result.data.series_synced} series`, 
                'success'
            );
        } else {
            Utils.showNotification('Failed to sync categories: ' + result.message, 'error');
        }
        
    } catch (error) {
        console.error('Error syncing categories:', error);
        Utils.showNotification('Failed to sync categories', 'error');
    }
},

// Test IPTV Editor Connection - EXISTING (keep as is)
async testIPTVEditorConnection() {
    const testButton = document.querySelector('[onclick="testIPTVEditorConnection()"]');
    
    try {
        if (testButton) {
            testButton.disabled = true;
            testButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
        }
        
        const response = await fetch('/api/iptv-editor/test-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            Utils.showNotification('IPTV Editor connection successful!', 'success');
            return true;
        } else {
            Utils.showNotification(`Connection failed: ${result.message}`, 'error');
            return false;
        }
        
    } catch (error) {
        console.error('❌ IPTV Editor connection test failed:', error);
        Utils.showNotification(`Connection test failed: ${error.message}`, 'error');
        return false;
        
    } finally {
        if (testButton) {
            testButton.disabled = false;
            testButton.innerHTML = '<i class="fas fa-wifi"></i> Test Connection';
        }
    }
},

// Sync IPTV Editor categories
async syncIPTVEditorCategories() {
    try {
        const syncBtn = document.getElementById('syncCategoriesBtn');
        if (syncBtn) {
            const originalText = syncBtn.innerHTML;
            syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
            syncBtn.disabled = true;
        }
        
        const response = await fetch('/api/iptv-editor/sync-categories', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            Utils.showNotification(
                `Categories synced: ${result.data.channels_synced} channels, ${result.data.vods_synced} VODs, ${result.data.series_synced} series`, 
                'success'
            );
        } else {
            Utils.showNotification('Failed to sync categories: ' + result.message, 'error');
        }
        
    } catch (error) {
        console.error('Error syncing categories:', error);
        Utils.showNotification('Failed to sync categories', 'error');
    } finally {
        const syncBtn = document.getElementById('syncCategoriesBtn');
        if (syncBtn) {
            syncBtn.innerHTML = '<i class="fas fa-sync"></i> Sync Categories';
            syncBtn.disabled = false;
        }
    }
}
};

// Clean export - no merging, no IPTV conflicts
window.Settings = Settings;

// Enhanced SettingsIPTV functions with DATABASE PERSISTENCE
// REPLACE your existing SettingsIPTV object in settings.js with this:

window.SettingsIPTV = {
    async testPanelConnection() {
        console.log('🔧 Testing IPTV panel connection...');
        
        try {
            const statusText = document.getElementById('connectionStatusText');
            const statusIcon = document.getElementById('connectionStatusIcon');

            if (statusText) statusText.textContent = 'Testing connection...';
            if (statusIcon) statusIcon.textContent = '🔄';

            // Save current settings first
            const iptvSettings = {
                iptv_panel_base_url: document.getElementById('iptvPanelBaseUrl')?.value || '',
                iptv_panel_login_url: document.getElementById('iptvPanelLoginUrl')?.value || '',
                iptv_panel_username: document.getElementById('iptvPanelUsername')?.value || '',
                iptv_panel_password: document.getElementById('iptvPanelPassword')?.value || '',
                iptv_package_id_for_bouquets: document.getElementById('iptvPackageIdForBouquets')?.value || ''
            };

            if (Object.values(iptvSettings).some(value => value !== '')) {
                await API.Settings.update(iptvSettings);
            }

            // Test connection
            const response = await fetch('/api/iptv/test-connection', { method: 'POST' });
            const data = await response.json();

            if (data.success) {
                if (statusText) statusText.textContent = 'Connection successful!';
                if (statusIcon) statusIcon.textContent = '✅';
                Utils.showNotification('IPTV panel connection successful', 'success');
            } else {
                if (statusText) statusText.textContent = `Connection failed: ${data.message}`;
                if (statusIcon) statusIcon.textContent = '❌';
                Utils.showNotification('IPTV panel connection failed', 'error');
            }
        } catch (error) {
            console.error('❌ Connection test failed:', error);
            const statusText = document.getElementById('connectionStatusText');
            const statusIcon = document.getElementById('connectionStatusIcon');
            if (statusText) statusText.textContent = 'Connection test failed';
            if (statusIcon) statusIcon.textContent = '❌';
            Utils.showNotification('Connection test failed', 'error');
        } finally {
            const button = document.getElementById('testConnectionText');
            if (button) button.textContent = 'Test Connection';
        }
    },

async syncPackagesFromPanel() {
    try {
        Utils.showNotification('Syncing packages (trial + paid) from panel...', 'info');
        
        const response = await fetch('/api/iptv/sync-packages', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            const count = data.count || 0;
            const breakdown = data.breakdown || {};
            
            // Update the display immediately
            const countElement = document.getElementById('totalPackagesCount');
            if (countElement) {
                countElement.textContent = count;
            }
            
            // Update last sync time
            const syncTime = new Date().toLocaleString();
            const syncElement = document.getElementById('lastPackageSync');
            if (syncElement) {
                syncElement.textContent = syncTime;
            }
            
            // Update package breakdown display
            this.updatePackageBreakdownDisplay(breakdown, countElement);
            
            // SAVE TO DATABASE - packages count and sync time
            await API.Settings.update({
                'iptv_packages_count': count,
                'iptv_packages_last_sync': new Date().toISOString(),
                'iptv_trial_packages_count': breakdown.trial || 0
            });
            
            Utils.showNotification(`Successfully synced ${count} packages (${breakdown.trial || 0} trial, ${(breakdown.basic || 0) + (breakdown.full || 0) + (breakdown.live_tv || 0)} paid) from panel`, 'success');
        } else {
            Utils.showNotification(`Failed to sync packages: ${data.message}`, 'error');
        }
    } catch (error) {
        console.error('❌ Package sync failed:', error);
        Utils.showNotification('Package sync failed', 'error');
    }
},

/**
 * Update package breakdown display
 */
updatePackageBreakdownDisplay(breakdown, totalElement) {
    if (!totalElement) return;
    
    // Create or update breakdown tooltip/display
    const packageSection = totalElement.closest('div[style*="text-align: center"]');
    if (packageSection) {
        let breakdownElement = packageSection.querySelector('.package-breakdown');
        if (!breakdownElement) {
            breakdownElement = document.createElement('div');
            breakdownElement.className = 'package-breakdown';
            breakdownElement.style.cssText = `
                color: #64b5f6; 
                font-size: 0.75rem; 
                margin-top: 5px;
                text-align: center;
            `;
            totalElement.parentElement.appendChild(breakdownElement);
        }
        
        breakdownElement.innerHTML = `
            Trial: ${breakdown.trial || 0} | Basic: ${breakdown.basic || 0} | 
            Full: ${breakdown.full || 0} | Live TV: ${breakdown.live_tv || 0}
        `;
    }
},

    async syncBouquetsFromPanel() {
        try {
            Utils.showNotification('Syncing bouquets from panel...', 'info');
            
            const response = await fetch('/api/iptv/sync-bouquets', { method: 'POST' });
            const data = await response.json();
            
            if (data.success) {
                const count = data.count || 0;
                
                // Update the display immediately
                const countElement = document.getElementById('totalBouquetsCount');
                if (countElement) {
                    countElement.textContent = count;
                }
                
                // Update last sync time
                const syncTime = new Date().toLocaleString();
                const syncElement = document.getElementById('lastBouquetSync');
                if (syncElement) {
                    syncElement.textContent = syncTime;
                }
                
                // SAVE TO DATABASE - bouquets count and sync time
                await API.Settings.update({
                    'iptv_bouquets_count': count,
                    'iptv_bouquets_last_sync': new Date().toISOString()
                });
                
                Utils.showNotification(`Synced ${count} bouquets`, 'success');
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('Failed to sync bouquets:', error);
            Utils.showNotification('Failed to sync bouquets', 'error');
        }
    },

    async syncCreditsBalance() {
        try {
            Utils.showNotification('Syncing credit balance...', 'info');
            
            const response = await fetch('/api/iptv/sync-credits', { method: 'POST' });
            const data = await response.json();
            
            if (data.success) {
                const credits = data.credits || 0;
                
                // Update the display immediately
                const creditElement = document.getElementById('currentCreditBalance');
                if (creditElement) {
                    creditElement.textContent = credits;
                }
                
                // Update last sync time
                const syncTime = new Date().toLocaleString();
                const syncElement = document.getElementById('lastCreditSync');
                if (syncElement) {
                    syncElement.textContent = syncTime;
                }
                
                // SAVE TO DATABASE - credits are already saved by the API, but let's save sync time
                await API.Settings.update({
                    'iptv_credits_last_sync': new Date().toISOString()
                });
                
                Utils.showNotification(`Credit balance: ${credits}`, 'success');
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('Failed to sync credits:', error);
            Utils.showNotification('Failed to sync credits', 'error');
        }
    },

    // NEW: Load initial statistics from DATABASE when page loads
    async loadIPTVStatistics() {
        try {
            console.log('📊 Loading IPTV statistics from database...');
            
            // Load settings from database
            const settings = await API.Settings.getAll();
            
            // Load packages count from database
            if (settings.iptv_packages_count !== undefined) {
                const countElement = document.getElementById('totalPackagesCount');
                if (countElement) {
                    countElement.textContent = settings.iptv_packages_count || 0;
                }
                console.log(`📦 Loaded packages count from DB: ${settings.iptv_packages_count}`);
            }
            
            // Load packages last sync from database
            if (settings.iptv_packages_last_sync) {
                const syncElement = document.getElementById('lastPackageSync');
                if (syncElement) {
                    const syncDate = new Date(settings.iptv_packages_last_sync);
                    syncElement.textContent = syncDate.toLocaleString();
                }
            }
            
            // Load bouquets count from database
            if (settings.iptv_bouquets_count !== undefined) {
                const countElement = document.getElementById('totalBouquetsCount');
                if (countElement) {
                    countElement.textContent = settings.iptv_bouquets_count || 0;
                }
                console.log(`📺 Loaded bouquets count from DB: ${settings.iptv_bouquets_count}`);
            }
            
            // Load bouquets last sync from database
            if (settings.iptv_bouquets_last_sync) {
                const syncElement = document.getElementById('lastBouquetSync');
                if (syncElement) {
                    const syncDate = new Date(settings.iptv_bouquets_last_sync);
                    syncElement.textContent = syncDate.toLocaleString();
                }
            }
            
            // Load current credit balance from database (already handled in main settings)
            if (settings.iptv_credits_balance !== undefined) {
                const creditElement = document.getElementById('currentCreditBalance');
                if (creditElement) {
                    creditElement.textContent = settings.iptv_credits_balance || 0;
                }
                console.log(`💳 Loaded credits from DB: ${settings.iptv_credits_balance}`);
            }
            
            // Load credits last sync from database
            if (settings.iptv_credits_last_sync) {
                const syncElement = document.getElementById('lastCreditSync');
                if (syncElement) {
                    const syncDate = new Date(settings.iptv_credits_last_sync);
                    syncElement.textContent = syncDate.toLocaleString();
                }
            }
            
            console.log('✅ IPTV statistics loaded from database');
            
        } catch (error) {
            console.error('❌ Failed to load IPTV statistics from database:', error);
            
            // Set default values if loading fails
            const elements = [
                { id: 'totalPackagesCount', value: '-' },
                { id: 'totalBouquetsCount', value: '-' },
                { id: 'currentCreditBalance', value: '-' }
            ];
            
            elements.forEach(({ id, value }) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            });
        }
    },

    // Initialize IPTV statistics when settings page loads
    async initializeIPTVSection() {
        console.log('🚀 Initializing IPTV settings section...');
        
        // Load initial statistics from database
        await this.loadIPTVStatistics();
        
        console.log('✅ IPTV settings section initialized');
    }
};

// Add initialization function to main Settings object
Settings.initializeIPTVSection = async function() {
    if (typeof SettingsIPTV !== 'undefined' && SettingsIPTV.initializeIPTVSection) {
        await SettingsIPTV.initializeIPTVSection();
    }
};

// Auto-initialize when settings page loads
$(document).ready(function() {
    // Check if we're on the settings page
    if (window.location.hash === '#settings' || 
        window.location.pathname.includes('settings') || 
        document.querySelector('.settings-section')) {
        
        console.log('🔄 Settings page detected, initializing IPTV section...');
        
        // Small delay to ensure DOM is ready
        setTimeout(() => {
            if (typeof SettingsIPTV !== 'undefined') {
                SettingsIPTV.initializeIPTVSection();
            }
        }, 500);
    }
});

console.log('✅ Enhanced SettingsIPTV functions with database persistence loaded');


// Export settings functions for onclick handlers
window.addOwner = Settings.addOwner.bind(Settings);
window.saveSettings = Settings.saveAllSettings.bind(Settings);
window.testEmailConnection = Settings.testEmailConnection.bind(Settings);
window.showOwnerForm = Settings.showOwnerForm.bind(Settings);
window.hideOwnerForm = Settings.hideOwnerForm.bind(Settings);
window.saveOwner = Settings.saveOwner.bind(Settings);
window.showSubscriptionForm = Settings.showSubscriptionForm.bind(Settings);
window.hideSubscriptionForm = Settings.hideSubscriptionForm.bind(Settings);
window.saveSubscription = Settings.saveSubscription.bind(Settings);
window.syncAllPlexLibraries = Settings.syncAllPlexLibraries.bind(Settings);
window.sendTestEmail = Settings.sendTestEmail.bind(Settings);
window.testPlexConnection = Settings.testPlexConnection.bind(Settings);

console.log('✅ Settings.js loaded cleanly with fixed initialization and sorting');

// Export IPTV Editor functions for HTML onclick handlers
window.testIPTVEditorConnection = function() {
    return Settings.testIPTVEditorConnection();
};

window.syncIPTVEditorPlaylists = function() {
    return Settings.syncIPTVEditorPlaylists();
};

window.syncIPTVEditorCategories = function() {
    return Settings.syncIPTVEditorCategories();
};

// Automatically load IPTV Editor settings on page load if we're on the settings tab
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.hash.includes('settings')) {
        if (typeof Settings !== 'undefined' && Settings.loadIPTVEditorSettings) {
            Settings.loadIPTVEditorSettings();
        }
    }
});