// Enhanced Plex Library Management with improved refresh functionality

window.Plex = {
    async init() {
        await this.loadLibraries();
    },
    
    async loadLibraries() {
        try {
            console.log('📚 Loading Plex libraries...');
            
            // Load both server groups
            const [plex1Data, plex2Data] = await Promise.all([
                this.loadLibrariesForGroup('plex1'),
                this.loadLibrariesForGroup('plex2')
            ]);
            
            // Update global state
            window.AppState.plexLibraries = {
                plex1: plex1Data,
                plex2: plex2Data
            };
            
            console.log('✅ All Plex libraries loaded');
        } catch (error) {
            console.error('❌ Error loading Plex libraries:', error);
            Utils.handleError(error, 'Loading Plex libraries');
        }
    },
    
    async loadLibrariesForGroup(serverGroup) {
        try {
            const data = await API.Plex.getLibraries(serverGroup);
            window.AppState.plexLibraries[serverGroup] = data;
            
            // Render if DOM elements exist
            this.renderPlexLibrariesForGroup(serverGroup, data);
            
            return data;
        } catch (error) {
            console.error(`Error loading ${serverGroup} libraries:`, error);
            throw error;
        }
    },
    
    renderPlexLibrariesForGroup(serverGroup, data) {
        const regularList = document.getElementById(`${serverGroup}RegularLibrariesList`);
        const fourkList = document.getElementById(`${serverGroup}FourkLibrariesList`);
        
        if (regularList && data.regular) {
            this.renderLibraryList(regularList, data.regular, serverGroup, 'regular');
        }
        
        if (fourkList && data.fourk) {
            this.renderLibraryList(fourkList, data.fourk, serverGroup, 'fourk');
        }
    },
    
    renderLibraryList(container, libraries, serverGroup, type) {
        if (!libraries || libraries.length === 0) {
            container.innerHTML = '<p style="color: #666;">No libraries available</p>';
            return;
        }
        
        container.innerHTML = libraries.map(library => `
            <div class="library-item">
                <input type="checkbox" 
                       id="${serverGroup}_${type}_${library.id}" 
                       name="${serverGroup}_${type}" 
                       value="${library.id}">
                <label for="${serverGroup}_${type}_${library.id}">${library.title}</label>
            </div>
        `).join('');
    },
    
    async testConnection(serverGroup) {
        try {
            const statusElement = document.getElementById(`${serverGroup}Status`);
            if (statusElement) {
                statusElement.textContent = 'Testing...';
                statusElement.className = 'connection-status';
            }
            
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
            
            return result;
        } catch (error) {
            console.error(`Error testing ${serverGroup} connection:`, error);
            const statusElement = document.getElementById(`${serverGroup}Status`);
            if (statusElement) {
                statusElement.textContent = 'Error';
                statusElement.className = 'connection-status status-disconnected';
            }
            throw error;
        }
    },
    
    // UPDATED: Enhanced refresh with pre-selection restore
    async refreshLibraries(serverGroup) {
        try {
            const button = event.target;
            const originalText = button.textContent;
            button.textContent = 'Refreshing...';
            button.disabled = true;
            
            console.log(`🔄 Manually refreshing libraries for ${serverGroup}`);
            
            // Force reload from API
            const libraryData = await API.Plex.getLibraries(serverGroup);
            console.log(`📚 Fresh data for ${serverGroup}:`, libraryData);
            
            // Update global state
            window.AppState.plexLibraries[serverGroup] = libraryData;
            
            // Re-render the libraries
            this.renderPlexLibrariesForGroup(serverGroup, libraryData);
            
            // CRITICAL: If we're editing a user, pre-select their current libraries
            if (window.AppState && window.AppState.editingUserId) {
                console.log(`🔧 Re-applying user library selections for ${serverGroup}...`);
                
                // Wait for DOM to update, then pre-select
                setTimeout(() => {
                    this.preSelectUserLibrariesAfterRefresh(serverGroup);
                }, 300);
            }
            
            button.textContent = originalText;
            button.disabled = false;
            
            Utils.showNotification(
                `${serverGroup} libraries refreshed successfully!\n\nRegular: ${libraryData.regular?.length || 0} libraries\n4K: ${libraryData.fourk?.length || 0} libraries`,
                'success'
            );
        } catch (error) {
            console.error('Error refreshing libraries:', error);
            const button = event.target;
            button.textContent = 'Refresh Libraries';
            button.disabled = false;
            Utils.handleError(error, 'Refreshing libraries');
        }
    },
    
    // NEW: Pre-select user libraries after refresh
    preSelectUserLibrariesAfterRefresh(serverGroup) {
        console.log(`🎯 Attempting to pre-select libraries for ${serverGroup} after refresh...`);
        
        // Try different ways to get current user data
        let currentUserData = null;
        
        if (window.AppState && window.AppState.currentUserData) {
            currentUserData = window.AppState.currentUserData;
        }
        
        if (!currentUserData) {
            console.log('❌ No current user data available for pre-selection');
            return;
        }
        
        if (!currentUserData.plex_libraries || !currentUserData.plex_libraries[serverGroup]) {
            console.log(`ℹ️ No library access data for ${serverGroup}`);
            return;
        }
        
        const userLibraries = currentUserData.plex_libraries[serverGroup];
        console.log(`📋 Pre-selecting libraries for ${serverGroup}:`, userLibraries);
        
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
    },
    
    async syncAllLibraries() {
        try {
            const button = event.target;
            const originalText = button.textContent;
            button.textContent = 'Syncing...';
            button.disabled = true;
            
            const result = await API.Plex.syncLibraries();
            
            // Reload all libraries in frontend
            await this.loadLibraries();
            
            button.textContent = originalText;
            button.disabled = false;
            
            if (result.success) {
                // Update last sync time display if element exists
                if (result.timestamp) {
                    const syncDate = new Date(result.timestamp);
                    const lastSyncElement = document.getElementById('lastSyncTime');
                    if (lastSyncElement) {
                        lastSyncElement.textContent = syncDate.toLocaleString();
                    }
                }
                Utils.showNotification('All Plex libraries synced successfully', 'success');
            } else {
                Utils.showNotification('Error syncing libraries: ' + (result.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error syncing libraries:', error);
            const button = event.target;
            button.textContent = 'Sync All Libraries';
            button.disabled = false;
            Utils.handleError(error, 'Syncing libraries');
        }
    },
    
    async forceLoadLibraries() {
        try {
            console.log('🚀 Force loading all Plex libraries...');
            
            // First trigger a sync on the backend
            const syncResult = await API.Plex.syncLibraries();
            console.log('📡 Sync result:', syncResult);
            
            // Then reload libraries in frontend
            await this.loadLibraries();
            
            // Show both library groups if they exist
            const plex1Group = document.getElementById('plex1LibraryGroup');
            const plex2Group = document.getElementById('plex2LibraryGroup');
            
            if (plex1Group) plex1Group.style.display = 'block';
            if (plex2Group) plex2Group.style.display = 'block';
            
            // Test connections
            await this.testConnection('plex1');
            await this.testConnection('plex2');
            
            const plex1Count = window.AppState.plexLibraries.plex1;
            const plex2Count = window.AppState.plexLibraries.plex2;
            
            Utils.showNotification(
                `Libraries force loaded!\n\nPlex 1: ${plex1Count.regular?.length || 0} regular + ${plex1Count.fourk?.length || 0} 4K\nPlex 2: ${plex2Count.regular?.length || 0} regular + ${plex2Count.fourk?.length || 0} 4K`,
                'success'
            );
        } catch (error) {
            console.error('❌ Error force loading libraries:', error);
            Utils.handleError(error, 'Force loading libraries');
        }
    },
    
    async debugLibraries(serverGroup) {
        try {
            console.log(`🐛 Starting debug for ${serverGroup}...`);
            
            // Test direct API call
            console.log(`📞 Making API call to /api/plex/libraries/${serverGroup}`);
            const response = await fetch(`/api/plex/libraries/${serverGroup}`);
            const data = await response.json();
            
            console.log(`📊 Raw API response for ${serverGroup}:`, data);
            console.log(`📋 Regular libraries:`, data.regular);
            console.log(`📋 4K libraries:`, data.fourk);
            
            // Check if DOM elements exist
            const regularList = document.getElementById(`${serverGroup}RegularLibrariesList`);
            const fourkList = document.getElementById(`${serverGroup}FourkLibrariesList`);
            
            console.log(`🔍 DOM Elements check:`, {
                regularList: !!regularList,
                fourkList: !!fourkList
            });
            
            // Try to render manually
            console.log(`🎨 Calling renderPlexLibraries manually...`);
            this.renderPlexLibrariesForGroup(serverGroup, data);
            
            // Update global state
            window.AppState.plexLibraries[serverGroup] = data;
            
            Utils.showNotification(
                `Debug complete for ${serverGroup}!\n\nAPI Response:\nRegular: ${data.regular?.length || 0} libraries\n4K: ${data.fourk?.length || 0} libraries\n\nCheck console for detailed logs.`,
                'info'
            );
        } catch (error) {
            console.error(`❌ Debug failed for ${serverGroup}:`, error);
            Utils.handleError(error, `Debug ${serverGroup}`);
        }
    },
    
    selectAllLibrariesForGroup(serverGroup) {
        console.log(`✅ Selecting all libraries for ${serverGroup}`);
        
        // Select all regular libraries
        document.querySelectorAll(`input[name="${serverGroup}_regular"]`).forEach(cb => {
            cb.checked = true;
        });
        
        // Select all 4K libraries
        document.querySelectorAll(`input[name="${serverGroup}_fourk"]`).forEach(cb => {
            cb.checked = true;
        });
    },
    
    clearAllLibrariesForGroup(serverGroup) {
        console.log(`❌ Clearing all libraries for ${serverGroup}`);
        
        // Clear all regular libraries
        document.querySelectorAll(`input[name="${serverGroup}_regular"]`).forEach(cb => {
            cb.checked = false;
        });
        
        // Clear all 4K libraries
        document.querySelectorAll(`input[name="${serverGroup}_fourk"]`).forEach(cb => {
            cb.checked = false;
        });
    }
};

// Make functions globally available for onclick handlers
window.testPlexConnection = window.Plex.testConnection.bind(window.Plex);
window.refreshPlexLibraries = window.Plex.refreshLibraries.bind(window.Plex);
window.syncAllPlexLibraries = window.Plex.syncAllLibraries.bind(window.Plex);
window.forceLoadLibraries = window.Plex.forceLoadLibraries.bind(window.Plex);
window.debugPlexLibraries = window.Plex.debugLibraries.bind(window.Plex);

window.selectAllPlex1Libraries = () => window.Plex.selectAllLibrariesForGroup('plex1');
window.selectAllPlex2Libraries = () => window.Plex.selectAllLibrariesForGroup('plex2');
window.clearAllPlex1Libraries = () => window.Plex.clearAllLibrariesForGroup('plex1');
window.clearAllPlex2Libraries = () => window.Plex.clearAllLibrariesForGroup('plex2');