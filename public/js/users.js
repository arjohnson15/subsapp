// Enhanced User Management Functions with Background Task System and Fixed Baseline Updates
console.log('👥 Loading Users.js...');

window.Users = {
    currentSortField: 'name',
    currentSortDirection: 'asc',
    backgroundTasks: new Map(), // Track background tasks
    originalLibraryBaseline: null, // Track original library state for change detection
    originalTagsBaseline: null, // Track original tags for comparison
    
    async init() {
        await this.loadUsers();
        this.setupEventListeners();
        this.startBackgroundTaskMonitor();
    },
    
    setupEventListeners() {
        // Setup search with debounce
        const searchInput = document.getElementById('userSearch');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce(this.filterUsers.bind(this), 300));
        }
    },
	
    populateOwnerFilter(users) {
        const ownerFilter = document.getElementById('ownerFilter');
        if (!ownerFilter) return;
        
        // Get unique owners
        const owners = [...new Set(users
            .filter(user => user.owner_name)
            .map(user => ({ id: user.owner_id, name: user.owner_name }))
        )];
        
        // Clear existing options except "All Owners"
        ownerFilter.innerHTML = '<option value="">All Owners</option>';
        
        // Add owner options
        owners.forEach(owner => {
            const option = document.createElement('option');
            option.value = owner.id;
            option.textContent = owner.name;
            ownerFilter.appendChild(option);
        });
    },
    
    // Background task monitoring system
    startBackgroundTaskMonitor() {
        // Check for completed background tasks every 2 seconds
        setInterval(() => {
            this.checkBackgroundTasks();
        }, 2000);
        
        console.log('🔄 Background task monitor started');
    },
    
    async checkBackgroundTasks() {
        for (const [taskId, task] of this.backgroundTasks.entries()) {
            // Check if task has a result (completed in background) - NO API CALLS
            if (task.result) {
                if (task.result.status === 'completed') {
                    this.handleTaskCompletion(taskId, task, task.result);
                } else if (task.result.status === 'failed') {
                    this.handleTaskFailure(taskId, task, task.result);
                }
                
                this.backgroundTasks.delete(taskId);
                this.hideBackgroundTaskIndicator();
            }
            // If no result yet, keep monitoring (tasks update themselves)
        }
    },
    
    // FIXED: Updated handleTaskCompletion with baseline update
    handleTaskCompletion(taskId, task, result) {
        console.log(`✅ Background task completed: ${taskId}`, result);
        
        // Show success notification with details
        let message = `${task.description} completed successfully!`;
        
        if (result.data && result.data.success) {
            message = 'Background job completed: Plex access updated successfully';
        }
        
        Utils.showNotification(message, 'success');
        
        // Hide any loading indicators
        Utils.hideLoading();
        
        // CRITICAL FIX: Update user baselines after successful Plex operations
        if (task.type === 'plex_update' && result.data && result.data.success) {
            this.updateUserBaselinesAfterPlexOperation(task.data);
        }
        
        // Refresh users list if it was a user operation
        if (task.type === 'plex_update') {
            this.loadUsers();
        }
    },
    
    handleTaskFailure(taskId, task, result) {
        console.error(`❌ Background task failed: ${taskId}`, result);
        
        let message = `${task.description} failed: ${result.error || 'Unknown error'}`;
        Utils.showNotification(message, 'error');
        
        Utils.hideLoading();
    },
    
    // NEW: Update user baselines after successful Plex operations
    async updateUserBaselinesAfterPlexOperation(taskData) {
        try {
            console.log('🔄 Updating user baselines after successful Plex operation...');
            
            if (!taskData || !taskData.userEmail) {
                console.log('⚠️ No task data available for baseline update');
                return;
            }
            
            // Find the user by email to get their current state from database
            const users = window.AppState.users || [];
            const user = users.find(u => u.plex_email === taskData.userEmail);
            
            if (!user) {
                console.log('⚠️ User not found for baseline update');
                return;
            }
            
            // CRITICAL: If this user is currently being edited, update their baselines
            if (window.AppState.editingUserId && 
                window.AppState.editingUserId == user.id && 
                window.AppState.currentUserData) {
                
                console.log(`📋 Updating baselines for currently edited user: ${user.name}`);
                
                // Update the current user data with fresh info from database
                const freshUserData = await API.User.getById(user.id);
                window.AppState.currentUserData = freshUserData;
                
                // Update baselines to reflect the NEW current state after Plex operations
                this.originalLibraryBaseline = this.deepClone(freshUserData.plex_libraries || {});
                this.originalTagsBaseline = [...(freshUserData.tags || [])];
                
                console.log('✅ Updated library baseline:', this.originalLibraryBaseline);
                console.log('✅ Updated tags baseline:', this.originalTagsBaseline);
                
            } else {
                console.log('💡 User not currently being edited - no baseline update needed');
            }
            
        } catch (error) {
            console.error('❌ Error updating user baselines:', error);
            // Don't throw - this is not critical enough to break the flow
        }
    },
    
    // NEW: Reload user data with fresh baselines for editing
    async reloadUserDataForEditing(userId) {
        try {
            console.log(`🔄 Reloading fresh user data for editing user ${userId}...`);
            
            // Always get fresh data from database
            const freshUser = await API.User.getById(userId);
            
            // Update global state
            window.AppState.currentUserData = freshUser;
            
            // Set NEW baselines based on current database state
            this.originalLibraryBaseline = this.deepClone(freshUser.plex_libraries || {});
            this.originalTagsBaseline = [...(freshUser.tags || [])];
            
            console.log('✅ Fresh baselines set:', {
                libraries: this.originalLibraryBaseline,
                tags: this.originalTagsBaseline
            });
            
            return freshUser;
            
        } catch (error) {
            console.error('❌ Error reloading user data:', error);
            throw error;
        }
    },
    
    createBackgroundTask(type, description, data = {}) {
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this.backgroundTasks.set(taskId, {
            id: taskId,
            type: type,
            description: description,
            data: data,
            startTime: new Date()
        });
        
        console.log(`🚀 Created background task: ${taskId} - ${description}`);
        return taskId;
    },
    
    async loadUsers() {
        try {
            console.log('🔄 Loading users...');
            const users = await API.User.getAll();
            window.AppState.users = users;
            window.AppState.allUsers = users; // Store for filtering
            
            // Populate owner filter dropdown
            this.populateOwnerFilter(users);
            
            // Initial render
            this.renderUsersTable();
            
            console.log(`✅ Loaded ${users.length} users`);
        } catch (error) {
            console.error('❌ Error loading users:', error);
            Utils.handleError(error, 'Loading users');
        }
    },
    
async renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    const users = window.AppState.users;
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No users found</td></tr>';
        return;
    }

    // PERFORMANCE FIX: Always use basic rendering - no API calls
    console.log('📋 Rendering users table (super fast mode)...');
    this.renderUsersTableBasic();
},


