// Subscription Management Functions
console.log('📋 Loading Subscriptions.js...');

window.Subscriptions = {
    currentSortField: 'name',
    currentSortDirection: 'asc',
    editingSubscriptionId: null,
    
    async init() {
        console.log('🔧 Initializing Subscriptions module...');
        await this.loadSubscriptions();
        this.setupEventListeners();
        this.updateStats();
        console.log('✅ Subscriptions module initialized');
    },
    
    setupEventListeners() {
        // Type change listener to show/hide streams field
        const typeSelect = document.getElementById('subscriptionType');
        if (typeSelect) {
            typeSelect.addEventListener('change', this.handleTypeChange.bind(this));
        }
    },
    
    handleTypeChange() {
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
    
    async loadSubscriptions() {
        try {
            console.log('📊 Loading subscriptions from API...');
            window.AppState.subscriptionTypes = await API.Subscription.getAll();
            console.log('📊 Subscriptions loaded:', window.AppState.subscriptionTypes.length);
            this.renderSubscriptionsTable();
        } catch (error) {
            console.error('❌ Error loading subscriptions:', error);
            Utils.handleError(error, 'Loading subscriptions');
        }
    },
    
    renderSubscriptionsTable() {
        const tbody = document.getElementById('subscriptionsTableBody');
        if (!tbody) {
            console.log('⚠️ Table body not found');
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
                    <button class="btn btn-small btn-edit" onclick="Subscriptions.editSubscription(${sub.id})">Edit</button>
                    <button class="btn btn-small btn-delete" onclick="Subscriptions.toggleSubscription(${sub.id})">
                        ${sub.active ? 'Deactivate' : 'Activate'}
                    </button>
                </td>
            </tr>
        `).join('');
        
        console.log('✅ Subscriptions table rendered');
    },
    
    updateStats() {
        const subscriptions = window.AppState.subscriptionTypes || [];
        
        // Update stat numbers
        const totalElement = document.getElementById('totalSubscriptions');
        const plexElement = document.getElementById('plexSubscriptions');
        const iptvElement = document.getElementById('iptvSubscriptions');
        const avgElement = document.getElementById('averagePrice');
        
        if (totalElement) totalElement.textContent = subscriptions.length;
        
        const plexSubs = subscriptions.filter(sub => sub.type === 'plex');
        const iptvSubs = subscriptions.filter(sub => sub.type === 'iptv');
        
        if (plexElement) plexElement.textContent = plexSubs.length;
        if (iptvElement) iptvElement.textContent = iptvSubs.length;
        
        // Calculate average price
        const activeSubs = subscriptions.filter(sub => sub.active);
        const avgPrice = activeSubs.length > 0 
            ? activeSubs.reduce((sum, sub) => sum + parseFloat(sub.price), 0) / activeSubs.length
            : 0;
        
        if (avgElement) avgElement.textContent = `$${avgPrice.toFixed(2)}`;
        
        console.log('📊 Stats updated:', {
            total: subscriptions.length,
            plex: plexSubs.length,
            iptv: iptvSubs.length,
            avgPrice: avgPrice
        });
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
    
    showCreateForm() {
        console.log('📝 Showing create form...');
        this.editingSubscriptionId = null;
        this.resetForm();
        
        const titleElement = document.getElementById('formTitle');
        const containerElement = document.getElementById('subscriptionFormContainer');
        
        if (titleElement) titleElement.textContent = 'Create Subscription Type';
        if (containerElement) {
            containerElement.style.display = 'block';
            containerElement.scrollIntoView({ behavior: 'smooth' });
        }
    },
    
    hideForm() {
        console.log('❌ Hiding form...');
        const containerElement = document.getElementById('subscriptionFormContainer');
        if (containerElement) {
            containerElement.style.display = 'none';
        }
        this.resetForm();
        this.editingSubscriptionId = null;
    },
    
    resetForm() {
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
            this.handleTypeChange();
            
            // Update form title and show
            const titleElement = document.getElementById('formTitle');
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
            
            console.log('💾 Form data:', formData);
            
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
            this.updateStats();
            this.hideForm();
            
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
            this.updateStats();
            
        } catch (error) {
            Utils.handleError(error, 'Updating subscription status');
        } finally {
            Utils.hideLoading();
        }
    }
};

// Make functions globally available for onclick handlers
window.activateAllSubscriptions = function() {
    if (window.Subscriptions && window.Subscriptions.activateAll) {
        return window.Subscriptions.activateAll();
    }
};

window.deactivateAllSubscriptions = function() {
    if (window.Subscriptions && window.Subscriptions.deactivateAll) {
        return window.Subscriptions.deactivateAll();
    }
};

console.log('✅ Subscriptions.js loaded successfully');