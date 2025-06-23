// Main Application Logic for JohnsonFlix Manager

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// Handle browser back/forward
window.addEventListener('hashchange', handleHashChange);

async function initializeApp() {
    try {
        // Load initial data
        await loadInitialData();
        
        // Set up page routing
        handleHashChange();
        
        console.log('✅ JohnsonFlix Manager initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        Utils.showNotification('Failed to initialize application: ' + error.message, 'error');
    }
}

async function loadInitialData() {
    try {
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

// Page navigation with hash routing
async function showPage(pageId) {
    try {
        // Update hash
        Utils.updateUrlHash(pageId);
        
        // Load page content
        const loaded = await Utils.loadPageContent(pageId);
        if (!loaded) return;
        
        // Initialize page-specific functionality
        await initializePage(pageId);
        
        // Update current page state
        window.AppState.currentPage = pageId;
        
        console.log(`📄 Loaded page: ${pageId}`);
    } catch (error) {
        console.error(`Error loading page ${pageId}:`, error);
        Utils.handleError(error, `Loading ${pageId} page`);
    }
}

async function initializePage(pageId) {
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
            if (window.Users && window.Users.initForm) {
                await window.Users.initForm();
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

// Export for use in other modules
window.App = {
    init: initializeApp,
    showPage,
    initializePage,
    loadInitialData
};