renderUsersTableBasic() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    const users = window.AppState.users;

    tbody.innerHTML = users.map(user => `
        <tr data-user-id="${user.id}">
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td>${user.owner_name || 'N/A'}</td>
            <td class="tags-cell">
                ${user.tags && user.tags.length > 0 ? 
                    user.tags.map(tag => `<span class="tag tag-${tag.toLowerCase().replace(' ', '')}">${tag}</span>`).join('') : ''}
                ${this.renderPlexStatus(user)}
            </td>
            <td style="color: ${user.plex_expiration === 'FREE' ? '#4fc3f7' : (user.plex_expiration ? Utils.isDateExpired(user.plex_expiration) ? '#f44336' : '#4caf50' : '#666')}">
                ${user.plex_expiration === 'FREE' ? 'FREE' : (user.plex_expiration ? Utils.formatDate(user.plex_expiration) : '')}
            </td>
            <td style="color: ${user.iptv_expiration === 'FREE' ? '#4fc3f7' : (user.iptv_expiration ? Utils.isDateExpired(user.iptv_expiration) ? '#f44336' : '#4caf50' : '#666')}">
                ${user.iptv_expiration === 'FREE' ? 'FREE' : (user.iptv_expiration ? Utils.formatDate(user.iptv_expiration) : '')}
            </td>
            <td>
                <button class="btn btn-small btn-view" onclick="Users.viewUser(${user.id})">View</button>
                <button class="btn btn-small btn-edit" onclick="Users.editUser(${user.id})">Edit</button>
                <button class="btn btn-small btn-email" onclick="Users.emailUser('${user.name}', '${user.email}')">Email</button>
                <button class="btn btn-small btn-delete" onclick="Users.deleteUser(${user.id})">Delete</button>
            </td>
        </tr>
    `).join('');
    
    console.log(`✅ Basic users table rendered with ${users.length} users`);
},

    
    filterUsers() {
        const searchTerm = document.getElementById('userSearch')?.value.toLowerCase() || '';
        const ownerFilter = document.getElementById('ownerFilter')?.value || '';
        const tagFilter = document.getElementById('tagFilter')?.value || '';
        
        console.log('🔍 Filtering users:', { searchTerm, ownerFilter, tagFilter });
        
        if (!window.AppState.allUsers) {
            console.warn('No users data available for filtering');
            return;
        }
        
        const filteredUsers = window.AppState.allUsers.filter(user => {
            // Search filter (name or email)
            const matchesSearch = !searchTerm || 
                user.name.toLowerCase().includes(searchTerm) ||
                user.email.toLowerCase().includes(searchTerm);
            
            // Owner filter
            const matchesOwner = !ownerFilter || 
                (user.owner_id && user.owner_id.toString() === ownerFilter);
            
            // Tag filter
            const matchesTag = !tagFilter || 
                (user.tags && Array.isArray(user.tags) && user.tags.includes(tagFilter));
            
            return matchesSearch && matchesOwner && matchesTag;
        });
        
        console.log(`📊 Filtered ${filteredUsers.length} out of ${window.AppState.allUsers.length} users`);
        
        // Temporarily update displayed users for rendering
        const originalUsers = window.AppState.users;
        window.AppState.users = filteredUsers;
        this.renderUsersTable();
        window.AppState.users = originalUsers; // Restore original for other functions
    },
    
    sortUsers(field) {
        if (this.currentSortField === field) {
            this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSortField = field;
            this.currentSortDirection = 'asc';
        }
        
        window.AppState.users = Utils.sortArray(
            window.AppState.users, 
            field, 
            this.currentSortDirection
        );
        
        // Update sort indicators
        this.updateSortIndicators(field, this.currentSortDirection);
        
        this.renderUsersTable();
    },

    // Update visual sort indicators in table headers
     updateSortIndicators(activeField, direction) {
        // Reset all sort indicators
        const sortableFields = ['name', 'email', 'owner_name', 'plex_expiration', 'iptv_expiration'];
        
        sortableFields.forEach(field => {
            const indicator = document.getElementById(`sort-${field}`);
            if (indicator) {
                if (field === activeField) {
                    indicator.textContent = direction === 'asc' ? '▲' : '▼';
                    indicator.style.color = '#4fc3f7'; // Highlight active sort
                } else {
                    indicator.textContent = '▼';
                    indicator.style.color = '#666'; // Dim inactive sorts
                }
            }
        });
    },
    
    async viewUser(userId) {
        try {
            const user = await API.User.getById(userId);
            this.showUserModal(user);
        } catch (error) {
            Utils.handleError(error, 'Loading user details');
        }
    },
    
// Enhanced user modal with better invite status and library access display
showUserModal(user) {
    const userDetailsDiv = document.getElementById('userDetails');
    if (!userDetailsDiv) return;
    
    // Check if user has pending invites
    const hasPendingInvites = this.userHasPendingInvites(user);
    const inviteStatusHtml = this.showDetailedInviteStatus(user);
    
    userDetailsDiv.innerHTML = `
        <div class="info-item"><div class="info-label">Name</div><div class="info-value">${user.name}</div></div>
        <div class="info-item"><div class="info-label">Email</div><div class="info-value">${user.email}</div></div>
        <div class="info-item"><div class="info-label">Owner</div><div class="info-value">${user.owner_name || 'N/A'}</div></div>
        <div class="info-item"><div class="info-label">Tags</div><div class="info-value">${user.tags ? user.tags.join(', ') : 'None'}</div></div>
        <div class="info-item"><div class="info-label">Plex Email</div><div class="info-value">${user.plex_email || 'N/A'}</div></div>
        
        ${hasPendingInvites ? `
        <div class="info-item invite-status-warning">
            <div class="info-label"><i class="fas fa-exclamation-triangle"></i> Invite Status</div>
            <div class="info-value">${inviteStatusHtml}</div>
        </div>
        ` : ''}
        
        <div class="info-item"><div class="info-label">IPTV Username</div><div class="info-value">${user.iptv_username || 'N/A'}</div></div>
        <div class="info-item"><div class="info-label">iMPlayer Code</div><div class="info-value">${user.implayer_code || 'N/A'}</div></div>
        <div class="info-item"><div class="info-label">Device Count</div><div class="info-value">${user.device_count || 'N/A'}</div></div>
    `;
    
    // Show enhanced library access display
    this.displayEnhancedLibraryAccess(user);
    
    document.getElementById('viewUserModal').classList.add('active');
},

// NEW: Enhanced library access display that shows both stored access AND pending status
displayEnhancedLibraryAccess(user) {
    const accessDiv = document.getElementById('userLibraryAccess');
    
    if (!user.plex_email) {
        accessDiv.innerHTML = '<p>No Plex email configured</p>';
        return;
    }
    
    const hasPendingInvites = this.userHasPendingInvites(user);
    const pendingInvites = user.pending_plex_invites || {};
    
    if (!user.plex_libraries || Object.keys(user.plex_libraries).length === 0) {
        if (hasPendingInvites) {
            accessDiv.innerHTML = `
                <div class="invite-warning">
                    <i class="fas fa-clock"></i>
                    <div>
                        <strong>Pending Setup:</strong> User has pending invites but no library access configured yet.
                        <br><small>Configure library access after user accepts invites.</small>
                    </div>
                </div>
            `;
        } else {
            accessDiv.innerHTML = '<p>No Plex access configured</p>';
        }
        return;
    }
    
    let accessHtml = '';
    
    if (hasPendingInvites) {
        accessHtml += `
            <div class="invite-warning" style="margin-bottom: 15px;">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <strong>Pending Invites:</strong> User must accept Plex invites before library access will work.
                    <br><small>Library configuration below will take effect once invites are accepted.</small>
                </div>
            </div>
        `;
    }
    
    for (const [serverGroup, serverAccess] of Object.entries(user.plex_libraries)) {
        const serverPending = pendingInvites[serverGroup] || null;
        const hasPendingForServer = serverPending && Object.keys(serverPending).length > 0;
        
        accessHtml += `<div class="library-group">
            <h5>${serverGroup.toUpperCase()} 
                ${hasPendingForServer ? 
                    `<span style="color: #ff9800; font-size: 0.8em;">⏳ Pending</span>` : 
                    `<span style="color: #4caf50; font-size: 0.8em;">✓ Active</span>`
                }
            </h5>
            <div class="library-list">`;
        
        if (serverAccess.regular && serverAccess.regular.length > 0) {
            accessHtml += `<div><strong>Regular Libraries:</strong> ${serverAccess.regular.length} libraries configured</div>`;
        }
        
        if (serverAccess.fourk && serverAccess.fourk.length > 0) {
            accessHtml += `<div><strong>4K Libraries:</strong> ${serverAccess.fourk.length} libraries configured</div>`;
        }
        
        if ((!serverAccess.regular || serverAccess.regular.length === 0) && 
            (!serverAccess.fourk || serverAccess.fourk.length === 0)) {
            accessHtml += `<div style="color: #9e9e9e;">No libraries configured</div>`;
        }
        
        if (hasPendingForServer) {
            const pendingServers = Object.keys(serverPending);
            accessHtml += `<div style="color: #ff9800; font-size: 0.9em; margin-top: 5px;">
                <i class="fas fa-clock"></i> Pending: ${pendingServers.join(', ')}
            </div>`;
        }
        
        accessHtml += `</div></div>`;
    }
    
    accessDiv.innerHTML = accessHtml || '<p>No library access found</p>';
},
	
	// NEW METHOD - Add this right here, after showUserModal()
	displayStoredLibraryAccess(user) {
    const accessDiv = document.getElementById('userLibraryAccess');
    
    if (!user.plex_email) {
        accessDiv.innerHTML = '<p>No Plex email configured</p>';
        return;
    }
    
    if (!user.plex_libraries || Object.keys(user.plex_libraries).length === 0) {
        accessDiv.innerHTML = '<p>No Plex access configured</p>';
        return;
    }
    
    let accessHtml = '';
    
    for (const [serverGroup, serverAccess] of Object.entries(user.plex_libraries)) {
        accessHtml += `<div class="library-group">
            <h5>${serverGroup.toUpperCase()}</h5>
            <div class="library-list">`;
        
        if (serverAccess.regular && serverAccess.regular.length > 0) {
            accessHtml += `<div>Regular Libraries: ${serverAccess.regular.length} libraries</div>`;
        }
        
        if (serverAccess.fourk && serverAccess.fourk.length > 0) {
            accessHtml += `<div>4K Libraries: ${serverAccess.fourk.length} libraries</div>`;
        }
        
        if ((!serverAccess.regular || serverAccess.regular.length === 0) && 
            (!serverAccess.fourk || serverAccess.fourk.length === 0)) {
            accessHtml += `<div>No access</div>`;
        }
        
        accessHtml += `</div></div>`;
    }
    
    accessDiv.innerHTML = accessHtml || '<p>No library access found</p>';
},
    
    
    // UPDATED: Use new baseline reloader for editing - FIXED function references
    async editUser(userId) {
        try {
            console.log(`📝 Starting edit for user ID: ${userId}`);
            
            // Set editing state
            window.AppState.editingUserId = userId;
            
            // Use our new baseline reloader
            const user = await this.reloadUserDataForEditing(userId);
            
            // Navigate to user form - FIXED: Use window.showPage
            await window.showPage('user-form');
            
            // Wait for page to fully load, then populate - FIXED: Use window.populateFormForEditing
            setTimeout(() => {
                console.log(`🔧 Populating form for editing user: ${user.name}`);
                window.populateFormForEditing(user);
            }, 1200);
            
        } catch (error) {
            Utils.handleError(error, 'Loading user for editing');
        }
    },
    
    emailUser(userName, userEmail) {
        // FIXED: Use window.showPage
        window.showPage('email');
        setTimeout(() => {
            const recipientField = document.getElementById('emailRecipient');
            const subjectField = document.getElementById('emailSubject');
            
            if (recipientField) recipientField.value = userEmail;
            if (subjectField) subjectField.value = `Message for ${userName}`;
        }, 100);
    },
    
    async deleteUser(userId) {
        if (!confirm('Are you sure you want to delete this user?')) return;
        
        try {
            await API.User.delete(userId);
            await this.loadUsers();
            Utils.showNotification('User deleted successfully', 'success');
        } catch (error) {
            Utils.handleError(error, 'Deleting user');
        }
    },
	
