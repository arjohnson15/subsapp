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
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return dateString; // Return original if invalid date
        }
        
        // Format as "MMM DD, YYYY" (e.g., "Jun 30, 2025")
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    } catch (error) {
        return dateString; // Return original if formatting fails
    }
}

// Show/hide loading indicator
function showLoading() {
    document.getElementById('loadingIndicator').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingIndicator').style.display = 'none';
}

// Show notification/alert with custom styling
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">&times;</button>
    `;
    
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
    document.getElementById(modalId).classList.remove('active');
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
        showLoading();
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