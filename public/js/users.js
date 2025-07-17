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
// REMOVED: Duplicate loadUsers() call that was causing rate limits
// The users list is already reloaded when navigating back to users page
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
        // Ensure subscription types are loaded first
        await this.ensureSubscriptionTypesLoaded();
        
        // Then get the user data
        const user = await API.User.getById(userId);
        this.showUserModal(user);
    } catch (error) {
        Utils.handleError(error, 'Loading user details');
    }
},
    
// Enhanced user modal with proper subscription type name resolution
showUserModal(user) {
    const userDetailsDiv = document.getElementById('userDetails');
    if (!userDetailsDiv) return;
    
    // Helper functions
    const formatDate = (dateStr) => {
        if (!dateStr || dateStr === 'FREE') return 'N/A';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
        } catch (error) {
            return dateStr;
        }
    };
    
    const isDateExpired = (dateString) => {
        if (!dateString || dateString === 'FREE') return false;
        const expirationDate = new Date(dateString);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return expirationDate < today;
    };
    
    // Function to get subscription type name by ID
    const getSubscriptionTypeName = (subscriptionTypeId) => {
        if (!subscriptionTypeId) return 'N/A';
        
        // Handle special cases
        if (subscriptionTypeId === 'free' || subscriptionTypeId === 'FREE') return 'FREE';
        if (subscriptionTypeId === 'remove') return 'Removed';
        
        // Try to find the subscription type in our global state
        const subscriptionTypes = window.AppState?.subscriptionTypes || [];
        const subscriptionType = subscriptionTypes.find(sub => sub.id == subscriptionTypeId);
        
        if (subscriptionType) {
            return subscriptionType.name;
        }
        
        // If not found in cache, return the ID with a note
        return `Subscription #${subscriptionTypeId}`;
    };
    
    // Get subscription type names
    const plexSubscriptionName = getSubscriptionTypeName(user.plex_subscription);
    const iptvSubscriptionName = getSubscriptionTypeName(user.iptv_subscription);
    
    // Check email preferences
    const bulkEmailStatus = user.exclude_bulk_emails ? 'Excluded' : 'Included';
    const automatedEmailStatus = user.exclude_automated_emails ? 'Excluded' : 'Included';
    const bccOwnerStatus = user.bcc_owner_renewal ? 'Enabled' : 'Disabled';
    
    // Format tags for display
    const tagsHtml = user.tags && user.tags.length > 0 
        ? user.tags.map(tag => `<span class="tag tag-${tag.toLowerCase().replace(/\s+/g, '')}">${tag}</span>`).join('')
        : '<span class="status-indicator status-disabled">No tags assigned</span>';
    
    // Check for pending invites
    const hasPendingInvites = this.userHasPendingInvites(user);
    const inviteStatusHtml = this.showDetailedInviteStatus(user);
    
    userDetailsDiv.innerHTML = `
        <div class="user-details-container">
            <div class="user-info-grid">
                <!-- Basic Information -->
                <div class="user-info-section">
                    <div class="section-title">
                        <i class="fas fa-user"></i>
                        Basic Information
                    </div>
                    <div class="info-item">
                        <div class="info-label">
                            <i class="fas fa-id-card"></i>
                            Name
                        </div>
                        <div class="info-value">${user.name}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">
                            <i class="fas fa-envelope"></i>
                            Email
                        </div>
                        <div class="info-value email">${user.email}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">
                            <i class="fas fa-user-tie"></i>
                            Owner
                        </div>
                        <div class="info-value">${user.owner_name || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">
                            <i class="fas fa-tags"></i>
                            Tags
                        </div>
                        <div class="info-value tag-list">${tagsHtml}</div>
                    </div>
                </div>

                <!-- Service Credentials -->
                <div class="user-info-section">
                    <div class="section-title">
                        <i class="fas fa-key"></i>
                        Service Credentials
                    </div>
                    <div class="info-item">
                        <div class="info-label">
                            <i class="fas fa-play"></i>
                            Plex Email
                        </div>
                        <div class="info-value email">${user.plex_email || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">
                            <i class="fas fa-tv"></i>
                            IPTV Username
                        </div>
                        <div class="info-value">${user.iptv_username || 'N/A'}</div>
                    </div>
<div class="info-item">
    <div class="info-label">
        <i class="fas fa-lock"></i>
        IPTV Password
    </div>
    <div class="info-value">${user.iptv_password || 'N/A'}</div>
</div>
                </div>

                <!-- Subscription Information -->
                <div class="user-info-section">
                    <div class="section-title">
                        <i class="fas fa-calendar"></i>
                        Plex Subscription
                    </div>
                    <div class="info-item">
                        <div class="info-label">
                            <i class="fas fa-bookmark"></i>
                            Type
                        </div>
                        <div class="info-value">${plexSubscriptionName}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">
                            <i class="fas fa-calendar-alt"></i>
                            Expiration
                        </div>
                        <div class="info-value">
                            ${user.plex_expiration === 'FREE' ? 
                                '<span class="status-indicator status-enabled">FREE</span>' :
                                user.plex_expiration ? 
                                    (isDateExpired(user.plex_expiration) ? 
                                        `<span class="status-indicator status-warning">${formatDate(user.plex_expiration)} (Expired)</span>` :
                                        `<span class="status-indicator status-enabled">${formatDate(user.plex_expiration)}</span>`
                                    ) : 'N/A'
                            }
                        </div>
                    </div>
                </div>

                <div class="user-info-section">
                    <div class="section-title">
                        <i class="fas fa-tv"></i>
                        IPTV Subscription
                    </div>
                    <div class="info-item">
                        <div class="info-label">
                            <i class="fas fa-bookmark"></i>
                            Type
                        </div>
                        <div class="info-value">${iptvSubscriptionName}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">
                            <i class="fas fa-calendar-alt"></i>
                            Expiration
                        </div>
                        <div class="info-value">
                            ${user.iptv_expiration === 'FREE' ? 
                                '<span class="status-indicator status-enabled">FREE</span>' :
                                user.iptv_expiration ? 
                                    (isDateExpired(user.iptv_expiration) ? 
                                        `<span class="status-indicator status-warning">${formatDate(user.iptv_expiration)} (Expired)</span>` :
                                        `<span class="status-indicator status-enabled">${formatDate(user.iptv_expiration)}</span>`
                                    ) : 'N/A'
                            }
                        </div>
                    </div>
                </div>

                <!-- Email Preferences Section -->
                <div class="user-info-section email-preferences">
                    <div class="section-title">
                        <i class="fas fa-mail-bulk"></i>
                        Email Preferences
                    </div>
                    <div class="preference-grid">
                        <div class="preference-item">
                            <div class="preference-icon">
                                <i class="fas fa-${user.exclude_bulk_emails ? 'ban' : 'check'}" 
                                   style="color: ${user.exclude_bulk_emails ? '#ff9800' : '#4caf50'}"></i>
                            </div>
                            <div class="preference-info">
                                <div class="preference-title">Bulk Emails</div>
                                <div class="preference-description">${bulkEmailStatus} from group emails</div>
                            </div>
                            <div class="status-indicator ${user.exclude_bulk_emails ? 'status-warning' : 'status-enabled'}">
                                ${bulkEmailStatus}
                            </div>
                        </div>
                        
                        <div class="preference-item">
                            <div class="preference-icon">
                                <i class="fas fa-${user.exclude_automated_emails ? 'ban' : 'check'}" 
                                   style="color: ${user.exclude_automated_emails ? '#ff9800' : '#4caf50'}"></i>
                            </div>
                            <div class="preference-info">
                                <div class="preference-title">Automated Emails</div>
                                <div class="preference-description">${automatedEmailStatus} from renewal reminders</div>
                            </div>
                            <div class="status-indicator ${user.exclude_automated_emails ? 'status-warning' : 'status-enabled'}">
                                ${automatedEmailStatus}
                            </div>
                        </div>
                        
                        <div class="preference-item">
                            <div class="preference-icon">
                                <i class="fas fa-${user.bcc_owner_renewal ? 'user-check' : 'user-times'}" 
                                   style="color: ${user.bcc_owner_renewal ? '#4caf50' : '#9e9e9e'}"></i>
                            </div>
                            <div class="preference-info">
                                <div class="preference-title">Owner BCC</div>
                                <div class="preference-description">Owner ${bccOwnerStatus.toLowerCase()} on renewals</div>
                            </div>
                            <div class="status-indicator ${user.bcc_owner_renewal ? 'status-enabled' : 'status-disabled'}">
                                ${bccOwnerStatus}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Library Access Section -->
            <div class="library-access-section">
                <div class="section-title">
                    <i class="fas fa-server"></i>
                    Current Library Access
                </div>
                <div id="userLibraryAccess" class="library-status">
                    <div style="text-align: center; color: #4fc3f7;">
                        <i class="fas fa-spinner fa-spin"></i> Loading library access...
                    </div>
                </div>
            </div>

            ${hasPendingInvites ? `
                <div class="invite-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div>
                        <strong>Pending Plex Invitations Detected</strong>
                        <small>This user has pending library invitations that need to be accepted.</small>
                        ${inviteStatusHtml}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    
    // Load library access
    this.loadUserLibraryAccess(user);
    
    // Show modal
    const modal = document.getElementById('viewUserModal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
},