// Enhanced Plex status rendering with better pending invite indicators
renderPlexStatus(user) {
    console.log(`🔍 Checking pending status for ${user.name}:`, user.pending_plex_invites);
    
    const pendingInvites = user.pending_plex_invites || null;
    
    // Show indicator if user has pending invites - MORE PROMINENT
    if (pendingInvites && Object.keys(pendingInvites).length > 0) {
        const serverGroups = Object.keys(pendingInvites);
        const serversText = serverGroups.map(sg => sg.toUpperCase()).join(', ');
        
        // Count total pending invites
        let totalPending = 0;
        Object.values(pendingInvites).forEach(serverGroup => {
            totalPending += Object.keys(serverGroup).length;
        });
        
        return `<br><span class="pending-invite-indicator" title="User must accept ${totalPending} pending invite(s) before library access will work">
            ⏳ PENDING: ${serversText} (${totalPending} invite${totalPending > 1 ? 's' : ''})
        </span>`;
    }
    
    // Return empty string if no pending invites
    return '';
},

// NEW: Enhanced function to show detailed invite status in user modal
showDetailedInviteStatus(user) {
    const pendingInvites = user.pending_plex_invites || null;
    
    if (!pendingInvites || Object.keys(pendingInvites).length === 0) {
        return '<div style="color: #4caf50;"><i class="fas fa-check-circle"></i> No pending invites</div>';
    }
    
    let statusHtml = '<div class="invite-status-warning">';
    statusHtml += '<div style="color: #ff9800; font-weight: bold; margin-bottom: 8px;"><i class="fas fa-exclamation-triangle"></i> Pending Invites Detected</div>';
    
    for (const [serverGroup, servers] of Object.entries(pendingInvites)) {
        const serverNames = Object.keys(servers);
        statusHtml += `<div style="margin-bottom: 4px;">`;
        statusHtml += `<strong>${serverGroup.toUpperCase()}:</strong> ${serverNames.join(', ')}`;
        statusHtml += `</div>`;
    }
    
    statusHtml += '<div style="font-size: 0.9em; color: #ffb74d; margin-top: 8px;">';
    statusHtml += 'User must accept these invites in their Plex app before library access will work.';
    statusHtml += '</div>';
    statusHtml += '</div>';
    
    return statusHtml;
},

