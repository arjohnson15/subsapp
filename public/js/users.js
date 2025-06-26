// Enhanced User Management Functions with Background Task System

window.Users = {
    currentSortField: 'name',
    currentSortDirection: 'asc',
    backgroundTasks: new Map(), // Track background tasks
    
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
            try {
                const result = await API.call(`/background-tasks/${taskId}`);
                
                if (result.status === 'completed') {
                    this.handleTaskCompletion(taskId, task, result);
                    this.backgroundTasks.delete(taskId);
                } else if (result.status === 'failed') {
                    this.handleTaskFailure(taskId, task, result);
                    this.backgroundTasks.delete(taskId);
                }
                // If status is 'running', keep monitoring
                
            } catch (error) {
                // Task endpoint might not exist yet, that's fine
                console.log(`Task ${taskId} not found, removing from monitor`);
                this.backgroundTasks.delete(taskId);
            }
        }
    },
    
    handleTaskCompletion(taskId, task, result) {
        console.log(`✅ Background task completed: ${taskId}`, result);
        
        // Show success notification with details
        let message = `${task.description} completed successfully!`;
        
        if (result.data && result.data.apiCallsMade) {
            message += ` Made ${result.data.apiCallsMade} Plex API calls.`;
        }
        
        Utils.showNotification(message, 'success');
        
        // Hide any loading indicators
        Utils.hideLoading();
        
        // Refresh users list if it was a user operation
        if (task.type === 'user_save') {
            this.loadUsers();
        }
    },
    
    handleTaskFailure(taskId, task, result) {
        console.error(`❌ Background task failed: ${taskId}`, result);
        
        let message = `${task.description} failed: ${result.error || 'Unknown error'}`;
        Utils.showNotification(message, 'error');
        
        Utils.hideLoading();
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
            window.AppState.users = await API.User.getAll();
            this.renderUsersTable();
        } catch (error) {
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
                <td style="color: ${user.plex_expiration === 'FREE' ? '#4caf50' : '#fff'}">${Utils.formatDate(user.plex_expiration)}</td>
                <td>${Utils.formatDate(user.iptv_expiration)}</td>
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
        const searchTerm = document.getElementById('userSearch')?.value || '';
        const users = window.AppState.users;
        
        const filteredUsers = Utils.filterArray(users, searchTerm, ['name', 'email']);
        
        // Temporarily update displayed users
        const originalUsers = window.AppState.users;
        window.AppState.users = filteredUsers;
        this.renderUsersTable();
        window.AppState.users = originalUsers;
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
        
        this.renderUsersTable();
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
    
    // FIXED: Proper edit user initialization
    async editUser(userId) {
        try {
            console.log(`📝 Starting edit for user ID: ${userId}`);
            
            // Set editing state FIRST
            window.AppState.editingUserId = userId;
            
            // Load the user data
            const user = await API.User.getById(userId);
            console.log(`📊 Loaded user for editing:`, user);
            
            // Store user data globally
            window.AppState.currentUserData = user;
            
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
    
    // ENHANCED: User saving with background task system
    async saveUser(event) {
        event.preventDefault();
        
        try {
            console.log('💾 Starting enhanced user save with background processing...');
            
            const formData = Utils.collectFormData('userFormData');
            console.log('🔍 Raw form data from Utils.collectFormData:', formData);
            
            // Handle special field conversions
            formData.bcc_owner_renewal = document.getElementById('bccOwnerRenewal')?.checked || false;
            formData.device_count = parseInt(formData.device_count) || 1;
            
            // FIXED: Ensure tags is always an array of strings
            if (!formData.tags) {
                formData.tags = [];
            } else if (!Array.isArray(formData.tags)) {
                // If it's a single value, make it an array
                formData.tags = [formData.tags];
            }
            
            // Ensure all tags are strings
            formData.tags = formData.tags.map(tag => {
                if (typeof tag === 'string') return tag;
                if (typeof tag === 'object' && tag.value) return tag.value;
                if (typeof tag === 'object' && tag.name) return tag.name;
                return String(tag);
            });
            
            console.log('🔍 Processed tags:', formData.tags);
            
            // Collect Plex library selections
            const plexLibraries = this.collectPlexLibrarySelections();
            formData.plex_libraries = plexLibraries;
            
            const isEditing = window.AppState.editingUserId;
            
            console.log('📋 Form data prepared:', {
                name: formData.name,
                email: formData.email,
                plex_email: formData.plex_email,
                tags: formData.tags,
                plexLibraries: plexLibraries,
                isEditing: isEditing
            });
            
            // Step 1: Save user to database quickly
            console.log('💾 Step 1: Saving user to database...');
            let savedUserId;
            
            if (isEditing) {
                await API.User.update(window.AppState.editingUserId, formData);
                savedUserId = window.AppState.editingUserId;
                console.log('✅ User updated in database');
            } else {
                try {
                    const result = await API.User.create(formData);
                    savedUserId = result.userId || result.id;
                    console.log('✅ User created in database');
                } catch (createError) {
                    console.error('❌ Detailed create error:', createError);
                    
                    // Try to get the actual error message from the server
                    let errorMessage = 'Failed to create user';
                    if (createError.message && createError.message.includes('400')) {
                        errorMessage = 'Validation error - check all required fields are filled correctly';
                    }
                    
                    throw new Error(errorMessage + ': ' + createError.message);
                }
            }
            
            // Step 2: Handle Plex library sharing in background if applicable
            if (formData.plex_email && this.hasPlexLibrariesSelected(plexLibraries)) {
                console.log('🚀 Step 2: Starting background Plex library processing...');
                
                // Create background task
                const taskId = this.createBackgroundTask(
                    'user_save',
                    `${isEditing ? 'Updating' : 'Setting up'} Plex access for ${formData.name}`,
                    {
                        userEmail: formData.plex_email,
                        plexLibraries: plexLibraries,
                        isNewUser: !isEditing,
                        userName: formData.name
                    }
                );
                
                // Start background processing (fire and forget)
                this.processPlexLibrariesInBackground(taskId, formData.plex_email, plexLibraries, !isEditing);
                
                // Show immediate success message
                Utils.showNotification(
                    `User ${isEditing ? 'updated' : 'created'} successfully! Plex access is being processed in the background.`,
                    'success'
                );
                
                // Show a small loading indicator for the background task
                this.showBackgroundTaskIndicator(`Processing Plex access for ${formData.name}...`);
                
            } else {
                console.log('ℹ️ Step 2: Skipped - No Plex email or libraries selected');
                Utils.showNotification(`User ${isEditing ? 'updated' : 'created'} successfully!`, 'success');
            }
            
            // Step 3: Clean up and navigate back immediately
            console.log('🔄 Step 3: Cleaning up and navigating back...');
            this.resetFormState();
            showPage('users');
            
            // Reload users to show updated data
            await this.loadUsers();
            
        } catch (error) {
            console.error('❌ Error saving user:', error);
            Utils.handleError(error, 'Saving user');
        }
    },
    
    // Background task processing for Plex operations
    async processPlexLibrariesInBackground(taskId, userEmail, plexLibraries, isNewUser) {
        try {
            console.log(`🔄 Background task ${taskId}: Processing Plex libraries...`);
            
            const result = await API.call('/plex/share-user-libraries', {
                method: 'POST',
                body: JSON.stringify({
                    userEmail: userEmail,
                    plexLibraries: plexLibraries,
                    isNewUser: isNewUser
                })
            });
            
            // Store result for the task monitor to pick up
            await this.storeBackgroundTaskResult(taskId, {
                status: result.success ? 'completed' : 'failed',
                data: result,
                error: result.success ? null : result.message || 'Unknown error'
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
        
        // Add spinner animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        
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
    
    // Mock API endpoint simulation for background tasks
    async checkBackgroundTasks() {
        for (const [taskId, task] of this.backgroundTasks.entries()) {
            // Check if task has a result (completed in background)
            if (task.result) {
                if (task.result.status === 'completed') {
                    this.handleTaskCompletion(taskId, task, task.result);
                } else if (task.result.status === 'failed') {
                    this.handleTaskFailure(taskId, task, task.result);
                }
                
                this.backgroundTasks.delete(taskId);
                this.hideBackgroundTaskIndicator();
            }
            // If no result yet, keep monitoring
        }
    },
    
    // NEW: Remove all Plex access for current user
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
    
    // NEW: Remove user from specific Plex server group
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
    },
    
    // Check if any Plex libraries are selected
    hasPlexLibrariesSelected(plexLibraries) {
        return Object.values(plexLibraries).some(group => 
            (group.regular && group.regular.length > 0) || 
            (group.fourk && group.fourk.length > 0)
        );
    },
    
    collectPlexLibrarySelections() {
        const plexLibraries = {};
        
        // Check if Plex 1 tag is selected
        if (document.getElementById('tag-plex1')?.checked) {
            const regularChecked = Array.from(document.querySelectorAll('input[name="plex1_regular"]:checked')).map(cb => cb.value);
            const fourkChecked = Array.from(document.querySelectorAll('input[name="plex1_fourk"]:checked')).map(cb => cb.value);
            
            if (regularChecked.length > 0 || fourkChecked.length > 0) {
                plexLibraries.plex1 = {
                    regular: regularChecked,
                    fourk: fourkChecked
                };
            }
        }
        
        // Check if Plex 2 tag is selected
        if (document.getElementById('tag-plex2')?.checked) {
            const regularChecked = Array.from(document.querySelectorAll('input[name="plex2_regular"]:checked')).map(cb => cb.value);
            const fourkChecked = Array.from(document.querySelectorAll('input[name="plex2_fourk"]:checked')).map(cb => cb.value);
            
            if (regularChecked.length > 0 || fourkChecked.length > 0) {
                plexLibraries.plex2 = {
                    regular: regularChecked,
                    fourk: fourkChecked
                };
            }
        }
        
        console.log('📋 Collected library selections:', plexLibraries);
        return plexLibraries;
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

// Make the saveUser function globally available
window.saveUser = function(event) {
    return window.Users.saveUser(event);
};