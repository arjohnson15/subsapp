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
            if (window.Users && window.Users.init) {
                await window.Users.init();
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

// Initialize user form page specifically
async function initUserFormPage() {
    try {
        console.log('?? Setting up user form page...');
        
        // Wait a bit for the HTML to be fully loaded
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Setup form event listeners
        setupUserFormEventListeners();
        
        // Load form data
        await loadUserFormData();
        
        // Load Plex libraries
        await loadPlexLibrariesForUserForm();
        
        // If editing a user, populate the form
        if (window.AppState.editingUserId) {
            setTimeout(async () => {
                await loadAndPopulateUser(window.AppState.editingUserId);
            }, 500);
        }
        
        console.log('? User form page setup complete');
    } catch (error) {
        console.error('? Error setting up user form:', error);
        Utils.handleError(error, 'Setting up user form');
    }
}

// Handle IPTV tag toggling
function toggleIptvManagementByTag(show) {
  const section = document.getElementById('iptvManagementSection');
  if (section) {
    section.style.display = show ? 'block' : 'none';
    
    if (show && window.IPTV) {
      // Ensure IPTV module is initialized when section is shown
      setTimeout(() => {
        if (typeof window.IPTV.init === 'function') {
          window.IPTV.init();
        }
      }, 100);
    }
  }
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

// Toggle IPTV management section visibility
function toggleIptvManagementByTag(isChecked) {
    console.log(`🔧 Toggling IPTV management: ${isChecked}`);
    
    const iptvGroup = document.getElementById('iptvSection');  // ← Use the correct ID
    if (!iptvGroup) {
        console.error(`❌ IPTV section not found`);
        return;
    }
    
    if (isChecked) {
        iptvGroup.style.display = 'block';
        
        // Initialize IPTV functionality when shown
        if (window.IPTV && typeof window.IPTV.init === 'function') {
            console.log('🚀 Initializing IPTV for user...');
            setTimeout(() => {
                window.IPTV.init();
            }, 100);
        } else {
            console.warn('⚠️ IPTV module not available or init function missing');
        }
    } else {
        iptvGroup.style.display = 'none';
    }
    
    console.log(`✅ IPTV section ${isChecked ? 'shown' : 'hidden'}`);
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

// Load and populate user for editing with enhanced library pre-selection
async function loadAndPopulateUser(userId) {
    try {
        console.log(`🔧 Loading user data for ID: ${userId}`);
        
        // Fetch user data from API
        const response = await fetch(`/api/users/${userId}`);
        const user = await response.json();
        
        if (!user) {
            throw new Error('User not found');
        }
        
        // Store user data in global state for pre-selection
        window.AppState.currentUserData = user;
        
        console.log(`📋 Loaded user data:`, user);
        
        // Populate basic form fields
        document.getElementById('userName').value = user.name || '';
        document.getElementById('userEmail').value = user.email || '';
        document.getElementById('plexEmail').value = user.plex_email || '';
        document.getElementById('userOwner').value = user.owner_id || '';
        document.getElementById('iptvUsername').value = user.iptv_username || '';
        document.getElementById('iptvPassword').value = user.iptv_password || '';
        document.getElementById('implayerCode').value = user.implayer_code || '';
        document.getElementById('deviceCount').value = user.device_count || 1;
        
        // Set expiration dates
        if (user.plex_expiration) {
            const plexDate = new Date(user.plex_expiration);
            if (!isNaN(plexDate.getTime())) {
                document.getElementById('plexExpiration').value = plexDate.toISOString().split('T')[0];
            }
        }
        
        if (user.iptv_expiration) {
            const iptvDate = new Date(user.iptv_expiration);
            if (!isNaN(iptvDate.getTime())) {
                document.getElementById('iptvExpiration').value = iptvDate.toISOString().split('T')[0];
            }
        }
        
        // Set checkboxes
        document.getElementById('bccOwnerRenewal').checked = user.bcc_owner_renewal === 1;
        
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
            // ADD THIS NEW SECTION:
            if (tag === 'IPTV') {
                toggleIptvManagementByTag(true);
                // Load current IPTV status for this user
                if (window.IPTV && typeof window.IPTV.loadUserStatus === 'function') {
                    setTimeout(() => {
                        window.IPTV.loadUserStatus(user);
                    }, 500); // Small delay to ensure UI is ready
                }
            }
        }
    });
}
        
        console.log(`✅ Form population completed for ${user.name}`);
        
    } catch (error) {
        console.error('❌ Error loading user data:', error);
        Utils.handleError(error, 'Loading user data');
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


// Dashboard functionality
window.Dashboard = {
    async init() {
        // FIXED: Load users first if they're not already loaded
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
        await this.loadExpiringUsers();
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
    
    async loadExpiringUsers() {
        try {
            const expiringUsers = await API.User.getExpiring(7);
            const expiringDiv = document.getElementById('expiringUsers');
            
            if (expiringUsers.length === 0) {
                expiringDiv.innerHTML = '<p style="color: #4caf50;">No users expiring this week!</p>';
            } else {
                expiringDiv.innerHTML = expiringUsers.map(user => `
                    <div class="expiring-user">
                        <span>${user.name} - ${user.subscription_type}</span>
                        <span style="color: #ff9800;">Expires ${Utils.formatDate(user.expiration_date)}</span>
                    </div>
                `).join('');
            }
            
        } catch (error) {
            console.error('Error loading expiring users:', error);
        }
    }
};

// Make functions globally available for onclick handlers
window.showPage = showPage;
window.closeModal = Utils.closeModal;
window.togglePlexLibrariesByTag = togglePlexLibrariesByTag;
window.populateUserForm = populateUserForm;
window.preSelectUserLibraries = preSelectUserLibraries;

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
    console.log('?? Calculating new IPTV expiration...');
    
    const subscription = document.getElementById('iptvSubscription')?.value;
    const expirationField = document.getElementById('iptvExpiration');
    
    if (!expirationField) {
        console.warn('?? IPTV expiration field not found');
        return;
    }
    
    console.log('?? Selected subscription:', subscription);
    
    if (subscription === 'remove') {
        // Remove subscription - clear the date field
        expirationField.value = '';
        console.log('? Set IPTV to REMOVE - cleared expiration date');
        return;
    }
    
    if (!subscription || subscription === '') {
        // Keep current or no subscription selected - don't change the date
        console.log('? Keep current IPTV subscription - no date change');
        return;
    }
    
    // Find the subscription type from loaded data
    const selectedSub = window.AppState.subscriptionTypes?.find(sub => sub.id == subscription);
    if (selectedSub) {
        const today = new Date();
        const expiration = new Date();
        expiration.setMonth(today.getMonth() + selectedSub.duration_months);
        expirationField.value = expiration.toISOString().split('T')[0];
        console.log(`? Set IPTV expiration to: ${expirationField.value} (${selectedSub.duration_months} months from today)`);
    } else {
        console.warn('?? Subscription type not found for ID:', subscription);
        expirationField.value = '';
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
        
        // Add skip links for keyboard navigation
        this.addSkipLinks();
    },
    
    // Add skip navigation links
    addSkipLinks() {
        const skipLink = document.createElement('a');
        skipLink.href = '#main-content';
        skipLink.textContent = 'Skip to main content';
        skipLink.style.cssText = `
            position: absolute;
            top: -40px;
            left: 6px;
            background: var(--primary-color);
            color: white;
            padding: 8px;
            text-decoration: none;
            border-radius: 4px;
            z-index: 1000;
            transition: top 0.2s ease;
        `;
        
        skipLink.addEventListener('focus', () => {
            skipLink.style.top = '6px';
        });
        
        skipLink.addEventListener('blur', () => {
            skipLink.style.top = '-40px';
        });
        
        document.body.insertBefore(skipLink, document.body.firstChild);
        
        // Add main content role without changing ID
        const pageContent = document.getElementById('pageContent');
        if (pageContent) {
            pageContent.setAttribute('role', 'main');
            // Don't change the ID - keep it as 'pageContent' for compatibility
        }
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

// Update existing modal functions to use new manager
function closeModal(modalId) {
    window.ModalManager.closeModal(modalId);
}

function openModal(modalId) {
    window.ModalManager.openModal(modalId);
}