// NEW: Check if user has any pending invites (utility function)
userHasPendingInvites(user) {
    const pendingInvites = user.pending_plex_invites || null;
    return pendingInvites && Object.keys(pendingInvites).length > 0;
},
    
    // Enhanced saveUser function with smart change detection and baseline management
    async saveUser(event) {
        event.preventDefault();
        console.log('🎯 Form submission triggered - starting save process');
        
        try {
            console.log('💾 Starting optimized user save with smart change detection...');
            
            // Collect form data properly
            const formData = new FormData(event.target);
            const userData = {};

            // Collect text inputs
            userData.name = formData.get('name');
            userData.email = formData.get('email');
            userData.owner_id = formData.get('owner_id') || null;
            userData.plex_email = formData.get('plex_email');
            userData.iptv_username = formData.get('iptv_username');
            userData.iptv_password = formData.get('iptv_password');
            userData.implayer_code = formData.get('implayer_code');
            userData.device_count = parseInt(formData.get('device_count')) || 1;
            userData.bcc_owner_renewal = document.getElementById('bccOwnerRenewal')?.checked || false;

            // Collect checked tags
            userData.tags = [];
            document.querySelectorAll('input[name="tags"]:checked').forEach(checkbox => {
                userData.tags.push(checkbox.value);
            });

            // Collect current Plex library selections
            const currentPlexLibraries = this.collectPlexLibrarySelections();
            userData.plex_libraries = currentPlexLibraries;
            
            // CRITICAL: Collect subscription data
            const plexSubscription = document.getElementById('plexSubscription')?.value;
            const plexExpiration = document.getElementById('plexExpiration')?.value;
            const iptvSubscription = document.getElementById('iptvSubscription')?.value;
            const iptvExpiration = document.getElementById('iptvExpiration')?.value;
            
            // FIXED: Handle Plex subscription with proper "remove" case
            console.log('🔍 Raw subscription values:', {
                plexSubscription, plexExpiration, iptvSubscription, iptvExpiration
            });

            if (plexSubscription === 'free') {
                userData.plex_subscription = 'free';
                userData.plex_expiration = null;
                userData.plex_is_free = true;
            } else if (plexSubscription === 'remove') {
                // FIXED: Properly handle remove case
                userData.plex_subscription = 'remove';
                userData.plex_expiration = null;
                userData.plex_is_free = false;
            } else if (plexSubscription && plexSubscription !== '') {
                // Paid subscription
                userData.plex_subscription = parseInt(plexSubscription);
                userData.plex_expiration = plexExpiration || null;
                userData.plex_is_free = false;
            } else {
                // Keep current (no change)
                userData.plex_subscription = null;
                userData.plex_expiration = null;
                userData.plex_is_free = false;
            }

            // FIXED: Handle IPTV subscription with proper "remove" case
            if (iptvSubscription === 'remove') {
                // FIXED: Properly handle remove case
                userData.iptv_subscription = 'remove';
                userData.iptv_expiration = null;
                userData.iptv_is_free = false;
            } else if (iptvSubscription && iptvSubscription !== '') {
                // Paid subscription
                userData.iptv_subscription = parseInt(iptvSubscription);
                userData.iptv_expiration = iptvExpiration || null;
                userData.iptv_is_free = false;
            } else {
                // Keep current (no change)
                userData.iptv_subscription = null;
                userData.iptv_expiration = null;
                userData.iptv_is_free = false;
            }

            console.log('🔍 Processed subscription data:', {
                plex_subscription: userData.plex_subscription,
                plex_expiration: userData.plex_expiration,
                iptv_subscription: userData.iptv_subscription,
                iptv_expiration: userData.iptv_expiration
            });
            
            console.log('🔍 Current form data with subscriptions:', userData);
            
            // FIXED CHANGE DETECTION - Only trigger Plex updates for actual Plex changes
            let shouldUpdatePlexAccess = false;
            const isEditing = window.AppState?.editingUserId;
            
            console.log('🔍 Change detection debug:', {
                isEditing: isEditing,
                hasOriginalLibraryBaseline: !!this.originalLibraryBaseline,
                hasOriginalTagsBaseline: !!this.originalTagsBaseline,
                currentPlexLibraries: currentPlexLibraries,
                originalLibraryBaseline: this.originalLibraryBaseline
            });
            
            if (isEditing && this.originalLibraryBaseline && this.originalTagsBaseline) {
                // Use stored baseline for comparison
                const originalUserData = window.AppState.currentUserData || {};
                
                // Check ONLY library-related changes that require API calls
                const normalizedCurrent = this.normalizeLibrariesForComparison(currentPlexLibraries);
                const normalizedOriginal = this.normalizeLibrariesForComparison(this.originalLibraryBaseline);
                const librarySelectionsChanged = !this.deepEqual(normalizedCurrent, normalizedOriginal);

                // Check if Plex email changed
                const plexEmailChanged = userData.plex_email !== (originalUserData.plex_email || '');
                
                // Check if Plex tags changed (Plex 1, Plex 2) - only compare RELEVANT tags
                const currentPlexTags = userData.tags.filter(tag => tag === 'Plex 1' || tag === 'Plex 2').sort();
                const originalPlexTags = this.originalTagsBaseline.filter(tag => tag === 'Plex 1' || tag === 'Plex 2').sort();
                const plexTagsChanged = !this.deepEqual(currentPlexTags, originalPlexTags);
                
                console.log('🔍 Detailed change analysis:', {
                    librarySelectionsChanged: librarySelectionsChanged,
                    plexEmailChanged: plexEmailChanged,
                    plexTagsChanged: plexTagsChanged,
                    normalizedCurrent: normalizedCurrent,
                    normalizedOriginal: normalizedOriginal,
                    currentPlexTags: currentPlexTags,
                    originalPlexTags: originalPlexTags
                });
                
                // Only trigger API calls for actual Plex access changes
                if (librarySelectionsChanged || plexEmailChanged || plexTagsChanged) {
                    console.log('🔄 Plex access changes detected - API calls needed:');
                    if (librarySelectionsChanged) {
                        console.log('   - Library selections changed');
                    }
                    if (plexEmailChanged) {
                        console.log('   - Plex email changed:', {from: originalUserData.plex_email, to: userData.plex_email});
                    }
                    if (plexTagsChanged) {
                        console.log('   - Plex tags changed:', {from: originalPlexTags, to: currentPlexTags});
                    }
                    shouldUpdatePlexAccess = true;
                } else {
                    console.log('✅ NO Plex access changes detected - SKIPPING all API calls');
                    shouldUpdatePlexAccess = false;
                }
                
                // Tell backend NOT to process tags automatically 
                userData._skipTagProcessing = true;
            } else if (isEditing) {
                // If we don't have baselines, something went wrong - don't make API calls
                console.log('⚠️ Missing baselines for editing user - skipping Plex API calls');
                shouldUpdatePlexAccess = false;
                userData._skipTagProcessing = true;
            } else {
                // New user - check if they have Plex access to share
                const hasPlexTags = userData.tags.some(tag => tag === 'Plex 1' || tag === 'Plex 2');
                const hasPlexLibraries = Object.keys(currentPlexLibraries).length > 0;
                shouldUpdatePlexAccess = hasPlexTags && hasPlexLibraries && userData.plex_email;
                console.log('👤 New user - will update Plex access:', shouldUpdatePlexAccess);
            }
            
            const method = isEditing ? 'PUT' : 'POST';
            const endpoint = isEditing ? `/users/${window.AppState.editingUserId}` : '/users';
            
            // Save user data to database FIRST
            console.log('💾 Saving user to database...');
            await API.call(endpoint, {
                method,
                body: JSON.stringify(userData)
            });
            
            // Show immediate success message
            Utils.showNotification(isEditing ? 'User updated successfully' : 'User created successfully', 'success');

            // Clear baselines after successful save
            if (isEditing) {
                this.originalLibraryBaseline = null;
                this.originalTagsBaseline = null;
            }

            // CRITICAL: Navigate away IMMEDIATELY after database save - before Plex operations
            console.log('🚀 Navigating back to users page immediately...');
            setTimeout(async () => {
                // FIXED: Use window.showPage
                await window.showPage('users');
                await this.loadUsers();
            }, 100);
            
            // Handle Plex operations in background ONLY if needed
            if (shouldUpdatePlexAccess && userData.plex_email) {
                // Create background task
                const taskId = this.createBackgroundTask(
                    'plex_update',
                    `Updating Plex access for ${userData.name}`,
                    { userEmail: userData.plex_email, plexLibraries: userData.plex_libraries }
                );
                
                // Show background task notification
                this.showBackgroundTaskIndicator('Background job started: Updating Plex access...');
                Utils.showNotification('Background job started: Updating Plex access', 'info');
                
                // Process in background
                this.processPlexLibrariesInBackground(taskId, userData.plex_email, userData.plex_libraries, !isEditing);
                
            } else if (!shouldUpdatePlexAccess && isEditing) {
                console.log('⏭️ Skipping Plex API calls - no Plex access changes detected');
            }
            
        } catch (error) {
            console.error('Error saving user:', error);
            Utils.handleError(error, 'Saving user');
        }
    },

    // Background task processing for Plex operations
    async processPlexLibrariesInBackground(taskId, userEmail, plexLibraries, isNewUser) {
        try {
            console.log(`🔄 Background task ${taskId}: Processing Plex libraries...`);
            
            const result = await this.sharePlexLibrariesWithUser(userEmail, plexLibraries);
            
            // Store result for the task monitor to pick up
            await this.storeBackgroundTaskResult(taskId, {
                status: 'completed',
                data: result,
                error: null
            });
            
            console.log(`✅ Background task ${taskId}: Completed`, result);
            
        } catch (error) {
            console.error(`❌ Background task ${taskId}: Failed`, error);
            
            await this.storeBackgroundTaskResult(taskId, {
                status: 'failed',
                error: error.message,
                data: null
            });
        }
    },

    // Store background task result (in memory for now, could be database later)
    async storeBackgroundTaskResult(taskId, result) {
        // For now, just update the task in memory
        const task = this.backgroundTasks.get(taskId);
        if (task) {
            task.result = result;
            task.completedAt = new Date();
        }
        
        // In a real system, you'd store this in database or Redis
        // For now, the checkBackgroundTasks will find it in memory
    },

    // Show a non-blocking background task indicator
    showBackgroundTaskIndicator(message) {
        // Create a small, unobtrusive indicator
        const indicator = document.createElement('div');
        indicator.id = 'backgroundTaskIndicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(45deg, #2196f3, #03a9f4);
            color: white;
            padding: 10px 15px;
            border-radius: 8px;
            font-size: 0.9rem;
            z-index: 1000;
            box-shadow: 0 4px 15px rgba(33, 150, 243, 0.3);
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        
        indicator.innerHTML = `
            <div style="
                width: 16px;
                height: 16px;
                border: 2px solid rgba(255,255,255,0.3);
                border-top: 2px solid white;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            "></div>
            ${message}
        `;
        
        // Add spinner animation if not already present
        if (!document.getElementById('spinnerStyle')) {
            const style = document.createElement('style');
            style.id = 'spinnerStyle';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Remove any existing indicator
        const existing = document.getElementById('backgroundTaskIndicator');
        if (existing) existing.remove();
        
        // Add new indicator
        document.body.appendChild(indicator);
        
        // Auto-remove after 60 seconds if task doesn't complete
        setTimeout(() => {
            const stillThere = document.getElementById('backgroundTaskIndicator');
            if (stillThere) stillThere.remove();
        }, 60000);
    },

    // Hide background task indicator
    hideBackgroundTaskIndicator() {
        const indicator = document.getElementById('backgroundTaskIndicator');
        if (indicator) indicator.remove();
    },

    async sharePlexLibrariesWithUser(userEmail, plexLibraries) {
        try {
            console.log('🤝 Sharing Plex libraries with user:', userEmail, plexLibraries);
            
            const result = await API.call('/plex/share-user-libraries', {
                method: 'POST',
                body: JSON.stringify({
                    userEmail: userEmail,
                    plexLibraries: plexLibraries
                })
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to share Plex libraries');
            }
            
            console.log('✅ Plex libraries shared successfully');
            return result;
            
        } catch (error) {
            console.error('❌ Error sharing Plex libraries:', error);
            throw error;
        }
    },
    
// OPTIMIZED: Check invite status and display appropriate indicators
// This method now uses caching to avoid duplicate API calls
async checkAndDisplayInviteStatus(userEmail, plexTags) {
    try {
        // Use cache to avoid duplicate calls for the same user
        const cacheKey = `invite_status_${userEmail}`;
        const cached = this.inviteStatusCache?.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < 30000) { // 30 second cache
            console.log(`📋 Using cached invite status for ${userEmail}`);
            plexTags.forEach(serverGroup => {
                this.displayInviteStatusForServer(serverGroup, cached.data, userEmail);
            });
            return;
        }
        
        console.log(`🔍 Checking invite status for ${userEmail} on servers:`, plexTags);
        
        const response = await API.call(`/plex/invite-status/${encodeURIComponent(userEmail)}`);
        
        if (response.success) {
            // Cache the result
            if (!this.inviteStatusCache) {
                this.inviteStatusCache = new Map();
            }
            this.inviteStatusCache.set(cacheKey, {
                data: response,
                timestamp: Date.now()
            });
            
            // Clean old cache entries (keep cache size reasonable)
            if (this.inviteStatusCache.size > 20) {
                const oldestKey = this.inviteStatusCache.keys().next().value;
                this.inviteStatusCache.delete(oldestKey);
            }
            
            // Display invite status for each server group
            plexTags.forEach(serverGroup => {
                this.displayInviteStatusForServer(serverGroup, response, userEmail);
            });
        } else {
            console.warn(`⚠️ Could not check invite status:`, response.error);
        }
        
    } catch (error) {
        console.error('❌ Error checking invite status:', error);
    }
},


// FIXED: Display invite status indicator - PENDING INVITES ALWAYS WIN
displayInviteStatusForServer(serverGroup, inviteResponse, userEmail) {
    const serverData = inviteResponse.servers?.[serverGroup];
    if (!serverData) return;
    
    const statusContainer = document.getElementById(`${serverGroup}Status`);
    if (!statusContainer) return;
    
    let hasPendingInvites = false;
    let hasAccess = false;
    const pendingServers = [];
    const accessServers = [];
    
    // Check both regular and 4K servers
    for (const [serverType, serverInfo] of Object.entries(serverData)) {
        if (serverInfo.status === 'pending') {
            hasPendingInvites = true;
            pendingServers.push(serverType);
        } else if (serverInfo.status === 'accepted') {
            hasAccess = true;
            accessServers.push(serverType);
        }
    }
    
    let statusHtml = '';
    
    // PRIORITY 1: ALWAYS show pending invites first - this is what you care about!
    if (hasPendingInvites) {
        statusHtml = `
            <div style="color: #ff9800; display: flex; flex-direction: column; gap: 4px;">
                <div style="display: flex; align-items: center; gap: 8px; font-weight: bold;">
                    <i class="fas fa-clock" style="color: #ff9800;"></i>
                    <span>PENDING INVITES</span>
                </div>
                <div style="font-size: 0.9em; color: #ffb74d;">
                    User must accept: ${pendingServers.join(', ')}
                </div>
                ${hasAccess ? `<div style="font-size: 0.8em; color: #81c784;">✓ Has access: ${accessServers.join(', ')}</div>` : ''}
            </div>
        `;
        
        // Add warning to library sections
        this.addInviteWarningToLibraries(serverGroup, pendingServers);
        
    } else if (hasAccess) {
        // PRIORITY 2: Only show access if NO pending invites
        statusHtml = `
            <div style="color: #4caf50; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-check-circle" style="color: #4caf50;"></i>
                <span>Access Granted</span>
                <small style="color: #81c784;">(${accessServers.join(', ')})</small>
            </div>
        `;
    } else {
        // PRIORITY 3: No access at all
        statusHtml = `
            <div style="color: #9e9e9e; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-user-slash" style="color: #9e9e9e;"></i>
                <span>No Access</span>
            </div>
        `;
    }
    
    statusContainer.innerHTML = statusHtml;
    
    console.log(`📊 ${serverGroup} status: pending=${hasPendingInvites}, access=${hasAccess}`);
},

    // Add warning message to library sections when user has pending invites
    addInviteWarningToLibraries(serverGroup, pendingServers) {
        const libraryGroup = document.getElementById(`${serverGroup}LibraryGroup`);
        if (!libraryGroup) return;
        
        // Remove existing warning
        const existingWarning = libraryGroup.querySelector('.invite-warning');
        if (existingWarning) existingWarning.remove();
        
        // Add new warning
        const warningDiv = document.createElement('div');
        warningDiv.className = 'invite-warning';
        warningDiv.style.cssText = `
            background: linear-gradient(45deg, #ff9800, #ffb74d);
            color: white;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            font-size: 0.9rem;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: pulse 2s infinite;
        `;
        warningDiv.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <span>User has pending invites on ${pendingServers.join(', ')} server${pendingServers.length > 1 ? 's' : ''}. Library access cannot be updated until invite is accepted.</span>
        `;
        
        // Insert after the status container
        const statusContainer = document.getElementById(`${serverGroup}Status`);
        if (statusContainer && statusContainer.parentNode) {
            statusContainer.parentNode.insertBefore(warningDiv, statusContainer.nextSibling);
        }
    },
	
	// Enhanced displayInviteStatusForServer to show more detailed status
    displayInviteStatusForServer(serverGroup, inviteResponse, userEmail) {
        const serverData = inviteResponse.servers?.[serverGroup];
        if (!serverData) return;
        
        const statusContainer = document.getElementById(`${serverGroup}Status`);
        if (!statusContainer) return;
        
        let hasPendingInvites = false;
        let hasAccess = false;
        let hasPartialAccess = false;
        const pendingServers = [];
        const accessServers = [];
        
        // Check both regular and 4K servers
        for (const [serverType, serverInfo] of Object.entries(serverData)) {
            if (serverInfo.status === 'pending') {
                hasPendingInvites = true;
                pendingServers.push(serverType);
            } else if (serverInfo.status === 'accepted') {
                hasAccess = true;
                accessServers.push(serverType);
            }
        }
        
        // Determine if user has partial access (some servers accepted, some pending)
        hasPartialAccess = hasAccess && hasPendingInvites;
        
        // Create enhanced status indicator
        let statusHtml = '';
        let statusClass = 'connection-status';
        
        if (hasPartialAccess) {
            statusHtml = `
                <div class="${statusClass}" style="color: #ff9800; display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-exclamation-triangle" style="color: #ff9800;"></i>
                        <span>Partial Access</span>
                    </div>
                    <div style="font-size: 0.8em; color: #ffb74d;">
                        ✓ Access: ${accessServers.join(', ')}
                    </div>
                    <div style="font-size: 0.8em; color: #ff9800;">
                        ⏳ Pending: ${pendingServers.join(', ')}
                    </div>
                </div>
            `;
            
            // Add warning to library sections
            this.addInviteWarningToLibrariesEnhanced(serverGroup, pendingServers, 'partial');
            
        } else if (hasPendingInvites) {
            statusHtml = `
                <div class="${statusClass}" style="color: #ff9800; display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-clock" style="color: #ff9800;"></i>
                        <span>Pending Invite Acceptance</span>
                    </div>
                    <div style="font-size: 0.8em; color: #ffb74d;">
                        User needs to accept invites for: ${pendingServers.join(', ')}
                    </div>
                </div>
            `;
            
            // Add warning to library sections
            this.addInviteWarningToLibrariesEnhanced(serverGroup, pendingServers, 'full_pending');
            
        } else if (hasAccess) {
            statusHtml = `
                <div class="${statusClass}" style="color: #4caf50; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-check-circle" style="color: #4caf50;"></i>
                    <span>Access Granted</span>
                    <small style="color: #81c784;">(${accessServers.join(', ')})</small>
                </div>
            `;
        } else {
            statusHtml = `
                <div class="${statusClass}" style="color: #9e9e9e; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-user-slash" style="color: #9e9e9e;"></i>
                    <span>No Access</span>
                </div>
            `;
        }
        
        statusContainer.innerHTML = statusHtml;
        
        console.log(`📊 ${serverGroup} status: pending=${hasPendingInvites}, access=${hasAccess}, partial=${hasPartialAccess}`);
    },

    // Enhanced warning message for library sections with different types
    addInviteWarningToLibrariesEnhanced(serverGroup, pendingServers, warningType = 'full_pending') {
        const libraryGroup = document.getElementById(`${serverGroup}LibraryGroup`);
        if (!libraryGroup) return;
        
        // Remove existing warning
        const existingWarning = libraryGroup.querySelector('.invite-warning');
        if (existingWarning) existingWarning.remove();
        
        // Create appropriate warning based on type
        const warningDiv = document.createElement('div');
        warningDiv.className = 'invite-warning';
        
        let warningContent = '';
        let backgroundColor = '';
        
        if (warningType === 'partial') {
            backgroundColor = 'linear-gradient(45deg, #ff9800, #ffb74d)';
            warningContent = `
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <strong>Partial Access:</strong> User has pending invites to Plex.
                    <br><small>Library changes will only affect servers where user has accepted invites.</small>
                </div>
            `;
        } else {
            backgroundColor = 'linear-gradient(45deg, #f44336, #ff6b6b)';
            warningContent = `
                <i class="fas fa-clock"></i>
                <div>
                    <strong>Pending Invites:</strong> User must accept invite from Plex before library access will work.
                    <br><small>Library selections below will take effect once invites are accepted.</small>
                </div>
            `;
        }
        
        warningDiv.style.cssText = `
            background: ${backgroundColor};
            color: white;
            padding: 12px;
            border-radius: 6px;
            margin: 10px 0;
            font-size: 0.9rem;
            display: flex;
            align-items: flex-start;
            gap: 10px;
            animation: pulse 2s infinite;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
        warningDiv.innerHTML = warningContent;
        
        // Insert warning at the top of the library group
        libraryGroup.insertBefore(warningDiv, libraryGroup.firstChild);
    },

    // Enhanced remove all Plex access for current user
    async removePlexAccess() {
        const userId = window.AppState.editingUserId;
        const userData = window.AppState.currentUserData;
        
        if (!userId || !userData) {
            Utils.showNotification('No user selected for Plex removal', 'error');
            return;
        }
        
        const confirmMessage = `Are you sure you want to COMPLETELY REMOVE all Plex access for ${userData.name}?\n\nThis will:\n- Cancel any pending invites\n- Remove them from all Plex servers\n- Clear all library access\n- Remove Plex tags from user\n- Clear Plex email\n- Remove Plex subscriptions\n\nThis action cannot be undone!`;
        
        if (!confirm(confirmMessage)) return;
        
        try {
            Utils.showLoading();
            console.log(`🗑️ Removing all Plex access for user ID: ${userId}`);
            
            const result = await API.call(`/users/${userId}/remove-plex-access`, {
                method: 'POST'
            });
            
            if (result.success) {
                const summary = result.summary;
                Utils.showNotification(
                    `Complete Plex removal successful for ${userData.name}! ` +
                    `${summary.invitesCancelled} invites cancelled, ` +
                    `${summary.usersRemoved} users removed, ` +
                    `${summary.removedTags.length} tags removed.`,
                    'success'
                );
                
                // Update the form to reflect changes
                this.refreshFormAfterPlexRemoval(result);
                
                // Reload user data
                await this.loadUsers();
            } else {
                Utils.showNotification('Failed to remove Plex access: ' + (result.error || 'Unknown error'), 'error');
            }
            
        } catch (error) {
            console.error('❌ Error removing Plex access:', error);
            Utils.handleError(error, 'Removing Plex access');
        } finally {
            Utils.hideLoading();
        }
    },

    // Remove user from specific Plex server group
    async removePlexServerAccess(serverGroup) {
        const userId = window.AppState.editingUserId;
        const userData = window.AppState.currentUserData;
        
        if (!userId || !userData) {
            Utils.showNotification('No user selected for Plex removal', 'error');
            return;
        }
        
        const confirmMessage = `Remove ${userData.name} from ${serverGroup.toUpperCase()}?\n\nThis will:\n- Cancel any pending invites on ${serverGroup}\n- Remove them from ${serverGroup} servers\n- Clear ${serverGroup} library access\n- Remove ${serverGroup} tag if no other access\n\nThis action cannot be undone!`;
        
        if (!confirm(confirmMessage)) return;
        
        try {
            Utils.showLoading();
            console.log(`🗑️ Removing ${serverGroup} access for user ID: ${userId}`);
            
            const userEmail = userData.plex_email || userData.email;
            if (!userEmail) {
                Utils.showNotification('User has no email configured for Plex removal', 'error');
                return;
            }
            
            // Remove from specific server group using enhanced removal
            const result = await API.call('/plex/remove-access-enhanced', {
                method: 'POST',
                body: JSON.stringify({
                    userEmail: userEmail,
                    serverGroups: [serverGroup]
                })
            });
            
            if (result.success) {
                const summary = result.summary;
                Utils.showNotification(
                    `${serverGroup.toUpperCase()} removal successful! ` +
                    `${summary.invites_cancelled} invites cancelled, ` +
                    `${summary.users_removed} users removed.`,
                    'success'
                );
                
                // Clear the relevant checkboxes
                this.clearServerGroupCheckboxes(serverGroup);
                
                // Update status
                const statusContainer = document.getElementById(`${serverGroup}Status`);
                if (statusContainer) {
                    statusContainer.innerHTML = '<span class="connection-status" style="color: #9e9e9e;">Access Removed</span>';
                }
                
                // Reload user data to reflect changes
                await this.loadUsers();
            } else {
                Utils.showNotification('Failed to remove access: ' + (result.error || 'Unknown error'), 'error');
            }
            
        } catch (error) {
            console.error('❌ Error removing server group access:', error);
            Utils.handleError(error, 'Removing server group access');
        } finally {
            Utils.hideLoading();
        }
    },

    // Clear checkboxes for a specific server group
    clearServerGroupCheckboxes(serverGroup) {
        // Clear regular library checkboxes
        const regularCheckboxes = document.querySelectorAll(`input[name="${serverGroup}_regular"]`);
        regularCheckboxes.forEach(checkbox => checkbox.checked = false);
        
        // Clear 4K library checkboxes
        const fourkCheckboxes = document.querySelectorAll(`input[name="${serverGroup}_fourk"]`);
        fourkCheckboxes.forEach(checkbox => checkbox.checked = false);
        
        // Uncheck the tag
        const tagCheckbox = document.querySelector(`input[name="tags"][value="Plex ${serverGroup === 'plex1' ? '1' : '2'}"]`);
        if (tagCheckbox) tagCheckbox.checked = false;
        
        console.log(`🧹 Cleared ${serverGroup} checkboxes`);
    },

    // Refresh form after complete Plex removal
    refreshFormAfterPlexRemoval(result) {
        // Clear Plex email
        const plexEmailField = document.getElementById('plexEmail');
        if (plexEmailField) plexEmailField.value = '';
        
        // Clear all Plex tags
        const plexTags = ['Plex 1', 'Plex 2'];
        plexTags.forEach(tag => {
            const checkbox = document.querySelector(`input[name="tags"][value="${tag}"]`);
            if (checkbox) checkbox.checked = false;
        });
        
        // Clear all library checkboxes
        this.clearServerGroupCheckboxes('plex1');
        this.clearServerGroupCheckboxes('plex2');
        
        // Hide library sections
        const plex1Group = document.getElementById('plex1LibraryGroup');
        const plex2Group = document.getElementById('plex2LibraryGroup');
        if (plex1Group) plex1Group.style.display = 'none';
        if (plex2Group) plex2Group.style.display = 'none';
        
        console.log(`🔄 Form refreshed after Plex removal`);
    },
    
    // Update form after specific server removal
    refreshFormAfterServerRemoval(serverGroup) {
        // Uncheck specific tag
        const tag = document.getElementById(`tag-${serverGroup}`);
        if (tag) {
            tag.checked = false;
            // FIXED: Use window.togglePlexLibrariesByTag
            if (window.togglePlexLibrariesByTag) {
                window.togglePlexLibrariesByTag(serverGroup, false);
            }
        }
        
        // Check if user still has any Plex access
        const plex1Tag = document.getElementById('tag-plex1');
        const plex2Tag = document.getElementById('tag-plex2');
        const hasAnyPlexAccess = (plex1Tag && plex1Tag.checked) || (plex2Tag && plex2Tag.checked);
        
        // Hide management section if no Plex access
        const managementSection = document.getElementById('plexAccessManagement');
        if (managementSection && !hasAnyPlexAccess) {
            managementSection.style.display = 'none';
        }
        
        console.log(`✅ Form updated after ${serverGroup} removal`);
    },
    
    // Reset form state
    resetFormState() {
        window.AppState.editingUserId = null;
        window.AppState.currentUserData = null;
        this.originalLibraryBaseline = null; // Clear baseline
        this.originalTagsBaseline = null; // Clear tags baseline too
    },
	
    deepClone(obj) {
        if (!obj) return obj;
        return JSON.parse(JSON.stringify(obj));
    },
    
    deepEqual(obj1, obj2) {
        if (obj1 === obj2) return true;
        
        if (!obj1 || !obj2) return obj1 === obj2;
        
        if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
            return obj1 === obj2;
        }
        
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);
        
        if (keys1.length !== keys2.length) return false;
        
        for (let key of keys1) {
            if (!keys2.includes(key)) return false;
            
            if (Array.isArray(obj1[key]) && Array.isArray(obj2[key])) {
                // Compare arrays
                if (obj1[key].length !== obj2.length) return false;
                const sorted1 = [...obj1[key]].sort();
                const sorted2 = [...obj2[key]].sort();
                for (let i = 0; i < sorted1.length; i++) {
                    if (sorted1[i] !== sorted2[i]) return false;
                }
            } else if (!this.deepEqual(obj1[key], obj2[key])) {
                return false;
            }
        }
        
        return true;
    },
	
    // Normalize library objects for comparison - ensures consistent sorting
    normalizeLibrariesForComparison(libraries) {
        if (!libraries) return {};
        const normalized = {};
        for (const [serverGroup, access] of Object.entries(libraries)) {
            if (access) {
                normalized[serverGroup] = {
                    regular: (access.regular || []).slice().sort(),
                    fourk: (access.fourk || []).slice().sort()
                };
            }
        }
        return normalized;
    },

    // Enhanced collectPlexLibrarySelections function that only includes selected libraries and sorts arrays
    collectPlexLibrarySelections() {
        const plexLibraries = {};
        
        // Check if Plex 1 tag is selected AND get its libraries
        if (document.getElementById('tag-plex1')?.checked) {
            const regularChecked = Array.from(document.querySelectorAll('input[name="plex1_regular"]:checked')).map(cb => cb.value);
            const fourkChecked = Array.from(document.querySelectorAll('input[name="plex1_fourk"]:checked')).map(cb => cb.value);
            
            // Only add if there are actually selected libraries
            if (regularChecked.length > 0 || fourkChecked.length > 0) {
                plexLibraries.plex1 = {
                    regular: regularChecked.sort(), // CRITICAL: Sort to ensure consistent comparison
                    fourk: fourkChecked.sort()      // CRITICAL: Sort to ensure consistent comparison
                };
            }
        }
        
        // Check if Plex 2 tag is selected AND get its libraries
        if (document.getElementById('tag-plex2')?.checked) {
            const regularChecked = Array.from(document.querySelectorAll('input[name="plex2_regular"]:checked')).map(cb => cb.value);
            const fourkChecked = Array.from(document.querySelectorAll('input[name="plex2_fourk"]:checked')).map(cb => cb.value);
            
            // Only add if there are actually selected libraries
            if (regularChecked.length > 0 || fourkChecked.length > 0) {
                plexLibraries.plex2 = {
                    regular: regularChecked.sort(), // CRITICAL: Sort to ensure consistent comparison
                    fourk: fourkChecked.sort()      // CRITICAL: Sort to ensure consistent comparison
                };
            }
        }
        
        console.log('📋 Collected library selections (sorted):', plexLibraries);
        return plexLibraries;
    },
	
    // Check if any Plex libraries are selected
    hasPlexLibrariesSelected(plexLibraries) {
        return Object.values(plexLibraries).some(group => 
            (group.regular && group.regular.length > 0) || 
            (group.fourk && group.fourk.length > 0)
        );
    },
	
    // DEBUG: Test user's current Plex access
    async debugUserAccess(userEmail) {
        try {
            console.log(`🐛 Debug: Testing access for ${userEmail}`);
            
            const debugResult = await API.call(`/plex/debug/user/${encodeURIComponent(userEmail)}`);
            console.log('🐛 Debug result:', debugResult);
            
            Utils.showNotification(
                `Debug complete for ${userEmail}. Check console for detailed results.`,
                'info'
            );
            
            return debugResult;
        } catch (error) {
            console.error('❌ Debug failed:', error);
            Utils.handleError(error, 'Debug user access');
        }
    }
};

