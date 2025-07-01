// Utility Functions for JohnsonFlix Manager

// Global state
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

// Utility function to format dates nicely
function formatDate(dateString) {
    if (!dateString || dateString === 'N/A' || dateString === 'FREE' || dateString === 'NEVER') {
        return dateString;
    }
    
    try {
        let date;
        if (dateString.includes('T')) {
            // If it has time, parse it directly but be careful about timezone
            const dateOnly = dateString.split('T')[0]; // Get just the date part
            const [year, month, day] = dateOnly.split('-');
            date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day)); // month is 0-indexed
        } else {
            // If it's just a date (YYYY-MM-DD), treat it as local to avoid timezone shifts
            const [year, month, day] = dateString.split('-');
            date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day)); // month is 0-indexed
        }
        
        if (isNaN(date.getTime())) {
            return dateString; // Return original if invalid date
        }
        
        // Format as "MMM DD, YYYY" (e.g., "Jul 08, 2025")
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    } catch (error) {
        console.error('Date formatting error:', error, 'for date:', dateString);
        return dateString; // Return original if formatting fails
    }
}

// Check if a date is expired (past today)
function isDateExpired(dateString) {
    if (!dateString || dateString === 'N/A' || dateString === 'FREE' || dateString === 'NEVER') {
        return false; // Special cases are not expired
    }
    
    try {
        const date = new Date(dateString);
        const today = new Date();
        
        // Set time to beginning of day for accurate comparison
        today.setHours(0, 0, 0, 0);
        date.setHours(0, 0, 0, 0);
        
        return date < today;
    } catch (error) {
        return false; // If we can't parse the date, assume it's not expired
    }
}

// Check if a date is expiring soon (within X days)
function isDateExpiringSoon(dateString, daysThreshold = 7) {
    if (!dateString || dateString === 'N/A' || dateString === 'FREE' || dateString === 'NEVER') {
        return false;
    }
    
    try {
        const date = new Date(dateString);
        const today = new Date();
        const threshold = new Date();
        threshold.setDate(today.getDate() + daysThreshold);
        
        // Set time to beginning of day for accurate comparison
        today.setHours(0, 0, 0, 0);
        date.setHours(0, 0, 0, 0);
        threshold.setHours(0, 0, 0, 0);
        
        return date >= today && date <= threshold;
    } catch (error) {
        return false;
    }
}

