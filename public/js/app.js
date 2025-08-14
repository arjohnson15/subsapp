window.AppDebug = {
    enabled: false, // SET TO FALSE FOR PRODUCTION
    
    log(...args) {
        if (this.enabled) console.log(...args);
    },
    
    info(...args) {
        console.log(...args); // Always show important info
    },
    
    error(...args) {
        console.error(...args); // Always show errors
    },
    
    warn(...args) {
        console.warn(...args); // Always show warnings
    }
};

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 JohnsonFlix Manager starting...');
    
    // Initialize global state WITHOUT auto-starting dashboard
    if (!window.AppState) {
        window.AppState = {
            currentPage: null,  // <-- CRITICAL: Don't auto-set to dashboard
            editingUserId: null,
            currentUserData: null,
            users: [],
            owners: [],
            subscriptionTypes: [],
            plexLibraries: {
                plex1: { regular: [], fourk: [] },
                plex2: { regular: [], fourk: [] }
            },
            sortOrder: {},
            filters: {}
        };
    }
    
    // Initialize new utility modules
    window.ResponsiveUtils.init();
    window.AccessibilityUtils.enhanceAccessibility();
    

loadInitialData().then(() => {
    // Check for hash first, otherwise default to dashboard
    const hash = window.location.hash.substring(1);
    if (hash) {
        showPage(hash);
    } else {
        showPage('dashboard');  // ✅ Restore auto-dashboard loading
    }
    console.log('✅ JohnsonFlix Manager initialized');
}).catch(error => {
        console.error('❌ Failed to initialize app:', error);
        Utils.showNotification('Failed to initialize application: ' + error.message, 'error');
    });
	});


async function loadInitialData() {
    try {
        console.log('🔄 Loading initial data...');
        
        // Load only essential initial data (not users - they load when navigating to users page)
        const [owners, subscriptions, settings] = await Promise.all([
            API.Owner.getAll(),
            API.Subscription.getAll(),
            API.Settings.getAll()  // <-- ADD THIS LINE
        ]);

        // Update global state
        window.AppState.owners = owners;
        window.AppState.subscriptionTypes = subscriptions;
        // Users will be loaded by the Users module when needed
        
        // APPLY BRANDING GLOBALLY - ADD THIS LINE
        await applyGlobalBranding(settings);
        
        console.log('🔄 Initial data loaded:', {
            owners: owners.length,
            subscriptions: subscriptions.length
        });
    } catch (error) {
        console.error('Error loading initial data:', error);
        throw error;
    }
}

// Global branding application function
async function applyGlobalBranding(settings) {
    try {
        console.log('🎨 Applying global branding...', settings);
        
        // Apply page title
        if (settings.app_title && settings.app_subtitle) {
            document.title = `${settings.app_title} - ${settings.app_subtitle}`;
        } else if (settings.app_title) {
            document.title = settings.app_title;
        }
        
        // Apply favicon
        if (settings.app_favicon) {
            updateGlobalFavicon(settings.app_favicon);
        }
        
        // Apply logo/title in header
        const logoElement = document.querySelector('.logo');
        if (logoElement) {
            if (settings.app_logo) {
                logoElement.innerHTML = `<img src="${settings.app_logo}" alt="${settings.app_title || 'Logo'}" style="max-height: 60px; max-width: 300px; object-fit: contain;">`;
            } else if (settings.app_title) {
                logoElement.textContent = settings.app_title;
            }
        }
        
        // Apply subtitle
        const subtitleElement = document.querySelector('.subtitle');
        if (subtitleElement && settings.app_subtitle) {
            subtitleElement.textContent = settings.app_subtitle;
        }
        
        console.log('✅ Global branding applied successfully');
    } catch (error) {
        console.error('❌ Error applying global branding:', error);
    }
}

// Helper function for favicon updates
function updateGlobalFavicon(faviconUrl) {
    // Remove existing favicon links
    const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
    existingFavicons.forEach(link => link.remove());
    
    // Add new favicon
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/x-icon';
    favicon.href = faviconUrl;
    document.head.appendChild(favicon);
}


async function showPage(pageId) {
    try {
        AppDebug.log(`📄 Navigating to page: ${pageId}`); // Debug only
        
        if (window.AppState.currentPage === 'dashboard' && pageId !== 'dashboard' && window.Dashboard) {
            AppDebug.log('📊 Leaving dashboard - stopping background refresh'); // Debug only
            window.Dashboard.destroy();
        }
        
        Utils.updateUrlHash(pageId);
        
        const loaded = await Utils.loadPageContent(pageId);
        if (!loaded) return;

        window.AppState.currentPage = pageId;
        
        await initializePage(pageId);
        
        AppDebug.log(`✅ Loaded page: ${pageId}`); // Debug only
    } catch (error) {
        AppDebug.error(`Error loading page ${pageId}:`, error); // Always log errors
        Utils.handleError(error, `Loading ${pageId} page`);
    }
}

async function initializePage(pageId) {
    AppDebug.log(`🔧 Initializing page: ${pageId}`); // Debug only
    
    switch (pageId) {
        case 'dashboard':
            if (window.Dashboard && window.Dashboard.init) {
                await window.Dashboard.init();
            }
            break;
            
        case 'users':
            if (window.Users && typeof window.Users.init === 'function') {
                await window.Users.init();
            } else {
                AppDebug.warn('⚠️ Users module not ready yet'); // Always show warnings
            }
            break;
            
        case 'user-form':
            console.log('?? Initializing user form page...');
            // Initialize the user form with proper setup
            await initUserFormPage();
            break;
            
        case 'email':
            if (window.Email && window.Email.init) {
                await window.Email.init();
            }
            break;
            
        case 'management':
            console.log('?? Initializing management page...');
            if (window.Management && window.Management.init) {
                await window.Management.init();
            } else {
                console.error('? Management module not available');
            }
            break;
            
        case 'settings':
            if (window.Settings && window.Settings.init) {
                await window.Settings.init();
            }
            break;
            
        default:
            console.log(`No initialization needed for page: ${pageId}`);
    }
}

async function initUserFormPage() {
    try {
        console.log('🔧 Setting up user form page...');
        
        // Wait a bit for the HTML to be fully loaded
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // DEBUG: Check what IPTV objects are available
        console.log('🔍 Available IPTV objects:', {
            'window.IPTV': !!window.IPTV,
            'window.IPTVUser': !!window.IPTVUser,
            'window.UserFormIPTV': !!window.UserFormIPTV,
            'IPTV_functions': window.IPTV ? Object.keys(window.IPTV).filter(k => typeof window.IPTV[k] === 'function') : []
        });
        
        // CRITICAL: Initialize IPTV module for user form page
        if (window.IPTV && typeof window.IPTV.init === 'function') {
            console.log('📺 Initializing IPTV module for user form...');
            await window.IPTV.init();
        } else {
            console.warn('⚠️ IPTV module not available during user form initialization');
            // Try to wait for it to load
            let attempts = 0;
            const maxAttempts = 10;
            while (!window.IPTV && attempts < maxAttempts) {
                console.log(`⏳ Waiting for IPTV module... attempt ${attempts + 1}`);
                await new Promise(resolve => setTimeout(resolve, 200));
                attempts++;
            }
            
            if (window.IPTV) {
                console.log('✅ IPTV module loaded after waiting');
                if (typeof window.IPTV.init === 'function') {
                    await window.IPTV.init();
                }
            } else {
                console.error('❌ IPTV module never loaded');
            }
        }
        
        // Setup form event listeners
        setupUserFormEventListeners();
        
        // Load form data
        await loadUserFormData();
        
        // Load Plex libraries
        await loadPlexLibrariesForUserForm();
        
        // ENHANCED: Load IPTV status for existing user
        const urlParams = new URLSearchParams(window.location.search);
        const userId = urlParams.get('id');
        
        if (userId && window.IPTV && typeof window.IPTV.loadCurrentUserIPTVStatus === 'function') {
            console.log('📺 Loading IPTV status for existing user...');
            setTimeout(() => {
                window.IPTV.loadCurrentUserIPTVStatus();
            }, 800);
        }
        
        // Load IPTV credits from database
        if (window.UserFormIPTV && typeof window.UserFormIPTV.loadCreditBalance === 'function') {
            console.log('💳 Loading credits for user form...');
            setTimeout(() => {
                window.UserFormIPTV.loadCreditBalance();
            }, 500);
        }
        
        // If editing a user, populate the form
        if (window.AppState.editingUserId) {
            setTimeout(async () => {
                await loadAndPopulateUser(window.AppState.editingUserId);
            }, 500);
        }
        
        console.log('✅ User form page setup complete');
    } catch (error) {
        console.error('❌ Error setting up user form:', error);
        Utils.handleError(error, 'Setting up user form');
    }
}


function toggleIptvManagementByTag(isChecked) {
    console.log(`🔧 Toggling IPTV management: ${isChecked}`);
    
    const iptvSection = document.getElementById('iptvSection');
    if (!iptvSection) {
        console.error(`❌ IPTV section not found`);
        return;
    }
    
    if (isChecked) {
        // Show the section first
        iptvSection.style.display = 'block';
        
        // Check if IPTV module is available
        if (window.IPTV) {
            console.log('📺 IPTV module available, initializing properly...');
            
            setTimeout(() => {
                if (window.AppState?.editingUserId) {
                    console.log('🔧 Editing mode detected - setting up IPTV for existing user...');
                    
                    // Set the current user for IPTV module
                    if (window.AppState.currentUserData && window.IPTV) {
                        window.IPTV.currentUser = window.AppState.currentUserData;
                        console.log('👤 Set current user for IPTV:', window.IPTV.currentUser.name);
                    }
                    
                    // Initialize IPTV interface with existing user
                    if (typeof window.IPTV.showIPTVSection === 'function') {
                        window.IPTV.showIPTVSection(window.AppState.editingUserId);
                    }
                    
                    // Load user IPTV status first (this will call updateStatusInterface internally)
                    if (window.IPTV && typeof window.IPTV.loadCurrentUserIPTVStatus === 'function') {
                        window.IPTV.loadCurrentUserIPTVStatus();
                    }
                    
                } else {
                    console.log('🆕 New user mode - setting up fresh IPTV interface...');
                    
                    // For new users, just populate dropdowns and show check interface
                    if (typeof window.IPTV.populatePackageSelect === 'function') {
                        const packageSuccess = window.IPTV.populatePackageSelect();
                        console.log(`📦 Package dropdown population: ${packageSuccess ? 'SUCCESS' : 'FAILED'}`);
                    }
                    
                    if (typeof window.IPTV.populateChannelGroupSelect === 'function') {
                        const channelSuccess = window.IPTV.populateChannelGroupSelect();
                        console.log(`📺 Channel group dropdown population: ${channelSuccess ? 'SUCCESS' : 'FAILED'}`);
                    }
                    
                    // Update credit display
                    if (typeof window.IPTV.updateCreditDisplay === 'function') {
                        window.IPTV.updateCreditDisplay();
                    }
                    
                    // Initialize form state
                    if (typeof window.IPTV.handleActionChange === 'function') {
                        window.IPTV.handleActionChange();
                    }
                    
                    // Show the check existing interface for new users
                    if (typeof window.IPTV.updateStatusInterface === 'function') {
                        window.IPTV.updateStatusInterface();
                    }
                }
                
                // CRITICAL: ALWAYS initialize the always-visible check button 
                // This must happen AFTER all IPTV module initialization
                setTimeout(() => {
                    if (window.initializeIPTVCheck) {
                        console.log('🔧 Initializing always-visible IPTV check button...');
                        window.initializeIPTVCheck();
                    } else {
                        console.error('❌ initializeIPTVCheck function not found');
                    }
                }, 300); // Slightly longer delay to ensure IPTV module is fully set up
                
            }, 200);
        } else {
            console.warn('⚠️ IPTV module not available when showing IPTV section');
        }
    } else {
        // Hide the section
        iptvSection.style.display = 'none';
        
        // Properly hide using IPTV module
        if (window.IPTV && typeof window.IPTV.hideIPTVSection === 'function') {
            window.IPTV.hideIPTVSection();
        } else if (window.IPTV) {
            // Fallback cleanup
            window.IPTV.currentUser = null;
        }
    }
    
    console.log(`✅ IPTV section ${isChecked ? 'shown' : 'hidden'}`);
}