// Override the global showUserForm function to fix new user pre-population
window.showUserForm = function() {
    console.log('🆕 Creating NEW user - clearing all state...');
    
    // CRITICAL: Clear editing state completely
    window.AppState.editingUserId = null;
    window.AppState.currentUserData = null;
    
    // Clear baselines for new user
    if (window.Users) {
        window.Users.originalLibraryBaseline = null;
        window.Users.originalTagsBaseline = null;
        // Reset the Users module editing state as well
        window.Users.resetFormState();
    }
    
    // FIXED: Use window.showPage
    window.showPage('user-form');
    
    // Wait for page load, then ensure completely clean form
    setTimeout(() => {
        console.log('🧹 Initializing clean form for new user...');
        
        // Reset the entire form
        const form = document.getElementById('userFormData');
        if (form) {
            form.reset();
        }
        
        // Explicitly clear all input fields
        const inputFields = [
            'userName', 'userEmail', 'userOwner', 'plexEmail',
            'iptvUsername', 'iptvPassword', 'implayerCode', 
            'plexSubscription', 'plexExpiration', 'iptvSubscription', 'iptvExpiration'
        ];
        
        inputFields.forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) {
                element.value = '';
            }
        });
        
        // Reset device count to default
        const deviceCount = document.getElementById('deviceCount');
        if (deviceCount) deviceCount.value = '1';
        
        // Clear ALL checkboxes - this is crucial
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
        
        // Clear all tag checkboxes specifically
        document.querySelectorAll('input[name="tags"]').forEach(cb => {
            cb.checked = false;
        });
        
        // Hide library sections
        const plex1Group = document.getElementById('plex1LibraryGroup');
        const plex2Group = document.getElementById('plex2LibraryGroup');
        const managementSection = document.getElementById('plexAccessManagement');
        
        if (plex1Group) plex1Group.style.display = 'none';
        if (plex2Group) plex2Group.style.display = 'none';
        if (managementSection) managementSection.style.display = 'none';
        
        // Clear any library selections
        ['plex1', 'plex2'].forEach(serverGroup => {
            document.querySelectorAll(`input[name="${serverGroup}_regular"]`).forEach(cb => cb.checked = false);
            document.querySelectorAll(`input[name="${serverGroup}_fourk"]`).forEach(cb => cb.checked = false);
        });
        
        // Clear any select elements
        document.querySelectorAll('select').forEach(select => {
            if (select.id !== 'userOwner') { // Keep owner dropdown as is
                select.selectedIndex = 0;
            }
        });
        
        console.log('✅ Clean form initialized for new user');
    }, 700);
};

