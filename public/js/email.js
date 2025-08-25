// Enhanced Email Management Functions

// EMAIL PREVIEW SYSTEM - ADD THIS BEFORE window.Email OBJECT
const EmailPreview = {
    iframe: null,
    isLargeView: false,

    createIframe() {
        if (this.iframe) return this.iframe;
        
        const iframe = document.createElement('iframe');
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            background: white;
        `;
        iframe.setAttribute('sandbox', 'allow-same-origin');
        this.iframe = iframe;
        return iframe;
    },

    getEmailClientHTML(content) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Preview</title>
    <style>
        * { box-sizing: border-box; }
        html, body {
            margin: 0; padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 14px; line-height: 1.6; color: #333333; background: #ffffff;
        }
        body { padding: 20px; min-height: calc(100vh - 40px); }
        h1, h2, h3, h4, h5, h6 { margin: 0 0 16px 0; font-weight: bold; line-height: 1.25; }
        h1 { font-size: 28px; color: #1a1a1a; }
        h2 { font-size: 24px; color: #2a2a2a; }
        h3 { font-size: 20px; color: #3a3a3a; }
        p { margin: 0 0 16px 0; line-height: 1.6; }
        a { color: #007cba; text-decoration: underline; }
        button, .btn {
            display: inline-block; padding: 12px 24px; margin: 8px 4px;
            border: none; border-radius: 6px; text-decoration: none;
            font-size: 14px; font-weight: 500; cursor: pointer;
            transition: all 0.2s ease; text-align: center;
        }
        .paypal-btn, button[style*="paypal"], a[href*="paypal"] {
            background: #0070ba !important; color: white !important; border: 2px solid #0070ba !important;
        }
        .venmo-btn, button[style*="venmo"], a[href*="venmo"] {
            background: #3d95ce !important; color: white !important; border: 2px solid #3d95ce !important;
        }
        .cashapp-btn, button[style*="cashapp"], a[href*="cash.app"] {
            background: #00d632 !important; color: white !important; border: 2px solid #00d632 !important;
        }
        @media only screen and (max-width: 600px) {
            body { padding: 10px; }
            h1 { font-size: 24px; } h2 { font-size: 20px; } h3 { font-size: 18px; }
            button, .btn { display: block; width: 100%; margin: 8px 0; }
        }
    </style>
</head>
<body>${content}</body>
</html>`;
    },

    updatePreview(htmlContent) {
        const iframe = this.createIframe();
        const previewContainer = document.getElementById('emailPreview');
        
        if (!previewContainer) return;
        
        previewContainer.innerHTML = '';
        
        if (!htmlContent || !htmlContent.trim()) {
            previewContainer.innerHTML = '<p class="preview-placeholder">Start typing in the email body above to see the preview...</p>';
            return;
        }
        
        const fullHTML = this.getEmailClientHTML(htmlContent);
        previewContainer.appendChild(iframe);
        
        iframe.onload = () => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                iframeDoc.open();
                iframeDoc.write(fullHTML);
                iframeDoc.close();
            } catch (error) {
                console.error('Error writing to iframe:', error);
                previewContainer.innerHTML = `<div style="padding: 20px; background: white; color: black; border-radius: 8px;">${htmlContent}</div>`;
            }
        };
        
        iframe.style.height = this.isLargeView ? '90vh' : '400px';
    }
};

// Helper functions for email preview
function formatDate(dateString) {
    if (!dateString || dateString === 'FREE' || dateString === 'N/A') return dateString;
    try {
        return new Date(dateString).toLocaleDateString();
    } catch (error) {
        return dateString;
    }
}

