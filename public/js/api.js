// API Functions for JohnsonFlix Manager

// Main API call function
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`/api${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

// User API calls
const UserAPI = {
    async getAll() {
        return await apiCall('/users');
    },
    
    async getById(id) {
        return await apiCall(`/users/${id}`);
    },
    
    async create(userData) {
        return await apiCall('/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    },
    
    async update(id, userData) {
        return await apiCall(`/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(userData)
        });
    },
    
    async delete(id) {
        return await apiCall(`/users/${id}`, {
            method: 'DELETE'
        });
    },
    
    async getExpiring(days = 7) {
        return await apiCall(`/users/expiring/${days}`);
    },
    
    async addSubscription(userId, subscriptionData) {
        return await apiCall(`/users/${userId}/subscription`, {
            method: 'POST',
            body: JSON.stringify(subscriptionData)
        });
    }
};

// Owner API calls
const OwnerAPI = {
    async getAll() {
        return await apiCall('/owners');
    },
    
    async create(ownerData) {
        return await apiCall('/owners', {
            method: 'POST',
            body: JSON.stringify(ownerData)
        });
    },
    
    async update(id, ownerData) {
        return await apiCall(`/owners/${id}`, {
            method: 'PUT',
            body: JSON.stringify(ownerData)
        });
    },
    
    async delete(id) {
        return await apiCall(`/owners/${id}`, {
            method: 'DELETE'
        });
    }
};

// Subscription API calls
const SubscriptionAPI = {
    async getAll() {
        return await apiCall('/subscriptions');
    },
    
    async create(subscriptionData) {
        return await apiCall('/subscriptions', {
            method: 'POST',
            body: JSON.stringify(subscriptionData)
        });
    },
    
    async update(id, subscriptionData) {
        return await apiCall(`/subscriptions/${id}`, {
            method: 'PUT',
            body: JSON.stringify(subscriptionData)
        });
    },
    
    async delete(id) {
        return await apiCall(`/subscriptions/${id}`, {
            method: 'DELETE'
        });
    }
};

// Email API calls
const EmailAPI = {
    async send(emailData) {
        return await apiCall('/email/send', {
            method: 'POST',
            body: JSON.stringify(emailData)
        });
    },
    
    async getTemplates() {
        return await apiCall('/email/templates');
    },
    
    async saveTemplate(templateData) {
        return await apiCall('/email/templates', {
            method: 'POST',
            body: JSON.stringify(templateData)
        });
    },
	
	async updateTemplate(templateName, templateData) {
    return await apiCall(`/email/templates/${templateName}`, {
        method: 'PUT',
        body: JSON.stringify(templateData)
    });
},
    
    async deleteTemplate(templateName) {
        return await apiCall(`/email/templates/${templateName}`, {
            method: 'DELETE'
        });
    },
    
    async testConnection() {
        return await apiCall('/email/test', {
            method: 'POST'
        });
    },
	
async sendBulkEmail(bulkEmailData) {
    return await apiCall('/email/send-bulk', {
        method: 'POST',
        body: JSON.stringify(bulkEmailData)
    });
},

async getUserData(userId) {
    return await apiCall(`/email/user-data/${userId}`);
},

async sendTestEmail(recipientEmail) {
    return await apiCall('/email/send-test', {
        method: 'POST',
        body: JSON.stringify({ to: recipientEmail })
    });
},

async sendRenewalReminders() {
    return await apiCall('/email/send-renewal-reminders', {
        method: 'POST'
    });
},
    
    async getLogs() {
        return await apiCall('/email/logs');
    }
};

// Plex API calls
const PlexAPI = {
    async getServers() {
        return await apiCall('/plex/servers');
    },
    
    async getLibraries(serverGroup) {
        return await apiCall(`/plex/libraries/${serverGroup}`);
    },
    
    async getUserAccess(userEmail) {
        return await apiCall(`/plex/user-access/${userEmail}`);
    },
    
    async shareLibraries(shareData) {
        return await apiCall('/plex/share', {
            method: 'POST',
            body: JSON.stringify(shareData)
        });
    },
    
    async removeAccess(removeData) {
        return await apiCall('/plex/remove-access', {
            method: 'POST',
            body: JSON.stringify(removeData)
        });
    },
    
    async testConnection(serverGroup) {
        return await apiCall(`/plex/test/${serverGroup}`, {
            method: 'POST'
        });
    },
    
    async syncLibraries() {
        return await apiCall('/plex/sync', {
            method: 'POST'
        });
    },
	
	async refreshUserData(userEmail) {
        return await apiCall('/plex/refresh-user-data', {
            method: 'POST',
            body: JSON.stringify({ userEmail })
        });
    }
};


// Settings API calls
const SettingsAPI = {
    async getAll() {
        return await apiCall('/settings');
    },
    
    async update(settingsData) {
        return await apiCall('/settings', {
            method: 'PUT',
            body: JSON.stringify(settingsData)
        });
    }
};

// ADD this to your existing API object in api.js
EmailSchedules: {
    async getAll() {
        return await apiCall('/email-schedules');
    },

    async create(scheduleData) {
        return await apiCall('/email-schedules', {
            method: 'POST',
            body: JSON.stringify(scheduleData)
        });
    },

    async update(id, scheduleData) {
        return await apiCall(`/email-schedules/${id}`, {
            method: 'PUT',
            body: JSON.stringify(scheduleData)
        });
    },

    async delete(id) {
        return await apiCall(`/email-schedules/${id}`, {
            method: 'DELETE'
        });
    },

    async test(id) {
        return await apiCall(`/email-schedules/${id}/test`, {
            method: 'POST'
        });
    }
}

// Export API modules
window.API = {
    call: apiCall,
    User: UserAPI,
    Owner: OwnerAPI,
    Subscription: SubscriptionAPI,
    Email: EmailAPI,
    Plex: PlexAPI,
    Settings: SettingsAPI
};