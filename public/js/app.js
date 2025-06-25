// Main Application Logic for JohnsonFlix Manager - Enhanced with Library Pre-selection

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// Handle browser back/forward
window.addEventListener('hashchange', handleHashChange);

async function initializeApp() {
    try {
        console.log('🚀 Initializing JohnsonFlix Manager...');
        
        // Initialize global state
        if (!window.AppState) {
            window.AppState = {
                users: [],
                owners: [],
                subscriptionTypes: [],
                plexLibraries: {
                    plex1: { regular: [], fourk: [] },
                    plex2: { regular: [], fourk: [] }
                },
                currentTemplate: '',
                editingUserId: null,
                currentPage: 'dashboard'
            };
        }
        
        // Load initial data
        await loadInitialData();
        
        // Set up page routing
        handleHashChange();
        
        checkModulesLoaded();

         console.log('✅ JohnsonFlix Manager initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        Utils.showNotification('Failed to initialize application: ' + error.message, 'error');
    }
}

async function loadInitialData() {
    try {
        console.log('📊 Loading initial data...');
        
        // Load all initial data in parallel
        const [users, owners, subscriptions] = await Promise.all([
            API.User.getAll(),
            API.Owner.getAll(),
            API.Subscription.getAll()
        ]);
        
        // Update global state
        window.AppState.users = users;
        window.AppState.owners = owners;
        window.AppState.subscriptionTypes = subscriptions;
        
        console.log('📊 Initial data loaded:', {
            users: users.length,
            owners: owners.length,
            subscriptions: subscriptions.length
        });
    } catch (error) {
        console.error('Error loading initial data:', error);
        throw error;
    }
}

// Debug: Check if all modules are loaded
function checkModulesLoaded() {
    const modules = ['Utils', 'API', 'Plex', 'Users', 'Email', 'Settings', 'Subscriptions'];
    modules.forEach(module => {
        if (window[module]) {
            console.log(`✅ ${module} module loaded`);
        } else {
            console.error(`❌ ${module} module NOT loaded`);
        }
    });
}

// Page navigation with hash routing
async function showPage(pageId) {
    try {
        console.log(`📄 Navigating to page: ${pageId}`);
        
        // Update hash
        Utils.updateUrlHash(pageId);
        
        // Load page content
        const loaded = await Utils.loadPageContent(pageId);
        if (!loaded) return;
        
        // Initialize page-specific functionality
        await initializePage(pageId);
        
        // Update current page state
        window.AppState.currentPage = pageId;
        
        console.log(`✅ Loaded page: ${pageId}`);
    } catch (error) {
        console.error(`Error loading page ${pageId}:`, error);
        Utils.handleError(error, `Loading ${pageId} page`);
    }
}

async function initializePage(pageId) {
    console.log(`🔧 Initializing page: ${pageId}`);
    
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
            console.log('🔧 Initializing user form page...');
            // Initialize the user form with proper setup
            await initUserFormPage();
            break;
            
        case 'subscriptions':
            if (window.Subscriptions && window.Subscriptions.init) {
                await window.Subscriptions.init();
            }
            break;
            
        case 'email':
            if (window.Email && window.Email.init) {
                await window.Email.init();
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
        console.log('📝 Setting up user form page...');
        
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
        
        console.log('✅ User form page setup complete');
    } catch (error) {
        console.error('❌ Error setting up user form:', error);
        Utils.handleError(error, 'Setting up user form');
    }
}

// Setup user form event listeners
function setupUserFormEventListeners() {
    console.log('🎧 Setting up user form event listeners...');
    
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
    
    console.log('✅ User form event listeners setup');
}

// Load data for user form
async function loadUserFormData() {
    try {
        console.log('📊 Loading user form data...');
        
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
        
        console.log('✅ User form data loaded');
    } catch (error) {
        console.error('❌ Error loading user form data:', error);
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
    const iptvSelect = document.getElementById('iptvSubscription');
    if (iptvSelect) {
        const iptvOptions = subscriptions
            .filter(sub => sub.type === 'iptv')
            .map(sub => `<option value="${sub.id}">${sub.name} - $${sub.price}</option>`)
            .join('');
        
        iptvSelect.innerHTML = '<option value="">-- No IPTV Selected --</option>' + iptvOptions;
    }
}

// Load Plex libraries for user form
async function loadPlexLibrariesForUserForm() {
    console.log('📚 Loading Plex libraries for user form...');
    
    try {
        // Load libraries for both groups
        await Promise.all([
            loadPlexLibrariesForGroup('plex1'),
            loadPlexLibrariesForGroup('plex2')
        ]);
        
        console.log('✅ Plex libraries loaded for user form');
    } catch (error) {
        console.error('❌ Error loading Plex libraries for user form:', error);
    }
}

// Load libraries for a specific group
async function loadPlexLibrariesForGroup(serverGroup) {
    try {
        console.log(`📚 Loading ${serverGroup} libraries...`);
        
        const data = await API.Plex.getLibraries(serverGroup);
        console.log(`📊 ${serverGroup} data:`, data);
        
        // Store in global state
        window.AppState.plexLibraries[serverGroup] = data;
        
        // Render if the section is visible
        const section = document.getElementById(`${serverGroup}LibraryGroup`);
        if (section && section.style.display !== 'none') {
            renderPlexLibrariesForGroup(serverGroup, data);
        }
        
        console.log(`✅ ${serverGroup} libraries loaded`);
    } catch (error) {
        console.error(`❌ Error loading ${serverGroup} libraries:`, error);
        showLibraryLoadError(serverGroup);
    }
}

// Render Plex libraries for a group
function renderPlexLibrariesForGroup(serverGroup, data) {
    console.log(`🎨 Rendering ${serverGroup} libraries:`, data);
    
    const regularList = document.getElementById(`${serverGroup}RegularLibrariesList`);
    const fourkList = document.getElementById(`${serverGroup}FourkLibrariesList`);
    
    if (!regularList || !fourkList) {
        console.error(`❌ Library list elements not found for ${serverGroup}`);
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

// Toggle Plex library sections based on tag selection
function togglePlexLibrariesByTag(serverGroup, isChecked) {
    const libraryGroup = document.getElementById(`${serverGroup}LibraryGroup`);
    
    if (!libraryGroup) {
        console.error(`❌ Library group not found: ${serverGroup}LibraryGroup`);
        return;
    }
    
    if (isChecked) {
        console.log(`✅ Showing ${serverGroup} libraries`);
        libraryGroup.style.display = 'block';
        
        // Load and render libraries if not already done
        const data = window.AppState.plexLibraries[serverGroup];
        if (data && (data.regular || data.fourk)) {
            renderPlexLibrariesForGroup(serverGroup, data);
            
            // IMPORTANT: Pre-select libraries if editing a user
            if (window.AppState.editingUserId) {
                setTimeout(() => preSelectUserLibraries(serverGroup), 200);
            }
        } else {
            loadPlexLibrariesForGroup(serverGroup);
        }
        
        // Test connection quietly
        testPlexConnectionQuiet(serverGroup);
    } else {
        console.log(`❌ Hiding ${serverGroup} libraries`);
        libraryGroup.style.display = 'none';
        clearAllLibrariesForGroup(serverGroup);
    }
}

// NEW: Pre-select libraries based on user's current access
function preSelectUserLibraries(serverGroup) {
    console.log(`🔧 Pre-selecting libraries for ${serverGroup}...`);
    
    // Get the current user being edited
    if (!window.AppState.editingUserId || !window.AppState.currentUserData) {
        console.log('No user data available for pre-selection');
        return;
    }
    
    const user = window.AppState.currentUserData;
    
    if (!user.plex_libraries || !user.plex_libraries[serverGroup]) {
        console.log(`No cached library access found for ${serverGroup}`);
        return;
    }
    
    const userAccess = user.plex_libraries[serverGroup];
    console.log(`📋 Pre-selecting based on cached access:`, userAccess);
    
    // Select regular libraries
    if (userAccess.regular && Array.isArray(userAccess.regular)) {
        userAccess.regular.forEach(libId => {
            const checkbox = document.querySelector(`input[name="${serverGroup}_regular"][value="${libId}"]`);
            if (checkbox) {
                checkbox.checked = true;
                console.log(`✅ Pre-selected regular library: ${libId}`);
            } else {
                console.log(`⚠️ Could not find checkbox for regular library: ${libId}`);
            }
        });
    }
    
    // Select 4K libraries
    if (userAccess.fourk && Array.isArray(userAccess.fourk)) {
        userAccess.fourk.forEach(libId => {
            const checkbox = document.querySelector(`input[name="${serverGroup}_fourk"][value="${libId}"]`);
            if (checkbox) {
                checkbox.checked = true;
                console.log(`✅ Pre-selected 4K library: ${libId}`);
            } else {
                console.log(`⚠️ Could not find checkbox for 4K library: ${libId}`);
            }
        });
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

// Load and populate user for editing with enhanced library pre-selection
async function loadAndPopulateUser(userId) {
    try {
        console.log(`👤 Loading user ${userId} for editing...`);
        
        const user = await API.User.getById(userId);
        console.log('📝 User loaded:', user);
        
        // Store user data globally for library pre-selection
        window.AppState.currentUserData = user;
        
        populateUserForm(user);
    } catch (error) {
        console.error('❌ Error loading user for editing:', error);
        Utils.handleError(error, 'Loading user for editing');
    }
}

// Populate form with user data
function populateUserForm(user) {
    console.log('📝 Populating form with user:', user);
    
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
    
    console.log('✅ Form populated with user data');
}

function handleHashChange() {
    const page = Utils.getHashFromUrl();
    showPage(page);
}

// Global error handler
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    Utils.handleError(event.error, 'Application error');
});

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    Utils.handleError(event.reason, 'Promise rejection');
    event.preventDefault();
});

// Dashboard functionality
window.Dashboard = {
    async init() {
        await this.loadStats();
        await this.loadExpiringUsers();
    },
    
    async loadStats() {
        try {
            const users = window.AppState.users;
            
            // Update stats
            document.getElementById('totalUsers').textContent = users.length;
            
            const plexUsers = users.filter(u => u.tags && (u.tags.includes('Plex 1') || u.tags.includes('Plex 2')));
            const iptvUsers = users.filter(u => u.tags && u.tags.includes('IPTV'));
            
            document.getElementById('plexUsers').textContent = plexUsers.length;
            document.getElementById('iptvUsers').textContent = iptvUsers.length;
            
            // Calculate revenue (placeholder)
            document.getElementById('monthlyRevenue').textContent = '$0';
            
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
};

window.calculateNewIptvExpiration = function() {
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
    
    console.log('📋 Collected library selections:', plexLibraries);
    return plexLibraries;
};

// Export for use in other modules
window.App = {
    init: initializeApp,
    showPage,
    initializePage,
    loadInitialData
};