// Enhanced form population function - MOVED TO GLOBAL SCOPE AND MADE ASYNC
window.populateFormForEditing = async function(user) {
    console.log(`📝 Populating form with user data:`, user);
    
    // Fill basic fields
    const fieldMappings = {
        'userName': user.name,
        'userEmail': user.email,
        'userOwner': user.owner_id || '',
        'plexEmail': user.plex_email || '',
        'iptvUsername': user.iptv_username || '',
        'iptvPassword': user.iptv_password || '',
        'implayerCode': user.implayer_code || '',
        'deviceCount': user.device_count || '1'
    };
    
    Object.keys(fieldMappings).forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element) {
            element.value = fieldMappings[fieldId];
            console.log(`📝 Set ${fieldId} = ${fieldMappings[fieldId]}`);
        }
    });
    
    // Handle BCC checkbox
    const bccCheckbox = document.getElementById('bccOwnerRenewal');
    if (bccCheckbox) {
        bccCheckbox.checked = user.bcc_owner_renewal || false;
    }
    
    // Clear all tags first, then set user's tags
    console.log(`🏷️ Setting tags:`, user.tags);
    document.querySelectorAll('input[name="tags"]').forEach(cb => cb.checked = false);
    
    // Show Plex Access Management section if user has Plex access
    const managementSection = document.getElementById('plexAccessManagement');
    const hasPlexAccess = user.tags && user.tags.some(tag => 
        String(tag).toLowerCase().includes('plex')
    );
    
    if (managementSection) {
        managementSection.style.display = hasPlexAccess ? 'block' : 'none';
    }
    
    const plexTags = []; // Track Plex tags for invite status check
    if (user.tags && Array.isArray(user.tags)) {
        user.tags.forEach(tag => {
            const checkbox = document.querySelector(`input[name="tags"][value="${tag}"]`);
            if (checkbox) {
                checkbox.checked = true;
                
                // Show library sections for Plex tags
                if (tag === 'Plex 1') {
                    plexTags.push('plex1');
                    window.showPlexLibrariesAndPreSelect('plex1', user);
                }
                if (tag === 'Plex 2') {
                    plexTags.push('plex2');
                    window.showPlexLibrariesAndPreSelect('plex2', user);
                }
            }
        });
    }
    
    // If user has Plex tags, check invite status and show appropriate indicators
    if (plexTags.length > 0 && user.plex_email && window.Users) {
        await window.Users.checkAndDisplayInviteStatus(user.plex_email, plexTags);
    }
    
    console.log(`✅ Form population completed for ${user.name}`);
};

