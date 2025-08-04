// Main Application Logic for JohnsonFlix Manager - Enhanced with Library Pre-selection

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 JohnsonFlix Manager starting...');
    
    // Initialize global state
    if (!window.AppState) {
        window.AppState = {
            currentPage: 'dashboard',
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
    
    // Load initial data and then show dashboard
    loadInitialData().then(() => {
        showPage('dashboard');
        console.log('✅ JohnsonFlix Manager initialized');
    }).catch(error => {
        console.error('❌ Failed to initialize app:', error);
        Utils.showNotification('Failed to initialize application: ' + error.message, 'error');
        // Still show dashboard even if initial data fails
        showPage('dashboard');
    });
    
    // Set up global error handlers
    window.addEventListener('error', (e) => {
        console.error('Global error:', e.error);
        Utils.showNotification('An unexpected error occurred', 'error');
    });
    
    window.addEventListener('unhandledrejection', function(event) {
        console.error('Unhandled promise rejection:', event.reason);
        Utils.handleError(event.reason, 'Promise rejection');
        event.preventDefault();
    });
    
    // Set up online/offline handlers
    window.addEventListener('online', () => {
        Utils.showNotification('Connection restored', 'success');
    });
    
    window.addEventListener('offline', () => {
        Utils.showNotification('Connection lost - some features may not work', 'warning');
    });
    
    // Set up hash change handler
    window.addEventListener('hashchange', handleHashChange);
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


// Page navigation with hash routing
async function showPage(pageId) {
    try {
        console.log(`?? Navigating to page: ${pageId}`);
        
        // Update hash
        Utils.updateUrlHash(pageId);
        
        // Load page content
        const loaded = await Utils.loadPageContent(pageId);
        if (!loaded) return;
        
        // Initialize page-specific functionality
        await initializePage(pageId);
        
        // Update current page state
        window.AppState.currentPage = pageId;
        
        console.log(`? Loaded page: ${pageId}`);
    } catch (error) {
        console.error(`Error loading page ${pageId}:`, error);
        Utils.handleError(error, `Loading ${pageId} page`);
    }
}

async function initializePage(pageId) {
    console.log(`?? Initializing page: ${pageId}`);
    
    switch (pageId) {
        case 'dashboard':
            if (window.Dashboard && window.Dashboard.init) {
                await window.Dashboard.init();
            }
            break;
            
case 'users':
    // Safer initialization for Users module
    if (window.Users && typeof window.Users.init === 'function') {
        await window.Users.init();
    } else {
        console.warn('⚠️ Users module not ready yet');
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
        console.log('📋 Loading and populating user data for ID:', userId);
        
        const response = await fetch(`/api/users/${userId}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const userData = await response.json();
        console.log('✅ User data loaded:', userData);
        
        // Populate basic form fields
        const fields = {
            'name': userData.name,
            'email': userData.email,
            'owner_id': userData.owner_id,
            'plex_email': userData.plex_email,
            'iptv_username': userData.iptv_username,    // Basic IPTV username field
            'iptv_password': userData.iptv_password,    // Basic IPTV password field
            'implayer_code': userData.implayer_code,
            'device_count': userData.device_count || 1,
            'bcc_owner_renewal': userData.bcc_owner_renewal,
            'exclude_bulk_emails': userData.exclude_bulk_emails,
            'exclude_automated_emails': userData.exclude_automated_emails
        };
        
        // Populate form fields
        Object.entries(fields).forEach(([fieldName, value]) => {
            const element = document.getElementById(fieldName);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = Boolean(value);
                } else {
                    element.value = value || '';
                }
                console.log(`✅ Set field ${fieldName}: ${value}`);
            }
        });
        
        // Handle tags (special case)
        if (userData.tags) {
            try {
                const tags = typeof userData.tags === 'string' ? JSON.parse(userData.tags) : userData.tags;
                console.log('📋 Processing tags:', tags);
                
                // Update tag checkboxes
                document.querySelectorAll('input[name="tags"]').forEach(checkbox => {
                    checkbox.checked = tags.includes(checkbox.value);
                    
                    // If IPTV tag is checked, show IPTV section and load status
                    if (checkbox.value === 'IPTV' && checkbox.checked) {
                        console.log('📺 IPTV tag detected, initializing IPTV section...');
                        if (window.IPTV && typeof window.IPTV.showIPTVSection === 'function') {
                            window.IPTV.showIPTVSection(userId);
                        }
                        
                        // Load IPTV status with a slight delay to ensure UI is ready
                        setTimeout(() => {
                            if (window.IPTV && typeof window.IPTV.loadCurrentUserIPTVStatus === 'function') {
                                window.IPTV.loadCurrentUserIPTVStatus();
                            }
                        }, 500);
                    }
                });
            } catch (tagError) {
                console.error('❌ Error processing tags:', tagError);
            }
        }
        
        // Handle Plex libraries (special case)
        if (userData.plex_libraries) {
            try {
                const libraries = typeof userData.plex_libraries === 'string' 
                    ? JSON.parse(userData.plex_libraries) 
                    : userData.plex_libraries;
                
                console.log('📺 Processing Plex libraries:', libraries);
                
                // Set Plex library checkboxes based on user data
                Object.entries(libraries).forEach(([serverKey, serverLibraries]) => {
                    if (serverLibraries && typeof serverLibraries === 'object') {
                        Object.entries(serverLibraries).forEach(([libraryKey, hasAccess]) => {
                            const checkboxId = `${serverKey}_${libraryKey}`;
                            const checkbox = document.getElementById(checkboxId);
                            if (checkbox) {
                                checkbox.checked = Boolean(hasAccess);
                                console.log(`✅ Set library ${checkboxId}: ${hasAccess}`);
                            }
                        });
                    }
                });
            } catch (libraryError) {
                console.error('❌ Error processing Plex libraries:', libraryError);
            }
        }
        
        // Set the user ID in the form
        const userIdField = document.getElementById('userId');
        if (userIdField) {
            userIdField.value = userId;
        }
        
        // Update page title
        const titleElement = document.querySelector('h2');
        if (titleElement) {
            titleElement.textContent = `Edit User: ${userData.name}`;
        }
        
        console.log('✅ User form populated successfully');
        
    } catch (error) {
        console.error('❌ Error loading user data:', error);
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


// Enhanced Dashboard functionality with content library stats
window.Dashboard = {
	expandedSections: new Set(),
    autoRefreshInterval: null,
    async init() {
        console.log('📊 Initializing enhanced dashboard...');
        
        // Load users first if they're not already loaded
        if (!window.AppState.users || window.AppState.users.length === 0) {
            console.log('📊 Dashboard: Loading users for stats...');
            try {
                const users = await API.User.getAll();
                window.AppState.users = users;
                window.AppState.allUsers = users;
                console.log(`📊 Dashboard: Loaded ${users.length} users for stats`);
            } catch (error) {
                console.error('📊 Dashboard: Error loading users:', error);
                window.AppState.users = []; // Fallback to empty array
            }
        }
        
        await this.loadStats();
        await this.loadContentStats();
    },
    
    async loadStats() {
        try {
            const users = window.AppState.users || [];
            console.log('📊 Dashboard: Calculating stats for', users.length, 'users');
            
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
            
            console.log('📊 Dashboard stats updated:', {
                totalUnique: uniqueUsers.length,
                plex1: plex1Users.length,
                plex2: plex2Users.length,
                totalPlex: plex1Users.length + plex2Users.length,
                iptv: iptvUsers.length
            });
            
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    },
    
    async loadContentStats() {
        console.log('📊 Loading content library statistics...');
        
        // Set loading state for content stats
        this.setContentStatsLoading();
        
        try {
            // Load IPTV content stats
            await this.loadIPTVContentStats();
            
            // Load Plex content stats
            await this.loadPlexContentStats();
            
        } catch (error) {
            console.error('Error loading content stats:', error);
            this.setContentStatsError();
        }
    },
    
    async loadIPTVContentStats() {
        try {
            console.log('📺 Loading IPTV content statistics from existing data...');
            
            // Call your existing IPTV Editor route for dashboard stats
            const response = await fetch('/api/iptv-editor/dashboard-stats');
            const iptvStats = await response.json();
            
            console.log('📺 IPTV stats loaded:', iptvStats);
            
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
            
            console.log('✅ IPTV dashboard stats updated successfully');
            
        } catch (error) {
            console.error('❌ Error loading IPTV content stats:', error);
            
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
        console.log('🎬 Loading Plex content statistics from cache...');
        
        const response = await fetch('/api/dashboard/plex-stats');
        const plexStats = await response.json();
        
        console.log('🎬 Plex stats loaded from cache:', plexStats);
        
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
        
        console.log('✅ Plex dashboard stats updated from cache');
        
    } catch (error) {
        console.error('❌ Error loading Plex content stats:', error);
        
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
            console.error(`Live section ${type} not found`);
            return;
        }
        
        const isExpanded = section.classList.contains('expanded');
        
        if (isExpanded) {
            // Collapse section
            section.classList.remove('expanded');
            this.expandedSections.delete(type);
            console.log(`📱 Collapsed ${type} live section`);
            
            // Stop auto-refresh if no sections are expanded
            if (this.expandedSections.size === 0) {
                this.stopAutoRefresh();
            }
        } else {
            // Expand section and load data
            section.classList.add('expanded');
            this.expandedSections.add(type);
            console.log(`📱 Expanded ${type} live section`);
            
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
                console.log('📺 Loading IPTV live viewers...');
                const response = await fetch('/api/dashboard/iptv-live');
                const iptvData = await response.json();
                this.updateIPTVViewers(iptvData);
            } else if (type === 'plex') {
                console.log('🎬 Loading Plex sessions...');
                const response = await fetch('/api/dashboard/plex-now-playing');
                const plexData = await response.json();
                this.updatePlexSessions(plexData);
            }
        } catch (error) {
            console.error(`Error loading ${type} live data:`, error);
            this.setLiveDataError(type);
        }
    },
    
    startAutoRefresh() {
        if (this.autoRefreshInterval) return;
        
        console.log('🔄 Starting auto-refresh for expanded sections');
        this.autoRefreshInterval = setInterval(() => {
            this.expandedSections.forEach(type => {
                this.loadLiveDataForSection(type);
            });
        }, 30000); // 30 seconds
    },
    
    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
            console.log('⏹️ Stopped auto-refresh');
        }
    },
    
    async refreshIPTVViewers() {
        console.log('📺 Manual refresh IPTV viewers...');
        const container = document.getElementById('iptvViewersContainer');
        if (container) {
            container.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Refreshing...</div>';
        }
        await this.loadLiveDataForSection('iptv');
    },
    
    async refreshPlexSessions() {
        console.log('🎬 Manual refresh Plex sessions...');
        const container = document.getElementById('plexSessionsContainer');
        if (container) {
            container.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Refreshing...</div>';
        }
        await this.loadLiveDataForSection('plex');
    },
    
    updatePlexSessions(plexData) {
        const container = document.getElementById('plexSessionsContainer');
        const countElement = document.getElementById('plexSessionCount');
        
        if (!container) {
            console.warn('Plex sessions container not found');
            return;
        }
        
        if (!plexData.sessions || plexData.sessions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-pause"></i>
                    <p>No active sessions</p>
                </div>
            `;
            if (countElement) countElement.textContent = '0';
            return;
        }
        
        if (countElement) {
            countElement.textContent = plexData.sessions.length.toString();
        }
        
        const sessionsHtml = plexData.sessions.map(session => {
            const posterUrl = session.thumb ? 
                `${session.serverUrl || ''}${session.thumb}${session.token ? '?X-Plex-Token=' + session.token : ''}` : 
                '';
            
            const statusClass = session.state === 'playing' ? 'status-playing' : 
                               session.state === 'paused' ? 'status-paused' : 'status-buffering';
            
            return `
                <div class="plex-session-card">
                    <div class="session-poster" style="background-image: url('${posterUrl}')"></div>
                    <div class="session-info">
                        <div class="session-title">${this.escapeHtml(session.title)}</div>
                        <div class="session-subtitle">${this.escapeHtml(session.subtitle || '')}</div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${session.progress || 0}%"></div>
                        </div>
                        <div class="session-meta">
                            <span><span class="status-indicator ${statusClass}"></span>${this.escapeHtml(session.user)}</span>
                            <span>${session.quality || 'Unknown'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = '<div class="plex-sessions-grid">' + sessionsHtml + '</div>';
    },
    
    updateIPTVViewers(iptvData) {
        const container = document.getElementById('iptvViewersContainer');
        const countElement = document.getElementById('iptvViewerCount');
        
        if (!container) {
            console.warn('IPTV viewers container not found');
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
        
        const viewersHtml = iptvData.viewers.map(viewer => `
            <div class="iptv-viewer-card">
                <div class="viewer-header">
                    <span class="viewer-username">${this.escapeHtml(viewer.username)}</span>
                    <span class="viewer-connections">${viewer.activeConnections}/${viewer.maxConnections}</span>
                </div>
                <div class="viewer-stream">${this.escapeHtml(viewer.streamName)}</div>
                <div class="viewer-meta">
                    ${viewer.watchIP} • ${viewer.expireDate}
                </div>
            </div>
        `).join('');
        
        container.innerHTML = '<div class="iptv-viewers-grid">' + viewersHtml + '</div>';
    },
    
    setLiveDataError(type) {
        const container = document.getElementById(type === 'iptv' ? 'iptvViewersContainer' : 'plexSessionsContainer');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error loading live data</p>
                </div>
            `;
        }
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    destroy() {
        this.stopAutoRefresh();
        this.expandedSections.clear();
        console.log('📊 Dashboard destroyed');
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
