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
        