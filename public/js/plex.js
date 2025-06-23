// Plex Management Functions

window.Plex = {
    async loadLibraries() {
        try {
            console.log('🔍 Loading Plex libraries from API...');
            
            // Load both server groups in parallel
            const [plex1Data, plex2Data] = await Promise.all([
                API.Plex.getLibraries('plex1'),
                API.Plex.getLibraries('plex2')
            ]);
            
            console.log('📚 Plex data received:', { plex1: plex1Data, plex2: plex2Data });
            
            // Update global state
            window.AppState.plexLibraries.plex1 = plex1Data;
            window.AppState.plexLibraries.plex2 = plex2Data;
            
            // Render libraries
            this.renderPlexLibraries('plex1', plex1Data);
            this.renderPlexLibraries('plex2', plex2Data);
            
            console.log('✅ All Plex libraries loaded successfully');
        } catch (error) {
            console.error('❌ Error loading Plex libraries:', error);
            Utils.handleError(error, 'Loading Plex libraries');
        }
    },
    
    async loadLibrariesForGroup(serverGroup) {
        try {
            console.log(`📚 Loading libraries specifically for ${serverGroup}`);
            const data = await API.Plex.getLibraries(serverGroup);
            console.log(`📊 Data loaded for ${serverGroup}:`, data);
            
            window.AppState.plexLibraries[serverGroup] = data;
            this.renderPlexLibraries(serverGroup, data);
        } catch (error) {
            console.error(`❌ Error loading libraries for ${serverGroup}:`, error);
            Utils.handleError(error, `Loading ${serverGroup} libraries`);
        }
    },
    
    renderPlexLibraries(serverGroup, libraryData) {
        console.log(`🎨 Rendering libraries for ${serverGroup}:`, libraryData);
        
        const regularList = document.getElementById(`${serverGroup}RegularLibrariesList`);
        const fourkList = document.getElementById(`${serverGroup}FourkLibrariesList`);
        
        if (!regularList || !fourkList) {
            console.error(`❌ Could not find library elements for ${serverGroup}`);
            return;
        }
        
        // Render regular libraries
        if (libraryData.regular && Array.isArray(libraryData.regular) && libraryData.regular.length > 0) {
            console.log(`📖 Rendering ${libraryData.regular.length} regular libraries`);
            regularList.innerHTML = libraryData.regular.map(lib => `
                <div class="library-item">
                    <input type="checkbox" id="${serverGroup}_regular_${lib.id}" name="${serverGroup}_regular" value="${lib.id}">
                    <label for="${serverGroup}_regular_${lib.id}">${lib.title} (${lib.type})</label>
                </div>
            `).join('');
        } else {
            console.log('❌ No regular libraries found');
            regularList.innerHTML = '<div style="color: #4fc3f7;">No regular libraries available</div>';
        }
        
        // Render 4K libraries
        if (libraryData.fourk && Array.isArray(libraryData.fourk) && libraryData.fourk.length > 0) {
            console.log(`📖 Rendering ${libraryData.fourk.length} 4K libraries`);
            fourkList.innerHTML = libraryData.fourk.map(lib => `
                <div class="library-item">
                    <input type="checkbox" id="${serverGroup}_fourk_${lib.id}" name="${serverGroup}_fourk" value="${lib.id}">
                    <label for="${serverGroup}_fourk_${lib.id}">${lib.title} (${lib.type})</label>
                </div>
            `).join('');
        } else {
            console.log('❌ No 4K libraries found');
            fourkList.innerHTML = '<div style="color: #4fc3f7;">No 4K libraries available</div>';
        }
        
        console.log(`✅ Finished rendering libraries for ${serverGroup}`);
    },
    
    async testConnection(serverGroup) {
        const statusElement = document.getElementById(`${serverGroup}Status`) || document.getElementById(`${serverGroup}ServerStatus`);
        
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
            
            // Only show popup if manually clicked (check if this was called from a button click)
            if (event && event.target && event.target.tagName === 'BUTTON') {
                if (result.success) {
                    Utils.showNotification(`${serverGroup.toUpperCase()} connection successful!`, 'success');
                } else {
                    Utils.showNotification(`${serverGroup.toUpperCase()} connection failed: ${result.error}`, 'error');
                }
            }
            
            return result;
        } catch (error) {
            console.error(`Error testing ${serverGroup} connection:`, error);
            if (statusElement) {
                statusElement.textContent = 'Error';
                statusElement.className = 'connection-status status-disconnected';
            }
            
            // Only show popup if manually clicked
            if (event && event.target && event.target.tagName === 'BUTTON') {
                Utils.handleError(error, `Testing ${serverGroup} connection`);
            }
            
            return { success: false, error: error.message };
        }
    },
    
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
            
            // Re-render
            this.renderPlexLibraries(serverGroup, libraryData);
            
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
            this.renderPlexLibraries(serverGroup, data);
            
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