function calculateDaysUntilExpiration(expirationDate, isFree = false) {
    if (isFree || !expirationDate || expirationDate === 'FREE' || expirationDate === 'N/A' || expirationDate === null) {
        return '∞';
    }
    try {
        const expDateStr = expirationDate.split('T')[0];
        const expDate = new Date(expDateStr + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const timeDiff = expDate.getTime() - today.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
        return daysDiff >= 0 ? daysDiff.toString() : '0';
    } catch (error) {
        return '0';
    }
}

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
    this.updateTemplateButtons(); // Only update buttons, don't load content
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
            // Load the template content
            document.getElementById('emailSubject').value = template.subject;
            document.getElementById('emailBody').value = template.body;
            
            // Update buttons
            this.updateTemplateButtons();
            
            // Update preview
            this.updateEmailPreview();
            
            // Force a second update after a tiny delay to ensure it works
            setTimeout(() => {
                this.updateEmailPreview();
            }, 10);
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
        
        
        // Get subscription info from user's subscriptions array
        let plexSubscription = null;
        let iptvSubscription = null;
        let plexSubscriptionName = 'N/A';
        let iptvSubscriptionName = 'N/A';
        let plexPrice = '0.00';
        let iptvPrice = '0.00';
        let plexDays = '0';
        let iptvDays = '0';
        let plexIsFree = false;
        let iptvIsFree = false;
        
        if (userDataToUse.subscriptions && Array.isArray(userDataToUse.subscriptions)) {
            plexSubscription = userDataToUse.subscriptions.find(sub => sub.type === 'plex' && sub.status === 'active');
            iptvSubscription = userDataToUse.subscriptions.find(sub => sub.type === 'iptv' && sub.status === 'active');
            
if (plexSubscription) {
    plexSubscriptionName = plexSubscription.subscription_name || 'Plex Subscription';
    plexPrice = plexSubscription.price || '0.00';
    // FIXED: Better FREE detection for Plex
    plexIsFree = (plexSubscription.subscription_type_id === null || plexSubscription.price === 0 || plexSubscription.subscription_name === 'FREE Plex Access');
    console.log('📧 Plex subscription details:', {
        name: plexSubscriptionName,
        price: plexPrice,
        isFree: plexIsFree,
        subscription_type_id: plexSubscription.subscription_type_id,
        expiration_date: plexSubscription.expiration_date
    });
    plexDays = calculateDaysUntilExpiration(plexSubscription.expiration_date, plexIsFree);
}
            
            if (iptvSubscription) {
                iptvSubscriptionName = iptvSubscription.subscription_name || 'IPTV Subscription';
                iptvPrice = iptvSubscription.price || '0.00';
                iptvIsFree = iptvSubscription.is_free || false;
                iptvDays = calculateDaysUntilExpiration(iptvSubscription.expiration_date, iptvIsFree);
            }
        }
        
// FIXED: Check if Plex is FREE from the user expiration field as fallback
        if (userDataToUse.plex_expiration === 'FREE') {
            console.log('📧 User plex_expiration is FREE, overriding days calculation');
            plexIsFree = true;
            plexDays = '∞';
        }
        
        // Check if IPTV is FREE from the user expiration field  
        if (userDataToUse.iptv_expiration === 'FREE') {
            iptvIsFree = true;
            iptvDays = '∞';
        }

        console.log('📧 Final calculated values:', {
            plexExpiration: userDataToUse.plex_expiration,
            plexIsFree: plexIsFree,
            plexDays: plexDays,
            iptvExpiration: userDataToUse.iptv_expiration,
            iptvIsFree: iptvIsFree,
            iptvDays: iptvDays
        });
        
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
            
            // FIX: Use actual expiration dates from user object and format them properly
            .replace(/\{\{plex_expiration\}\}/g, 
                userDataToUse.plex_expiration === 'FREE' ? 'FREE' : 
                formatDate(userDataToUse.plex_expiration) || 'N/A')
            .replace(/\{\{iptv_expiration\}\}/g, 
                userDataToUse.iptv_expiration === 'FREE' ? 'FREE' : 
                formatDate(userDataToUse.iptv_expiration) || 'N/A')
            
            // Specific subscription types only
            .replace(/\{\{plex_subscription_type\}\}/g, plexSubscriptionName)
            .replace(/\{\{iptv_subscription_type\}\}/g, iptvSubscriptionName)
            
            // Specific days until expiration only (with FREE check)
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
    
// Update the preview using the new iframe system
EmailPreview.updatePreview(previewContent);
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

// Toggle dynamic fields visibility
function toggleDynamicFields() {
    const content = document.getElementById('dynamicFieldsContent');
    const toggle = document.getElementById('dynamicFieldsToggle');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        toggle.textContent = '−';
    } else {
        content.style.display = 'none';
        toggle.textContent = '+';
    }
}