// Show Plex libraries and pre-select user's current access - FIXED MODULE REFERENCE
window.showPlexLibrariesAndPreSelect = function(serverGroup, user) {
    console.log(`📚 Showing ${serverGroup} libraries for editing...`);
    
    const libraryGroup = document.getElementById(`${serverGroup}LibraryGroup`);
    if (libraryGroup) {
        libraryGroup.style.display = 'block';
        
        // Load libraries first, then pre-select with multiple attempts
        // FIXED: Call the function directly instead of through window.Plex
        if (window.loadPlexLibrariesForGroup) {
            window.loadPlexLibrariesForGroup(serverGroup).then(() => {
                // Multiple attempts at different intervals to ensure checkboxes are rendered
                setTimeout(() => {
                    console.log(`🎯 First pre-selection attempt for ${serverGroup}`);
                    window.preSelectUserLibraries(serverGroup, user);
                }, 500);
                
                setTimeout(() => {
                    console.log(`🎯 Second pre-selection attempt for ${serverGroup}`);
                    window.preSelectUserLibraries(serverGroup, user);
                }, 1200);
                
                setTimeout(() => {
                    console.log(`🎯 Final pre-selection attempt for ${serverGroup}`);
                    window.preSelectUserLibraries(serverGroup, user);
                }, 2500);
                
            }).catch(error => {
                console.error(`Error loading libraries for ${serverGroup}:`, error);
            });
        } else {
            console.error(`loadPlexLibrariesForGroup function not found`);
            // Try the app.js version instead
            if (window.loadPlexLibrariesForGroup) {
                window.loadPlexLibrariesForGroup(serverGroup);
            }
            
            // Still try pre-selection in case libraries are already loaded
            setTimeout(() => {
                window.preSelectUserLibraries(serverGroup, user);
            }, 500);
        }
        
        // Test connection if function exists
        if (window.testPlexConnectionQuiet) {
            window.testPlexConnectionQuiet(serverGroup);
        }
    }
};

