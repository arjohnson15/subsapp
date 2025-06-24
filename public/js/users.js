// Enhanced User Management Functions with Form State Persistence

window.Users = {
    currentSortField: 'name',
    currentSortDirection: 'asc',
    
    async init() {
        await this.loadUsers();
        this.setupEventListeners();
    },
    
    async initForm() {
        await this.loadFormData();
        this.setupFormEventListeners();
    },
    
    setupEventListeners() {
        // Setup search with debounce
        const searchInput = document.getElementById('userSearch');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce(this.filterUsers.bind(this), 300));
        }
    },
    
    setupFormEventListeners() {
        // Setup tag change listeners
        const tagCheckboxes = document.querySelectorAll('input[name="tags"]');
        tagCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                if (e.target.value === 'Plex 1') {
                    this.togglePlexLibrariesByTag('plex1', e.target.checked);
                } else if (e.target.value === 'Plex 2') {
                    this.togglePlexLibrariesByTag('plex2', e.target.checked);
                }
            });
        });
    },
    
    async loadUsers() {
        try {
            window.AppState.users = await API.User.getAll();
            this.renderUsersTable();
        } catch (error) {
            Utils.handleError(error, 'Loading users');
        }
    },
    
    async loadFormData() {
        try {
            // Load owners for dropdown
            const owners = await API.Owner.getAll();
            const subscriptions = await API.Subscription.getAll();
            
            this.updateOwnerDropdown(owners);
            this.updateSubscriptionDropdowns(subscriptions);
            
            // Load Plex libraries
            await window.Plex.loadLibraries();
            
        } catch (error) {
            Utils.handleError(error, 'Loading form data');
        }
    },
    
    updateOwnerDropdown(owners) {
        const ownerSelect = document.getElementById('userOwner');
        if (ownerSelect) {
            ownerSelect.innerHTML = '<option value="">-- No Owner --</option>' +
                owners.map(owner => `<option value="${owner.id}">${owner.name}</option>`).join('');
        }
    },
    
    updateSubscriptionDropdowns(subscriptions) {
        const iptvSelect = document.getElementById('iptvSubscription');
        if (iptvSelect) {
            const iptvOptions = subscriptions
                .filter(sub => sub.type === 'iptv')
                .map(sub => `<option value="${sub.id}">${sub.name} - $${sub.price}</option>`)
                .join('');
            
            iptvSelect.innerHTML = '<option value="">-- No IPTV Selected --</option>' + iptvOptions;
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
    
    async editUser(userId) {
        try {
            console.log(`📝 Starting edit for user ID: ${userId}`);
            
            // Set editing state BEFORE loading the page
            window.AppState.editingUserId = userId;
            
            // Load the user data
            const user = await API.User.getById(userId);
            console.log(`📊 Loaded user for editing:`, user);
            
            // Store user data globally for form population
            window.AppState.currentUserData = user;
            
            // Navigate to user form
            await showPage('user-form');
            
            // Wait a bit longer for the page to fully load, then populate
            setTimeout(() => {
                console.log(`🔧 Populating form for editing user: ${user.name}`);
                this.populateUserFormForEditing(user);
            }, 1000); // Increased timeout to ensure page is ready
            
        } catch (error) {
            Utils.handleError(error, 'Loading user for editing');
        }
    },
    
    // Enhanced form population that actually persists state
    populateUserFormForEditing(user) {
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
            } else {
                console.warn(`⚠️ Element not found: ${fieldId}`);
            }
        });
        
        // Handle checkbox
        const bccCheckbox = document.getElementById('bccOwnerRenewal');
        if (bccCheckbox) {
            bccCheckbox.checked = user.bcc_owner_renewal || false;
        }
        
        // Handle tags and show corresponding library sections
        console.log(`🏷️ Setting tags:`, user.tags);
        document.querySelectorAll('input[name="tags"]').forEach(cb => cb.checked = false);
        
        if (user.tags && Array.isArray(user.tags)) {
            user.tags.forEach(tag => {
                const checkbox = document.querySelector(`input[name="tags"][value="${tag}"]`);
                if (checkbox) {
                    checkbox.checked = true;
                    console.log(`✅ Checked tag: ${tag}`);
                    
                    // Show library sections for checked tags
                    if (tag === 'Plex 1') {
                        console.log(`📚 Showing Plex 1 libraries...`);
                        this.togglePlexLibrariesByTag('plex1', true);
                        
                        // Pre-select user's current libraries after libraries are loaded
                        setTimeout(() => {
                            this.preSelectUserLibraries(user, 'plex1');
                        }, 2000); // Wait for libraries to load
                    }
                    
                    if (tag === 'Plex 2') {
                        console.log(`📚 Showing Plex 2 libraries...`);
                        this.togglePlexLibrariesByTag('plex2', true);
                        
                        // Pre-select user's current libraries after libraries are loaded
                        setTimeout(() => {
                            this.preSelectUserLibraries(user, 'plex2');
                        }, 2000); // Wait for libraries to load
                    }
                } else {
                    console.warn(`⚠️ Tag checkbox not found: ${tag}`);
                }
            });
        }
        
        console.log(`✅ Form population completed for ${user.name}`);
    },
    
    // Pre-select user's current library access based on database
    preSelectUserLibraries(user, serverGroup) {
        console.log(`🔧 Pre-selecting libraries for ${serverGroup}:`, user.plex_libraries);
        
        if (!user.plex_libraries || !user.plex_libraries[serverGroup]) {
            console.log(`ℹ️ No cached library data for ${serverGroup} - user may have no access yet`);
            return;
        }
        
        const userLibraries = user.plex_libraries[serverGroup];
        let selectedCount = 0;
        
        // Select regular libraries
        if (userLibraries.regular && Array.isArray(userLibraries.regular)) {
            userLibraries.regular.forEach(libId => {
                const checkbox = document.querySelector(`input[name="${serverGroup}_regular"][value="${libId}"]`);
                if (checkbox) {
                    checkbox.checked = true;
                    selectedCount++;
                    console.log(`✅ Pre-selected regular library: ${libId}`);
                } else {
                    console.log(`⚠️ Regular library checkbox not found: ${libId} (library may no longer exist)`);
                }
            });
        }
        
        // Select 4K libraries
        if (userLibraries.fourk && Array.isArray(userLibraries.fourk)) {
            userLibraries.fourk.forEach(libId => {
                const checkbox = document.querySelector(`input[name="${serverGroup}_fourk"][value="${libId}"]`);
                if (checkbox) {
                    checkbox.checked = true;
                    selectedCount++;
                    console.log(`✅ Pre-selected 4K library: ${libId}`);
                } else {
                    console.log(`⚠️ 4K library checkbox not found: ${libId} (library may no longer exist)`);
                }
            });
        }
        
        console.log(`📊 Pre-selected ${selectedCount} libraries for ${serverGroup}`);
    },
    
    togglePlexLibrariesByTag(serverGroup, isChecked) {
        const libraryGroup = document.getElementById(`${serverGroup}LibraryGroup`);
        
        if (libraryGroup) {
            if (isChecked) {
                console.log(`📚 Showing ${serverGroup} library section`);
                libraryGroup.style.display = 'block';
                
                // Load libraries for this group if not already loaded
                if (window.Plex) {
                    window.Plex.loadLibrariesForGroup(serverGroup);
                }
            } else {
                console.log(`📚 Hiding ${serverGroup} library section`);
                libraryGroup.style.display = 'none';
                // Clear all selections when hiding
                this.clearAllLibrariesForGroup(serverGroup);
            }
        } else {
            console.warn(`⚠️ Library group element not found: ${serverGroup}LibraryGroup`);
        }
    },
    
    clearAllLibrariesForGroup(serverGroup) {
        console.log(`🗑️ Clearing all library selections for ${serverGroup}`);
        
        // Clear all regular libraries
        document.querySelectorAll(`input[name="${serverGroup}_regular"]`).forEach(cb => {
            cb.checked = false;
        });
        
        // Clear all 4K libraries
        document.querySelectorAll(`input[name="${serverGroup}_fourk"]`).forEach(cb => {
            cb.checked = false;
        });
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
    
    // Enhanced user saving with proper library management
    async saveUser(event) {
        event.preventDefault();
        
        try {
            Utils.showLoading();
            console.log('💾 Starting user save process...');
            
            const formData = Utils.collectFormData('userFormData');
            
            // Handle special field conversions
            formData.bcc_owner_renewal = document.getElementById('bccOwnerRenewal')?.checked || false;
            formData.device_count = parseInt(formData.device_count) || 1;
            
            // Ensure tags is always an array
            if (!formData.tags) formData.tags = [];
            if (!Array.isArray(formData.tags)) formData.tags = [formData.tags];
            
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
            
            // Step 1: Save user to database first
            console.log('💾 Step 1: Saving user to database...');
            if (isEditing) {
                await API.User.update(window.AppState.editingUserId, formData);
                console.log('✅ User updated in database');
            } else {
                await API.User.create(formData);
                console.log('✅ User created in database');
            }
            
            // Step 2: Handle Plex library sharing if user has Plex email and selected libraries
            if (formData.plex_email && this.hasPlexLibrariesSelected(plexLibraries)) {
                console.log('🤝 Step 2: Processing Plex library sharing...');
                
                try {
                    const shareResult = await this.shareUserPlexLibraries(
                        formData.plex_email, 
                        plexLibraries, 
                        !isEditing // isNewUser
                    );
                    
                    if (shareResult.success) {
                        console.log('✅ Plex sharing completed successfully');
                        Utils.showNotification(
                            `User ${isEditing ? 'updated' : 'created'} successfully! ${shareResult.message}`,
                            'success'
                        );
                    } else {
                        console.log('⚠️ Plex sharing had issues:', shareResult);
                        Utils.showNotification(
                            `User ${isEditing ? 'updated' : 'created'}, but: ${shareResult.message}`,
                            'warning'
                        );
                    }
                } catch (shareError) {
                    console.error('❌ Plex sharing failed:', shareError);
                    Utils.showNotification(
                        `User ${isEditing ? 'updated' : 'created'}, but Plex sharing had an issue: ${shareError.message}`,
                        'warning'
                    );
                }
            } else {
                console.log('ℹ️ Step 2: Skipped - No Plex email or libraries selected');
                Utils.showNotification(`User ${isEditing ? 'updated' : 'created'} successfully!`, 'success');
            }
            
            // Step 3: Reset form state and go back to users page
            console.log('🔄 Step 3: Cleaning up and navigating back...');
            this.resetFormState();
            showPage('users');
            
            // Reload users to show updated data
            await this.loadUsers();
            
        } catch (error) {
            console.error('❌ Error saving user:', error);
            Utils.handleError(error, 'Saving user');
        } finally {
            Utils.hideLoading();
        }
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
    
    // Enhanced Plex library sharing using the comprehensive sharing endpoint
    async shareUserPlexLibraries(userEmail, plexLibraries, isNewUser = false) {
        try {
            console.log(`🤝 Starting Plex sharing for ${userEmail}...`);
            console.log(`📋 Libraries to share:`, plexLibraries);
            console.log(`👤 Is new user: ${isNewUser}`);
            
            // Use the comprehensive sharing endpoint
            const shareResult = await apiCall('/plex/share-user-libraries', {
                method: 'POST',
                body: JSON.stringify({
                    userEmail: userEmail,
                    plexLibraries: plexLibraries,
                    isNewUser: isNewUser
                })
            });
            
            console.log('📊 Sharing result:', shareResult);
            
            return shareResult;
            
        } catch (error) {
            console.error('❌ Error in Plex sharing:', error);
            return {
                success: false,
                error: error.message
            };
        }
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
    
    // Auto-calculation functions for subscriptions
    calculateNewPlexExpiration() {
        const subscription = document.getElementById('plexSubscription')?.value;
        const expirationField = document.getElementById('plexExpiration');
        
        if (!expirationField) return;
        
        if (subscription === '12-month') {
            const today = new Date();
            const expiration = new Date(today.setFullYear(today.getFullYear() + 1));
            expirationField.value = expiration.toISOString().split('T')[0];
        } else if (subscription === 'free' || subscription === '') {
            expirationField.value = '';
        }
    },
    
    calculateNewIptvExpiration() {
        const subscription = document.getElementById('iptvSubscription')?.value;
        const expirationField = document.getElementById('iptvExpiration');
        
        if (!expirationField) return;
        
        const selectedSub = window.AppState.subscriptionTypes?.find(sub => sub.id == subscription);
        if (selectedSub) {
            const today = new Date();
            const expiration = new Date(today.setMonth(today.getMonth() + selectedSub.duration_months));
            expirationField.value = expiration.toISOString().split('T')[0];
        } else {
            expirationField.value = '';
        }
    }
};

// Make functions globally available for onclick handlers
window.showUserForm = () => {
    window.AppState.editingUserId = null;
    window.AppState.currentUserData = null;
    showPage('user-form');
};

window.saveUser = window.Users.saveUser.bind(window.Users);
window.calculateNewPlexExpiration = window.Users.calculateNewPlexExpiration.bind(window.Users);
window.calculateNewIptvExpiration = window.Users.calculateNewIptvExpiration.bind(window.Users);