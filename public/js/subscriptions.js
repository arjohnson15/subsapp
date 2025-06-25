// Subscription Management Functions
console.log('📋 Loading Subscriptions.js...');

window.Subscriptions = {
    currentSortField: 'name',
    currentSortDirection: 'asc',
    editingSubscriptionId: null,
    
    async init() {
        await this.loadSubscriptions();
        this.setupEventListeners();
        this.updateStats();
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
            window.AppState.subscriptionTypes = await API.Subscription.getAll();
            this.renderSubscriptionsTable();
        } catch (error) {
            Utils.handleError(error, 'Loading subscriptions');
        }
    },
    
    renderSubscriptionsTable() {
        const tbody = document.getElementById('subscriptionsTableBody');
        if (!tbody) return;
        
        const subscriptions = window.AppState.subscriptionTypes;
        
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
                    <button class="btn btn-small btn-delete" onclick="Subscriptions.deleteSubscription(${sub.id})">
                        ${sub.active ? 'Deactivate' : 'Activate'}
                    </button>
                </td>
            </tr>
        `).join('');
    },
    
    updateStats() {
        const subscriptions = window.AppState.subscriptionTypes || [];
        
        // Update stat numbers
        document.getElementById('totalSubscriptions').textContent = subscriptions.length;
        
        const plexSubs = subscriptions.filter(sub => sub.type === 'plex');
        const iptvSubs = subscriptions.filter(sub => sub.type === 'iptv');
        
        document.getElementById('plexSubscriptions').textContent = plexSubs.length;
        document.getElementById('iptvSubscriptions').textContent = iptvSubs.length;
        
        // Calculate average price
        const activeSubs = subscriptions.filter(sub => sub.active);
        const avgPrice = activeSubs.length > 0 
            ? activeSubs.reduce((sum, sub) => sum + parseFloat(sub.price), 0) / activeSubs.length
            : 0;
        
        document.getElementById('averagePrice').textContent = `$${avgPrice.toFixed(2)}`;
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
        this.editingSubscriptionId = null;
        this.resetForm();
        
        document.getElementById('formTitle').textContent = 'Create Subscription Type';
        document.getElementById('subscriptionFormContainer').style.display = 'block';
        
        // Scroll to form
        document.getElementById('subscriptionFormContainer').scrollIntoView({ 
            behavior: 'smooth' 
        });
    },
    
    hideForm() {
        document.getElementById('subscriptionFormContainer').style.display = 'none';
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
            const subscription = window.AppState.subscriptionTypes.find(sub => sub.id === subscriptionId);
            if (!subscription) {
                Utils.showNotification('Subscription not found', 'error');
                return;
            }
            
            this.editingSubscriptionId = subscriptionId;
            
            // Populate form
            document.getElementById('subscriptionName').value = subscription.name;
            document.getElementById('subscriptionType').value = subscription.type;
            document.getElementById('subscriptionDuration').value = subscription.duration_months;
            document.getElementById('subscriptionPrice').value = subscription.price;
            document.getElementById('subscriptionStreams').value = subscription.streams || '';
            document.getElementById('subscriptionActive').checked = subscription.active;
            
            // Show streams field if IPTV
            this.handleTypeChange();
            
            // Update form title and show
            document.getElementById('formTitle').textContent = 'Edit Subscription Type';
            document.getElementById('subscriptionFormContainer').style.display = 'block';
            
            // Scroll to form
            document.getElementById('subscriptionFormContainer').scrollIntoView({ 
                behavior: 'smooth' 
            });
            
        } catch (error) {
            Utils.handleError(error, 'Loading subscription for editing');
        }
    },
    
    async saveSubscription(event) {
        event.preventDefault();
        
        try {
            Utils.showLoading();
            
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
            
            console.log('Saving subscription:', formData);
            
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
    
    async deleteSubscription(subscriptionId) {
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
    },
    
    // Bulk operations
    async activateAll() {
        if (!confirm('Activate all subscription types?')) return;
        
        try {
            Utils.showLoading();
            
            const subscriptions = window.AppState.subscriptionTypes;
            const inactiveSubscriptions = subscriptions.filter(sub => !sub.active);
            
            for (const sub of inactiveSubscriptions) {
                await API.Subscription.update(sub.id, { ...sub, active: true });
            }
            
            Utils.showNotification(`Activated ${inactiveSubscriptions.length} subscription types`, 'success');
            
            await this.loadSubscriptions();
            this.updateStats();
            
        } catch (error) {
            Utils.handleError(error, 'Bulk activating subscriptions');
        } finally {
            Utils.hideLoading();
        }
    },
    
    async deactivateAll() {
        if (!confirm('Deactivate all subscription types? This will prevent new users from selecting them.')) return;
        
        try {
            Utils.showLoading();
            
            const subscriptions = window.AppState.subscriptionTypes;
            const activeSubscriptions = subscriptions.filter(sub => sub.active);
            
            for (const sub of activeSubscriptions) {
                await API.Subscription.update(sub.id, { ...sub, active: false });
            }
            
            Utils.showNotification(`Deactivated ${activeSubscriptions.length} subscription types`, 'success');
            
            await this.loadSubscriptions();
            this.updateStats();
            
        } catch (error) {
            Utils.handleError(error, 'Bulk deactivating subscriptions');
        } finally {
            Utils.hideLoading();
        }
    }
};

// Make functions globally available for onclick handlers
window.activateAllSubscriptions = window.Subscriptions.activateAll.bind(window.Subscriptions);
window.deactivateAllSubscriptions = window.Subscriptions.deactivateAll.bind(window.Subscriptions);

console.log('📋 Subscriptions.js loaded successfully');