// Show/hide loading indicator
function showLoading(message = 'Loading...') {
    let loadingIndicator = document.getElementById('loadingIndicator');
    
    if (!loadingIndicator) {
        // Create loading indicator if it doesn't exist
        loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'loadingIndicator';
        loadingIndicator.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            color: white;
            font-size: 1.2rem;
        `;
        document.body.appendChild(loadingIndicator);
    }
    
    loadingIndicator.innerHTML = `
        <div style="text-align: center;">
            <div style="border: 4px solid rgba(255, 255, 255, 0.3); border-top: 4px solid #4fc3f7; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px;"></div>
            <div>${message}</div>
        </div>
    `;
    
    // Add spin animation if not already present
    if (!document.getElementById('loadingSpinStyle')) {
        const style = document.createElement('style');
        style.id = 'loadingSpinStyle';
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
    loadingIndicator.style.display = 'flex';
}

function hideLoading() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
}

// Show notification/alert with custom styling
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        max-width: 400px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        animation: slideInRight 0.3s ease-out;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
    `;
    
    // Set background color based on type
    const colors = {
        success: 'linear-gradient(45deg, #4caf50, #8bc34a)',
        error: 'linear-gradient(45deg, #f44336, #e91e63)',
        warning: 'linear-gradient(45deg, #ff9800, #ffc107)',
        info: 'linear-gradient(45deg, #2196f3, #03a9f4)'
    };
    
    notification.style.background = colors[type] || colors.info;
    
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; font-size: 18px; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
    `;
    
    // Add CSS animation if not already present
    if (!document.getElementById('notificationStyle')) {
        const style = document.createElement('style');
        style.id = 'notificationStyle';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Modal functions
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
}

// Page loading utility
async function loadPageContent(pageName) {
    try {
        showLoading(`Loading ${pageName} page...`);
        const response = await fetch(`pages/${pageName}.html`);
        if (!response.ok) {
            throw new Error(`Failed to load ${pageName} page`);
        }
        const html = await response.text();
        document.getElementById('pageContent').innerHTML = html;
        
        // Update page state
        window.AppState.currentPage = pageName;
        
        hideLoading();
        return true;
    } catch (error) {
        console.error('Error loading page:', error);
        hideLoading();
        showNotification('Error loading page: ' + error.message, 'error');
        return false;
    }
}

// Hash routing utility
function updateUrlHash(page) {
    window.location.hash = page;
}

function getHashFromUrl() {
    return window.location.hash.substring(1) || 'dashboard';
}

// Form validation utility
function validateForm(formId, rules) {
    const form = document.getElementById(formId);
    const errors = [];
    
    Object.keys(rules).forEach(fieldName => {
        const field = form.querySelector(`[name="${fieldName}"]`);
        const rule = rules[fieldName];
        
        if (rule.required && !field.value.trim()) {
            errors.push(`${rule.label || fieldName} is required`);
        }
        
        if (rule.email && field.value && !isValidEmail(field.value)) {
            errors.push(`${rule.label || fieldName} must be a valid email`);
        }
        
        if (rule.minLength && field.value.length < rule.minLength) {
            errors.push(`${rule.label || fieldName} must be at least ${rule.minLength} characters`);
        }
    });
    
    return errors;
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Local storage utilities
function saveToStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error('Error saving to storage:', error);
    }
}

function loadFromStorage(key, defaultValue = null) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    } catch (error) {
        console.error('Error loading from storage:', error);
        return defaultValue;
    }
}

// Debounce utility for search functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Search and filter utilities
function filterArray(array, searchTerm, fields) {
    if (!searchTerm) return array;
    
    const term = searchTerm.toLowerCase();
    return array.filter(item => {
        return fields.some(field => {
            const value = getNestedProperty(item, field);
            return value && value.toString().toLowerCase().includes(term);
        });
    });
}

function getNestedProperty(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
}

// Sort utility
function sortArray(array, field, direction = 'asc') {
    return [...array].sort((a, b) => {
        const aVal = getNestedProperty(a, field);
        const bVal = getNestedProperty(b, field);
        
        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

// Generic form data collector
function collectFormData(formId) {
    const form = document.getElementById(formId);
    const formData = new FormData(form);
    const data = {};
    
    // Handle regular form fields
    for (let [key, value] of formData.entries()) {
        if (data[key]) {
            // If key already exists, make it an array
            if (Array.isArray(data[key])) {
                data[key].push(value);
            } else {
                data[key] = [data[key], value];
            }
        } else {
            data[key] = value;
        }
    }
    
    // Handle checkboxes that aren't checked (they won't be in FormData)
    const checkboxes = form.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        if (!formData.has(checkbox.name)) {
            data[checkbox.name] = false;
        } else if (!Array.isArray(data[checkbox.name])) {
            data[checkbox.name] = true;
        }
    });
    
    return data;
}

// Error handling utility
function handleError(error, context = '') {
    console.error(`Error ${context}:`, error);
    const message = error.message || 'An unexpected error occurred';
    showNotification(`${context ? context + ': ' : ''}${message}`, 'error');
}

// Export for use in other modules
window.Utils = {
    formatDate,
    isDateExpired,
    isDateExpiringSoon,
    showLoading,
    hideLoading,
    showNotification,
    closeModal,
    loadPageContent,
    updateUrlHash,
    getHashFromUrl,
    validateForm,
    isValidEmail,
    saveToStorage,
    loadFromStorage,
    debounce,
    filterArray,
    sortArray,
    collectFormData,
    handleError
};

console.log('🔧 Utils module loaded successfully');