// Pre-select user's current library access - COMPLETE ENHANCED VERSION
window.preSelectUserLibraries = function(serverGroup, user = null) {
    console.log(`🔧 Pre-selecting libraries for ${serverGroup}...`);
    
    // Get user data - prefer passed parameter, fall back to global state
    let currentUserData = user;
    if (!currentUserData && window.AppState && window.AppState.currentUserData) {
        currentUserData = window.AppState.currentUserData;
    }
    
    if (!currentUserData) {
        console.log('❌ No user data available for pre-selection');
        return;
    }
    
    if (!currentUserData.plex_libraries || !currentUserData.plex_libraries[serverGroup]) {
        console.log(`ℹ️ No library data for ${serverGroup}`);
        return;
    }
    
    const userLibraries = currentUserData.plex_libraries[serverGroup];
    let selectedCount = 0;
    let notFoundCount = 0;
    
    console.log(`📋 User libraries for ${serverGroup}:`, userLibraries);
    
    // Helper function to extract library ID from various formats
    const extractLibraryId = (lib) => {
        if (typeof lib === 'object' && lib !== null) {
            // Try multiple property names that could contain the ID
            return lib.id || lib.key || lib.ratingKey || lib.libraryId || lib.value || lib.library_id || lib.sectionId;
        }
        return lib; // Assume it's already a string/number ID
    };
    
    // Helper function to find checkbox by ID
    const findCheckbox = (serverGroup, type, libId) => {
        // Try multiple selector methods
        let checkbox = document.querySelector(`input[name="${serverGroup}_${type}"][value="${libId}"]`);
        
        if (!checkbox) {
            checkbox = document.getElementById(`${serverGroup}_${type}_${libId}`);
        }
        
        if (!checkbox) {
            // Try with string conversion
            checkbox = document.querySelector(`input[name="${serverGroup}_${type}"][value="${String(libId)}"]`);
        }
        
        return checkbox;
    };
    
    // Pre-select regular libraries
    if (userLibraries.regular && Array.isArray(userLibraries.regular)) {
        console.log(`🔄 Processing ${userLibraries.regular.length} regular libraries...`);
        
        userLibraries.regular.forEach((lib, index) => {
            const libId = extractLibraryId(lib);
            
            if (!libId) {
                console.log(`⚠️ Could not extract ID from regular library at index ${index}:`, lib);
                notFoundCount++;
                return;
            }
            
            console.log(`🔍 Looking for regular library checkbox with ID: ${libId} (type: ${typeof libId})`);
            
            const checkbox = findCheckbox(serverGroup, 'regular', libId);
            
            if (checkbox) {
                checkbox.checked = true;
                selectedCount++;
                console.log(`✅ Pre-selected regular library: ${libId}`);
            } else {
                notFoundCount++;
                console.log(`❌ Regular library checkbox NOT FOUND for ID: ${libId}`);
                
                // Debug: show what checkboxes are actually available
                const allRegularBoxes = document.querySelectorAll(`input[name="${serverGroup}_regular"]`);
                console.log(`🔍 Available regular checkboxes for ${serverGroup}:`, 
                    Array.from(allRegularBoxes).map(cb => ({
                        value: cb.value, 
                        id: cb.id,
                        type: typeof cb.value
                    }))
                );
            }
        });
    }
    
    // Pre-select 4K libraries
    if (userLibraries.fourk && Array.isArray(userLibraries.fourk)) {
        console.log(`🔄 Processing ${userLibraries.fourk.length} 4K libraries...`);
        
        userLibraries.fourk.forEach((lib, index) => {
            const libId = extractLibraryId(lib);
            
            if (!libId) {
                console.log(`⚠️ Could not extract ID from 4K library at index ${index}:`, lib);
                notFoundCount++;
                return;
            }
            
            console.log(`🔍 Looking for 4K library checkbox with ID: ${libId} (type: ${typeof libId})`);
            
            const checkbox = findCheckbox(serverGroup, 'fourk', libId);
            
            if (checkbox) {
                checkbox.checked = true;
                selectedCount++;
                console.log(`✅ Pre-selected 4K library: ${libId}`);
            } else {
                notFoundCount++;
                console.log(`❌ 4K library checkbox NOT FOUND for ID: ${libId}`);
                
                // Debug: show what checkboxes are actually available
                const allFourkBoxes = document.querySelectorAll(`input[name="${serverGroup}_fourk"]`);
                console.log(`🔍 Available 4K checkboxes for ${serverGroup}:`, 
                    Array.from(allFourkBoxes).map(cb => ({
                        value: cb.value, 
                        id: cb.id,
                        type: typeof cb.value
                    }))
                );
            }
        });
    }
    
    console.log(`📊 Pre-selection completed for ${serverGroup}: ${selectedCount} selected, ${notFoundCount} not found`);
    
    // If some checkboxes weren't found, try again after DOM settles
    if (notFoundCount > 0) {
        console.log(`🔄 ${notFoundCount} checkboxes not found, retrying in 1 second...`);
        setTimeout(() => {
            retryPreSelection(serverGroup, userLibraries, extractLibraryId, findCheckbox);
        }, 1000);
    }
    
    // If still having issues after initial attempt, try one more time with longer delay
    if (notFoundCount > 0) {
        setTimeout(() => {
            retryPreSelection(serverGroup, userLibraries, extractLibraryId, findCheckbox);
        }, 3000);
    }
};

// Helper function for retry logic
function retryPreSelection(serverGroup, userLibraries, extractLibraryId, findCheckbox) {
    console.log(`🔄 RETRY: Attempting pre-selection again for ${serverGroup}...`);
    let retrySelected = 0;
    
    // Retry regular libraries
    if (userLibraries.regular && Array.isArray(userLibraries.regular)) {
        userLibraries.regular.forEach(lib => {
            const libId = extractLibraryId(lib);
            if (!libId) return;
            
            const checkbox = findCheckbox(serverGroup, 'regular', libId);
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                retrySelected++;
                console.log(`🔄 RETRY SUCCESS: Pre-selected regular library: ${libId}`);
            }
        });
    }
    
    // Retry 4K libraries
    if (userLibraries.fourk && Array.isArray(userLibraries.fourk)) {
        userLibraries.fourk.forEach(lib => {
            const libId = extractLibraryId(lib);
            if (!libId) return;
            
            const checkbox = findCheckbox(serverGroup, 'fourk', libId);
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                retrySelected++;
                console.log(`🔄 RETRY SUCCESS: Pre-selected 4K library: ${libId}`);
            }
        });
    }
    
    console.log(`🔄 Retry completed for ${serverGroup}: ${retrySelected} additional libraries selected`);
    
    // Final debug if still having issues
    if (retrySelected === 0) {
        console.log(`⚠️ RETRY FAILED: Still unable to select libraries for ${serverGroup}`);
        console.log(`🔍 Final debug - checking DOM state...`);
        
        // Show current state of DOM
        const regularBoxes = document.querySelectorAll(`input[name="${serverGroup}_regular"]`);
        const fourkBoxes = document.querySelectorAll(`input[name="${serverGroup}_fourk"]`);
        
        console.log(`📋 Current DOM state for ${serverGroup}:`);
        console.log(`   Regular checkboxes (${regularBoxes.length}):`, Array.from(regularBoxes).map(cb => cb.value));
        console.log(`   4K checkboxes (${fourkBoxes.length}):`, Array.from(fourkBoxes).map(cb => cb.value));
        console.log(`   User library IDs:`, {
            regular: userLibraries.regular?.map(lib => extractLibraryId(lib)),
            fourk: userLibraries.fourk?.map(lib => extractLibraryId(lib))
        });
    }
}

// Helper function for retry logic
function retryPreSelection(serverGroup, userLibraries, extractLibraryId, findCheckbox) {
    console.log(`🔄 RETRY: Attempting pre-selection again for ${serverGroup}...`);
    let retrySelected = 0;
    
    // Retry regular libraries
    if (userLibraries.regular && Array.isArray(userLibraries.regular)) {
        userLibraries.regular.forEach(lib => {
            const libId = extractLibraryId(lib);
            if (!libId) return;
            
            const checkbox = findCheckbox(serverGroup, 'regular', libId);
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                retrySelected++;
                console.log(`🔄 RETRY SUCCESS: Pre-selected regular library: ${libId}`);
            }
        });
    }
    
    // Retry 4K libraries
    if (userLibraries.fourk && Array.isArray(userLibraries.fourk)) {
        userLibraries.fourk.forEach(lib => {
            const libId = extractLibraryId(lib);
            if (!libId) return;
            
            const checkbox = findCheckbox(serverGroup, 'fourk', libId);
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                retrySelected++;
                console.log(`🔄 RETRY SUCCESS: Pre-selected 4K library: ${libId}`);
            }
        });
    }
    
    console.log(`🔄 Retry completed for ${serverGroup}: ${retrySelected} additional libraries selected`);
    
    // Final debug if still having issues
    if (retrySelected === 0) {
        console.log(`⚠️ RETRY FAILED: Still unable to select libraries for ${serverGroup}`);
        console.log(`🔍 Final debug - checking DOM state...`);
        
        // Show current state of DOM
        const regularBoxes = document.querySelectorAll(`input[name="${serverGroup}_regular"]`);
        const fourkBoxes = document.querySelectorAll(`input[name="${serverGroup}_fourk"]`);
        
        console.log(`📋 Current DOM state for ${serverGroup}:`);
        console.log(`   Regular checkboxes (${regularBoxes.length}):`, Array.from(regularBoxes).map(cb => cb.value));
        console.log(`   4K checkboxes (${fourkBoxes.length}):`, Array.from(fourkBoxes).map(cb => cb.value));
        console.log(`   User library IDs:`, {
            regular: userLibraries.regular?.map(lib => extractLibraryId(lib)),
            fourk: userLibraries.fourk?.map(lib => extractLibraryId(lib))
        });
    }
}

// Export for global access
window.Users.loadUsers = window.Users.loadUsers.bind(window.Users);
window.Users.editUser = window.Users.editUser.bind(window.Users);
window.Users.deleteUser = window.Users.deleteUser.bind(window.Users);
window.Users.viewUser = window.Users.viewUser.bind(window.Users);
window.Users.emailUser = window.Users.emailUser.bind(window.Users);
window.Users.sortUsers = window.Users.sortUsers.bind(window.Users);
window.Users.saveUser = window.Users.saveUser.bind(window.Users);

// Make the saveUser function globally available
window.saveUser = function(event) {
    return window.Users.saveUser(event);
};

console.log('👥 Users module loaded successfully');