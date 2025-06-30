// Enhanced Email Management Functions

window.Email = {
    currentTemplate: null,
    recipientUserId: null,

    async init() {
        this.setupEventListeners();
        await this.loadTemplates();
        
        // Check if we have a recipient pre-populated from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const userId = urlParams.get('userId');
        if (userId) {
            await this.prepopulateRecipient(userId);
        }
    },
    
    setupEventListeners() {
        const emailBody = document.getElementById('emailBody');
        if (emailBody) {
            emailBody.addEventListener('input', this.updateEmailPreview.bind(this));
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
    
    async prepopulateRecipient(userId) {
        try {
            this.recipientUserId = userId;
            const userData = await API.Email.getUserData(userId);
            
            if (userData) {
                document.getElementById('emailRecipient').value = userData.email;
                // Update preview with real user data
                this.updateEmailPreview(userData);
            }
        } catch (error) {
            console.error('Error prepopulating recipient:', error);
        }
    },
    
    updateEmailPreview(userData = null) {
        const emailBody = document.getElementById('emailBody')?.value || '';
        const preview = document.getElementById('emailPreview');
        
        if (!preview) return;
        
        let previewContent = emailBody;
        
        if (userData) {
            // Use real user data for preview
            previewContent = previewContent
                .replace(/\{\{name\}\}/g, userData.name || '')
                .replace(/\{\{email\}\}/g, userData.email || '')
                .replace(/\{\{username\}\}/g, userData.username || userData.name || '')
                .replace(/\{\{plex_expiration\}\}/g, userData.plex_expiration || '')
                .replace(/\{\{iptv_expiration\}\}/g, userData.iptv_expiration || '')
                .replace(/\{\{subscription_type\}\}/g, userData.subscription_type || '')
                .replace(/\{\{renewal_price\}\}/g, userData.renewal_price || '')
                .replace(/\{\{owner_name\}\}/g, userData.owner_name || '')
                .replace(/\{\{owner_email\}\}/g, userData.owner_email || '')
                .replace(/\{\{plex_email\}\}/g, userData.plex_email || '')
                .replace(/\{\{iptv_username\}\}/g, userData.iptv_username || '')
                .replace(/\{\{iptv_password\}\}/g, userData.iptv_password || '')
                .replace(/\{\{implayer_code\}\}/g, userData.implayer_code || '')
                .replace(/\{\{device_count\}\}/g, userData.device_count || '1');
        } else {
            // Use sample data for preview
            previewContent = previewContent
                .replace(/\{\{name\}\}/g, 'John Doe')
                .replace(/\{\{email\}\}/g, 'john.doe@example.com')
                .replace(/\{\{username\}\}/g, 'johndoe')
                .replace(/\{\{plex_expiration\}\}/g, 'Jun 28, 2025')
                .replace(/\{\{iptv_expiration\}\}/g, 'Jul 15, 2025')
                .replace(/\{\{subscription_type\}\}/g, 'Plex')
                .replace(/\{\{renewal_price\}\}/g, '$120.00')
                .replace(/\{\{owner_name\}\}/g, 'Andrew')
                .replace(/\{\{owner_email\}\}/g, 'arjohnson15@gmail.com')
                .replace(/\{\{plex_email\}\}/g, 'johndoe@example.com')
                .replace(/\{\{iptv_username\}\}/g, 'johndoe_iptv')
                .replace(/\{\{iptv_password\}\}/g, 'iptv456')
                .replace(/\{\{implayer_code\}\}/g, 'ABC123DEF')
                .replace(/\{\{device_count\}\}/g, '2');
        }
        
        // Replace payment links with sample data or actual settings
        previewContent = previewContent
            .replace(/\{\{paypal_link\}\}/g, 'https://paypal.me/johnsonflix')
            .replace(/\{\{venmo_link\}\}/g, 'https://venmo.com/johnsonflix')
            .replace(/\{\{cashapp_link\}\}/g, 'https://cash.app/$johnsonflix')
            .replace(/\{\{days_until_expiration\}\}/g, '7');
        
        if (previewContent.trim()) {
            preview.innerHTML = previewContent;
        } else {
            preview.innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">Start typing in the email body below to see the preview...</p>';
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
        
        if (!Utils.ValidationUtils?.validateEmail(recipient)) {
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
            
            await API.Email.send(emailData);
            Utils.showNotification('Email sent successfully', 'success');
            
            // Clear form
            this.clearForm();
            
        } catch (error) {
            Utils.handleError(error, 'Sending email');
        } finally {
            Utils.hideLoading();
        }
    },
    
    async sendBulkEmail() {
        const selectedTags = Array.from(document.querySelectorAll('input[name="bulkEmailTags"]:checked'))
            .map(cb => cb.value);
        
        const subject = document.getElementById('emailSubject')?.value;
        const body = document.getElementById('emailBody')?.value;
        const bcc = document.getElementById('emailBCC')?.value;
        
        if (selectedTags.length === 0) {
            Utils.showNotification('Please select at least one tag for bulk email', 'error');
            return;
        }
        
        if (!subject || !body) {
            Utils.showNotification('Please fill in subject and body', 'error');
            return;
        }
        
        if (!confirm(`Send email to all users with tags: ${selectedTags.join(', ')}?\n\nUsers marked "exclude from bulk emails" will be skipped.`)) {
            return;
        }
        
        try {
            Utils.showLoading('Sending bulk emails...');
            
            const bulkEmailData = {
                tags: selectedTags,
                subject,
                body,
                templateName: this.currentTemplate,
                bcc
            };
            
            const result = await API.Email.sendBulk(bulkEmailData);
            
            if (result.success) {
                let message = `Bulk email sent to ${result.sent || 0} users`;
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
        document.getElementById('emailRecipient').value = '';
        document.getElementById('emailSubject').value = '';
        document.getElementById('emailBody').value = '';
        document.getElementById('emailCC').value = '';
        document.getElementById('emailBCC').value = '';
        document.getElementById('emailTemplate').value = '';
        
        // Uncheck bulk email tags
        document.querySelectorAll('input[name="bulkEmailTags"]').forEach(cb => cb.checked = false);
        
        this.recipientUserId = null;
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
            Utils.showNotification('Template saved successfully', 'success');
            
            // Reload templates and select the new one
            await this.loadTemplates();
            document.getElementById('emailTemplate').value = templateName;
            this.currentTemplate = templateName;
            this.updateTemplateButtons();
            
        } catch (error) {
            Utils.handleError(error, 'Saving template');
        }
    },
    
    async updateTemplate() {
        if (!this.currentTemplate) {
            Utils.showNotification('No template selected', 'error');
            return;
        }
        
        const subject = document.getElementById('emailSubject')?.value;
        const body = document.getElementById('emailBody')?.value;
        
        if (!subject || !body) {
            Utils.showNotification('Please fill in subject and body', 'error');
            return;
        }
        
        try {
            const templateData = {
                subject,
                body,
                template_type: 'custom'
            };
            
            await API.Email.updateTemplate(this.currentTemplate, templateData);
            Utils.showNotification('Template updated successfully', 'success');
            
        } catch (error) {
            Utils.handleError(error, 'Updating template');
        }
    },
    
    async deleteTemplate() {
        if (!this.currentTemplate) {
            Utils.showNotification('No template selected', 'error');
            return;
        }
        
        if (!confirm(`Are you sure you want to delete the template "${this.currentTemplate}"?`)) {
            return;
        }
        
        try {
            await API.Email.deleteTemplate(this.currentTemplate);
            Utils.showNotification('Template deleted successfully', 'success');
            
            // Reload templates and clear form
            await this.loadTemplates();
            this.clearForm();
            
        } catch (error) {
            Utils.handleError(error, 'Deleting template');
        }
    },
    
    async testEmailConnection() {
        try {
            Utils.showLoading('Testing email connection...');
            
            const result = await API.Email.testConnection();
            
            if (result.success) {
                Utils.showNotification('Email connection test successful', 'success');
            } else {
                Utils.showNotification(`Email test failed: ${result.error}`, 'error');
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
        const logContainer = document.getElementById('emailLogsContainer');
        if (!logContainer) return;
        
        if (logs.length === 0) {
            logContainer.innerHTML = '<p>No email logs found</p>';
            return;
        }
        
        logContainer.innerHTML = `
            <table class="table">
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