// Setup user form event listeners
function setupUserFormEventListeners() {
    console.log('?? Setting up user form event listeners...');
    
    // Tag change listeners
const tagCheckboxes = document.querySelectorAll('input[name="tags"]');
tagCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', function(e) {
        const tagValue = e.target.value;
        const isChecked = e.target.checked;
        
        console.log(`🏷️ Tag ${tagValue} changed to ${isChecked}`);
        
        if (tagValue === 'Plex 1') {
            togglePlexLibrariesByTag('plex1', isChecked);
        } else if (tagValue === 'Plex 2') {
            togglePlexLibrariesByTag('plex2', isChecked);
        } else if (tagValue === 'IPTV') {
            toggleIptvManagementByTag(isChecked);
        }
    });
});
    
    // Subscription change listeners
    const plexSub = document.getElementById('plexSubscription');
    const iptvSub = document.getElementById('iptvSubscription');
    
    if (plexSub) {
        plexSub.addEventListener('change', calculateNewPlexExpiration);
    }
    
    if (iptvSub) {
        iptvSub.addEventListener('change', calculateNewIptvExpiration);
    }
    
    console.log('? User form event listeners setup');
}

// Load data for user form
async function loadUserFormData() {
    try {
        console.log('?? Loading user form data...');
        
        // Use existing data if already loaded, otherwise fetch
        let owners = window.AppState.owners;
        let subscriptions = window.AppState.subscriptionTypes;
        
        if (!owners || owners.length === 0) {
            owners = await API.Owner.getAll();
            window.AppState.owners = owners;
        }
        
        if (!subscriptions || subscriptions.length === 0) {
            subscriptions = await API.Subscription.getAll();
            window.AppState.subscriptionTypes = subscriptions;
        }
        
        // Update form dropdowns
        updateOwnerDropdown(owners);
        updateSubscriptionDropdowns(subscriptions);
        
        console.log('? User form data loaded');
    } catch (error) {
        console.error('? Error loading user form data:', error);
        Utils.handleError(error, 'Loading user form data');
    }
}

// Update form dropdowns
function updateOwnerDropdown(owners) {
    const select = document.getElementById('userOwner');
    if (select) {
        select.innerHTML = '<option value="">-- No Owner --</option>' +
            owners.map(owner => `<option value="${owner.id}">${owner.name}</option>`).join('');
    }
}

function updateSubscriptionDropdowns(subscriptions) {
    console.log('🔧 Updating subscription dropdowns with:', subscriptions);
    
    // Update Plex subscription dropdown
    const plexSelect = document.getElementById('plexSubscription');
    if (plexSelect) {
        console.log('🔧 Found Plex subscription dropdown');
        
        // FIXED: Filter out the FREE Plex Access database entry to avoid duplicates
        const plexOptions = subscriptions
    .filter(sub => sub.type === 'plex' && sub.active && sub.price > 0)  // ✅ Only paid plex (price > 0)
    .map(sub => `<option value="${sub.id}">${sub.name} - $${sub.price}</option>`)
            .join('');
        
        // Only include hardcoded FREE option and paid options (no database FREE)
        plexSelect.innerHTML = `
            <option value="">-- Keep Current Plex Subscription --</option>
            <option value="free">FREE Plex Access</option>
            <option value="remove">🗑️ Remove Plex Subscription</option>
            ${plexOptions}
        `;
        
        console.log('✅ Plex dropdown updated with hardcoded FREE and', plexOptions.split('</option>').length - 1, 'paid options');
    } else {
        console.warn('⚠️ Plex subscription dropdown not found');
    }
    
    // Update IPTV subscription dropdown (no changes needed)
    const iptvSelect = document.getElementById('iptvSubscription');
    if (iptvSelect) {
        console.log('🔧 Found IPTV subscription dropdown');
        
        const iptvOptions = subscriptions
            .filter(sub => sub.type === 'iptv' && sub.active)
            .map(sub => `<option value="${sub.id}">${sub.name} - $${sub.price}</option>`)
            .join('');
        
        iptvSelect.innerHTML = `
            <option value="">-- Keep Current IPTV Subscription --</option>
            <option value="remove">🗑️ Remove IPTV Subscription</option>
            ${iptvOptions}
        `;
        
        console.log('✅ IPTV dropdown updated with', iptvOptions.split('</option>').length - 1, 'paid options');
    } else {
        console.warn('⚠️ IPTV subscription dropdown not found');
    }
}

function debugSubscriptionDropdowns() {
    console.log('?? Debugging subscription dropdowns...');
    
    const plexSelect = document.getElementById('plexSubscription');
    const iptvSelect = document.getElementById('iptvSubscription');
    
    console.log('Plex dropdown element:', plexSelect);
    console.log('Plex dropdown HTML:', plexSelect?.innerHTML);
    console.log('IPTV dropdown element:', iptvSelect);
    console.log('IPTV dropdown HTML:', iptvSelect?.innerHTML);
    
    if (window.AppState?.subscriptionTypes) {
        console.log('Available subscription types:', window.AppState.subscriptionTypes);
    } else {
        console.log('No subscription types in AppState');
    }
}

// Load Plex libraries for user form
async function loadPlexLibrariesForUserForm() {
    console.log('?? Loading Plex libraries for user form...');
    
    try {
        // Load libraries for both groups
        await Promise.all([
            loadPlexLibrariesForGroup('plex1'),
            loadPlexLibrariesForGroup('plex2')
        ]);
        
        console.log('? Plex libraries loaded for user form');
    } catch (error) {
        console.error('? Error loading Plex libraries for user form:', error);
    }
}

// Load libraries for a specific group
async function loadPlexLibrariesForGroup(serverGroup) {
    try {
        console.log(`?? Loading ${serverGroup} libraries...`);
        
        const data = await API.Plex.getLibraries(serverGroup);
        console.log(`?? ${serverGroup} data:`, data);
        
        // Store in global state
        window.AppState.plexLibraries[serverGroup] = data;
        
        // Render if the section is visible
        const section = document.getElementById(`${serverGroup}LibraryGroup`);
        if (section && section.style.display !== 'none') {
            renderPlexLibrariesForGroup(serverGroup, data);
        }
        
        console.log(`? ${serverGroup} libraries loaded`);
    } catch (error) {
        console.error(`? Error loading ${serverGroup} libraries:`, error);
        showLibraryLoadError(serverGroup);
    }
}

// Render Plex libraries for a group
function renderPlexLibrariesForGroup(serverGroup, data) {
    console.log(`?? Rendering ${serverGroup} libraries:`, data);
    
    const regularList = document.getElementById(`${serverGroup}RegularLibrariesList`);
    const fourkList = document.getElementById(`${serverGroup}FourkLibrariesList`);
    
    if (!regularList || !fourkList) {
        console.error(`? Library list elements not found for ${serverGroup}`);
        return;
    }
    
    // Render regular libraries
    if (data.regular && data.regular.length > 0) {
        regularList.innerHTML = data.regular.map(lib => `
            <div class="library-item">
                <input type="checkbox" id="${serverGroup}_regular_${lib.id}" name="${serverGroup}_regular" value="${lib.id}">
                <label for="${serverGroup}_regular_${lib.id}">${lib.title} (${lib.type})</label>
            </div>
        `).join('');
    } else {
        regularList.innerHTML = '<div style="color: #4fc3f7;">No regular libraries available</div>';
    }
    
    // Render 4K libraries
    if (data.fourk && data.fourk.length > 0) {
        fourkList.innerHTML = data.fourk.map(lib => `
            <div class="library-item">
                <input type="checkbox" id="${serverGroup}_fourk_${lib.id}" name="${serverGroup}_fourk" value="${lib.id}">
                <label for="${serverGroup}_fourk_${lib.id}">${lib.title} (${lib.type})</label>
            </div>
        `).join('');
    } else {
        fourkList.innerHTML = '<div style="color: #4fc3f7;">No 4K libraries available</div>';
    }
}

// Show library load error
function showLibraryLoadError(serverGroup) {
    const regularList = document.getElementById(`${serverGroup}RegularLibrariesList`);
    const fourkList = document.getElementById(`${serverGroup}FourkLibrariesList`);
    
    if (regularList) regularList.innerHTML = '<div style="color: #f44336;">Error loading libraries</div>';
    if (fourkList) fourkList.innerHTML = '<div style="color: #f44336;">Error loading libraries</div>';
}

// Update the togglePlexLibrariesByTag function to pass user data
function togglePlexLibrariesByTag(serverGroup, isChecked) {
    console.log(`🔧 Toggling ${serverGroup} libraries: ${isChecked}`);
    
    const libraryGroup = document.getElementById(`${serverGroup}LibraryGroup`);
    if (!libraryGroup) {
        console.error(`❌ Library group not found: ${serverGroup}LibraryGroup`);
        return;
    }
    
    if (isChecked) {
        console.log(`✅ Showing ${serverGroup} libraries`);
        libraryGroup.style.display = 'block';
        
const data = window.AppState.plexLibraries[serverGroup];
if (data && (data.regular || data.fourk)) {
    renderPlexLibrariesForGroup(serverGroup, data);
    
    // FIXED: Pass current user data to pre-selection
    if (window.AppState.editingUserId && window.AppState.currentUserData) {
        setTimeout(() => {
            if (window.preSelectUserLibraries) {
                window.preSelectUserLibraries(serverGroup, window.AppState.currentUserData);
            }
        }, 300);
    }
} else {
    loadPlexLibrariesForGroup(serverGroup).then(() => {
        // FIXED: Pass current user data to pre-selection after loading
        if (window.AppState.editingUserId && window.AppState.currentUserData) {
            setTimeout(() => {
                if (window.preSelectUserLibraries) {
                    window.preSelectUserLibraries(serverGroup, window.AppState.currentUserData);
                }
            }, 300);
        }
    });
}
        
        // Test connection quietly
        if (window.testPlexConnectionQuiet) {
            testPlexConnectionQuiet(serverGroup);
        }
    } else {
        console.log(`❌ Hiding ${serverGroup} libraries`);
        libraryGroup.style.display = 'none';
        if (window.clearAllLibrariesForGroup) {
            clearAllLibrariesForGroup(serverGroup);
        }
    }
}


// Test Plex connection quietly
async function testPlexConnectionQuiet(serverGroup) {
    const statusElement = document.getElementById(`${serverGroup}Status`);
    
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
    } catch (error) {
        console.error(`Error testing ${serverGroup} connection:`, error);
        if (statusElement) {
            statusElement.textContent = 'Error';
            statusElement.className = 'connection-status status-disconnected';
        }
    }
}

// Clear library selections
function clearAllLibrariesForGroup(serverGroup) {
    document.querySelectorAll(`input[name="${serverGroup}_regular"]`).forEach(cb => cb.checked = false);
    document.querySelectorAll(`input[name="${serverGroup}_fourk"]`).forEach(cb => cb.checked = false);
}

