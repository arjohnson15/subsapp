// Enhanced User Management Functions with Background Task System and Fixed Baseline Updates

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
    
    renderUsersTable() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;
        
        const users = window.AppState.users;
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No users found</td></tr>';
            return;
        }
        
        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${user.owner_name || 'N/A'}</td>
                <td>
                    ${user.tags ? user.tags.map(tag => `<span class="tag tag-${tag.toLowerCase().replace(' ', '')}">${tag}</span>`).join('') : ''}
                </td>
                <td style="color: ${user.plex_expiration === 'FREE' ? '#4fc3f7' : (user.plex_expiration ? Utils.isDateExpired(user.plex_expiration) ? '#f44336' : '#4caf50' : '#666')}">
                    ${user.plex_expiration || 'No Subscription'}
                </td>
                <td style="color: ${user.iptv_expiration === 'FREE' ? '#4fc3f7' : (user.iptv_expiration ? Utils.isDateExpired(user.iptv_expiration) ? '#f44336' : '#4caf50' : '#666')}">
                    ${user.iptv_expiration || 'No Subscription'}
                </td>
                <td>
                    <button class="btn btn-small btn-view" onclick="Users.viewUser(${user.id})">View</button>
                    <button class="btn btn-small btn-edit" onclick="Users.editUser(${user.id})">Edit</button>
                    <button class="btn btn-small btn-email" onclick="Users.emailUser('${user.name}', '${user.email}')">Email</button>
                    <button class="btn btn-small btn-delete" onclick="Users.deleteUser(${user.id})">Delete</button>
                </td>
            </tr>
        `).join('');
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
    
    showUserModal(user) {
        const userDetailsDiv = document.getElementById('userDetails');
        if (!userDetailsDiv) return;
        
        userDetailsDiv.innerHTML = `
            <div class="info-item"><div class="info-label">Name</div><div class="info-value">${user.name}</div></div>
            <div class="info-item"><div class="info-label">Email</div><div class="info-value">${user.email}</div></div>
            <div class="info-item"><div class="info-label">Owner</div><div class="info-value">${user.owner_name || 'N/A'}</div></div>
            <div class="info-item"><div class="info-label">Tags</div><div class="info-value">${user.tags ? user.tags.join(', ') : 'None'}</div></div>
            <div class="info-item"><div class="info-label">Plex Email</div><div class="info-value">${user.plex_email || 'N/A'}</div></div>
            <div class="info-item"><div class="info-label">IPTV Username</div><div class="info-value">${user.iptv_username || 'N/A'}</div></div>
            <div class="info-item"><div class="info-label">iMPlayer Code</div><div class="info-value">${user.implayer_code || 'N/A'}</div></div>
            <div class="info-item"><div class="info-label">Device Count</div><div class="info-value">${user.device_count || 'N/A'}</div></div>
        `;
        
        // Load user's current Plex access
        if (user.plex_email) {
            this.loadUserPlexAccess(user.plex_email);
        } else {
            document.getElementById('userLibraryAccess').innerHTML = '<p>No Plex email configured</p>';
        }
        
        document.getElementById('viewUserModal').classList.add('active');
    },
    
    async loadUserPlexAccess(plexEmail) {
        try {
            const access = await API.Plex.getUserAccess(plexEmail);
            const accessDiv = document.getElementById('userLibraryAccess');
            
            let accessHtml = '';
            
            for (const [serverGroup, serverAccess] of Object.entries(access)) {
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
            
            accessDiv.innerHTML = accessHtml || '<p>No Plex access found</p>';
        } catch (error) {
            document.getElementById('userLibraryAccess').innerHTML = '<p>Error loading Plex access</p>';
            console.error('Error loading user Plex access:', error);
        }
    },
    
    // UPDATED: Use new baseline reloader for editing
    async editUser(userId) {
        try {
            console.log(`📝 Starting edit for user ID: ${userId}`);
            
            // Set editing state
            window.AppState.editingUserId = userId;
            
            // Use our new baseline reloader
            const user = await this.reloadUserDataForEditing(userId);
            
            // Navigate to user form
            await showPage('user-form');
            
            // Wait for page to fully load, then populate
            setTimeout(() => {
                console.log(`🔧 Populating form for editing user: ${user.name}`);
                populateFormForEditing(user);
            }, 1200);
            
        } catch (error) {
            Utils.handleError(error, 'Loading user for editing');
        }
    },
    
    emailUser(userName, userEmail) {
        showPage('email');
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
            
            // Handle Plex subscription
            if (plexSubscription === 'free') {
                userData.plex_subscription = 'free';
                userData.plex_expiration = null; // FREE users have no expiration
                userData.plex_is_free = true;
            } else if (plexSubscription && plexSubscription !== '') {
                userData.plex_subscription = parseInt(plexSubscription);
                userData.plex_expiration = plexExpiration || null;
                userData.plex_is_free = false;
            } else {
                userData.plex_subscription = null;
                userData.plex_expiration = null;
                userData.plex_is_free = false;
            }
            
            // Handle IPTV subscription
            if (iptvSubscription && iptvSubscription !== '') {
                userData.iptv_subscription = parseInt(iptvSubscription);
                userData.iptv_expiration = iptvExpiration || null;
                userData.iptv_is_free = false;
            } else {
                userData.iptv_subscription = null;
                userData.iptv_expiration = null;
                userData.iptv_is_free = false;
            }
            
            console.log('🔍 Current form data with subscriptions:', userData);
            
            // OPTIMIZED CHANGE DETECTION
            let shouldUpdatePlexAccess = false;
            const isEditing = window.AppState?.editingUserId;
            
            if (isEditing) {
                // Use stored baseline instead of database fetch
                const originalLibraries = this.originalLibraryBaseline || {};
                const originalUserData = window.AppState.currentUserData || {};
                
                // Check ONLY library-related changes that require API calls
                const normalizedCurrent = this.normalizeLibrariesForComparison(currentPlexLibraries);
                const normalizedOriginal = this.normalizeLibrariesForComparison(originalLibraries);
                const librarySelectionsChanged = !this.deepEqual(normalizedCurrent, normalizedOriginal);

                if (librarySelectionsChanged) {
                    console.log('📊 Library change comparison:');
                    console.log('   Original normalized:', normalizedOriginal);
                    console.log('   Current normalized:', normalizedCurrent);
                }
                const plexEmailChanged = userData.plex_email !== (originalUserData.plex_email || '');
                
                // FIXED: Check if Plex tags changed (Plex 1, Plex 2) - only compare RELEVANT tags
                const currentPlexTags = userData.tags.filter(tag => tag === 'Plex 1' || tag === 'Plex 2').sort();
                const originalPlexTags = (this.originalTagsBaseline || []).filter(tag => tag === 'Plex 1' || tag === 'Plex 2').sort();
                const plexTagsChanged = !this.deepEqual(currentPlexTags, originalPlexTags);
                
                // Only trigger API calls for actual Plex access changes
                if (librarySelectionsChanged || plexEmailChanged || plexTagsChanged) {
                    console.log('🔄 Plex access changes detected:');
                    if (librarySelectionsChanged) {
                        console.log('   - Library selections changed:', {from: originalLibraries, to: currentPlexLibraries});
                    }
                    if (plexEmailChanged) {
                        console.log('   - Plex email changed:', {from: originalUserData.plex_email, to: userData.plex_email});
                    }
                    if (plexTagsChanged) {
                        console.log('   - Plex tags changed:', {from: originalPlexTags, to: currentPlexTags});
                    }
                    shouldUpdatePlexAccess = true;
                } else {
                    console.log('✅ No Plex access changes detected - skipping API calls');
                    
                    // ADDITIONAL CHECK: Make sure we really have the same libraries selected vs available
                    const hasPlexTagsNow = currentPlexTags.length > 0;
                    const hasPlexLibrariesSelected = Object.values(currentPlexLibraries).some(serverGroup => 
                        (serverGroup.regular && serverGroup.regular.length > 0) || 
                        (serverGroup.fourk && serverGroup.fourk.length > 0)
                    );
                    
                    // If user has Plex tags but no libraries selected, or vice versa, we need to update
                    if (hasPlexTagsNow !== hasPlexLibrariesSelected) {
                        console.log('🔄 Plex tag/library mismatch detected - need to sync');
                        shouldUpdatePlexAccess = true;
                    } else {
                        shouldUpdatePlexAccess = false;
                    }
                }
                
                // Tell backend NOT to process tags automatically 
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
                await showPage('users');
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
    
    // Remove all Plex access for current user
    async removePlexAccess() {
        const userId = window.AppState.editingUserId;
        const userData = window.AppState.currentUserData;
        
        if (!userId || !userData) {
            Utils.showNotification('No user selected for Plex removal', 'error');
            return;
        }
        
        const confirmMessage = `Are you sure you want to COMPLETELY REMOVE all Plex access for ${userData.name}?\n\nThis will:\n- Remove them from all Plex servers\n- Clear all library access\n- Remove Plex tags\n- Clear Plex email\n\nThis action cannot be undone!`;
        
        if (!confirm(confirmMessage)) return;
        
        try {
            Utils.showLoading();
            console.log(`🗑️ Removing all Plex access for user ID: ${userId}`);
            
            const result = await API.call(`/users/${userId}/remove-plex-access`, {
                method: 'POST'
            });
            
            if (result.success) {
                Utils.showNotification(
                    `All Plex access removed for ${userData.name}. Removed tags: ${result.removedTags.join(', ')}`,
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
        
        const confirmMessage = `Remove ${userData.name} from ${serverGroup.toUpperCase()}?\n\nThis will:\n- Remove them from ${serverGroup} servers\n- Clear ${serverGroup} library access\n- Remove ${serverGroup} tag if no libraries selected\n\nThis action cannot be undone!`;
        
        if (!confirm(confirmMessage)) return;
        
        try {
            Utils.showLoading();
            console.log(`🗑️ Removing ${serverGroup} access for user ID: ${userId}`);
            
            const userEmail = userData.plex_email || userData.email;
            if (!userEmail) {
                Utils.showNotification('User has no email configured for Plex removal', 'error');
                return;
            }
            
            // Remove from specific server group
            const result = await API.call('/plex/remove-access', {
                method: 'POST',
                body: JSON.stringify({
                    userEmail: userEmail,
                    serverGroups: [serverGroup]
                })
            });
            
            if (result.success) {
                Utils.showNotification(
                    `${userData.name} removed from ${serverGroup.toUpperCase()} successfully!`,
                    'success'
                );
                
                // Update the form to reflect changes
                this.refreshFormAfterServerRemoval(serverGroup);
                
                // Reload user data
                await this.loadUsers();
            } else {
                Utils.showNotification('Failed to remove from ' + serverGroup + ': ' + (result.error || 'Unknown error'), 'error');
            }
            
        } catch (error) {
            console.error(`❌ Error removing from ${serverGroup}:`, error);
            Utils.handleError(error, `Removing from ${serverGroup}`);
        } finally {
            Utils.hideLoading();
        }
    },
    
    // Update form after Plex access removal
    refreshFormAfterPlexRemoval(result) {
        // Clear Plex email
        const plexEmailField = document.getElementById('plexEmail');
        if (plexEmailField) plexEmailField.value = '';
        
        // Uncheck Plex tags
        const plex1Tag = document.getElementById('tag-plex1');
        const plex2Tag = document.getElementById('tag-plex2');
        
        if (plex1Tag) {
            plex1Tag.checked = false;
            togglePlexLibrariesByTag('plex1', false);
        }
        
        if (plex2Tag) {
            plex2Tag.checked = false;
            togglePlexLibrariesByTag('plex2', false);
        }
        
        // Hide the management section
        const managementSection = document.getElementById('plexAccessManagement');
        if (managementSection) {
            managementSection.style.display = 'none';
        }
        
        console.log('✅ Form updated after Plex access removal');
    },
    
    // Update form after specific server removal
    refreshFormAfterServerRemoval(serverGroup) {
        // Uncheck specific tag
        const tag = document.getElementById(`tag-${serverGroup}`);
        if (tag) {
            tag.checked = false;
            togglePlexLibrariesByTag(serverGroup, false);
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
    }
};

// FORM STATE FIXES - Global functions

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
    }
    
    showPage('user-form');
    
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
        
        // Clear ALL checkboxes
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
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
        
        console.log('✅ Clean form initialized for new user');
    }, 700);
};

// Enhanced form population function
function populateFormForEditing(user) {
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
    
    if (user.tags && Array.isArray(user.tags)) {
        user.tags.forEach(tag => {
            const checkbox = document.querySelector(`input[name="tags"][value="${tag}"]`);
            if (checkbox) {
                checkbox.checked = true;
                console.log(`✅ Checked tag: ${tag}`);
                
                // Show library sections for Plex tags and pre-select libraries
                if (tag === 'Plex 1') {
                    showPlexLibrariesAndPreSelect('plex1', user);
                }
                if (tag === 'Plex 2') {
                    showPlexLibrariesAndPreSelect('plex2', user);
                }
            }
        });
    }
    
    console.log(`✅ Form population completed for ${user.name}`);
}

// Show Plex libraries and pre-select user's current access
function showPlexLibrariesAndPreSelect(serverGroup, user) {
    console.log(`📚 Showing ${serverGroup} libraries for editing...`);
    
    const libraryGroup = document.getElementById(`${serverGroup}LibraryGroup`);
    if (libraryGroup) {
        libraryGroup.style.display = 'block';
        
        // Load libraries first, then pre-select
        if (window.Plex) {
            window.Plex.loadLibrariesForGroup(serverGroup).then(() => {
                // Wait a bit for rendering, then pre-select
                setTimeout(() => {
                    preSelectUserLibraries(serverGroup, user);
                }, 800);
            }).catch(error => {
                console.error(`Error loading libraries for ${serverGroup}:`, error);
            });
        }
        
        // Test connection
        if (window.testPlexConnection) {
            window.testPlexConnection(serverGroup);
        }
    }
}

// Pre-select user's current library access
function preSelectUserLibraries(serverGroup, user) {
    console.log(`🔧 Pre-selecting libraries for ${serverGroup}:`, user.plex_libraries);
    
    if (!user.plex_libraries || !user.plex_libraries[serverGroup]) {
        console.log(`ℹ️ No library data for ${serverGroup}`);
        return;
    }
    
    const userLibraries = user.plex_libraries[serverGroup];
    let selectedCount = 0;
    
    // Pre-select regular libraries
    if (userLibraries.regular && Array.isArray(userLibraries.regular)) {
        userLibraries.regular.forEach(libId => {
            const checkbox = document.querySelector(`input[name="${serverGroup}_regular"][value="${libId}"]`);
            if (checkbox) {
                checkbox.checked = true;
                selectedCount++;
                console.log(`✅ Pre-selected regular library: ${libId}`);
            } else {
                console.log(`⚠️ Regular library checkbox not found: ${libId}`);
            }
        });
    }
    
    // Pre-select 4K libraries
    if (userLibraries.fourk && Array.isArray(userLibraries.fourk)) {
        userLibraries.fourk.forEach(libId => {
            const checkbox = document.querySelector(`input[name="${serverGroup}_fourk"][value="${libId}"]`);
            if (checkbox) {
                checkbox.checked = true;
                selectedCount++;
                console.log(`✅ Pre-selected 4K library: ${libId}`);
            } else {
                console.log(`⚠️ 4K library checkbox not found: ${libId}`);
            }
        });
    }
    
    console.log(`📊 Pre-selected ${selectedCount} total libraries for ${serverGroup}`);
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