// FINAL WORKING VERSION - Replace togglePreviewSize function
function togglePreviewSize() {
    const existing = document.getElementById('EMAIL_MODAL_FINAL');
    if (existing) {
        existing.remove();
        document.body.style.overflow = '';
        EmailPreview.isLargeView = false;
        
        if (window.emailModalEscHandler) {
            document.removeEventListener('keydown', window.emailModalEscHandler);
            window.emailModalEscHandler = null;
        }
        
        // Restore normal preview
        if (window.Email && window.Email.updateEmailPreview) {
            window.Email.updateEmailPreview();
        }
        return;
    }
    
    const emailBody = document.getElementById('emailBody')?.value || '';
    if (!emailBody.trim()) {
        Utils.showNotification('Please enter some email content first', 'warning');
        return;
    }
    
    // Create iframe modal for large view
    const modal = document.createElement('div');
    modal.id = 'EMAIL_MODAL_FINAL';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.9); z-index: 999999; display: flex;
        align-items: center; justify-content: center; padding: 20px;
    `;
    
    const container = document.createElement('div');
    container.style.cssText = `
        width: 90vw; max-width: 1200px; height: 90vh; background: white;
        border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;
    `;
    
    const header = document.createElement('div');
    header.style.cssText = `
        background: linear-gradient(135deg, #2a2a3e 0%, #1e1e2e 100%); color: white;
        padding: 15px 20px; display: flex; justify-content: space-between; align-items: center;
    `;
    
    const title = document.createElement('h3');
    title.textContent = 'Email Preview - Full Size';
    title.style.cssText = 'margin: 0; color: #4fc3f7;';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = 'background: #4fc3f7; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;';
    closeBtn.onclick = () => togglePreviewSize();
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    const iframeContainer = document.createElement('div');
    iframeContainer.style.cssText = 'flex: 1; overflow: hidden; background: white;';
    
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width: 100%; height: 100%; border: none; background: white;';
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
    
    // Process content with your existing field replacement logic
    let processedContent = emailBody;
    const currentUserData = window.Email?.currentUserData || null;
    
    if (currentUserData) {
        // Apply all your existing field replacements here
        // (use the same logic from your updateEmailPreview function)
    } else {
        // Use sample data
        processedContent = processedContent
            .replace(/\{\{name\}\}/g, 'John Doe')
            .replace(/\{\{email\}\}/g, 'john@example.com')
            .replace(/\{\{plex_email\}\}/g, 'john@plex.com')
            .replace(/\{\{iptv_username\}\}/g, 'john_iptv')
            .replace(/\{\{iptv_password\}\}/g, 'password123');
    }
    
    // Replace payment links
    processedContent = processedContent
        .replace(/\{\{paypal_link\}\}/g, 'https://paypal.me/johnsonflix')
        .replace(/\{\{venmo_link\}\}/g, 'https://venmo.com/johnsonflix')
        .replace(/\{\{cashapp_link\}\}/g, 'https://cash.app/$johnsonflix');
    
// Process dynamic fields before showing in full size (same as small preview)
let processedEmailBody = emailBody;

// Use the same dynamic field processing as the small preview
if (Email && Email.currentUserData) {
    const userData = Email.currentUserData;
    
    // Process dynamic fields with actual user data
    processedEmailBody = emailBody
        .replace(/\{\{name\}\}/g, userData.name || '')
        .replace(/\{\{email\}\}/g, userData.email || '')
        .replace(/\{\{username\}\}/g, userData.username || userData.name || '')
        .replace(/\{\{owner_name\}\}/g, userData.owner_name || '')
        .replace(/\{\{owner_email\}\}/g, userData.owner_email || '')
        .replace(/\{\{plex_email\}\}/g, userData.plex_email || userData.email || '')
        .replace(/\{\{plex_expiration\}\}/g, formatDate(userData.plex_expiration || userData.expiration_date))
        .replace(/\{\{plex_subscription_type\}\}/g, userData.plex_subscription_type || userData.subscription_type || 'FREE Plex Access')
        .replace(/\{\{plex_days_until_expiration\}\}/g, calculateDaysUntilExpiration(userData.plex_expiration || userData.expiration_date))
        .replace(/\{\{plex_renewal_price\}\}/g, userData.subscriptions?.find(s => s.type === 'plex' && s.status === 'active')?.price ? `$${userData.subscriptions.find(s => s.type === 'plex' && s.status === 'active').price}` : '$0.00')
        .replace(/\{\{iptv_username\}\}/g, userData.iptv_username || '')
        .replace(/\{\{iptv_password\}\}/g, userData.iptv_password || '')
        .replace(/\{\{iptv_expiration\}\}/g, formatDate(userData.iptv_expiration || userData.expiration_date))
        .replace(/\{\{iptv_subscription_type\}\}/g, userData.iptv_subscription_type || userData.subscription_type || '')
        .replace(/\{\{iptv_days_until_expiration\}\}/g, calculateDaysUntilExpiration(userData.iptv_expiration || userData.expiration_date))
        .replace(/\{\{iptv_renewal_price\}\}/g, userData.subscriptions?.find(s => s.type === 'iptv' && s.status === 'active')?.price ? `$${userData.subscriptions.find(s => s.type === 'iptv' && s.status === 'active').price}` : '$0.00')
        .replace(/\{\{implayer_code\}\}/g, userData.implayer_code || '')
        .replace(/\{\{device_count\}\}/g, userData.device_count || '')
        .replace(/\{\{subscription_name\}\}/g, userData.subscription_name || userData.subscription_type || 'FREE Plex Access')
        .replace(/\{\{subscription_type\}\}/g, userData.subscription_type || 'FREE Plex Access')
        .replace(/\{\{expiration_date\}\}/g, formatDate(userData.expiration_date))
        .replace(/\{\{days_until_expiration\}\}/g, calculateDaysUntilExpiration(userData.expiration_date))
        .replace(/\{\{renewal_price\}\}/g, userData.renewal_price ? `$${userData.renewal_price}` : '$0.00')
        .replace(/\{\{paypal_link\}\}/g, '#')
        .replace(/\{\{venmo_link\}\}/g, '#')
        .replace(/\{\{cashapp_link\}\}/g, '#');
} else {
    // Use sample data if no user is selected
    processedEmailBody = emailBody
        .replace(/\{\{name\}\}/g, 'Sample User')
        .replace(/\{\{email\}\}/g, 'user@example.com')
        .replace(/\{\{plex_days_until_expiration\}\}/g, '7')
        .replace(/\{\{plex_renewal_price\}\}/g, '$120.00')
        .replace(/\{\{iptv_renewal_price\}\}/g, '$40.00')
        .replace(/\{\{days_until_expiration\}\}/g, '7')
        .replace(/\{\{renewal_price\}\}/g, '$120.00')
        .replace(/\{\{paypal_link\}\}/g, '#')
        .replace(/\{\{venmo_link\}\}/g, '#')
        .replace(/\{\{cashapp_link\}\}/g, '#');
}

const fullHTML = EmailPreview.getEmailClientHTML(processedEmailBody);
    
    iframe.onload = () => {
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(fullHTML);
            iframeDoc.close();
        } catch (error) {
            console.error('Error loading iframe in modal:', error);
        }
    };
    
    iframeContainer.appendChild(iframe);
    container.appendChild(header);
    container.appendChild(iframeContainer);
    modal.appendChild(container);
    
    modal.onclick = (e) => {
        if (e.target === modal) togglePreviewSize();
    };
    
    window.emailModalEscHandler = (e) => {
        if (e.key === 'Escape') togglePreviewSize();
    };
    document.addEventListener('keydown', window.emailModalEscHandler);
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    EmailPreview.isLargeView = true;
}

// Make sure it's globally available
window.togglePreviewSize = togglePreviewSize;

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