async function loadAndPopulateUser(userId) {
    try {
        AppDebug.log('📋 Loading and populating user data for ID:', userId); // Debug only
        
        const response = await fetch(`/api/users/${userId}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const userData = await response.json();
        AppDebug.log('✅ User data loaded:', userData); // Debug only
        
        // Populate fields WITHOUT logging each one
        const fields = {
            'name': userData.name,
            'email': userData.email,
            'owner_id': userData.owner_id,
            // ... other fields
        };
        
        // Set field values silently (no per-field logging)
        Object.entries(fields).forEach(([fieldName, value]) => {
            const element = document.getElementById(fieldName);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = Boolean(value);
                } else {
                    element.value = value || '';
                }
                // REMOVED: console.log per field
            }
        });
        
        // Handle tags with minimal logging
        if (userData.tags) {
            try {
                const tags = typeof userData.tags === 'string' ? JSON.parse(userData.tags) : userData.tags;
                AppDebug.log('📋 Processing tags:', tags); // Debug only
                
                document.querySelectorAll('input[name="tags"]').forEach(checkbox => {
                    checkbox.checked = tags.includes(checkbox.value);
                    
                    if (checkbox.value === 'IPTV' && checkbox.checked) {
                        AppDebug.log('📺 IPTV tag detected'); // Debug only
                        if (window.IPTV && typeof window.IPTV.showIPTVSection === 'function') {
                            window.IPTV.showIPTVSection(userId);
                        }
                        
                        setTimeout(() => {
                            if (window.IPTV && typeof window.IPTV.loadCurrentUserIPTVStatus === 'function') {
                                window.IPTV.loadCurrentUserIPTVStatus();
                            }
                        }, 500);
                    }
                });
            } catch (tagError) {
                AppDebug.error('❌ Error processing tags:', tagError);
            }
        }
        
        // Handle libraries with minimal logging
        if (userData.plex_libraries) {
            try {
                const libraries = typeof userData.plex_libraries === 'string' 
                    ? JSON.parse(userData.plex_libraries) 
                    : userData.plex_libraries;
                
                AppDebug.log('📺 Processing Plex libraries:', libraries); // Debug only
                
                // Set checkboxes silently (no per-checkbox logging)
                Object.entries(libraries).forEach(([serverKey, serverLibraries]) => {
                    if (serverLibraries && typeof serverLibraries === 'object') {
                        Object.entries(serverLibraries).forEach(([libraryKey, hasAccess]) => {
                            const checkboxId = `${serverKey}_${libraryKey}`;
                            const checkbox = document.getElementById(checkboxId);
                            if (checkbox) {
                                checkbox.checked = Boolean(hasAccess);
                                // REMOVED: per-checkbox logging
                            }
                        });
                    }
                });
            } catch (libraryError) {
                AppDebug.error('❌ Error processing Plex libraries:', libraryError);
            }
        }
        
        const userIdField = document.getElementById('userId');
        if (userIdField) {
            userIdField.value = userId;
        }
        
        const titleElement = document.querySelector('h2');
        if (titleElement) {
            titleElement.textContent = `Edit User: ${userData.name}`;
        }
        
        AppDebug.log('✅ User form populated successfully'); // Debug only
        
    } catch (error) {
        AppDebug.error('❌ Error loading user data:', error); // Always log errors
        if (window.Utils && window.Utils.showNotification) {
            window.Utils.showNotification(`Failed to load user: ${error.message}`, 'error');
        }
    }
}

// Populate form with user data
function populateUserForm(user) {
    console.log('?? Populating form with user:', user);
    
    // Basic fields
    const fieldMapping = {
        userName: 'name',
        userEmail: 'email',
        userOwner: 'owner_id',
        plexEmail: 'plex_email',
        iptvUsername: 'iptv_username',
        iptvPassword: 'iptv_password',
        implayerCode: 'implayer_code',
        deviceCount: 'device_count'
    };
    
    Object.keys(fieldMapping).forEach(fieldId => {
        const element = document.getElementById(fieldId);
        const userField = fieldMapping[fieldId];
        if (element && user[userField] !== undefined) {
            element.value = user[userField] || '';
        }
    });
    
    // Checkbox
    const bccCheckbox = document.getElementById('bccOwnerRenewal');
    if (bccCheckbox) {
        bccCheckbox.checked = user.bcc_owner_renewal || false;
    }
    
    // Tags and library sections
    document.querySelectorAll('input[name="tags"]').forEach(cb => cb.checked = false);
    if (user.tags && Array.isArray(user.tags)) {
        user.tags.forEach(tag => {
            const checkbox = document.querySelector(`input[name="tags"][value="${tag}"]`);
            if (checkbox) {
                checkbox.checked = true;
                
                // Show library sections for Plex tags and pre-select libraries
                if (tag === 'Plex 1') {
                    togglePlexLibrariesByTag('plex1', true);
                }
                if (tag === 'Plex 2') {
                    togglePlexLibrariesByTag('plex2', true);
                }
            }
        });
    }
    
    // ADD THIS SECTION HERE - Populate subscription information when editing
    const plexExpirationField = document.getElementById('plexExpiration');
    const iptvExpirationField = document.getElementById('iptvExpiration');
    
    if (plexExpirationField && user.plex_expiration) {
        if (user.plex_expiration !== 'No Subscription' && user.plex_expiration !== 'FREE') {
            plexExpirationField.value = user.plex_expiration;
        }
    }
    
    if (iptvExpirationField && user.iptv_expiration) {
        if (user.iptv_expiration !== 'No Subscription' && user.iptv_expiration !== 'FREE') {
            iptvExpirationField.value = user.iptv_expiration;
        }
    }
    
    console.log('?? Populated subscription dates:', {
        plex: user.plex_expiration,
        iptv: user.iptv_expiration
    });
    
    console.log('? Form populated with user data');
}

function handleHashChange() {
    const page = Utils.getHashFromUrl();
    showPage(page);
}


window.Dashboard = {
    expandedSections: new Set(),
    autoRefreshInterval: null,
    backgroundRefreshInterval: null,
    cachedIPTVData: null,
    cachedPlexData: null,
	cachedResourceData: null,
    
    refreshStartTime: null,
    maxRefreshDuration: 30 * 60 * 1000, // 30 minutes
    refreshInterval: 15000, // 15 seconds 

    // NEW: Debug control - SET TO FALSE FOR PRODUCTION
    debugMode: false, // Change to true only when debugging
    
    // Smart logging methods
    debug(...args) {
        if (this.debugMode) console.log(...args);
    },
    
    info(...args) {
        console.log(...args); // Always show important messages
    },
    
    error(...args) {
        console.error(...args); // Always show errors
    },
    
async init() {
    this.info('📊 Initializing enhanced dashboard with server resource monitoring...');
    
    // CRITICAL: Set refresh start time AND reset any existing intervals
    this.refreshStartTime = Date.now();
    
    // IMPORTANT: Stop any existing refresh intervals first
    if (this.backgroundRefreshInterval) {
        clearInterval(this.backgroundRefreshInterval);
        this.backgroundRefreshInterval = null;
    }
    if (this.autoRefreshInterval) {
        clearInterval(this.autoRefreshInterval);
        this.autoRefreshInterval = null;
    }
    
    // Load users first if they're not already loaded
    if (!window.AppState.users || window.AppState.users.length === 0) {
        this.debug('📊 Dashboard: Loading users for stats...');
        try {
            const users = await API.User.getAll();
            window.AppState.users = users;
            window.AppState.allUsers = users;
            this.debug(`📊 Dashboard: Loaded ${users.length} users for stats`);
        } catch (error) {
            this.error('📊 Dashboard: Error loading users:', error);
            window.AppState.users = [];
        }
    }
    
// Load all dashboard data in parallel
await Promise.all([
    this.loadStats(),
    this.loadContentStats(),
    this.loadServerResources(),
    this.preloadLiveData()
]);

// NEW: Update mobile preview counts immediately after preload
this.updateMobilePreviewCounts();

this.debug('🚀 Starting background live data refresh...');
this.startBackgroundRefresh();
    
    this.info('✅ Dashboard fully initialized with server resource monitoring active');
},

    stopBackgroundRefresh() {
        if (this.backgroundRefreshInterval) {
            this.debug('🛑 Stopping background refresh'); // Debug only
            clearInterval(this.backgroundRefreshInterval);
            this.backgroundRefreshInterval = null;
            
            // IMPORTANT: Also reset timing
            this.refreshStartTime = null;
        }
    },
        
    async loadStats() {
        try {
            const users = window.AppState.users || [];
            this.debug('📊 Dashboard: Calculating stats for', users.length, 'users'); // Debug only
            
            // Calculate total unique users (users with any Plex or IPTV tags)
            const uniqueUsers = users.filter(u => {
                if (!u.tags || !Array.isArray(u.tags)) return false;
                return u.tags.some(tag => tag === 'Plex 1' || tag === 'Plex 2' || tag === 'IPTV');
            });
            
            // Update total users count
            const totalUsersEl = document.getElementById('totalUsers');
            if (totalUsersEl) totalUsersEl.textContent = uniqueUsers.length;
            
            // Calculate individual Plex user counts
            const plex1Users = users.filter(u => u.tags && u.tags.includes('Plex 1'));
            const plex2Users = users.filter(u => u.tags && u.tags.includes('Plex 2'));
            
            // Update individual Plex counts in the split layout
            const plex1CountEl = document.getElementById('plex1Count');
            const plex2CountEl = document.getElementById('plex2Count');
            if (plex1CountEl) plex1CountEl.textContent = plex1Users.length;
            if (plex2CountEl) plex2CountEl.textContent = plex2Users.length;
            
            // Calculate IPTV users
            const iptvUsers = users.filter(u => u.tags && u.tags.includes('IPTV'));
            const iptvUsersEl = document.getElementById('iptvUsers');
            if (iptvUsersEl) iptvUsersEl.textContent = iptvUsers.length;
            
            this.debug('📊 Dashboard stats updated:', {
                totalUnique: uniqueUsers.length,
                plex1: plex1Users.length,
                plex2: plex2Users.length,
                totalPlex: plex1Users.length + plex2Users.length,
                iptv: iptvUsers.length
            }); // Debug only
            
        } catch (error) {
            this.error('Error loading stats:', error);
        }
    },
    
async loadContentStats() {
    this.debug('📊 Loading content library statistics...'); // Debug only
    
    // Set loading state for content stats
    this.setContentStatsLoading();
    
    try {
        // Load IPTV content stats
        await this.loadIPTVContentStats();
        
        // Load Plex content stats
        await this.loadPlexContentStats();
        
        // NEW: Load IPTV credits
        await this.loadIPTVCredits();
        
    } catch (error) {
        this.error('Error loading content stats:', error);
        this.setContentStatsError();
    }
},
    
    async loadIPTVContentStats() {
        try {
            this.debug('📺 Loading IPTV content statistics from existing data...'); // Debug only
            
            // Call your existing IPTV Editor route for dashboard stats
            const response = await fetch('/api/iptv-editor/dashboard-stats');
            const iptvStats = await response.json();
            
            this.debug('📺 IPTV stats loaded:', iptvStats); // Debug only
            
            // Update the UI elements
            const iptvElements = {
                channels: document.getElementById('iptvChannels'),
                movies: document.getElementById('iptvMovies'),
                series: document.getElementById('iptvSeries')
            };
            
            // Update the numbers with formatting
            if (iptvElements.channels) {
                iptvElements.channels.textContent = this.formatNumber(iptvStats.channels);
            }
            if (iptvElements.movies) {
                iptvElements.movies.textContent = this.formatNumber(iptvStats.movies);
            }
            if (iptvElements.series) {
                iptvElements.series.textContent = this.formatNumber(iptvStats.series);
            }
            
            // Update last update timestamp if element exists
            const lastUpdateEl = document.querySelector('.iptv-last-update');
            if (lastUpdateEl && iptvStats.lastUpdate) {
                lastUpdateEl.textContent = `Last updated: ${iptvStats.lastUpdate}`;
            }
            
            this.debug('✅ IPTV dashboard stats updated successfully'); // Debug only
            
        } catch (error) {
            this.error('❌ Error loading IPTV content stats:', error);
            
            // Show error state
            const iptvElements = {
                channels: document.getElementById('iptvChannels'),
                movies: document.getElementById('iptvMovies'),
                series: document.getElementById('iptvSeries')
            };
            
            Object.values(iptvElements).forEach(el => {
                if (el) el.textContent = 'Error';
            });
        }
    },
    
    async loadPlexContentStats() {
        try {
            this.debug('🎬 Loading Plex content statistics from cache...'); // Debug only
            
            const response = await fetch('/api/dashboard/plex-stats');
            const plexStats = await response.json();
            
            this.debug('🎬 Plex stats loaded from cache:', plexStats); // Debug only
            
            const plexElements = {
                hdMovies: document.getElementById('plexHDMovies'),
                animeMovies: document.getElementById('plexAnimeMovies'),
                fourkMovies: document.getElementById('plex4KMovies'),
                tvShows: document.getElementById('plexTVShows'),
                animeShows: document.getElementById('plexAnimeShows'), // ADD THIS LINE
                tvSeasons: document.getElementById('plexTVSeasons'),
                tvEpisodes: document.getElementById('plexTVEpisodes'),
                audioBooks: document.getElementById('plexAudioBooks')
            };
            
            // Update UI with cached data (fast!)
            if (plexElements.hdMovies) plexElements.hdMovies.textContent = this.formatNumber(plexStats.hdMovies);
            if (plexElements.animeMovies) plexElements.animeMovies.textContent = this.formatNumber(plexStats.animeMovies);
            if (plexElements.fourkMovies) plexElements.fourkMovies.textContent = this.formatNumber(plexStats.fourkMovies);
            if (plexElements.tvShows) plexElements.tvShows.textContent = this.formatNumber(plexStats.tvShows);
            if (plexElements.animeShows) plexElements.animeShows.textContent = this.formatNumber(plexStats.animeTVShows); // ADD THIS LINE
            if (plexElements.tvSeasons) plexElements.tvSeasons.textContent = this.formatNumber(plexStats.tvSeasons);
            if (plexElements.tvEpisodes) plexElements.tvEpisodes.textContent = this.formatNumber(plexStats.tvEpisodes);
            if (plexElements.audioBooks) plexElements.audioBooks.textContent = this.formatNumber(plexStats.audioBooks);
            
            this.debug('✅ Plex dashboard stats updated from cache'); // Debug only
            
        } catch (error) {
            this.error('❌ Error loading Plex content stats:', error);
            
            // Show error state
            const plexElements = [
                'plexHDMovies', 'plexAnimeMovies', 'plex4KMovies',
                'plexTVShows', 'plexAnimeShows', 'plexTVSeasons', 'plexTVEpisodes', 'plexAudioBooks' // ADD plexAnimeShows HERE TOO
            ];
            
            plexElements.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = 'Error';
            });
        }
    },
	
	async loadIPTVCredits() {
    try {
        this.debug('💳 Loading IPTV credit balance for dashboard...'); // Debug only
        
        const response = await fetch('/api/settings');
        const data = await response.json();
        
        let credits = 0;
        
        // Handle different response formats (same logic as IPTV module)
        if (data.iptv_credits_balance !== undefined) {
            credits = parseInt(data.iptv_credits_balance) || 0;
        } else if (data.success && data.settings && Array.isArray(data.settings)) {
            const creditSetting = data.settings.find(s => s.setting_key === 'iptv_credits_balance');
            credits = creditSetting ? parseInt(creditSetting.setting_value) || 0 : 0;
        } else if (data.settings && Array.isArray(data.settings)) {
            const creditSetting = data.settings.find(s => s.setting_key === 'iptv_credits_balance');
            credits = creditSetting ? parseInt(creditSetting.setting_value) || 0 : 0;
        }
        
        // Update the display using existing formatNumber function
        const creditsEl = document.getElementById('iptvCredits');
        if (creditsEl) {
            creditsEl.textContent = this.formatNumber(credits);
        }
        
        this.debug(`💳 Dashboard IPTV credits loaded: ${credits}`); // Debug only
        
    } catch (error) {
        this.error('❌ Error loading IPTV credits for dashboard:', error);
        const creditsEl = document.getElementById('iptvCredits');
        if (creditsEl) {
            creditsEl.textContent = '-';
        }
    }
},

        
    setContentStatsLoading() {
        const elements = [
            'iptvChannels', 'iptvMovies', 'iptvSeries',
            'plexHDMovies', 'plex4KMovies', 'plexTVShows', 'plexAudioBooks'
        ];
        
        elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = '-';
                el.parentElement?.classList.add('loading');
            }
        });
    },
    
    setContentStatsError() {
        const elements = [
            'iptvChannels', 'iptvMovies', 'iptvSeries',
            'plexHDMovies', 'plex4KMovies', 'plexTVShows', 'plexAudioBooks'
        ];
        
        elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = 'Error';
                el.parentElement?.classList.remove('loading');
            }
        });
    },
    
    formatNumber(num) {
        if (num === 0 || num === null || num === undefined) return '0';
        return new Intl.NumberFormat().format(num);
    },
    
    // NEW: Collapsible live section functionality
    async toggleLiveSection(type) {
        const section = document.getElementById(`${type}LiveSection`);
        if (!section) {
            this.error(`Live section ${type} not found`);
            return;
        }
        
        const isExpanded = section.classList.contains('expanded');
        
        if (isExpanded) {
            // Collapse section
            section.classList.remove('expanded');
            this.expandedSections.delete(type);
            this.debug(`📱 Collapsed ${type} live section`); // Debug only
            
            // Stop auto-refresh if no sections are expanded
            if (this.expandedSections.size === 0) {
                this.stopAutoRefresh();
            }
        } else {
            // Expand section and load data
            section.classList.add('expanded');
            this.expandedSections.add(type);
            this.debug(`📱 Expanded ${type} live section`); // Debug only
            
            // Start auto-refresh if this is the first expanded section
            if (this.expandedSections.size === 1) {
                this.startAutoRefresh();
            }
            
            // Load data for this section
            await this.loadLiveDataForSection(type);
        }
    },
    
    async loadLiveDataForSection(type) {
        try {
            if (type === 'iptv') {
                this.debug('📺 Loading IPTV live viewers (cached)...'); // Debug only
                if (this.cachedIPTVData) {
                    this.updateIPTVViewers(this.cachedIPTVData);
                } else {
                    const response = await fetch('/api/dashboard/iptv-live');
                    const iptvData = await response.json();
                    this.cachedIPTVData = iptvData;
                    this.updateIPTVViewers(iptvData);
                }
            } else if (type === 'plex') {
                this.debug('🎬 Loading Plex sessions (cached)...'); // Debug only
                if (this.cachedPlexData) {
                    this.updatePlexSessions(this.cachedPlexData);
                } else {
                    const response = await fetch('/api/dashboard/plex-now-playing');
                    const plexData = await response.json();
                    this.cachedPlexData = plexData;
                    this.updatePlexSessions(plexData);
                }
            }
        } catch (error) {
            this.error(`Error loading ${type} live data:`, error);
            this.setLiveDataError(type);
        }
    },
        
    startAutoRefresh() {
        if (this.autoRefreshInterval) return;
        
        this.debug('🔄 Starting auto-refresh for expanded sections (15s intervals)'); // Debug only
        this.autoRefreshInterval = setInterval(() => {
            // Check 30-minute timeout for expanded sections too
            const elapsedTime = Date.now() - this.refreshStartTime;
            if (elapsedTime >= this.maxRefreshDuration) {
                this.info('⏰ Expanded sections auto-refresh also stopped (30min)');
                this.stopAutoRefresh();
                return;
            }
            
            this.expandedSections.forEach(type => {
                this.loadLiveDataForSection(type);
            });
        }, this.refreshInterval); // 15 seconds instead of 30000
    },
        
    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
            this.debug('⏹️ Stopped auto-refresh'); // Debug only
        }
    },
    
    async refreshIPTVViewers() {
        this.debug('📺 Manual refresh IPTV viewers...'); // Debug only
        const container = document.getElementById('iptvViewersContainer');
        const refreshBtn = document.querySelector('[onclick="Dashboard.refreshIPTVViewers()"]');
        
        if (container) {
            container.innerHTML = `
                <div class="plex-sessions-loading">
                    <i class="fas fa-spinner"></i>
                    Refreshing IPTV viewers...
                </div>
            `;
        }
        
        // Disable refresh button temporarily
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.style.opacity = '0.5';
        }
        
        try {
            await this.loadLiveDataForSection('iptv');
            
            // Re-enable refresh button
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.style.opacity = '1';
            }
            
        } catch (error) {
            this.error('Error refreshing IPTV viewers:', error);
            this.setLiveDataError('iptv');
            
            // Re-enable refresh button
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.style.opacity = '1';
            }
        }
    },
        
    async refreshPlexSessions() {
        this.debug('🔄 Manually refreshing Plex sessions...'); // Debug only
        
        const container = document.getElementById('plexSessionsContainer');
        const refreshBtn = document.querySelector('.plex-refresh');
        
        if (!container) return;
        
        // Show loading state
        container.innerHTML = `
            <div class="sessions-loading">
                <i class="fas fa-spinner"></i>
                Loading Plex sessions...
            </div>
        `;
        
        // Disable and animate refresh button
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }
        
        try {
            const response = await fetch('/api/dashboard/plex-now-playing');
            const data = await response.json();
            
            // Cache the data
            this.cachedPlexData = data;
            
            // Update the session count in header
            const countElement = document.getElementById('plexSessionCount');
            if (countElement) {
                countElement.textContent = (data.sessions || []).length.toString();
            }
            
            // Update the displayed sessions
            this.updatePlexSessions(data);
            
            this.debug('✅ Plex sessions refreshed successfully'); // Debug only
            
        } catch (error) {
            this.error('❌ Error refreshing Plex sessions:', error);
            container.innerHTML = `
                <div class="sessions-empty" style="color: #f44336;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div>Error loading Plex sessions</div>
                    <div style="font-size: 0.8rem; opacity: 0.7; margin-top: 5px;">${error.message}</div>
                </div>
            `;
        } finally {
            // Reset refresh button
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
            }
        }
    },
	
	// Mobile preview counts update
updateMobilePreviewCounts() {
    try {
        // Only run on mobile
        if (window.innerWidth > 768) return;
        
        // Update IPTV mobile preview
        if (this.cachedIPTVData && this.cachedIPTVData.viewers) {
            const iptvPreview = document.getElementById('iptvViewersPreview');
            if (iptvPreview) {
                iptvPreview.textContent = this.cachedIPTVData.viewers.length.toString();
            }
        }
        
        // Update Plex mobile preview
        if (this.cachedPlexData && this.cachedPlexData.sessions) {
            const plexPreview = document.getElementById('plexSessionCountMobile');
            const bandwidthPreview = document.getElementById('plexBandwidthMobile');
            
            if (plexPreview) {
                plexPreview.textContent = this.cachedPlexData.sessions.length.toString();
            }
            
            if (bandwidthPreview) {
                if (this.cachedPlexData.sessions.length > 0) {
                    const summaryStats = this.generateSessionSummary(this.cachedPlexData.sessions);
                    const bandwidthMatch = summaryStats.match(/Bandwidth:\s*([\d.]+\s*Mbps)/i);
                    if (bandwidthMatch) {
                        bandwidthPreview.textContent = bandwidthMatch[1];
                    } else {
                        bandwidthPreview.textContent = 'Active';
                    }
                } else {
                    bandwidthPreview.textContent = '0 Mbps';
                }
            }
        }
        
        console.log('📱 Mobile preview counts updated by main Dashboard');
    } catch (error) {
        console.error('❌ Error updating mobile preview counts:', error);
    }
},
        
    // OPTIMIZED: Remove excessive logging from updatePlexSessions
    updatePlexSessions(data) {
        // REMOVED: console.log('🎬 Updating Plex sessions with stable ordering:', data);
        
        const container = document.getElementById('plexSessionsContainer');
        const summaryElement = document.getElementById('plexSessionSummary');
        
        if (!container) {
            this.error('❌ Plex sessions container not found');
            return;
        }
        
        if (!data || !data.sessions || data.sessions.length === 0) {
            container.innerHTML = `
                <div class="sessions-empty">
                    <i class="fas fa-tv"></i>
                    <p>No active Plex sessions</p>
                    <small>Users will appear here when streaming content</small>
                </div>
            `;
            
            // Hide summary when no sessions
            if (summaryElement) {
                summaryElement.style.display = 'none';
            }
            
            return;
        }
        
        // Generate session summary for HEADER
        const summaryStats = this.generateSessionSummary(data.sessions);
        
        // Update header summary element
        if (summaryElement) {
            summaryElement.innerHTML = summaryStats;
            summaryElement.style.display = 'block';
        }
        
        // STABLE ORDER LOGIC - Don't rebuild if sessions haven't changed significantly
        const existingGrid = container.querySelector('.tautulli-sessions-grid');
        const existingSessions = existingGrid ? Array.from(existingGrid.querySelectorAll('.tautulli-session-card')).map(card => 
            card.getAttribute('data-session-key')
        ) : [];
        
        const newSessionKeys = data.sessions.map(s => s.sessionKey || s.ratingKey || s.user + s.title);
        
        // Check if we can do an in-place update instead of full rebuild
        const canUpdateInPlace = existingSessions.length > 0 && 
                                 existingSessions.length === newSessionKeys.length &&
                                 existingSessions.every((key, index) => key === newSessionKeys[index]);
        
        if (canUpdateInPlace && existingGrid) {
            this.debug('🔄 Doing in-place session update (maintains order)'); // Debug only
            this.updateSessionsInPlace(existingGrid, data.sessions);
        } else {
            this.debug('🔄 Full session rebuild (session list changed)'); // Debug only
            this.rebuildSessionsGrid(container, data.sessions);
        }
        
        // REMOVED: Excessive success logging
        this.debug(`✅ Updated ${data.sessions.length} Plex sessions - order preserved`); // Debug only
    },

    updateSingleSessionCard(card, session) {
        try {
            // Update progress bar
            const progressFill = card.querySelector('.progress-fill-bottom');
            const progressText = card.querySelector('.progress-text-bottom');
            
            if (progressFill && progressText) {
                const viewOffset = parseInt(session.viewOffset) || 0;
                const duration = parseInt(session.duration) || 1;
                const progressPercent = Math.round((viewOffset / duration) * 100);
                const progressWidth = Math.min(Math.max(progressPercent, 0), 100);
                
                progressFill.style.width = `${progressWidth}%`;
                
                const currentTime = session.elapsedTime || this.formatDuration(viewOffset);
                const totalTime = session.durationFormatted || this.formatDuration(duration);
                progressText.textContent = `${currentTime} / ${totalTime} (${progressPercent}%)`;
            }
            
            // Update metadata values (bandwidths, stream states, etc. can change)
            const metadataRows = card.querySelectorAll('.metadata-row-compact');
            metadataRows.forEach(row => {
                const label = row.querySelector('.metadata-label-compact');
                const value = row.querySelector('.metadata-value-compact');
                
                if (label && value) {
                    const labelText = label.textContent.toLowerCase();
                    
                    if (labelText.includes('bandwidth')) {
                        value.textContent = session.bandwidth || 'Unknown';
                    } else if (labelText.includes('stream')) {
                        value.textContent = session.stream || 'Unknown';
                    } else if (labelText.includes('quality')) {
                        value.textContent = session.quality || 'Unknown';
                    }
                    // Add more fields as needed
                }
            });
            
            // REMOVED: console.log('✅ Updated session card in-place for:', session.title);
            
        } catch (error) {
            this.error('❌ Error updating session card:', error);
        }
    },

    // NEW METHOD: Full rebuild when session list changes
    rebuildSessionsGrid(container, sessions) {
        // Sort sessions by a stable criteria (user + title) to maintain consistent order
        const sortedSessions = [...sessions].sort((a, b) => {
            const keyA = `${a.user}_${a.title}_${a.sessionKey || a.ratingKey}`;
            const keyB = `${b.user}_${b.title}_${b.sessionKey || b.ratingKey}`;
            return keyA.localeCompare(keyB);
        });
        
        const sessionsHtml = `
            <div class="tautulli-sessions-grid">
                ${sortedSessions.map(session => {
                    const sessionCard = this.createTautulliSessionCard(session);
                    // Add session key for tracking
                    const sessionKey = session.sessionKey || session.ratingKey || session.user + session.title;
                    return sessionCard.replace('<div class="tautulli-session-card redesigned"', 
                        `<div class="tautulli-session-card redesigned" data-session-key="${sessionKey}"`);
                }).join('')}
            </div>
        `;
        
        container.innerHTML = sessionsHtml;
    },

    // ALSO UPDATE the generateSessionSummary method to use the parsed data:
    generateSessionSummary(sessions) {
        const totalSessions = sessions.length;
        
        // Count by decision type using the enhanced backend data
        let directPlays = 0;
        let directStreams = 0; 
        let transcodes = 0;
        let totalBandwidth = 0;
        let wanBandwidth = 0;
        
        sessions.forEach(session => {
            // Use the enhanced bandwidth from backend
            if (session.bandwidth && session.bandwidth !== 'Unknown') {
                const bandwidthMatch = session.bandwidth.match(/(\d+(?:\.\d+)?)/);
                if (bandwidthMatch) {
                    const bw = parseFloat(bandwidthMatch[1]);
                    if (!isNaN(bw)) {
                        totalBandwidth += bw;
                        // Add to WAN if not local
                        if (session.location !== 'LAN' && !session.local) {
                            wanBandwidth += bw;
                        }
                    }
                }
            }
            
            // Use the enhanced stream decision from backend
            const decision = session.streamingDecision || session.transcodeDecision || 'unknown';
            
            if (decision.toLowerCase().includes('directplay') || decision.toLowerCase().includes('direct play')) {
                directPlays++;
            } else if (decision.toLowerCase().includes('directstream') || decision.toLowerCase().includes('direct stream')) {
                directStreams++;
            } else if (decision.toLowerCase().includes('transcode')) {
                transcodes++;
            } else {
                // Unknown - assume transcode for safety
                transcodes++;
            }
        });
        
        // Format the summary similar to Tautulli
        let summary = `<strong>Sessions:</strong> ${totalSessions} stream${totalSessions !== 1 ? 's' : ''}`;
        
        const streamTypes = [];
        if (directPlays > 0) streamTypes.push(`${directPlays} direct play${directPlays !== 1 ? 's' : ''}`);
        if (directStreams > 0) streamTypes.push(`${directStreams} direct stream${directStreams !== 1 ? 's' : ''}`);
        if (transcodes > 0) streamTypes.push(`${transcodes} transcode${transcodes !== 1 ? 's' : ''}`);
        
        if (streamTypes.length > 0) {
            summary += ` (${streamTypes.join(', ')})`;
        }
        
        if (totalBandwidth > 0) {
            summary += ` | <strong>Bandwidth:</strong> ${totalBandwidth.toFixed(1)} Mbps`;
            if (wanBandwidth > 0) {
                summary += ` (WAN: ${wanBandwidth.toFixed(1)} Mbps)`;
            }
        }
        
        return summary;
    },

    // OPTIMIZED createTautulliSessionCard function - Removes excessive logging
    createTautulliSessionCard(session) {
        // REMOVED: console.log('🎬 Creating Tautulli-style card for:', session.title);
        
        // Enhanced poster URL handling
        let posterUrl = '';

        const createProxyImageUrl = (originalUrl) => {
            if (!originalUrl) return '';
            
            if (window.location.protocol === 'https:' && originalUrl.startsWith('http://')) {
                return `/api/dashboard/plex-image?url=${encodeURIComponent(originalUrl)}`;
            }
            
            return originalUrl;
        };

        // Better poster priority - TV shows use show poster, not episode screenshot
        if (session.type === 'episode' && session.grandparentThumb) {
            posterUrl = createProxyImageUrl(session.grandparentThumb);
        } else if (session.thumb) {
            posterUrl = createProxyImageUrl(session.thumb);
        } else if (session.art) {
            posterUrl = createProxyImageUrl(session.art);
        }
        
        // Enhanced progress calculation
        const viewOffset = parseInt(session.viewOffset) || 0;
        const duration = parseInt(session.duration) || 1;
        const progressPercent = Math.round((viewOffset / duration) * 100);
        const progressWidth = Math.min(Math.max(progressPercent, 0), 100);
        
        // Use formatted times from backend
        const currentTime = session.elapsedTime || this.formatDuration(viewOffset);
        const totalTime = session.durationFormatted || this.formatDuration(duration);
        
        // Enhanced title and subtitle building - NO MORE ? CHARACTERS
        let displayTitle = session.title || 'Unknown';
        let displaySubtitle = '';
        
        // Build subtitle based on content type
        if (session.type === 'episode') {
            // For TV episodes, show the show name as title, episode info as subtitle
            displayTitle = session.grandparentTitle || session.title;
            
            const seasonNum = session.parentIndex ? String(session.parentIndex).padStart(2, '0') : '00';
            const episodeNum = session.index ? String(session.index).padStart(2, '0') : '00';
            const episodeTitle = session.title || '';
            
            displaySubtitle = `S${seasonNum}E${episodeNum}`;
            if (episodeTitle && episodeTitle !== displayTitle) {
                displaySubtitle += ` - ${episodeTitle}`; // Use dash instead of bullet
            }
            if (session.year) {
                displaySubtitle += ` (${session.year})`;
            }
            
        } else if (session.type === 'movie') {
            // For movies, show movie title and year/studio - FIXED SEPARATOR
            displayTitle = session.title;
            
            const yearPart = session.year ? `(${session.year})` : '';
            const studioPart = session.studio ? session.studio : '';
            
            if (yearPart && studioPart) {
                displaySubtitle = `${yearPart} - ${studioPart}`; // Use dash instead of bullet
            } else if (yearPart) {
                displaySubtitle = yearPart;
            } else if (studioPart) {
                displaySubtitle = studioPart;
            }
            
        } else if (session.type === 'track') {
            // For music tracks
            displayTitle = session.title;
            const artist = session.grandparentTitle || '';
            const album = session.parentTitle || '';
            
            if (artist && album && artist !== album) {
                displaySubtitle = `${artist} - ${album}`; // Use dash instead of bullet
            } else if (artist) {
                displaySubtitle = artist;
            } else if (album) {
                displaySubtitle = album;
            }
        }
        
        // ===== EXTRACT TAUTULLI-STYLE METADATA - FIXED PARSING =====
        
        // Player and Product info - exactly like Tautulli
        const playerProduct = session.product || session.playerProduct || 'Unknown';
        const playerTitle = session.player || session.playerTitle || playerProduct;
        
        // Quality info - use the enhanced session data
        const qualityDisplay = session.quality || session.bandwidth || 'Unknown';
        
        // Stream Decision - use the enhanced session data
        const streamDecision = session.stream || session.streamingDecision || session.transcodeDecision || session.decision || 'Unknown';
        
        // Container info - use the enhanced session data with proper formatting
        let containerDisplay = 'Unknown';
        if (session.container) {
            containerDisplay = session.container;
        } else {
            const container = session.Container || session.containerFormat || 'Unknown';
            if (container !== 'Unknown') {
                containerDisplay = `Direct Play (${container.toUpperCase()})`;
            }
        }
        
        // Video info - use the enhanced session data
        let videoDisplay = 'Unknown';
        if (session.video) {
            videoDisplay = session.video;
        } else {
            const videoCodec = session.videoCodec || session.VideoCodec || '';
            const videoResolution = session.videoResolution || session.resolution || '';
            if (videoCodec) {
                videoDisplay = `Direct Play (${videoCodec.toUpperCase()}${videoResolution ? ' ' + videoResolution : ''})`;
            }
        }
        
        // Audio info - use the enhanced session data
        let audioDisplay = 'Unknown';
        if (session.audio) {
            audioDisplay = session.audio;
        } else {
            const audioCodec = session.audioCodec || session.AudioCodec || '';
            const audioChannels = session.audioChannels || session.channels || '';
            if (audioCodec) {
                audioDisplay = `Direct Play (${audioCodec.toUpperCase()}${audioChannels ? ' ' + audioChannels : ''})`;
            }
        }
        
        // Location info - Extract only IP address (NO LOGGING)
        const location = session.location || 'Unknown';
        let ipAddress = 'Unknown';
        
        if (location && location !== 'Unknown') {
            // REMOVED: console.log('🔍 Raw location data:', location);
            
            // Use regex to extract IP address pattern directly
            const ipPattern = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/;
            const ipMatch = location.match(ipPattern);
            
            if (ipMatch) {
                ipAddress = ipMatch[1]; // Use the first captured IP address
                // REMOVED: console.log('✅ Extracted IP:', ipAddress);
            } else {
                // Fallback: aggressive cleaning
                ipAddress = location
                    .replace(/WAN\s*:\s*/gi, '') // Remove WAN: (case insensitive)
                    .replace(/LAN\s*:\s*/gi, '') // Remove LAN: (case insensitive)
                    .replace(/[^\w\s\.:]/g, '') // Remove special characters except alphanumeric, space, dot, colon
                    .trim();
                
                // If it still doesn't look like an IP, keep as 'Unknown'
                if (!ipAddress.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
                    ipAddress = 'Unknown';
                }
                
                // REMOVED: console.log('🔧 Cleaned location:', ipAddress);
            }
        } else {
            // REMOVED: console.log('⚠️ No location data available');
        }
        
        const bandwidth = session.bandwidth || 'Unknown';
        const user = session.user || session.username || 'Unknown';
        const subtitleCodec = session.subtitle || session.subtitleCodec || 'None';
        
        // REMOVED: All the console.log statements about metadata
        
const cardHtml = `
            <div class="tautulli-session-card" data-type="${session.type || 'unknown'}">
                <!-- Poster Section -->
                <div class="session-poster-large">
                    ${posterUrl ? `
                        <img src="${posterUrl}" 
                             alt="${this.escapeHtml(displayTitle)}" 
                             class="poster-image" 
                             crossorigin="anonymous"
                             onerror="this.style.display='none'; this.parentElement.querySelector('.poster-icon').style.display='block'; this.parentElement.querySelector('.poster-text').style.display='block';" />
                    ` : ''}
                    <div class="poster-icon" style="${posterUrl ? 'display:none' : ''}">🎬</div>
                    <div class="poster-text" style="${posterUrl ? 'display:none' : ''}">${this.escapeHtml(displayTitle.substring(0, 12))}...</div>
                </div>
                
                <!-- Session Details Section -->
                <div class="session-details">
                    <!-- Header with title, subtitle, and username -->
                    <div class="session-header">
                        <div class="session-title-row">
                            <div class="session-title-large" title="${this.escapeHtml(displayTitle)}">
                                ${this.escapeHtml(displayTitle)}
                            </div>
                            <div class="username-badge">${this.escapeHtml(user)}</div>
                        </div>
                        ${displaySubtitle ? `
                            <div class="session-subtitle-large" title="${this.escapeHtml(displaySubtitle)}">
                                ${this.escapeHtml(displaySubtitle)}
                            </div>
                        ` : ''}
                    </div>
                    
                    <!-- Detailed Metadata Grid - Desktop and Mobile -->
                    <div class="session-metadata">
                        <!-- Desktop-only metadata -->
                        <div class="metadata-row desktop-only">
                            <span class="metadata-label">PRODUCT</span>
                            <span class="metadata-value">${this.escapeHtml(playerProduct)}</span>
                        </div>
                        
                        <div class="metadata-row desktop-only">
                            <span class="metadata-label">PLAYER</span>
                            <span class="metadata-value">${this.escapeHtml(playerTitle)}</span>
                        </div>
                        
                        <div class="metadata-row desktop-only">
                            <span class="metadata-label">QUALITY</span>
                            <span class="metadata-value" title="${this.escapeHtml(qualityDisplay)}">${this.escapeHtml(qualityDisplay)}</span>
                        </div>
                        
                        <div class="metadata-row mobile-important">
							<span class="metadata-label">STREAM</span>
							<span class="metadata-value stream-type">${this.escapeHtml(streamDecision)}</span>
						</div>
                        
<!-- Mobile-important metadata -->
<div class="metadata-row desktop-only">
    <span class="metadata-label">CONTAINER</span>
    <span class="metadata-value" title="${this.escapeHtml(containerDisplay)}">${this.escapeHtml(containerDisplay)}</span>
</div>

<div class="metadata-row desktop-only">
    <span class="metadata-label">VIDEO</span>
    <span class="metadata-value" title="${this.escapeHtml(videoDisplay)}">${this.escapeHtml(videoDisplay)}</span>
</div>

<div class="metadata-row desktop-only">
    <span class="metadata-label">AUDIO</span>
    <span class="metadata-value" title="${this.escapeHtml(audioDisplay)}">${this.escapeHtml(audioDisplay)}</span>
</div>
                        
                        <!-- Desktop-only metadata continued -->
                        <div class="metadata-row desktop-only">
                            <span class="metadata-label">SUBTITLE</span>
                            <span class="metadata-value">${this.escapeHtml(subtitleCodec)}</span>
                        </div>
                        
                        <div class="metadata-row desktop-only">
                            <span class="metadata-label">LOCATION</span>
                            <span class="metadata-value location">${this.escapeHtml(ipAddress)}</span>
                        </div>
                        
                        <div class="metadata-row desktop-only">
                            <span class="metadata-label">BANDWIDTH</span>
                            <span class="metadata-value bandwidth">${this.escapeHtml(bandwidth)}</span>
                        </div>
                    </div>
                    
                    <!-- Progress Bar -->
                    <div class="progress-section">
                        <div class="progress-bar-large">
                            <div class="progress-fill-large" style="width: ${progressWidth}%"></div>
                        </div>
                        <div class="progress-text">
                            ${currentTime} / ${totalTime} (${progressPercent}%)
                        </div>
                    </div>
                </div>
            </div>
        `;

        return cardHtml;
    },

    // Fixed generateSessionSummary to use the enhanced backend data
    generateSessionSummary(sessions) {
        const totalSessions = sessions.length;
        
        // Count by stream decision using enhanced backend data
        let directPlays = 0;
        let directStreams = 0; 
        let transcodes = 0;
        let totalBandwidth = 0;
        let wanBandwidth = 0;
        
        sessions.forEach(session => {
            // Use the enhanced bandwidth from backend
            if (session.bandwidth && session.bandwidth !== 'Unknown') {
                const bandwidthMatch = session.bandwidth.match(/(\d+(?:\.\d+)?)/);
                if (bandwidthMatch) {
                    const bw = parseFloat(bandwidthMatch[1]);
                    if (!isNaN(bw)) {
                        totalBandwidth += bw;
                        // Add to WAN if not local
                        if (!session.local && session.location && session.location.includes('WAN')) {
                            wanBandwidth += bw;
                        }
                    }
                }
            }
            
            // Use the enhanced stream decision from backend
            const stream = session.stream || 'Unknown';
            
            if (stream.toLowerCase().includes('direct play')) {
                directPlays++;
            } else if (stream.toLowerCase().includes('direct stream')) {
                directStreams++;
            } else if (stream.toLowerCase().includes('transcode')) {
                transcodes++;
            } else {
                // Unknown - assume transcode for safety
                transcodes++;
            }
        });
        
        // Format the summary similar to Tautulli
        let summary = `<strong>Sessions:</strong> ${totalSessions} stream${totalSessions !== 1 ? 's' : ''}`;
        
        const streamTypes = [];
        if (directPlays > 0) streamTypes.push(`${directPlays} direct play${directPlays !== 1 ? 's' : ''}`);
        if (directStreams > 0) streamTypes.push(`${directStreams} direct stream${directStreams !== 1 ? 's' : ''}`);
        if (transcodes > 0) streamTypes.push(`${transcodes} transcode${transcodes !== 1 ? 's' : ''}`);
        
        if (streamTypes.length > 0) {
            summary += ` (${streamTypes.join(', ')})`;
        }
        
        if (totalBandwidth > 0) {
            summary += ` | <strong>Bandwidth:</strong> ${totalBandwidth.toFixed(1)} Mbps`;
            if (wanBandwidth > 0) {
                summary += ` (WAN: ${wanBandwidth.toFixed(1)} Mbps)`;
            }
        }
        
        return summary;
    },

    // ADD this new method (completely new):
    formatDuration(ms) {
        if (!ms || ms === 0) return '0:00';
        
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        } else {
            return `${minutes}:${String(seconds).padStart(2, '0')}`;
        }
    },

    updateIPTVViewers(iptvData) {
        const container = document.getElementById('iptvViewersContainer');
        const countElement = document.getElementById('iptvViewerCount');
        
        this.debug('🐛 Frontend received IPTV data:', iptvData); // Debug only
        
        if (!container) {
            this.error('IPTV viewers container not found');
            return;
        }
        
        if (!iptvData.viewers || iptvData.viewers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-tv"></i>
                    <p>No active viewers</p>
                </div>
            `;
            if (countElement) countElement.textContent = '0';
            return;
        }
        
        if (countElement) {
            countElement.textContent = iptvData.viewers.length.toString();
        }
        
        const viewersHtml = iptvData.viewers.map(viewer => {
            this.debug('🐛 Processing viewer:', viewer.username, 'speedColor:', viewer.speedColor); // Debug only
            
            // Build streams list (no individual speed indicators)
            let streamsHtml = '';
            if (viewer.connections && viewer.connections.length > 0) {
                streamsHtml = viewer.connections.map(stream => `
                    <div class="stream-item">
                        <span class="stream-name">${this.escapeHtml(stream.streamName)}</span>
                        <span class="stream-time">${stream.totalOnlineTime}</span>
                    </div>
                `).join('');
            }
            
            const speedColor = viewer.speedColor || 'gray';
            const speedText = this.getSpeedText(speedColor);
            
            this.debug('🎨 Using speed color:', speedColor, 'for user:', viewer.username); // Debug only
            
            return `
                <div class="iptv-viewer-card">
                    <div class="viewer-header">
                        <span class="viewer-username">${this.escapeHtml(viewer.username)}</span>
                        <span class="viewer-connections">
                            ${viewer.totalConnections}/${viewer.maxConnections}
                            <div class="speed-indicator speed-${speedColor}" 
                                 title="Connection Speed: ${speedText}"></div>
                        </span>
                    </div>
                    <div class="viewer-details">
                        <div class="viewer-ip">${viewer.userIP} (${viewer.geoCountry})</div>
                        <div class="viewer-streams">
                            ${streamsHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = '<div class="iptv-viewers-grid">' + viewersHtml + '</div>';
    },
        
    setLiveDataError(type) {
        const container = document.getElementById(type === 'iptv' ? 'iptvViewersContainer' : 'plexSessionsContainer');
        const countElement = document.getElementById(type === 'iptv' ? 'iptvViewerCount' : 'plexSessionCount');
        
        if (container) {
            const iconClass = type === 'iptv' ? 'fa-tv' : 'fa-exclamation-triangle';
            const message = type === 'iptv' ? 'Error loading IPTV viewers' : 'Error loading Plex sessions';
            
            container.innerHTML = `
                <div class="empty-state" style="color: #ff6b6b;">
                    <i class="fas ${iconClass}"></i>
                    <p>${message}</p>
                    <small style="opacity: 0.7;">Check server connections and try refreshing</small>
                </div>
            `;
        }
        
        if (countElement) {
            countElement.textContent = '0';
            countElement.style.color = '#ff6b6b';
        }
    },
        
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // ADD this method:
    getSpeedText(color) {
        switch (color) {
            case 'green': return 'Good';
            case 'yellow': return 'Fair';
            case 'red': return 'Poor';
            case 'gray': return 'Unknown';
            default: return 'Unknown';
        }
    },

    /**
     * Calculate overall user speed color based on their connections
     * @param {Array} connections - User's active connections
     * @returns {string} - Overall speed color
     */
    calculateUserSpeedColor(connections) {
        if (!connections || connections.length === 0) {
            return 'gray';
        }
        
        // Count each speed type
        const speeds = { red: 0, yellow: 0, green: 0, gray: 0 };
        connections.forEach(conn => {
            const speed = conn.speedColor || 'gray';
            speeds[speed]++;
        });
        
        // Priority: if any red, show red; if any yellow, show yellow; otherwise green or gray
        if (speeds.red > 0) return 'red';
        if (speeds.yellow > 0) return 'yellow';
        if (speeds.green > 0) return 'green';
        return 'gray';
    },
	
	// Load server resource data
async loadServerResources() {
    try {
        this.debug('📊 Loading Plex server resources...');
        const response = await fetch('/api/plex/dashboard-resources');
        const data = await response.json();
        
        this.debug('📊 Server resources data:', data);
        this.cachedResourceData = data;
        
        // Update the dashboard display immediately
        this.updateServerResourceDisplay(data);
        
    } catch (error) {
        this.error('❌ Error loading server resources:', error);
        // Show default/error state
        this.updateServerResourceDisplay(this.getDefaultResourceData());
    }
},

// Update the server resource display in the dashboard
updateServerResourceDisplay(resourceData) {
    console.log('🔍 DEBUG: updateServerResourceDisplay called with:', resourceData);
    
    this.debug('🎨 Updating server CPU display with data:', resourceData);
    
    // Update each server's CPU display
    this.updateSingleServerCpu('plex1', 'regular', resourceData.plex1?.regular);
    this.updateSingleServerCpu('plex1', 'fourk', resourceData.plex1?.fourk);
    this.updateSingleServerCpu('plex2', 'regular', resourceData.plex2?.regular);
    this.updateSingleServerCpu('plex2', 'fourk', resourceData.plex2?.fourk);
},

// Update individual server CPU display
updateSingleServerCpu(serverGroup, serverType, serverData) {
    // Generate element ID (plex1Cpu, plex1FourkCpu, plex2Cpu, plex2FourkCpu)
    const elementId = serverGroup + (serverType === 'fourk' ? 'FourkCpu' : 'Cpu');
    const element = document.getElementById(elementId);
    
    // ADD THIS DEBUG LINE
    console.log(`🔍 DEBUG: Looking for element ID: ${elementId}, found:`, !!element);
    
    if (!element) {
        this.debug(`⚠️ CPU element not found: ${elementId}`);
        return;
    }
    
    // Default data if server data is missing
    const data = serverData || { cpuUsage: 0, status: 'unknown', success: false };
    
    // ADD THIS DEBUG LINE
    console.log(`🔍 DEBUG: Server data for ${elementId}:`, data);
    
    let displayValue = '--';
    let cssClass = 'cpu-offline';
    
    if (data.success && data.status === 'online') {
        const cpuUsage = data.cpuUsage || 0;
        displayValue = `${cpuUsage}%`;
        
        // Color code based on CPU usage
        if (cpuUsage <= 30) {
            cssClass = 'cpu-low';      // Green
        } else if (cpuUsage <= 60) {
            cssClass = 'cpu-medium';   // Orange  
        } else {
            cssClass = 'cpu-high';     // Red
        }
    } else {
        // Server offline or error
        displayValue = data.status === 'error' ? 'ERR' : 'OFF';
        cssClass = 'cpu-offline';
    }
    
    // Update the display
    element.textContent = displayValue;
    element.className = element.className.replace(/cpu-\w+/g, '').trim();
    element.classList.add(cssClass);
    
    // ADD THIS DEBUG LINE
    console.log(`🔍 DEBUG: Updated ${elementId} - Text: "${displayValue}", Class: "${cssClass}", Element classes: "${element.className}"`);
},


// Get default resource data structure
getDefaultResourceData() {
    const defaultServer = {
        cpuUsage: 0,
        memoryUsage: 0,
        activeSessions: 0,
        status: 'unknown',
        success: false
    };
    
    return {
        plex1: { 
            regular: { ...defaultServer },
            fourk: { ...defaultServer }
        },
        plex2: { 
            regular: { ...defaultServer },
            fourk: { ...defaultServer }
        },
        lastUpdate: 'No data'
    };
},
        

    // NEW METHOD 1: Preload live data on dashboard init
    async preloadLiveData() {
        try {
            this.debug('🔄 Preloading live data for instant display...'); // Debug only
            
            const [iptvResponse, plexResponse] = await Promise.allSettled([
                fetch('/api/dashboard/iptv-live'),
                fetch('/api/dashboard/plex-now-playing'),
				fetch('/api/plex/dashboard-resources')
            ]);
            
            if (iptvResponse.status === 'fulfilled') {
                this.cachedIPTVData = await iptvResponse.value.json();
                this.debug('✅ IPTV live data cached'); // Debug only
                
                // NEW: Set initial count
                const iptvCountElement = document.getElementById('iptvViewerCount');
                if (iptvCountElement && this.cachedIPTVData.viewers) {
                    iptvCountElement.textContent = this.cachedIPTVData.viewers.length.toString();
                }
            }
            
            if (plexResponse.status === 'fulfilled') {
                this.cachedPlexData = await plexResponse.value.json();
                this.debug('✅ Plex live data cached'); // Debug only
                
                // NEW: Set initial count
                const plexCountElement = document.getElementById('plexSessionCount');
                if (plexCountElement && this.cachedPlexData.sessions) {
                    plexCountElement.textContent = this.cachedPlexData.sessions.length.toString();
                }
                
                // ADD THIS: Set initial session summary
                const plexSummaryElement = document.getElementById('plexSessionSummary');
                if (plexSummaryElement) {
                    if (this.cachedPlexData.sessions && this.cachedPlexData.sessions.length > 0) {
                        const summaryStats = this.generateSessionSummary(this.cachedPlexData.sessions);
                        plexSummaryElement.innerHTML = summaryStats;
                        plexSummaryElement.style.display = 'block';
                    } else {
                        plexSummaryElement.style.display = 'none';
                    }
                }
            }
            
        } catch (error) {
            this.error('❌ Error preloading live data:', error);
        }
    },

startBackgroundRefresh() {
    if (this.backgroundRefreshInterval) {
        clearInterval(this.backgroundRefreshInterval);
    }
    
    // Reset start time when starting
    if (!this.refreshStartTime) {
        this.refreshStartTime = Date.now();
    }
    
    this.info(`📊 Starting background refresh (${this.refreshInterval/1000}s intervals, 30min max)`);
    
    this.backgroundRefreshInterval = setInterval(async () => {
        // CRITICAL: Double-check current page before ANY processing
        if (!window.AppState || window.AppState.currentPage !== 'dashboard') {
            this.debug('🚫 Not on dashboard page - stopping background refresh');
            this.stopBackgroundRefresh();
            return;
        }
        
        // Check if 30 minutes have passed
        const elapsedTime = Date.now() - this.refreshStartTime;
        if (elapsedTime >= this.maxRefreshDuration) {
            this.info('⏰ Dashboard auto-refresh stopped after 30 minutes');
            this.stopBackgroundRefresh();
            return;
        }
        
        try {
            const [iptvResponse, plexResponse, resourcesResponse] = await Promise.allSettled([
                fetch('/api/dashboard/iptv-live'),
                fetch('/api/dashboard/plex-now-playing'),
                fetch('/api/plex/dashboard-resources') // NEW: Server resources
            ]);
            
// Update IPTV data (silent unless error)
if (iptvResponse.status === 'fulfilled' && iptvResponse.value.ok) {
    this.cachedIPTVData = await iptvResponse.value.json();
    
    const iptvCountElement = document.getElementById('iptvViewerCount');
    if (iptvCountElement && this.cachedIPTVData.viewers) {
        iptvCountElement.textContent = this.cachedIPTVData.viewers.length.toString();
    }
    
    // ADD THIS - Update mobile IPTV count too
    const iptvMobileCountElement = document.getElementById('iptvViewersPreview');
    if (iptvMobileCountElement && this.cachedIPTVData.viewers) {
        iptvMobileCountElement.textContent = this.cachedIPTVData.viewers.length.toString();
    }
    
    if (this.expandedSections.has('iptv')) {
        this.updateIPTVViewers(this.cachedIPTVData);
    }
} else {
    this.error('❌ IPTV background refresh failed');
}
            
            // Update Plex data (silent unless error)  
            if (plexResponse.status === 'fulfilled' && plexResponse.value.ok) {
                this.cachedPlexData = await plexResponse.value.json();
                this.updatePlexSessionsSummary(); // This was the missing function!
                
                if (this.expandedSections.has('plex')) {
                    this.updatePlexSessions(this.cachedPlexData);
                }
            } else {
                this.error('❌ Plex background refresh failed');
            }
            
            // NEW: Update server resources (silent unless error)
            if (resourcesResponse.status === 'fulfilled' && resourcesResponse.value.ok) {
                this.cachedResourceData = await resourcesResponse.value.json();
                this.updateServerResourceDisplay(this.cachedResourceData);
                this.debug('✅ Server resources updated in background');
            } else {
                this.error('❌ Server resources background refresh failed');
            }
            
        } catch (error) {
            this.error('❌ Background refresh failed:', error);
        }
    }, this.refreshInterval); // 15 seconds
},

updatePlexSessionsSummary() {
    this.debug('🎬 Updating Plex sessions summary...');
    
    const plexCountElement = document.getElementById('plexSessionCount');
    const summaryElement = document.getElementById('plexSessionSummary');
    const plexMobileCountElement = document.getElementById('plexSessionCountMobile');
    const bandwidthElement = document.getElementById('plexBandwidthMobile');
    
if (!this.cachedPlexData || !this.cachedPlexData.sessions) {
    if (plexCountElement) plexCountElement.textContent = '0';
    if (plexMobileCountElement) plexMobileCountElement.textContent = '0';
    if (bandwidthElement) bandwidthElement.textContent = '0 Mbps';
    if (summaryElement) summaryElement.style.display = 'none';
    return;
}
    
    const sessionCount = this.cachedPlexData.sessions.length;
    
// Update ALL session count elements
if (plexCountElement) plexCountElement.textContent = sessionCount.toString();
if (plexMobileCountElement) plexMobileCountElement.textContent = sessionCount.toString();
    
    // Update summary if there are sessions
    if (summaryElement) {
        if (sessionCount > 0) {
            const summaryStats = this.generateSessionSummary(this.cachedPlexData.sessions);
            summaryElement.innerHTML = summaryStats;
            summaryElement.style.display = 'block';
            
            // Extract bandwidth for mobile display
            if (bandwidthElement) {
                const bandwidthMatch = summaryStats.match(/Bandwidth:\s*([\d.]+\s*Mbps)/i);
                if (bandwidthMatch) {
                    bandwidthElement.textContent = bandwidthMatch[1];
                } else {
                    bandwidthElement.textContent = 'Active';
                }
            }
        } else {
            summaryElement.style.display = 'none';
            if (bandwidthElement) bandwidthElement.textContent = '0 Mbps';
        }
    }
    
    this.debug(`🎬 Updated session summary: ${sessionCount} sessions`);
},



    destroy() {
        this.info('📊 Dashboard destroyed - stopping ALL refreshes and cleaning up');
        
        // Stop the expanded sections refresh
        this.stopAutoRefresh();
        
        // Stop the background refresh
        this.stopBackgroundRefresh();
        
        // Clear all cached data
        this.expandedSections.clear();
        this.cachedIPTVData = null;
        this.cachedPlexData = null;
        
        this.info('✅ Dashboard cleanup completed');
    }

};


// Add this function definition RIGHT HERE - before the "Make functions globally available" comment
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
    
    // Helper function to extract library ID from various formats
    const extractLibraryId = (lib) => {
        if (typeof lib === 'object' && lib !== null) {
            return lib.id || lib.key || lib.ratingKey || lib.libraryId || lib.value || lib.library_id || lib.sectionId;
        }
        return lib; // Assume it's already a string/number ID
    };
    
    // Helper function to find checkbox by ID
    const findCheckbox = (serverGroup, type, libId) => {
        let checkbox = document.querySelector(`input[name="${serverGroup}_${type}"][value="${libId}"]`);
        if (!checkbox) {
            checkbox = document.getElementById(`${serverGroup}_${type}_${libId}`);
        }
        if (!checkbox) {
            checkbox = document.querySelector(`input[name="${serverGroup}_${type}"][value="${String(libId)}"]`);
        }
        return checkbox;
    };
    
    // Pre-select regular libraries
    if (userLibraries.regular && Array.isArray(userLibraries.regular)) {
        userLibraries.regular.forEach(lib => {
            const libId = extractLibraryId(lib);
            if (!libId) return;
            
            const checkbox = findCheckbox(serverGroup, 'regular', libId);
            if (checkbox) {
                checkbox.checked = true;
                selectedCount++;
            }
        });
    }
    
    // Pre-select 4K libraries  
    if (userLibraries.fourk && Array.isArray(userLibraries.fourk)) {
        userLibraries.fourk.forEach(lib => {
            const libId = extractLibraryId(lib);
            if (!libId) return;
            
            const checkbox = findCheckbox(serverGroup, 'fourk', libId);
            if (checkbox) {
                checkbox.checked = true;
                selectedCount++;
            }
        });
    }
    
    console.log(`📊 Pre-selected ${selectedCount} libraries for ${serverGroup}`);
};

// Make functions globally available for onclick handlers
window.showPage = showPage;
window.closeModal = Utils.closeModal;
window.togglePlexLibrariesByTag = togglePlexLibrariesByTag;
window.populateUserForm = populateUserForm;
window.preSelectUserLibraries = preSelectUserLibraries; // ← This line stays as is



// Auto-calculation functions for subscriptions
window.calculateNewPlexExpiration = function() {
    console.log('?? Calculating new Plex expiration...');
    
    const subscription = document.getElementById('plexSubscription')?.value;
    const expirationField = document.getElementById('plexExpiration');
    
    if (!expirationField) {
        console.warn('?? Plex expiration field not found');
        return;
    }
    
    console.log('?? Selected subscription:', subscription);
    
    if (subscription === 'free') {
        // FREE subscription - clear the date field (backend will handle as FREE)
        expirationField.value = '';
        console.log('? Set Plex to FREE - cleared expiration date');
        return;
    }
    
    if (subscription === 'remove') {
        // Remove subscription - clear the date field
        expirationField.value = '';
        console.log('? Set Plex to REMOVE - cleared expiration date');
        return;
    }
    
    if (!subscription || subscription === '') {
        // Keep current or no subscription selected - don't change the date
        console.log('? Keep current Plex subscription - no date change');
        return;
    }
    
    // Find the subscription type from loaded data
    const selectedSub = window.AppState.subscriptionTypes?.find(sub => sub.id == subscription);
    if (selectedSub) {
        const today = new Date();
        const expiration = new Date();
        expiration.setMonth(today.getMonth() + selectedSub.duration_months);
        expirationField.value = expiration.toISOString().split('T')[0];
        console.log(`? Set Plex expiration to: ${expirationField.value} (${selectedSub.duration_months} months from today)`);
    } else {
        console.warn('?? Subscription type not found for ID:', subscription);
        expirationField.value = '';
    }
};

window.calculateNewIptvExpiration = function() {
    console.log('📅 Calculating new IPTV expiration...');
    
    const subscription = document.getElementById('iptvSubscription')?.value;
    // FIX: Target the actual date input field, not the display span
    const expirationField = document.querySelector('input[name="iptv_expiration"]') || document.querySelector('input[type="date"][id*="iptv"]');
    
    console.log('🔍 Debug info:');
    console.log('- Subscription value:', subscription);
    console.log('- Expiration field found:', !!expirationField);
    console.log('- Expiration field type:', expirationField?.type);
    console.log('- Expiration field ID:', expirationField?.id);
    
    if (!expirationField) {
        console.warn('⚠️ IPTV date input field not found');
        return;
    }
    
    if (subscription === 'remove') {
        expirationField.value = '';
        console.log('🗑️ Set IPTV to REMOVE - cleared expiration date');
        return;
    }
    
    if (!subscription || subscription === '') {
        console.log('ℹ️ Keep current IPTV subscription - no date change');
        return;
    }
    
    // Find the subscription type from loaded data
    const selectedSub = window.AppState.subscriptionTypes?.find(sub => sub.id == subscription);
    if (selectedSub && selectedSub.duration_months) {
        const today = new Date();
        const expiration = new Date();
        expiration.setMonth(today.getMonth() + selectedSub.duration_months);
        const dateString = expiration.toISOString().split('T')[0];
        
        expirationField.value = dateString;
        
        // Trigger change event to ensure UI updates
        expirationField.dispatchEvent(new Event('change', { bubbles: true }));
        
        console.log(`✅ Set IPTV expiration to: ${dateString} (${selectedSub.duration_months} months from today)`);
        console.log('🔍 Field value after setting:', expirationField.value);
        
    } else {
        console.warn('⚠️ Subscription type not found for ID:', subscription);
        console.log('Available subscription types:', window.AppState?.subscriptionTypes);
    }
};

// Collect Plex library selections
window.collectPlexLibrarySelections = function() {
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
    
    console.log('?? Collected library selections:', plexLibraries);
    return plexLibraries;
};

window.ResponsiveUtils = {
    // Get current screen size category
    getScreenSize() {
        const width = window.innerWidth;
        if (width <= 480) return 'mobile';
        if (width <= 768) return 'tablet';
        if (width <= 1024) return 'desktop';
        return 'large';
    },
    
    // Adjust table for mobile
    adjustTableForMobile() {
        const tables = document.querySelectorAll('table');
        const isMobile = this.getScreenSize() === 'mobile';
        
        tables.forEach(table => {
            if (isMobile) {
                table.style.fontSize = 'var(--font-xs)';
                // Hide less important columns on mobile
                const cells = table.querySelectorAll('th:nth-child(3), td:nth-child(3)'); // Owner column
                cells.forEach(cell => cell.style.display = 'none');
            } else {
                table.style.fontSize = '';
                const cells = table.querySelectorAll('th:nth-child(3), td:nth-child(3)');
                cells.forEach(cell => cell.style.display = '');
            }
        });
    },
    
    // Adjust library checkboxes layout
    adjustLibraryLayout() {
        const libraryLists = document.querySelectorAll('.library-list');
        const screenSize = this.getScreenSize();
        
        libraryLists.forEach(list => {
            switch(screenSize) {
                case 'mobile':
                    list.style.gridTemplateColumns = '1fr';
                    break;
                case 'tablet':
                    list.style.gridTemplateColumns = 'repeat(auto-fit, minmax(140px, 1fr))';
                    break;
                default:
                    list.style.gridTemplateColumns = 'repeat(auto-fit, minmax(180px, 1fr))';
            }
        });
    },
    
    // Initialize responsive handlers
    init() {
        // Initial adjustments
        this.adjustTableForMobile();
        this.adjustLibraryLayout();
        
        // Listen for resize events with debouncing
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                this.adjustTableForMobile();
                this.adjustLibraryLayout();
            }, 250);
        });
    }
};

window.FormValidation = {
    // Show responsive error messages
    showError(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        
        // Remove existing error
        this.clearError(fieldId);
        
        // Create error element
        const error = document.createElement('div');
        error.className = 'field-error';
        error.style.cssText = `
            color: var(--error-color);
            font-size: var(--font-xs);
            margin-top: var(--spacing-xs);
            padding: var(--spacing-xs);
            background: rgba(244, 67, 54, 0.1);
            border-radius: 4px;
            border-left: 3px solid var(--error-color);
        `;
        error.textContent = message;
        
        // Insert after field
        field.parentNode.insertBefore(error, field.nextSibling);
        
        // Add error styling to field
        field.style.borderColor = 'var(--error-color)';
        field.style.boxShadow = '0 0 0 2px rgba(244, 67, 54, 0.2)';
    },
    
    // Clear error for field
    clearError(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        
        // Remove error message
        const error = field.parentNode.querySelector('.field-error');
        if (error) error.remove();
        
        // Reset field styling
        field.style.borderColor = '';
        field.style.boxShadow = '';
    },
    
    // Clear all errors
    clearAllErrors() {
        document.querySelectorAll('.field-error').forEach(error => error.remove());
        document.querySelectorAll('input, select, textarea').forEach(field => {
            field.style.borderColor = '';
            field.style.boxShadow = '';
        });
    },
    
    // Validate email format
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },
    
    // Validate required fields
    validateRequired(fieldId, fieldName) {
        const field = document.getElementById(fieldId);
        if (!field || !field.value.trim()) {
            this.showError(fieldId, `${fieldName} is required`);
            return false;
        }
        this.clearError(fieldId);
        return true;
    }
};

window.AccessibilityUtils = {
    // Add ARIA labels and roles
    enhanceAccessibility() {
        // Add roles to tables
        document.querySelectorAll('table').forEach(table => {
            table.setAttribute('role', 'table');
            table.querySelectorAll('th').forEach(th => th.setAttribute('role', 'columnheader'));
            table.querySelectorAll('td').forEach(td => td.setAttribute('role', 'cell'));
        });
        
        // Add aria-labels to buttons
        document.querySelectorAll('.btn-small').forEach(btn => {
            if (btn.textContent.includes('View')) btn.setAttribute('aria-label', 'View user details');
            if (btn.textContent.includes('Edit')) btn.setAttribute('aria-label', 'Edit user');
            if (btn.textContent.includes('Email')) btn.setAttribute('aria-label', 'Send email to user');
            if (btn.textContent.includes('Delete')) btn.setAttribute('aria-label', 'Delete user');
        });
        
        // Skip links disabled - they were causing unwanted popups
        // this.addSkipLinks();
    },
    
    // Add skip navigation links - DISABLED
    addSkipLinks() {
        // Function disabled to prevent "Skip to main content" popup
        // The popup was appearing when users focused on keyboard navigation
        return;
    },
    
    // Focus management for modals
    trapFocus(modal) {
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        // Focus first element when modal opens
        firstElement.focus();
        
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey && document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                } else if (!e.shiftKey && document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            } else if (e.key === 'Escape') {
                const closeBtn = modal.querySelector('.close-btn');
                if (closeBtn) closeBtn.click();
            }
        });
    }
};

window.ModalManager = {
    // Open modal with accessibility enhancements
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        // Store previous focus
        this.previousFocus = document.activeElement;
        
        // Show modal
        modal.classList.add('active');
        modal.style.display = 'flex';
        
        // Add body class to prevent scrolling
        document.body.style.overflow = 'hidden';
        
        // Enhance accessibility
        window.AccessibilityUtils.trapFocus(modal);
        
        // Adjust for mobile
        if (window.ResponsiveUtils.getScreenSize() === 'mobile') {
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.style.width = '95vw';
                modalContent.style.height = '90vh';
                modalContent.style.margin = 'auto';
                modalContent.style.overflow = 'auto';
            }
        }
    },
    
    // Close modal and restore focus
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        modal.classList.remove('active');
        modal.style.display = 'none';
        
        // Restore body scrolling
        document.body.style.overflow = '';
        
        // Restore focus
        if (this.previousFocus) {
            this.previousFocus.focus();
        }
        
        // Reset mobile styling
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.width = '';
            modalContent.style.height = '';
            modalContent.style.margin = '';
            modalContent.style.overflow = '';
        }
    }
};

// NEW: Force load libraries function (for the "Force Load Libraries" button)
window.forceLoadLibraries = async function() {
    console.log('🔄 Force loading Plex libraries...');
    
    try {
        Utils.showNotification('Reloading Plex libraries...', 'info');
        
        // Clear existing library data
        window.AppState.plexLibraries = {
            plex1: { regular: [], fourk: [] },
            plex2: { regular: [], fourk: [] }
        };
        
        // Force reload libraries for both groups
        await Promise.all([
            loadPlexLibrariesForGroup('plex1'),
            loadPlexLibrariesForGroup('plex2')
        ]);
        
        // Re-trigger pre-selection if editing a user
        if (window.AppState.editingUserId && window.AppState.currentUserData) {
            const user = window.AppState.currentUserData;
            if (user.tags && Array.isArray(user.tags)) {
                user.tags.forEach(tag => {
                    if (tag === 'Plex 1' && document.getElementById('tag-plex1').checked) {
                        setTimeout(() => preSelectUserLibraries('plex1'), 500);
                    }
                    if (tag === 'Plex 2' && document.getElementById('tag-plex2').checked) {
                        setTimeout(() => preSelectUserLibraries('plex2'), 500);
                    }
                });
            }
        }
        
        Utils.showNotification('Plex libraries reloaded successfully!', 'success');
        console.log('✅ Force load libraries completed');
        
    } catch (error) {
        console.error('❌ Error force loading libraries:', error);
        Utils.showNotification('Failed to reload libraries: ' + error.message, 'error');
    }
};


// sync function for iptv date
window.syncIptvExpirationFromPanel = function() {
    console.log('🔄 Syncing IPTV expiration from panel data...');
    
    const userId = getFormUserId();
    if (!userId) {
        Utils.showNotification('No user ID found - save user first', 'error');
        return;
    }
    
    const syncBtn = document.getElementById('syncIptvDateBtn');
    const originalText = syncBtn.innerHTML;
    
    // Disable button and show loading
    syncBtn.disabled = true;
    syncBtn.innerHTML = '⏳ Syncing...';
    
    // Use the IPTV-specific API that gets the stored (should be converted) date
    fetch(`/api/iptv/user/${userId}`)
        .then(response => response.json())
        .then(data => {
            console.log('📺 IPTV API response:', data);
            
            if (data.success && data.user && data.user.iptv_expiration) {
                const expDate = new Date(data.user.iptv_expiration);
                if (!isNaN(expDate.getTime())) {
                    const dateValue = expDate.toISOString().split('T')[0];
                    
                    // Target the correct date input field
                    const expirationField = document.querySelector('input[name="iptv_expiration"]') || document.querySelector('input[type="date"][id*="iptv"]');
                    
                    if (expirationField) {
                        expirationField.value = dateValue;
                        expirationField.dispatchEvent(new Event('change', { bubbles: true }));
                        
                        Utils.showNotification(`IPTV expiration synced: ${dateValue}`, 'success');
                        console.log(`✅ Synced IPTV expiration: ${data.user.iptv_expiration} → ${dateValue}`);
                    }
                }
            } else {
                Utils.showNotification('No IPTV expiration date found in panel data', 'warning');
            }
        })
        .catch(error => {
            console.error('❌ Error syncing IPTV expiration:', error);
            Utils.showNotification('Error syncing from panel data: ' + error.message, 'error');
        })
        .finally(() => {
            syncBtn.disabled = false;
            syncBtn.innerHTML = originalText;
        });
};

function getFormUserId() {
    let userId = null;
    
    // Method 1: Check URL parameters (for editing existing users)
    const urlParams = new URLSearchParams(window.location.search);
    userId = urlParams.get('edit'); // The edit user URL uses 'edit' parameter
    if (userId) {
        console.log('📋 Found user ID from URL edit parameter:', userId);
        return userId;
    }
    
    // Method 2: Check AppState for editing user ID
    if (window.AppState && window.AppState.editingUserId) {
        userId = window.AppState.editingUserId;
        console.log('📋 Found user ID from AppState.editingUserId:', userId);
        return userId;
    }
    
    // Method 3: Check various possible user ID fields
    const possibleUserIdFields = ['userId', 'user_id', 'editUserId'];
    for (const fieldId of possibleUserIdFields) {
        const field = document.getElementById(fieldId);
        if (field && field.value) {
            userId = field.value;
            console.log(`📋 Found user ID from field ${fieldId}:`, userId);
            return userId;
        }
    }
    
    // Method 4: Check current editing user ID
    if (window.currentEditingUserId) {
        userId = window.currentEditingUserId;
        console.log('📋 Found user ID from currentEditingUserId:', userId);
        return userId;
    }
    
    // Method 5: Check IPTV module current user
    if (window.IPTV && window.IPTV.currentUser) {
        userId = window.IPTV.currentUser;
        console.log('📋 Found user ID from IPTV.currentUser:', userId);
        return userId;
    }
    
    console.warn('⚠️ No user ID found using any method');
    return null;
}

// Update existing modal functions to use new manager
function closeModal(modalId) {
    window.ModalManager.closeModal(modalId);
}

function openModal(modalId) {
    window.ModalManager.openModal(modalId);
}

// ==========================================
// GLOBAL MOBILE NAVIGATION FUNCTIONS
// ==========================================

// Toggle mobile navigation menu
function toggleGlobalMobileNav() {
    const menu = document.getElementById('globalMobileNavMenu');
    const hamburger = document.querySelector('.hamburger-btn');
    
    if (menu.classList.contains('show')) {
        closeGlobalMobileNav();
    } else {
        openGlobalMobileNav();
    }
}

// Open mobile navigation
function openGlobalMobileNav() {
    const menu = document.getElementById('globalMobileNavMenu');
    const hamburger = document.querySelector('.hamburger-btn');
    const body = document.body;
    
    menu.classList.add('show');
    hamburger.classList.add('active');
    body.classList.add('nav-open');
    
    // Prevent body scrolling when menu is open
    body.style.overflow = 'hidden';
    
    // Focus on first menu item for accessibility
    const firstMenuItem = menu.querySelector('.mobile-nav-item');
    if (firstMenuItem) {
        setTimeout(() => firstMenuItem.focus(), 100);
    }
}

// Close mobile navigation
function closeGlobalMobileNav() {
    const menu = document.getElementById('globalMobileNavMenu');
    const hamburger = document.querySelector('.hamburger-btn');
    const body = document.body;
    
    menu.classList.remove('show');
    hamburger.classList.remove('active');
    body.classList.remove('nav-open');
    
    // Restore body scrolling
    body.style.overflow = '';
}

// Navigate to page and close mobile menu
function navigateToPage(pageId) {
    closeGlobalMobileNav();
    showPage(pageId);
}

// Global mobile nav event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Close mobile nav when clicking overlay
    document.addEventListener('click', function(event) {
        const mobileNav = document.querySelector('.mobile-nav-global');
        const menu = document.getElementById('globalMobileNavMenu');
        
        // If clicking on overlay (not menu content) and menu is open
        if (event.target === menu && menu.classList.contains('show')) {
            closeGlobalMobileNav();
        }
    });
    
    // Close mobile nav on escape key
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const menu = document.getElementById('globalMobileNavMenu');
            if (menu && menu.classList.contains('show')) {
                closeGlobalMobileNav();
            }
        }
    });
    
    // Handle window resize
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            closeGlobalMobileNav();
        }
    });
});

// Make functions globally available
window.toggleGlobalMobileNav = toggleGlobalMobileNav;
window.closeGlobalMobileNav = closeGlobalMobileNav;
window.navigateToPage = navigateToPage;