// Enhanced Email Management Functions

window.Email = {
    currentTemplate: null,
    recipientUserId: null,
    currentUserData: null, // ADD THIS LINE

    async init() {
        console.log('📧 Initializing Email module...');
        
        // Setup event listeners with delay to ensure DOM is ready
        setTimeout(() => {
            this.setupEventListeners();
        }, 100);
        
        await this.loadTemplates();
        
        // Check for pre-populated recipient FIRST
        await this.checkForPrePopulatedRecipient();
        
        // ALWAYS clear everything except recipient
        const recipientValue = document.getElementById('emailRecipient')?.value || '';
        this.clearForm();
        
        // Restore recipient if it was pre-populated
        if (recipientValue) {
            document.getElementById('emailRecipient').value = recipientValue;
            setTimeout(() => {
                this.lookupUserByEmail();
            }, 200);
        }
        
        console.log('📧 Email module initialized');
    },
    
    async checkForPrePopulatedRecipient() {
        // First check URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const userId = urlParams.get('userId');
        
        if (userId) {
            console.log('📧 Found userId in URL params:', userId);
            await this.prepopulateRecipient(userId);
            return;
        }
        
        // Then check AppState for data from email button
        if (window.AppState && window.AppState.emailRecipient) {
            console.log('📧 Found recipient in AppState:', window.AppState.emailRecipient);
            const { name, email } = window.AppState.emailRecipient;
            
            // Populate ONLY the recipient field
            const recipientField = document.getElementById('emailRecipient');
            
            if (recipientField && email) {
                recipientField.value = email;
                console.log('📧 Populated recipient field:', email);
            }
            
            // Clear the AppState data after using it
            delete window.AppState.emailRecipient;
        }
    },

    setupEventListeners() {
        console.log('📧 Setting up event listeners...');
        
        const emailBody = document.getElementById('emailBody');
        if (emailBody) {
            emailBody.addEventListener('input', this.updateEmailPreview.bind(this));
            emailBody.addEventListener('keyup', this.updateEmailPreview.bind(this));
            console.log('📧 Email body listeners attached');
        } else {
            console.warn('📧 Email body element not found');
        }
        
        const emailRecipient = document.getElementById('emailRecipient');
        if (emailRecipient) {
            emailRecipient.addEventListener('input', this.lookupUserByEmail.bind(this));
            emailRecipient.addEventListener('blur', this.lookupUserByEmail.bind(this));
            console.log('📧 Email recipient listeners attached');
        } else {
            console.warn('📧 Email recipient element not found');
        }
        
        const emailTemplate = document.getElementById('emailTemplate');
        if (emailTemplate) {
            emailTemplate.addEventListener('change', this.onTemplateChange.bind(this));
        }
        
        // Initialize preview and button state
        this.updateEmailPreview();
        this.updateTemplateButtons();
    },
    
    async loadTemplates() {
        try {
            const templates = await API.Email.getTemplates();
            this.updateTemplateDropdown(templates);
        } catch (error) {
            Utils.handleError(error, 'Loading email templates');
        }
    },
    
    updateTemplateDropdown(templates) {
        const templateSelect = document.getElementById('emailTemplate');
        if (!templateSelect) return;
        
        templateSelect.innerHTML = '<option value="">-- Select a Template --</option>' +
            templates.map(template => 
                `<option value="${template.name}">${template.name}</option>`
            ).join('');
    },
    
    onTemplateChange() {
        this.updateTemplateButtons();
    },
    
    updateTemplateButtons() {
        const templateName = document.getElementById('emailTemplate')?.value;
        const saveBtn = document.getElementById('saveTemplateBtn');
        const updateBtn = document.getElementById('updateTemplateBtn');
        const deleteBtn = document.getElementById('deleteTemplateBtn');
        
        if (templateName) {
            // Template is selected - show update and delete buttons
            if (saveBtn) saveBtn.style.display = 'none';
            if (updateBtn) updateBtn.style.display = 'inline-block';
            if (deleteBtn) deleteBtn.style.display = 'inline-block';
            this.currentTemplate = templateName;
        } else {
            // No template selected - show save as new button
            if (saveBtn) saveBtn.style.display = 'inline-block';
            if (updateBtn) updateBtn.style.display = 'none';
            if (deleteBtn) deleteBtn.style.display = 'none';
            this.currentTemplate = null;
        }
    },
    
    async loadTemplate() {
        const templateName = document.getElementById('emailTemplate')?.value;
        if (!templateName) return;
        
        try {
            const templates = await API.Email.getTemplates();
            const template = templates.find(t => t.name === templateName);
            
            if (template) {
                document.getElementById('emailSubject').value = template.subject;
                document.getElementById('emailBody').value = template.body;
                this.updateEmailPreview();
                this.updateTemplateButtons();
            }
        } catch (error) {
            Utils.handleError(error, 'Loading email template');
        }
    },
    
// Fixed prepopulateRecipient function to get complete user data with subscriptions
async prepopulateRecipient(userId) {
    try {
        this.recipientUserId = userId;
        
        // Get complete user data from getAll which includes subscriptions
        const users = await API.User.getAll();
        const userData = users.find(u => u.id == userId);
        
        if (userData) {
            document.getElementById('emailRecipient').value = userData.email;
            this.currentUserData = userData; // Store the complete user data
            console.log('📧 Stored complete user data for dynamic fields:', userData.name);
            console.log('📧 User subscription data:', userData.subscriptions);
            // Update preview with real user data
            this.updateEmailPreview();
        }
    } catch (error) {
        console.error('Error prepopulating recipient:', error);
        
        // Fallback: try to get user data from getById
        try {
            const userData = await API.User.getById(userId);
            
            if (userData) {
                document.getElementById('emailRecipient').value = userData.email;
                this.currentUserData = userData;
                console.log('📧 Fallback: Using getById user data for dynamic fields:', userData.name);
                this.updateEmailPreview();
            }
        } catch (fallbackError) {
            console.error('Error in fallback prepopulate:', fallbackError);
        }
    }
},
    
// Fixed updateEmailPreview function with all the issues resolved
updateEmailPreview(userData = null) {
    const emailBody = document.getElementById('emailBody')?.value || '';
    const preview = document.getElementById('emailPreview');
    
    if (!preview) return;
    
    let previewContent = emailBody;
    
    // CRITICAL FIX: Always use stored currentUserData if available, 
    // regardless of whether userData parameter is passed
    const userDataToUse = this.currentUserData || userData;
    
    if (userDataToUse) {
        console.log('📧 Using real user data for preview:', userDataToUse.name);
        console.log('📧 User subscriptions:', userDataToUse.subscriptions);
        
        // Helper function to calculate days until expiration
        const calculateDaysUntilExpiration = (expirationDate) => {
            if (!expirationDate || expirationDate === 'FREE' || expirationDate === 'N/A') {
                return '∞';
            }
            try {
                // Handle both database format (YYYY-MM-DD) and ISO format
                const expDateStr = expirationDate.split('T')[0]; // Remove time if present
                const expDate = new Date(expDateStr + 'T00:00:00'); // Add time to avoid timezone issues
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Reset time for accurate comparison
                
                const timeDiff = expDate.getTime() - today.getTime();
                const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                return daysDiff >= 0 ? daysDiff.toString() : '0';
            } catch (error) {
                console.error('Error calculating days:', error);
                return '0';
            }
        };
        
        // Get subscription info from user's subscriptions array
        let plexSubscription = null;
        let iptvSubscription = null;
        let plexSubscriptionName = 'N/A';
        let iptvSubscriptionName = 'N/A';
        let plexPrice = '0.00';
        let iptvPrice = '0.00';
        let plexDays = '0';
        let iptvDays = '0';
        
        if (userDataToUse.subscriptions && Array.isArray(userDataToUse.subscriptions)) {
            plexSubscription = userDataToUse.subscriptions.find(sub => sub.type === 'plex' && sub.status === 'active');
            iptvSubscription = userDataToUse.subscriptions.find(sub => sub.type === 'iptv' && sub.status === 'active');
            
            if (plexSubscription) {
                plexSubscriptionName = plexSubscription.subscription_name || 'Plex Subscription';
                plexPrice = plexSubscription.price || '0.00';
                plexDays = calculateDaysUntilExpiration(plexSubscription.expiration_date);
            }
            
            if (iptvSubscription) {
                iptvSubscriptionName = iptvSubscription.subscription_name || 'IPTV Subscription';
                iptvPrice = iptvSubscription.price || '0.00';
                iptvDays = calculateDaysUntilExpiration(iptvSubscription.expiration_date);
            }
        }
        
        // Use real user data for preview - FIX: Use actual expiration dates from user object
        previewContent = previewContent
            .replace(/\{\{name\}\}/g, userDataToUse.name || 'User Name')
            .replace(/\{\{email\}\}/g, userDataToUse.email || 'user@example.com')
            .replace(/\{\{username\}\}/g, userDataToUse.plex_email || userDataToUse.iptv_username || userDataToUse.name || 'Username')
            .replace(/\{\{plex_email\}\}/g, userDataToUse.plex_email || userDataToUse.email || 'plex@example.com')
            .replace(/\{\{iptv_username\}\}/g, userDataToUse.iptv_username || 'IPTV_Username')
            .replace(/\{\{iptv_password\}\}/g, userDataToUse.iptv_password || 'IPTV_Password')
            .replace(/\{\{implayer_code\}\}/g, userDataToUse.implayer_code || 'iMPlayer_Code')
            .replace(/\{\{device_count\}\}/g, userDataToUse.device_count || '1')
            .replace(/\{\{owner_name\}\}/g, userDataToUse.owner_name || 'Owner Name')
            .replace(/\{\{owner_email\}\}/g, userDataToUse.owner_email || 'owner@example.com')
            
            // FIX: Use actual expiration dates from user object (already formatted by API)
            .replace(/\{\{plex_expiration\}\}/g, userDataToUse.plex_expiration || 'N/A')
            .replace(/\{\{iptv_expiration\}\}/g, userDataToUse.iptv_expiration || 'N/A')
            
            // Specific subscription types only
            .replace(/\{\{plex_subscription_type\}\}/g, plexSubscriptionName)
            .replace(/\{\{iptv_subscription_type\}\}/g, iptvSubscriptionName)
            
            // Specific days until expiration only
            .replace(/\{\{plex_days_until_expiration\}\}/g, plexDays)
            .replace(/\{\{iptv_days_until_expiration\}\}/g, iptvDays)
            
            // Specific renewal prices only
            .replace(/\{\{plex_renewal_price\}\}/g, `$${plexPrice}`)
			.replace(/\{\{iptv_renewal_price\}\}/g, `$${iptvPrice}`);
                
    } else {
        console.log('📧 Using sample data for preview');
        // Use sample data for preview
        previewContent = previewContent
            .replace(/\{\{name\}\}/g, 'John Doe')
            .replace(/\{\{email\}\}/g, 'john@example.com')
            .replace(/\{\{username\}\}/g, 'johndoe')
            .replace(/\{\{plex_email\}\}/g, 'john@plex.com')
            .replace(/\{\{iptv_username\}\}/g, 'john_iptv')
            .replace(/\{\{iptv_password\}\}/g, 'password123')
            .replace(/\{\{implayer_code\}\}/g, 'ABC12345')
            .replace(/\{\{device_count\}\}/g, '2')
            .replace(/\{\{owner_name\}\}/g, 'Andrew')
            .replace(/\{\{owner_email\}\}/g, 'arjohnson15@gmail.com')
            .replace(/\{\{plex_expiration\}\}/g, '2024-12-31')
            .replace(/\{\{iptv_expiration\}\}/g, '2024-12-31')
            .replace(/\{\{plex_subscription_type\}\}/g, 'Plex 12 Month')
            .replace(/\{\{iptv_subscription_type\}\}/g, 'IPTV 3 Month - 2 Streams')
            .replace(/\{\{plex_days_until_expiration\}\}/g, '15')
            .replace(/\{\{iptv_days_until_expiration\}\}/g, '7')
            .replace(/\{\{plex_renewal_price\}\}/g, '$120.00')
            .replace(/\{\{iptv_renewal_price\}\}/g, '$40.00');
    }
    
    // Replace payment links with actual settings
    previewContent = previewContent
        .replace(/\{\{paypal_link\}\}/g, 'https://paypal.me/johnsonflix')
        .replace(/\{\{venmo_link\}\}/g, 'https://venmo.com/johnsonflix')
        .replace(/\{\{cashapp_link\}\}/g, 'https://cash.app/$johnsonflix');
    
    if (previewContent.trim()) {
        preview.innerHTML = previewContent;
    } else {
        preview.innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">Start typing in the email body below to see the preview...</p>';
    }
},


// Fixed lookupUserByEmail function to get complete user data with subscriptions
async lookupUserByEmail() {
    const recipientEmail = document.getElementById('emailRecipient')?.value;
    
    if (!recipientEmail || !Utils.isValidEmail(recipientEmail)) {
        // No valid email, clear stored user data and use sample data
        this.currentUserData = null;
        this.recipientUserId = null;
        this.updateEmailPreview();
        return;
    }
    
    try {
        // Look up user by email - get complete user data from getAll (which includes subscriptions)
        const users = await API.User.getAll();
        const user = users.find(u => u.email.toLowerCase() === recipientEmail.toLowerCase());
        
        if (user) {
            console.log('📧 Found user for email preview:', user.name);
            console.log('📧 User data with subscriptions:', user);
            
            // Store the complete user data (getAll already includes subscriptions)
            this.currentUserData = user;
            this.recipientUserId = user.id;
            this.updateEmailPreview(); // This will now use the stored user data
        } else {
            console.log('📧 No user found for email, using sample data');
            this.currentUserData = null;
            this.recipientUserId = null;
            this.updateEmailPreview();
        }
    } catch (error) {
        console.error('Error looking up user by email:', error);
        this.currentUserData = null;
        this.recipientUserId = null;
        this.updateEmailPreview();
    }
},
    
insertField(field) {
    const emailBody = document.getElementById('emailBody');
    if (!emailBody) return;
    
    const start = emailBody.selectionStart;
    const end = emailBody.selectionEnd;
    const text = emailBody.value;
    
    emailBody.value = text.substring(0, start) + field + text.substring(end);
    emailBody.selectionStart = emailBody.selectionEnd = start + field.length;
    emailBody.focus();
    
    // Update preview immediately after inserting field
    this.updateEmailPreview();
},
    
    async sendEmail() {
        const recipient = document.getElementById('emailRecipient')?.value;
        const cc = document.getElementById('emailCC')?.value;
        const bcc = document.getElementById('emailBCC')?.value;
        const subject = document.getElementById('emailSubject')?.value;
        const body = document.getElementById('emailBody')?.value;
        
        if (!recipient || !subject || !body) {
            Utils.showNotification('Please fill in recipient, subject, and body', 'error');
            return;
        }
        
        // FIXED: Use the correct validation function
        if (!Utils.isValidEmail(recipient)) {
            Utils.showNotification('Please enter a valid recipient email', 'error');
            return;
        }
        
        try {
            Utils.showLoading('Sending email...');
            
            const emailData = {
                to: recipient,
                subject,
                body,
                userId: this.recipientUserId,
                templateName: this.currentTemplate,
                cc: cc ? cc.split(',').map(email => email.trim()).filter(email => email) : [],
                bcc: bcc ? bcc.split(',').map(email => email.trim()).filter(email => email) : []
            };
            
            // FIXED: Use the correct API function
            const result = await API.Email.send(emailData);
            
            if (result.success) {
                Utils.showNotification('Email sent successfully!', 'success');
                
                // Clear form
                this.clearForm();
                
                // Reload logs if container exists
                if (document.getElementById('emailLogsContainer')) {
                    await this.loadEmailLogs();
                }
            } else {
                Utils.showNotification(`Failed to send email: ${result.error}`, 'error');
            }
        } catch (error) {
            Utils.handleError(error, 'Sending email');
        } finally {
            Utils.hideLoading();
        }
    },
    
    async sendBulkEmail() {
        const selectedTags = [];
        document.querySelectorAll('input[name="bulkEmailTags"]:checked').forEach(checkbox => {
            selectedTags.push(checkbox.value);
        });
        
        if (selectedTags.length === 0) {
            Utils.showNotification('Please select at least one tag group for bulk email', 'error');
            return;
        }
        
        const subject = document.getElementById('emailSubject')?.value;
        const body = document.getElementById('emailBody')?.value;
        
        if (!subject || !body) {
            Utils.showNotification('Please fill in subject and body', 'error');
            return;
        }
        
        const confirmed = confirm(`Send bulk email to all users with tags: ${selectedTags.join(', ')}?\n\nThis will send ONE email with all users BCC'd (rate limit friendly).`);
        if (!confirmed) return;
        
        try {
            Utils.showLoading('Sending bulk emails...');
            
            const bulkData = {
                tags: selectedTags,
                subject,
                body,
                templateName: this.currentTemplate
            };
            
            const result = await API.Email.sendBulkEmail(bulkData);
            
            if (result.success) {
                let message = `Bulk email sent to ${result.sent || 0} recipients`;
                if (result.errors && result.errors.length > 0) {
                    message += `, with ${result.errors.length} errors`;
                }
                Utils.showNotification(message, 'success');
            } else {
                throw new Error(result.error);
            }
            
        } catch (error) {
            Utils.handleError(error, 'Sending bulk email');
        } finally {
            Utils.hideLoading();
        }
    },
    
clearForm() {
    // Clear all fields except recipient (if it was pre-populated)
    document.getElementById('emailSubject').value = '';
    document.getElementById('emailBody').value = '';
    document.getElementById('emailCC').value = '';
    document.getElementById('emailBCC').value = '';
    document.getElementById('emailTemplate').value = '';
    
    // Don't clear recipient if it was pre-populated via navigation
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    const hasAppStateRecipient = window.AppState && window.AppState.emailRecipient;
    
    if (!userId && !hasAppStateRecipient) {
        document.getElementById('emailRecipient').value = '';
        this.currentUserData = null; // CLEAR STORED USER DATA
        this.recipientUserId = null;
    }
    
    // Uncheck bulk email tags
    document.querySelectorAll('input[name="bulkEmailTags"]').forEach(cb => cb.checked = false);
    
    this.currentTemplate = null;
    this.updateEmailPreview();
    this.updateTemplateButtons();
},
    
    async saveTemplate() {
        const templateName = prompt('Enter template name:');
        if (!templateName) return;
        
        const subject = document.getElementById('emailSubject')?.value;
        const body = document.getElementById('emailBody')?.value;
        
        if (!subject || !body) {
            Utils.showNotification('Please fill in subject and body', 'error');
            return;
        }
        
        try {
            const templateData = {
                name: templateName,
                subject,
                body,
                template_type: 'custom'
            };
            
            await API.Email.saveTemplate(templateData);
            Utils.showNotification('Template saved successfully!', 'success');
            await this.loadTemplates();
            
            // Select the newly saved template
            document.getElementById('emailTemplate').value = templateName;
            this.updateTemplateButtons();
            
        } catch (error) {
            Utils.handleError(error, 'Saving email template');
        }
    },
    
    async updateTemplate() {
        const templateName = document.getElementById('emailTemplate')?.value;
        if (!templateName) return;
        
        const subject = document.getElementById('emailSubject')?.value;
        const body = document.getElementById('emailBody')?.value;
        
        if (!subject || !body) {
            Utils.showNotification('Please fill in subject and body', 'error');
            return;
        }
        
        try {
            const templateData = {
                name: templateName,
                subject,
                body,
                template_type: 'custom'
            };
            
            await API.Email.updateTemplate(templateName, templateData);
            Utils.showNotification('Template updated successfully!', 'success');
            
        } catch (error) {
            Utils.handleError(error, 'Updating email template');
        }
    },
    
    async deleteTemplate() {
        const templateName = document.getElementById('emailTemplate')?.value;
        if (!templateName) return;
        
        if (!confirm(`Are you sure you want to delete the template "${templateName}"?`)) {
            return;
        }
        
        try {
            await API.Email.deleteTemplate(templateName);
            Utils.showNotification('Template deleted successfully!', 'success');
            await this.loadTemplates();
            
            // Clear template selection
            document.getElementById('emailTemplate').value = '';
            this.updateTemplateButtons();
            
        } catch (error) {
            Utils.handleError(error, 'Deleting email template');
        }
    },
    
    async testEmailConnection() {
        try {
            Utils.showLoading('Testing email connection...');
            
            const result = await API.Email.testConnection();
            
            if (result.success) {
                Utils.showNotification('Email connection test successful!', 'success');
            } else {
                Utils.showNotification(`Email connection test failed: ${result.error}`, 'error');
            }
        } catch (error) {
            Utils.handleError(error, 'Testing email connection');
        } finally {
            Utils.hideLoading();
        }
    },
    
    async loadEmailLogs() {
        try {
            const logs = await API.Email.getLogs();
            this.renderEmailLogs(logs);
        } catch (error) {
            Utils.handleError(error, 'Loading email logs');
        }
    },
    
    renderEmailLogs(logs) {
        const container = document.getElementById('emailLogsContainer');
        if (!container) return;
        
        container.innerHTML = `
            <h4 style="color: #4fc3f7; margin-bottom: 20px;">Recent Email Activity</h4>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Recipient</th>
                        <th>Subject</th>
                        <th>Status</th>
                        <th>User</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map(log => `
                        <tr>
                            <td>${Utils.formatDate ? Utils.formatDate(log.sent_at) : log.sent_at}</td>
                            <td>${log.recipient_email || log.recipient || ''}</td>
                            <td>${log.subject || ''}</td>
                            <td>
                                <span class="status ${log.status === 'sent' ? 'success' : 'error'}">
                                    ${log.status || 'unknown'}
                                </span>
                            </td>
                            <td>${log.user_name || 'N/A'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
};

// Global function exports for onclick handlers
window.loadTemplate = window.Email.loadTemplate.bind(window.Email);
window.insertField = window.Email.insertField.bind(window.Email);
window.sendEmail = window.Email.sendEmail.bind(window.Email);
window.saveTemplate = window.Email.saveTemplate.bind(window.Email);
window.deleteTemplate = window.Email.deleteTemplate.bind(window.Email);
window.updateTemplate = window.Email.updateTemplate.bind(window.Email);
window.sendBulkEmail = window.Email.sendBulkEmail.bind(window.Email);
window.testEmailConnection = window.Email.testEmailConnection.bind(window.Email);

console.log('📧 Enhanced Email module loaded successfully');