// Add this helper function to ensure subscription types are loaded
async ensureSubscriptionTypesLoaded() {
    if (!window.AppState?.subscriptionTypes || window.AppState.subscriptionTypes.length === 0) {
        try {
            console.log('📊 Loading subscription types for modal...');
            const subscriptionTypes = await API.call('/subscriptions');
            window.AppState.subscriptionTypes = subscriptionTypes;
            console.log('✅ Subscription types loaded:', subscriptionTypes.length);
        } catch (error) {
            console.error('❌ Error loading subscription types:', error);
            window.AppState.subscriptionTypes = [];
        }
    }
},

// Enhanced library access display function - Add to users.js
loadUserLibraryAccess(user) {
    const libraryDiv = document.getElementById('userLibraryAccess');
    if (!libraryDiv) return;
    
    // Check if user has Plex libraries configured
    if (!user.plex_libraries || Object.keys(user.plex_libraries).length === 0) {
        libraryDiv.innerHTML = `
            <div class="no-access-message">
                <i class="fas fa-ban" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i>
                <div>No Plex access configured</div>
            </div>
        `;
        return;
    }
    
    let libraryHtml = '';
    
// Process each server group
Object.keys(user.plex_libraries).forEach(serverGroup => {
    const serverAccess = user.plex_libraries[serverGroup];
    
    // Check if this server group has any libraries
    const hasRegularLibs = serverAccess.regular && Array.isArray(serverAccess.regular) && serverAccess.regular.length > 0;
    const hasFourkLibs = serverAccess.fourk && Array.isArray(serverAccess.fourk) && serverAccess.fourk.length > 0;
    
    if (!hasRegularLibs && !hasFourkLibs) return;
    
    libraryHtml += `
        <div class="server-group">
            <div class="server-title">
                <i class="fas fa-server"></i>
                ${serverGroup.toUpperCase()}
            </div>
            <div class="library-list">
    `;
    
    // Process regular libraries
    if (hasRegularLibs) {
        libraryHtml += `<div class="library-section">
            <h6>Regular Libraries (${serverAccess.regular.length})</h6>
            <div class="library-items">`;
        
serverAccess.regular.forEach(library => {
    // Handle both object and string formats
    let libraryName;
    let libraryId;
    
    if (typeof library === 'object' && library !== null) {
        // Library is stored as an object
        libraryName = library.title || library.name || `Library ${library.id}`;
        libraryId = library.id;
    } else {
        // Library is stored as just an ID string
        libraryId = library;
        
        // Try to get library name from available libraries
        const availableLibraries = window.AppState?.plexLibraries || {};
        const serverLibs = availableLibraries[serverGroup];
        
        if (serverLibs) {
            const regularLib = serverLibs.regular?.find(lib => lib.id === libraryId || lib.id === String(libraryId));
            if (regularLib) {
                libraryName = regularLib.title || regularLib.name || `Library ${libraryId}`;
            } else {
                libraryName = `Library ${libraryId}`;
            }
        } else {
            libraryName = `Library ${libraryId}`;
        }
    }
    
    libraryHtml += `<span class="library-badge regular">${libraryName}</span>`;
});

        libraryHtml += `</div></div>`;
    }
    
    // Process 4K libraries
    if (hasFourkLibs) {
        libraryHtml += `<div class="library-section">
            <h6>4K Libraries (${serverAccess.fourk.length})</h6>
            <div class="library-items">`;
        
serverAccess.fourk.forEach(library => {
    // Handle both object and string formats
    let libraryName;
    let libraryId;
    
    if (typeof library === 'object' && library !== null) {
        // Library is stored as an object
        libraryName = library.title || library.name || `Library ${library.id}`;
        libraryId = library.id;
    } else {
        // Library is stored as just an ID string
        libraryId = library;
        
        // Try to get library name from available libraries
        const availableLibraries = window.AppState?.plexLibraries || {};
        const serverLibs = availableLibraries[serverGroup];
        
        if (serverLibs) {
            const fourkLib = serverLibs.fourk?.find(lib => lib.id === libraryId || lib.id === String(libraryId));
            if (fourkLib) {
                libraryName = fourkLib.title || fourkLib.name || `Library ${libraryId}`;
            } else {
                libraryName = `Library ${libraryId}`;
            }
        } else {
            libraryName = `Library ${libraryId}`;
        }
    }
    
    libraryHtml += `<span class="library-badge k4">${libraryName}</span>`;
});
        
        libraryHtml += `</div></div>`;
    }
    
    libraryHtml += `
            </div>
        </div>
    `;
});
    
    if (libraryHtml === '') {
        libraryDiv.innerHTML = `
            <div class="no-access-message">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i>
                <div>Plex access configured but no libraries assigned</div>
            </div>
        `;
    } else {
        libraryDiv.innerHTML = libraryHtml;
    }
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
    
    
async editUser(userId) {
    try {
        console.log(`📝 Starting edit for user ID: ${userId}`);
        
        // Set editing state
        window.AppState.editingUserId = userId;
        
        // Get initial user data
        const user = await API.User.getById(userId);
        if (!user) {
            throw new Error('User not found');
        }
        
        console.log(`👤 Loaded user: ${user.name} (${user.email})`);
        
        // Store initial user data
        window.AppState.currentUserData = user;
        
        // Set initial baselines for change detection (from database state only)
        this.originalLibraryBaseline = this.deepClone(user.plex_libraries || {});
        this.originalTagsBaseline = [...(user.tags || [])];
        
        console.log('✅ Set baselines from database:', {
            libraries: this.originalLibraryBaseline,
            tags: this.originalTagsBaseline
        });
        
        // Navigate to user form first
        await window.showPage('user-form');
        
        // REMOVED: Background refresh - all data should come from database
        // No more automatic API calls that interfere with editing
        
        // Populate form with database data only
setTimeout(async () => {
    console.log(`🔧 Populating form for editing user: ${user.name}`);
    window.populateFormForEditing(user);
    
    // Load IPTV Editor status
    await loadIPTVEditorStatus(user.id);
}, 1200);
        
    } catch (error) {
        Utils.handleError(error, 'Loading user for editing');
    }
},
    
emailUser(userName, userEmail) {
    // Store the user info for the email page
    window.AppState = window.AppState || {};
    window.AppState.emailRecipient = {
        name: userName,
        email: userEmail
    };
    
    // Navigate to email page
    window.showPage('email');
    
    // Prepopulate fields after page loads
    setTimeout(() => {
        const recipientField = document.getElementById('emailRecipient');
        const subjectField = document.getElementById('emailSubject');
        
        if (recipientField) {
            recipientField.value = userEmail;
            console.log('📧 Prepopulated recipient:', userEmail);
        }
        if (subjectField) {
            subjectField.value = `Message for ${userName}`;
            console.log('📧 Prepopulated subject for:', userName);
        }
        
        // Update email preview if Email module is loaded
        if (window.Email && window.Email.updateEmailPreview) {
            window.Email.updateEmailPreview();
        }
    }, 200);
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
    const pendingInvites = user.pending_plex_invites || null;
    
    // Show simple pending indicator
    if (pendingInvites && Object.keys(pendingInvites).length > 0) {
        return `<br><span class="pending-invite-simple" title="User has pending Plex invites">⏳ Pending Plex Invite</span>`;
    }
    
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
    

// REPLACE ONLY THE saveUser FUNCTION - find this in your users.js and replace just this function:

async saveUser(event) {
    event.preventDefault();
    console.log('🎯 Form submission triggered - starting save process');
    
    try {
        // Check if this is a new user without basic info saved
        const isNewUser = !window.AppState?.editingUserId && !window.currentEditingUserId;
        
        if (isNewUser) {
            // For completely new users, encourage using basic save first
            const hasIPTVTag = document.getElementById('tag-iptv')?.checked;
            const hasPlexTags = document.getElementById('tag-plex1')?.checked || document.getElementById('tag-plex2')?.checked;
            
            if (hasIPTVTag || hasPlexTags) {
                const useBasicSave = confirm(
                    'For new users with IPTV or Plex services, we recommend saving basic info first.\n\n' +
                    'Click OK to save basic info first, or Cancel to save everything at once.'
                );
                
                if (useBasicSave) {
                    // Call the basic save function instead
                    await this.saveBasicUserInfo();
                    return;
                }
            }
        }
        
        // Continue with existing saveUser logic...
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
        userData.exclude_bulk_emails = document.getElementById('excludeBulkEmails')?.checked || false;
        userData.exclude_automated_emails = document.getElementById('excludeAutomatedEmails')?.checked || false;

        // FIXED: Use empty string instead of null for backend validation
        userData.plex_expiration = formData.get('plex_expiration') || '';
        userData.iptv_expiration = formData.get('iptv_expiration') || '';
        
        console.log('🗓️ Manual expiration dates collected (fixed):', {
            plex_expiration: userData.plex_expiration,
            iptv_expiration: userData.iptv_expiration
        });

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
        const iptvSubscription = document.getElementById('iptvSubscription')?.value;
        
        // FIXED: Handle Plex subscription with proper "remove" case
        console.log('🔍 Raw subscription values:', {
            plexSubscription, 
            iptvSubscription,
            plex_expiration: userData.plex_expiration,
            iptv_expiration: userData.iptv_expiration
        });

        if (plexSubscription === 'free') {
            userData.plex_subscription = 'free';
            userData.plex_is_free = true;
            // Keep manual expiration date if provided, otherwise empty string
        } else if (plexSubscription === 'remove') {
            // FIXED: Properly handle remove case
            userData.plex_subscription = 'remove';
            userData.plex_expiration = ''; // Use empty string instead of null
            userData.plex_is_free = false;
        } else if (plexSubscription && plexSubscription !== '') {
            // Paid subscription - use manual expiration if provided
            userData.plex_subscription = parseInt(plexSubscription);
            userData.plex_is_free = false;
            // userData.plex_expiration already set from form data above
        } else {
            // Keep current (no change)
            userData.plex_subscription = null;
            userData.plex_is_free = false;
            // Keep manual expiration if provided
        }

        // FIXED: Handle IPTV subscription with proper "remove" case
        if (iptvSubscription === 'remove') {
            // FIXED: Properly handle remove case
            userData.iptv_subscription = 'remove';
            userData.iptv_expiration = ''; // Use empty string instead of null
            userData.iptv_is_free = false;
        } else if (iptvSubscription && iptvSubscription !== '') {
            // Paid subscription - use manual expiration if provided
            userData.iptv_subscription = parseInt(iptvSubscription);
            userData.iptv_is_free = false;
            // userData.iptv_expiration already set from form data above
        } else {
            // Keep current (no change)
            userData.iptv_subscription = null;
            userData.iptv_is_free = false;
            // Keep manual expiration if provided
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

/**
 * Save basic user info only (for new users)
 */
async saveBasicUserInfo() {
    const button = document.getElementById('saveBasicInfoBtn');
    const originalText = button.innerHTML;
    
    // Validate required fields
    const name = document.getElementById('userName').value.trim();
    const email = document.getElementById('userEmail').value.trim();
    
    if (!name || !email) {
        Utils.showNotification('Name and Email are required', 'error');
        return;
    }
    
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    button.disabled = true;
    
    try {
        const basicUserData = {
            name: name,
            email: email,
            plex_email: document.getElementById('plexEmail').value.trim(),
            owner_id: document.getElementById('userOwner').value || null
        };
        
        const response = await API.call('/users', {
            method: 'POST',
            body: JSON.stringify(basicUserData)
        });
        
console.log('🔍 Full response:', response);
console.log('🔍 response.success:', response.success);
console.log('🔍 response.success type:', typeof response.success);
console.log('🔍 response.message:', response.message);

// Check for success based on the actual response format
if (response.id && response.message === 'User created successfully') {
    Utils.showNotification('Basic user info saved! You can now add services below.', 'success');
    
    // Hide the save basic info section
    document.getElementById('saveBasicInfoSection').style.display = 'none';
    
    // Get user ID directly from response (we know it's there now)
    const userId = response.id;
    console.log(`✅ Got user ID from response: ${userId}`);
    
    if (userId) {
        this.updateFormToEditMode(userId);
        
        // Update page title
        document.querySelector('h2').textContent = 'Edit User';
    } else {
        console.warn('⚠️ Could not determine user ID, but user was created successfully');
        Utils.showNotification('User created but could not switch to edit mode. Please refresh the page.', 'warning');
    }
    
} else {
    console.error('❌ Response indicates failure:', response);
    throw new Error(response.message || 'Failed to save user');
}
        
    } catch (error) {
        console.error('Error saving basic user info:', error);
        Utils.showNotification('Failed to save: ' + error.message, 'error');
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
},

/**
 * Update form to edit mode after saving basic info
 */
updateFormToEditMode(userId) {
    // Store the user ID globally so other functions can use it
    window.currentEditingUserId = userId;
    window.AppState.editingUserId = userId;
    
    // Update the form action or any hidden fields if needed
    const form = document.getElementById('userFormData');
    if (form) {
        form.setAttribute('data-user-id', userId);
    }
    
    console.log(`✅ Form updated to edit mode with user ID: ${userId}`);
},

/**
 * Show/hide the basic save button based on whether this is a new user
 */
toggleBasicSaveButton() {
    const isNewUser = !window.AppState?.editingUserId && !window.currentEditingUserId;
    const section = document.getElementById('saveBasicInfoSection');
    
    if (section) {
        section.style.display = isNewUser ? 'block' : 'none';
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
                if (obj1[key].length !== obj2[key].length) return false;
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
    },
	
	// Check for Plex Access Methods - NEW FUNCTIONALITY
    checkExistingPlexAccess: async function(email) {
        try {
            console.log('🔍 Checking existing Plex access for:', email);
            
            const response = await API.call(`/plex/user-access/${encodeURIComponent(email)}`);
            
            console.log('📊 Received access data:', response);
            return response;
            
        } catch (error) {
            console.error('❌ Error checking Plex access:', error);
            throw error;
        }
    },

    displayPlexAccessResults: function(accessData, email) {
        const resultsDiv = document.getElementById('plexAccessResults');
        
        if (!resultsDiv) {
            console.warn('⚠️ Results div not found');
            return;
        }
        
        // Count total libraries
        let totalLibraries = 0;
        let hasAnyAccess = false;
        let serverGroups = [];
        
        for (const [serverGroup, groupData] of Object.entries(accessData)) {
            const regularCount = groupData.regular ? groupData.regular.length : 0;
            const fourkCount = groupData.fourk ? groupData.fourk.length : 0;
            const groupTotal = regularCount + fourkCount;
            
            if (groupTotal > 0) {
                hasAnyAccess = true;
                serverGroups.push({
                    name: serverGroup,
                    regular: regularCount,
                    fourk: fourkCount,
                    total: groupTotal,
                    regularLibs: groupData.regular || [],
                    fourkLibs: groupData.fourk || []
                });
            }
            
            totalLibraries += groupTotal;
        }
        
        let html = '';
        
        if (hasAnyAccess) {
            html += `
                <div class="plex-access-success">
                    <h5>✅ Found Existing Plex Access!</h5>
                    <p>User <strong>${email}</strong> has access to <strong>${totalLibraries}</strong> libraries across <strong>${serverGroups.length}</strong> server group(s).</p>
                </div>
            `;
            
            // Show details for each server group
            for (const group of serverGroups) {
                const serverName = group.name === 'plex1' ? 'Plex 1' : 'Plex 2';
                html += `
                    <div class="server-group-detail">
                        <div class="server-group-header">
                            <h6>${serverName}</h6>
                            <span class="server-group-count">${group.total} libraries</span>
                        </div>
                        <div class="server-group-stats">
                            ${group.regular > 0 ? `Regular: ${group.regular} libraries` : ''}
                            ${group.regular > 0 && group.fourk > 0 ? ' • ' : ''}
                            ${group.fourk > 0 ? `4K: ${group.fourk} libraries` : ''}
                        </div>
                        <div class="server-group-libraries">
                            ${group.regularLibs.map(lib => lib.title || `Library ${lib.id}`).join(', ')}
                            ${group.regularLibs.length > 0 && group.fourkLibs.length > 0 ? ', ' : ''}
                            ${group.fourkLibs.map(lib => `${lib.title || `Library ${lib.id}`} (4K)`).join(', ')}
                        </div>
                    </div>
                `;
            }
            
            html += `
                <div class="plex-access-info">
                    <p>💡 <strong>Auto-Selection:</strong> The detected libraries have been automatically selected below. You can modify the selection as needed.</p>
                </div>
            `;
        } else {
            html += `
                <div class="plex-access-warning">
                    <h5>⚠️ No Plex Access Found</h5>
                    <p>User <strong>${email}</strong> doesn't appear to have access to any Plex libraries yet. You can manually select libraries below to invite them.</p>
                </div>
            `;
        }
        
        resultsDiv.innerHTML = html;
        resultsDiv.style.display = 'block';
    },

    autoSelectDetectedLibraries: function(accessData) {
        console.log('🎯 Auto-selecting detected libraries...');
        
        for (const [serverGroup, groupData] of Object.entries(accessData)) {
            const regularLibs = groupData.regular || [];
            const fourkLibs = groupData.fourk || [];
            
            if (regularLibs.length > 0 || fourkLibs.length > 0) {
                console.log(`📚 Auto-selecting libraries for ${serverGroup}:`, { regular: regularLibs.length, fourk: fourkLibs.length });
                
                // Make sure the library section is visible
                const libraryGroup = document.getElementById(`${serverGroup}LibraryGroup`);
                if (libraryGroup && libraryGroup.style.display === 'none') {
                    libraryGroup.style.display = 'block';
                }
                
                // Load the libraries first, then select after a delay to ensure they're rendered
                if (window.loadPlexLibrariesForGroup) {
                    window.loadPlexLibrariesForGroup(serverGroup).then(() => {
                        // Multiple attempts with increasing delays to ensure checkboxes are rendered
                        setTimeout(() => this.selectLibrariesById(serverGroup, regularLibs, fourkLibs), 500);
                        setTimeout(() => this.selectLibrariesById(serverGroup, regularLibs, fourkLibs), 1000);
                        setTimeout(() => this.selectLibrariesById(serverGroup, regularLibs, fourkLibs), 2000);
                    });
                }
            }
        }
    },

    selectLibrariesById: function(serverGroup, regularLibs, fourkLibs) {
        console.log(`🎯 Selecting libraries for ${serverGroup}:`, { regularLibs, fourkLibs });
        
        let selectedCount = 0;
        
        // Select regular libraries
        regularLibs.forEach(lib => {
            // Try multiple possible checkbox selectors
            const selectors = [
                `input[name="${serverGroup}RegularLibraries"][value="${lib.id}"]`,
                `input[data-library-id="${lib.id}"][data-server-group="${serverGroup}"][data-library-type="regular"]`,
                `#${serverGroup}RegularLibrariesList input[value="${lib.id}"]`,
                `input[name="${serverGroup}_regular"][value="${lib.id}"]`
            ];
            
            let checkbox = null;
            for (const selector of selectors) {
                checkbox = document.querySelector(selector);
                if (checkbox) break;
            }
            
            if (checkbox) {
                checkbox.checked = true;
                selectedCount++;
                console.log(`✅ Selected regular library: ${lib.title || lib.id}`);
            } else {
                console.log(`⚠️ Regular library checkbox not found for: ${lib.title || lib.id} (ID: ${lib.id})`);
            }
        });
        
        // Select 4K libraries
        fourkLibs.forEach(lib => {
            // Try multiple possible checkbox selectors
            const selectors = [
                `input[name="${serverGroup}FourkLibraries"][value="${lib.id}"]`,
                `input[data-library-id="${lib.id}"][data-server-group="${serverGroup}"][data-library-type="fourk"]`,
                `#${serverGroup}FourkLibrariesList input[value="${lib.id}"]`,
                `input[name="${serverGroup}_fourk"][value="${lib.id}"]`
            ];
            
            let checkbox = null;
            for (const selector of selectors) {
                checkbox = document.querySelector(selector);
                if (checkbox) break;
            }
            
            if (checkbox) {
                checkbox.checked = true;
                selectedCount++;
                console.log(`✅ Selected 4K library: ${lib.title || lib.id}`);
            } else {
                console.log(`⚠️ 4K library checkbox not found for: ${lib.title || lib.id} (ID: ${lib.id})`);
            }
        });
        
        console.log(`📊 Auto-selected ${selectedCount} libraries for ${serverGroup}`);
        
        return selectedCount;
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
        
        // Show/hide basic save button based on user type (NEW USER = show button)
        if (window.Users && window.Users.toggleBasicSaveButton) {
            window.Users.toggleBasicSaveButton();
        }
        
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

// Handle email preference checkboxes
document.getElementById('excludeBulkEmails').checked = user.exclude_bulk_emails || false;
document.getElementById('excludeAutomatedEmails').checked = user.exclude_automated_emails || false;
    
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
    let hasIPTVTag = false; // Track IPTV tag for initialization
    
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
                
                // CRITICAL: Track IPTV tag but don't trigger the change event
                if (tag === 'IPTV') {
                    hasIPTVTag = true;
                    // Show IPTV section without triggering change event
                    const iptvSection = document.getElementById('iptvSection');
                    if (iptvSection) {
                        iptvSection.style.display = 'block';
                    }
                }
            }
        });
    }
    
    // CRITICAL: If user has IPTV tag, initialize IPTV functionality
    if (hasIPTVTag) {
        console.log('📺 User has IPTV tag - initializing IPTV functionality...');
        
        // Initialize IPTV module for this user
        if (window.IPTV && typeof window.IPTV.showIPTVSection === 'function') {
            setTimeout(() => {
                window.IPTV.showIPTVSection(window.AppState.editingUserId);
            }, 300);
        }
        
        // CRITICAL: Initialize the always-visible IPTV check button
        setTimeout(() => {
            if (window.initializeIPTVCheck) {
                console.log('🔧 Initializing IPTV check button for editing user...');
                window.initializeIPTVCheck();
            } else {
                console.error('❌ initializeIPTVCheck function not found during form population');
            }
        }, 500);
    }
    
    // If user has Plex tags, check invite status and show appropriate indicators
    if (plexTags.length > 0 && user.plex_email && window.Users) {
        await window.Users.checkAndDisplayInviteStatus(user.plex_email, plexTags);
    }
    
    console.log(`✅ Form population completed for ${user.name}`);
	
	checkForOrphanedIPTVEditor(user);
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
};


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

// Make saveBasicUserInfo globally available
window.saveBasicUserInfo = function() {
    return window.Users.saveBasicUserInfo();
};

// Make toggleBasicSaveButton globally available  
window.toggleBasicSaveButton = function() {
    return window.Users.toggleBasicSaveButton();
};

// IPTV Editor Check Functions - Add these to your users.js file

async function checkIPTVEditorAccess() {
    const usernameInput = document.getElementById('existingIptvEditorUsername');
    const checkBtn = document.getElementById('checkEditorAccessBtn');
    const resultsDiv = document.getElementById('editorAccessCheckResults');
    
    const username = usernameInput.value.trim();
    
    if (!username) {
        Utils.showNotification('Please enter a username to check', 'error');
        return;
    }
    
    // Update button state
    const originalText = checkBtn.innerHTML;
    checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
    checkBtn.disabled = true;
    
    try {
        // FIXED: Use the existing /users endpoint
        const response = await fetch(`/api/iptv-editor/users`);
        const data = await response.json();
        
        if (data.success && data.data && data.data.api_users) {
            // Search for the username in the API users
            const matchingUser = data.data.api_users.find(user => 
                user.username && user.username.toLowerCase() === username.toLowerCase()
            );
            
            resultsDiv.style.display = 'block';
            
            if (matchingUser) {
                // User found - show sync results
                showIPTVEditorSyncResults(matchingUser, username);
            } else {
                // User not found - show create option
                showIPTVEditorCreateOption(username);
            }
        } else {
            throw new Error('Failed to load IPTV Editor users');
        }
        
    } catch (error) {
        console.error('Error checking IPTV Editor access:', error);
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = `
            <div style="background: rgba(244, 67, 54, 0.1); border: 1px solid #f44336; border-radius: 4px; padding: 12px;">
                <div style="color: #f44336; font-weight: bold; margin-bottom: 5px;">
                    <i class="fas fa-exclamation-triangle"></i> Check Failed
                </div>
                <div style="color: #fff; font-size: 0.9rem;">
                    Unable to check IPTV Editor access. Please verify the username and try again.
                </div>
            </div>
        `;
    } finally {
        // Restore button
        checkBtn.innerHTML = originalText;
        checkBtn.disabled = false;
    }
}

function showIPTVEditorSyncResults(user, username) {
    // Store the user data globally so sync can access it
    currentIPTVEditorData = {
        iptv_editor_id: user.id,
        iptv_editor_username: user.username,
        iptv_editor_password: user.password,
        m3u_code: user.m3u,
        epg_code: user.epg,
        max_connections: user.max_connections,
        expiry_date: user.expiry,
        sync_status: 'found',
        last_sync_time: new Date().toISOString()
    };
    
    const resultsDiv = document.getElementById('editorAccessCheckResults');
    
    // Update the IPTV username field if it's empty
    const iptvUsernameField = document.getElementById('iptvUsername');
    if (iptvUsernameField && !iptvUsernameField.value) {
        iptvUsernameField.value = username;
    }
    
    const expiryDate = user.expiry ? new Date(user.expiry).toLocaleDateString() : 'Unknown';
    
    resultsDiv.innerHTML = `
        <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid #4caf50; border-radius: 4px; padding: 15px;">
            <div style="color: #4caf50; font-weight: bold; margin-bottom: 10px;">
                <i class="fas fa-check-circle"></i> IPTV Editor Account Found
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                <div>
                    <label style="color: #4fc3f7; font-size: 0.9rem;">Username:</label><br>
                    <strong style="color: #fff;">${user.username}</strong>
                </div>
                <div>
                    <label style="color: #4fc3f7; font-size: 0.9rem;">Max Connections:</label><br>
                    <strong style="color: #fff;">${user.max_connections}</strong>
                </div>
                <div>
                    <label style="color: #4fc3f7; font-size: 0.9rem;">Expiry:</label><br>
                    <strong style="color: #fff;">${expiryDate}</strong>
                </div>
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="color: #4fc3f7; font-size: 0.9rem;">Last updated:</label><br>
                <strong style="color: #fff;">undefined</strong>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button type="button" 
                        onclick="syncIPTVEditorUser('${username}')"
                        style="background: linear-gradient(45deg, #4fc3f7, #29b6f6); color: #000; border: none; padding: 8px 15px; border-radius: 4px; font-weight: bold;">
                    <i class="fas fa-sync"></i> Sync Data
                </button>
                <span style="color: #ccc; font-size: 0.85rem; line-height: 2;">User data matches - click to sync</span>
            </div>
        </div>
    `;
}

function showIPTVEditorCreateOption(username) {
    const resultsDiv = document.getElementById('editorAccessCheckResults');
    
    resultsDiv.innerHTML = `
        <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid #ffc107; border-radius: 4px; padding: 15px;">
            <div style="color: #ffc107; font-weight: bold; margin-bottom: 10px;">
                <i class="fas fa-user-plus"></i> No IPTV Editor Account Found
            </div>
            
            <div style="color: #fff; margin-bottom: 15px; font-size: 0.9rem;">
                Username "<strong>${username}</strong>" was not found in IPTV Editor. 
                You can create an account when you save this user or create it manually now.
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button type="button" 
                        onclick="createIPTVEditorAccountNow('${username}')"
                        style="background: linear-gradient(45deg, #8e24aa, #ab47bc); color: #fff; border: none; padding: 8px 15px; border-radius: 4px; font-weight: bold;">
                    <i class="fas fa-plus"></i> Create Account Now
                </button>
                <span style="color: #ccc; font-size: 0.85rem; line-height: 2;">Or save user to auto-create</span>
            </div>
        </div>
    `;
}

async function syncIPTVEditorUser(username) {
    try {
        Utils.showNotification('Syncing IPTV Editor account...', 'info');
        
        // Get the current user ID using multiple methods
        let userId = null;
        
        // Method 1: Check URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        userId = urlParams.get('id') || urlParams.get('edit');
        
        // Method 2: Check form field
        if (!userId) {
            const userIdField = document.getElementById('userId');
            if (userIdField && userIdField.value) {
                userId = userIdField.value;
            }
        }
        
        // Method 3: Check app state
        if (!userId && window.AppState && window.AppState.editingUserId) {
            userId = window.AppState.editingUserId;
        }
        
        if (!userId) {
            Utils.showNotification('User ID not found. Please save the user first.', 'error');
            return;
        }
        
        const response = await fetch(`/api/iptv-editor/user/${username}/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id: parseInt(userId) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            Utils.showNotification('IPTV Editor account synced and saved successfully', 'success');
            // Update the display with new data
            showIPTVEditorSyncResults(data.user, username);
            
            // Also load the IPTV status section
            await loadIPTVEditorStatus(userId);
        } else {
            Utils.showNotification(`Sync failed: ${data.message}`, 'error');
        }
        
    } catch (error) {
        console.error('Error syncing IPTV Editor user:', error);
        Utils.showNotification('Failed to sync IPTV Editor account', 'error');
    }
}

// Helper function to get current user ID
function getUserId() {
    // Method 1: Check URL parameters for editing existing user
    const urlParams = new URLSearchParams(window.location.search);
    let userId = urlParams.get('id') || urlParams.get('edit');
    
    if (userId) {
        console.log('📋 Found user ID from URL:', userId);
        return userId;
    }
    
    // Method 2: Check form field
    const userIdField = document.getElementById('userId');
    if (userIdField && userIdField.value) {
        userId = userIdField.value;
        console.log('📋 Found user ID from form field:', userId);
        return userId;
    }
    
    // Method 3: Check app state
    if (window.AppState && window.AppState.editingUserId) {
        userId = window.AppState.editingUserId;
        console.log('📋 Found user ID from AppState:', userId);
        return userId;
    }
    
    console.warn('⚠️ No user ID found using any method');
    return null;
}

async function createIPTVEditorAccountNow(username) {
    try {
        const userName = document.getElementById('userName')?.value;
        const userEmail = document.getElementById('userEmail')?.value;
        
        if (!userName || !userEmail) {
            Utils.showNotification('Please fill in user name and email first', 'error');
            return;
        }
        
        // Get the current user ID
        const userId = getUserId();
        if (!userId) {
            Utils.showNotification('Please save the user first, then create IPTV Editor account', 'error');
            return;
        }
        
        Utils.showNotification('Creating IPTV Editor account...', 'info');
        
        console.log('📤 Sending create request with data:', {
            user_id: parseInt(userId),
            username: username
        });
        
        const response = await fetch('/api/iptv-editor/user/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: parseInt(userId),
                username: username
            })
        });
        
        // Log the response for debugging
        console.log('📥 Response status:', response.status);
        
        const data = await response.json();
        console.log('📥 Response data:', data);
        
        if (data.success) {
            Utils.showNotification('IPTV Editor account created successfully', 'success');
            // Show the success results
            showIPTVEditorSyncResults(data.user, username);
        } else {
            Utils.showNotification(`Failed to create account: ${data.message}`, 'error');
            
            // Log validation errors if they exist
            if (data.errors) {
                console.error('Validation errors:', data.errors);
            }
        }
        
    } catch (error) {
        console.error('Error creating IPTV Editor account:', error);
        Utils.showNotification('Failed to create IPTV Editor account', 'error');
    }
}

// Auto-populate from IPTV username field when it changes
document.addEventListener('DOMContentLoaded', function() {
    const iptvUsernameField = document.getElementById('iptvUsername');
    const iptvEditorUsernameField = document.getElementById('existingIptvEditorUsername');
    
    if (iptvUsernameField && iptvEditorUsernameField) {
        iptvUsernameField.addEventListener('input', function() {
            if (this.value && !iptvEditorUsernameField.value) {
                iptvEditorUsernameField.value = this.value;
            }
        });
    }
});

// Global variable to store IPTV Editor data
let currentIPTVEditorData = null;

// Function to load IPTV Editor status for a user
async function loadIPTVEditorStatus(userId) {
    if (!userId) return;
    
    try {
        const response = await fetch(`/api/iptv-editor/user/${userId}/status`);
        const data = await response.json();
        
        if (data.success && data.iptvUser) {
            currentIPTVEditorData = data.iptvUser;
            displayIPTVEditorStatus(data.iptvUser);
        } else {
            hideIPTVEditorStatus();
        }
    } catch (error) {
        console.error('Error loading IPTV Editor status:', error);
        hideIPTVEditorStatus();
    }
}

// Function to display IPTV Editor status
function displayIPTVEditorStatus(iptvUser) {
    const statusSection = document.getElementById('iptvEditorStatusSection');
    const m3uSection = document.getElementById('iptvEditorM3USection');
    const indicator = document.getElementById('iptvEditorIndicator');
    
    if (statusSection) {
        statusSection.style.display = 'block';
        
        // Update status details
        document.getElementById('iptvEditorUsername').textContent = iptvUser.iptv_editor_username || '-';
        document.getElementById('iptvEditorLastSync').textContent = iptvUser.last_sync_time ? 
            new Date(iptvUser.last_sync_time).toLocaleDateString() : '-';
        document.getElementById('iptvEditorSyncStatus').textContent = iptvUser.sync_status || '-';
        
        // Update status dot color based on sync status
        const statusDot = document.getElementById('iptvEditorStatusDot');
        if (statusDot) {
            switch (iptvUser.sync_status) {
                case 'synced':
                    statusDot.style.background = '#4caf50';
                    break;
                case 'error':
                    statusDot.style.background = '#f44336';
                    break;
                default:
                    statusDot.style.background = '#ff9800';
            }
        }
    }
    
    // Show M3U Plus URL if available
    if (m3uSection && iptvUser.m3u_code) {
        m3uSection.style.display = 'block';
        const m3uUrl = `https://xtream.johnsonflix.tv/${iptvUser.m3u_code}`;
        document.getElementById('iptvEditorM3UUrl').value = m3uUrl;
    }
    
    // Show indicator
    if (indicator) {
        indicator.style.display = 'flex';
    }
}

// Function to hide IPTV Editor status
function hideIPTVEditorStatus() {
    const statusSection = document.getElementById('iptvEditorStatusSection');
    const m3uSection = document.getElementById('iptvEditorM3USection');
    const indicator = document.getElementById('iptvEditorIndicator');
    
    if (statusSection) statusSection.style.display = 'none';
    if (m3uSection) m3uSection.style.display = 'none';
    if (indicator) indicator.style.display = 'none';
    
    currentIPTVEditorData = null;
}

// Function to copy IPTV Editor M3U URL
function copyEditorM3UUrl() {
    const urlInput = document.getElementById('iptvEditorM3UUrl');
    if (urlInput && urlInput.value) {
        urlInput.select();
        document.execCommand('copy');
        Utils.showNotification('IPTV Editor M3U URL copied to clipboard', 'success');
    }
}

// Enhanced delete function that handles both IPTV services
async function deleteIPTVSubscription() {
    if (!currentEditingUserId) {
        Utils.showNotification('No user selected', 'error');
        return;
    }
    
    // Check what services need to be deleted
    const hasRegularIPTV = document.getElementById('iptvLineId').textContent !== 'None';
    const hasIPTVEditor = currentIPTVEditorData !== null;
    
    if (!hasRegularIPTV && !hasIPTVEditor) {
        Utils.showNotification('No IPTV subscriptions found to delete', 'error');
        return;
    }
    
    // Build confirmation message
    let confirmMessage = '⚠️ WARNING: This will permanently delete:\n\n';
    if (hasRegularIPTV) {
        confirmMessage += `• Regular IPTV subscription (Line ID: ${document.getElementById('iptvLineId').textContent})\n`;
    }
    if (hasIPTVEditor) {
        confirmMessage += `• IPTV Editor account (${currentIPTVEditorData.iptv_editor_username})\n`;
    }
    confirmMessage += '\nThis action cannot be undone. Are you sure you want to proceed?';
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const deleteBtn = document.getElementById('iptvDeleteBtn');
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        deleteBtn.disabled = true;
        
        // Delete regular IPTV subscription if exists (use existing IPTV.deleteSubscription logic)
        if (hasRegularIPTV) {
            // Call the existing IPTV delete function
            await IPTV.deleteSubscription();
        }
        
        // Delete IPTV Editor account if exists
        if (hasIPTVEditor) {
            const response = await fetch(`/api/iptv-editor/user/${currentIPTVEditorData.iptv_editor_username}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_id: currentEditingUserId
                })
            });
            
            const result = await response.json();
            if (!result.success) {
                throw new Error('Failed to delete IPTV Editor: ' + result.message);
            }
        }
        
        Utils.showNotification('All IPTV subscriptions deleted successfully', 'success');
        
        // Reset IPTV Editor interface
        hideIPTVEditorStatus();
        
        // Hide M3U sections
        const m3uSection = document.getElementById('iptvM3USection');
        const editorM3uSection = document.getElementById('iptvEditorM3USection');
        if (m3uSection) m3uSection.style.display = 'none';
        if (editorM3uSection) editorM3uSection.style.display = 'none';
        
    } catch (error) {
        console.error('Error deleting IPTV subscriptions:', error);
        Utils.showNotification('Delete failed: ' + error.message, 'error');
    } finally {
        const deleteBtn = document.getElementById('iptvDeleteBtn');
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete Subscription';
        deleteBtn.disabled = false;
    }
}

/**
 * Cleanup orphaned IPTV Editor users
 * This can be used when regular deletion fails but IPTV Editor user still exists
 */
async function cleanupIPTVEditor(userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required for IPTV Editor cleanup');
    }
    
    console.log(`🧹 Attempting IPTV Editor cleanup for user ${userId}`);
    
    // Show loading state
    const cleanupBtn = document.getElementById('cleanupIPTVEditorBtn');
    if (cleanupBtn) {
      cleanupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cleaning up...';
      cleanupBtn.disabled = true;
    }
    
    // Check if user has IPTV Editor account
    const statusResponse = await fetch(`/api/iptv-editor/users/${userId}/status`);
    const statusData = await statusResponse.json();
    
    if (!statusData.success || !statusData.iptvUser) {
      throw new Error('No IPTV Editor account found for this user');
    }
    
    // Attempt deletion via direct IPTV Editor API
    const deleteResponse = await fetch(`/api/iptv-editor/users/${userId}`, {
      method: 'DELETE'
    });
    
    const deleteData = await deleteResponse.json();
    
    if (deleteData.success) {
      if (window.Utils && window.Utils.showNotification) {
        window.Utils.showNotification('IPTV Editor account cleaned up successfully', 'success');
      } else {
        alert('IPTV Editor account cleaned up successfully');
      }
      
      // Refresh the user interface
      if (typeof loadUserData === 'function') {
        await loadUserData(userId);
      }
    } else {
      throw new Error(deleteData.message || 'IPTV Editor cleanup failed');
    }
    
  } catch (error) {
    console.error('❌ IPTV Editor cleanup failed:', error);
    
    if (window.Utils && window.Utils.showNotification) {
      window.Utils.showNotification(`Cleanup failed: ${error.message}`, 'error');
    } else {
      alert(`Cleanup failed: ${error.message}`);
    }
  } finally {
    // Restore button state
    const cleanupBtn = document.getElementById('cleanupIPTVEditorBtn');
    if (cleanupBtn) {
      cleanupBtn.innerHTML = '<i class="fas fa-broom"></i> Cleanup IPTV Editor';
      cleanupBtn.disabled = false;
    }
  }
}

/**
 * Enhanced delete subscription that handles orphaned accounts
 * OPTIONAL: You can replace your existing deleteSubscription function with this enhanced version
 * OR keep this as a separate function like deleteSubscriptionEnhanced()
 */
async function deleteSubscriptionEnhanced() {
  try {
    const userId = document.getElementById('userId').value; // Get from form
    if (!userId) {
      throw new Error('No user selected');
    }
    
    // Get current user data to check what exists
    const userResponse = await fetch(`/api/users/${userId}`);
    const userData = await userResponse.json();
    
    const hasRegularIPTV = userData.user.iptv_line_id && userData.user.iptv_line_id !== 'None';
    const hasIPTVEditor = userData.user.iptv_editor_enabled;
    
    if (!hasRegularIPTV && !hasIPTVEditor) {
      throw new Error('No IPTV subscriptions found to delete');
    }
    
    let confirmMessage = 'This will delete:\n';
    if (hasRegularIPTV) confirmMessage += '• Regular IPTV subscription\n';
    if (hasIPTVEditor) confirmMessage += '• IPTV Editor account\n';
    confirmMessage += '\nThis action cannot be undone. Continue?';
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    // Show loading state on delete button
    const deleteBtn = document.getElementById('iptvDeleteBtn');
    if (deleteBtn) {
      deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
      deleteBtn.disabled = true;
    }
    
    try {
      // If we have a regular IPTV subscription, use the enhanced deletion endpoint
      if (hasRegularIPTV) {
        const lineId = userData.user.iptv_line_id;
        const response = await fetch(`/api/iptv/subscription/${lineId}?userId=${userId}`, {
          method: 'DELETE'
        });
        
        const result = await response.json();
        
        // Show detailed results
        if (result.success) {
          let message = result.message;
          if (!result.details.all_successful) {
            message += '\n\nSome components failed - you may need to use the cleanup button.';
          }
          
          if (window.Utils && window.Utils.showNotification) {
            window.Utils.showNotification(message, result.details.all_successful ? 'success' : 'warning');
          } else {
            alert(message);
          }
        } else {
          throw new Error(result.message);
        }
      } else if (hasIPTVEditor) {
        // Only IPTV Editor exists - clean it up directly
        await cleanupIPTVEditor(userId);
      }
      
      // Refresh user data
      if (typeof loadUserData === 'function') {
        await loadUserData(userId);
      }
      
    } finally {
      // Restore delete button state
      if (deleteBtn) {
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete Subscription';
        deleteBtn.disabled = false;
      }
    }
    
  } catch (error) {
    console.error('❌ Enhanced deletion failed:', error);
    
    if (window.Utils && window.Utils.showNotification) {
      window.Utils.showNotification(`Deletion failed: ${error.message}`, 'error');
    } else {
      alert(`Deletion failed: ${error.message}`);
    }
  }
}

// Make functions globally available
window.cleanupIPTVEditor = cleanupIPTVEditor;
window.deleteSubscriptionEnhanced = deleteSubscriptionEnhanced;

// Enhanced IPTV check button initialization with proper cleanup
window.initializeIPTVCheck = function() {
    const usernameInput = document.getElementById('existingIptvUsername');
    const checkBtn = document.getElementById('checkAccessBtn');
    
    if (usernameInput && checkBtn) {
        console.log('🔧 Initializing IPTV check button (always-visible version)...');
        
        // CRITICAL: Remove any existing event listeners first to prevent duplicates
        if (usernameInput._iptvInputHandler) {
            usernameInput.removeEventListener('input', usernameInput._iptvInputHandler);
            delete usernameInput._iptvInputHandler;
        }
        if (checkBtn._iptvClickHandler) {
            checkBtn.removeEventListener('click', checkBtn._iptvClickHandler);
            delete checkBtn._iptvClickHandler;
        }
        
        // Create new handler functions and store references for cleanup
        const inputHandler = function() {
            const username = this.value.trim();
            checkBtn.disabled = username.length === 0;
        };
        
        const clickHandler = function() {
            if (window.IPTV && window.IPTV.checkExistingAccess) {
                window.IPTV.checkExistingAccess();
            } else {
                console.error('❌ IPTV.checkExistingAccess not found');
                if (window.Utils && window.Utils.showNotification) {
                    window.Utils.showNotification('IPTV module not properly loaded. Please refresh the page.', 'error');
                }
            }
        };
        
        // Store references for future cleanup
        usernameInput._iptvInputHandler = inputHandler;
        checkBtn._iptvClickHandler = clickHandler;
        
        // Add the event listeners
        usernameInput.addEventListener('input', inputHandler);
        checkBtn.addEventListener('click', clickHandler);
        
        // Set initial button state
        const initialUsername = usernameInput.value.trim();
        checkBtn.disabled = initialUsername.length === 0;
        
        console.log('✅ IPTV check button initialized successfully (always-visible version)');
    } else {
        console.warn('⚠️ IPTV check button elements not found:', {
            usernameInput: !!usernameInput,
            checkBtn: !!checkBtn
        });
    }
};

console.log('👥 Users module loaded successfully');

// Global function that can be called from the HTML
window.checkExistingPlexAccess = async function() {
    const plexEmailField = document.getElementById('plexEmail');
    const emailField = document.getElementById('userEmail');
    const btnText = document.getElementById('checkAccessBtnText');
    const resultsDiv = document.getElementById('plexAccessResults');
    
    // Get email to check
    const emailToCheck = plexEmailField.value.trim() || emailField.value.trim();
    
    if (!emailToCheck) {
        Utils.showNotification('Please enter a Plex email or regular email first', 'error');
        return;
    }
    
    // Update button state
    btnText.innerHTML = '🔄 Checking...';
    
    try {
        console.log('🔍 Checking existing Plex access for:', emailToCheck);
        
        // Use the Users method
        const accessData = await window.Users.checkExistingPlexAccess(emailToCheck);
        
        console.log('📊 Received access data:', accessData);
        
        // Show results
        window.Users.displayPlexAccessResults(accessData, emailToCheck);
        
        // Auto-select detected libraries
        window.Users.autoSelectDetectedLibraries(accessData);
        
        Utils.showNotification('Plex access check completed!', 'success');
        
    } catch (error) {
        console.error('❌ Error checking Plex access:', error);
        Utils.showNotification('Error checking Plex access: ' + error.message, 'error');
        
        // Show error in results
        if (resultsDiv) {
            resultsDiv.innerHTML = `
                <div class="plex-access-error">
                    <p>❌ Error: ${error.message}</p>
                </div>
            `;
            resultsDiv.style.display = 'block';
        }
    } finally {
        // Reset button
        btnText.innerHTML = '🔍 Check for Plex Access';
    }
};

// Function to show/hide the check access section when Plex tags are selected
window.updatePlexAccessCheckVisibility = function() {
    const plex1Checkbox = document.getElementById('tag-plex1');
    const plex2Checkbox = document.getElementById('tag-plex2');
    const checkSection = document.getElementById('plexAccessCheckSection');
    
    if (!checkSection) return;
    
    const hasPlexTags = (plex1Checkbox && plex1Checkbox.checked) || (plex2Checkbox && plex2Checkbox.checked);
    
    if (hasPlexTags) {
        checkSection.style.display = 'block';
    } else {
        checkSection.style.display = 'none';
        // Clear any previous results
        const resultsDiv = document.getElementById('plexAccessResults');
        if (resultsDiv) {
            resultsDiv.style.display = 'none';
            resultsDiv.innerHTML = '';
        }
    }
};