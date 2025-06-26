// Email Management Functions

window.Email = {
    async init() {
        this.setupEventListeners();
        await this.loadTemplates();
    },
    
    setupEventListeners() {
        const emailBody = document.getElementById('emailBody');
        if (emailBody) {
            emailBody.addEventListener('input', this.updateEmailPreview.bind(this));
        }
        
        // Initialize preview
        this.updateEmailPreview();
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
            }
        } catch (error) {
            Utils.handleError(error, 'Loading email template');
        }
    },
    
    updateEmailPreview() {
        const emailBody = document.getElementById('emailBody')?.value || '';
        const preview = document.getElementById('emailPreview');
        
        if (!preview) return;
        
        let previewContent = emailBody
            .replace(/\{\{name\}\}/g, 'John Doe')
            .replace(/\{\{email\}\}/g, 'john.doe@example.com')
            .replace(/\{\{username\}\}/g, 'johndoe')
            .replace(/\{\{plex_expiration\}\}/g, 'Jun 28, 2025')
            .replace(/\{\{iptv_expiration\}\}/g, 'Jul 15, 2025')
            .replace(/\{\{subscription_type\}\}/g, 'Plex')
            .replace(/\{\{days_until_expiration\}\}/g, '7')
            .replace(/\{\{renewal_price\}\}/g, '$120.00')
            .replace(/\{\{owner_name\}\}/g, 'Andrew')
            .replace(/\{\{owner_email\}\}/g, 'arjohnson15@gmail.com')
            .replace(/\{\{plex_email\}\}/g, 'johndoe@example.com')
            .replace(/\{\{iptv_username\}\}/g, 'johndoe_iptv')
            .replace(/\{\{iptv_password\}\}/g, 'iptv456')
            .replace(/\{\{implayer_code\}\}/g, 'ABC123DEF')
            .replace(/\{\{device_count\}\}/g, '2')
            .replace(/\{\{paypal_link\}\}/g, 'https://paypal.me/johnsonflix')
            .replace(/\{\{venmo_link\}\}/g, 'https://venmo.com/johnsonflix')
            .replace(/\{\{cashapp_link\}\}/g, 'https://cash.app/$johnsonflix');
        
        preview.innerHTML = previewContent || '<em>Preview will appear here...</em>';
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
        const subject = document.getElementById('emailSubject')?.value;
        const body = document.getElementById('emailBody')?.value;
        const cc = document.getElementById('emailCC')?.value;
        
        if (!recipient || !subject || !body) {
            Utils.showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        try {
            Utils.showLoading('Sending email...');
            
            const emailData = {
                to: recipient,
                subject,
                body,
                cc: cc ? cc.split(',').map(email => email.trim()) : []
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
    
    clearForm() {
        document.getElementById('emailRecipient').value = '';
        document.getElementById('emailSubject').value = '';
        document.getElementById('emailBody').value = '';
        document.getElementById('emailCC').value = '';
        document.getElementById('emailTemplate').value = '';
        this.updateEmailPreview();
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
            
            // Reload templates
            await this.loadTemplates();
            
        } catch (error) {
            Utils.handleError(error, 'Saving template');
        }
    },
    
    async deleteTemplate() {
        const templateName = document.getElementById('emailTemplate')?.value;
        if (!templateName) {
            Utils.showNotification('Please select a template to delete', 'error');
            return;
        }
        
        if (!confirm(`Are you sure you want to delete the template "${templateName}"?`)) {
            return;
        }
        
        try {
            await API.Email.deleteTemplate(templateName);
            Utils.showNotification('Template deleted successfully', 'success');
            
            // Reload templates and clear form
            await this.loadTemplates();
            this.clearForm();
            
        } catch (error) {
            Utils.handleError(error, 'Deleting template');
        }
    },
    
    async sendBulkEmail() {
        const selectedTags = Array.from(document.querySelectorAll('input[name="bulkEmailTags"]:checked'))
            .map(cb => cb.value);
        
        const subject = document.getElementById('emailSubject')?.value;
        const body = document.getElementById('emailBody')?.value;
        
        if (selectedTags.length === 0) {
            Utils.showNotification('Please select at least one tag for bulk email', 'error');
            return;
        }
        
        if (!subject || !body) {
            Utils.showNotification('Please fill in subject and body', 'error');
            return;
        }
        
        if (!confirm(`Send email to all users with tags: ${selectedTags.join(', ')}?`)) {
            return;
        }
        
        try {
            Utils.showLoading('Sending bulk emails...');
            
            const bulkEmailData = {
                tags: selectedTags,
                subject,
                body
            };
            
            const result = await API.Email.sendBulk(bulkEmailData);
            Utils.showNotification(`Bulk email sent to ${result.sent || 0} users`, 'success');
            
        } catch (error) {
            Utils.handleError(error, 'Sending bulk email');
        } finally {
            Utils.hideLoading();
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
                            <td>${Utils.formatDate(log.sent_at)}</td>
                            <td>${log.recipient}</td>
                            <td>${log.subject}</td>
                            <td>
                                <span class="status ${log.status === 'sent' ? 'success' : 'error'}">
                                    ${log.status}
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
window.sendBulkEmail = window.Email.sendBulkEmail.bind(window.Email);
window.testEmailConnection = window.Email.testEmailConnection.bind(window.Email);

console.log('📧 Email module loaded successfully');