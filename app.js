/**
 * Page Printing Chrome Extension
 * Full application with popup, full-app, and credential storage
 * Supports both chrome.storage.local (extension) and localStorage (standalone)
 */

class PagePrintingApp {
    constructor() {
        this.baseURL = 'https://aim.yodlee.com/aim/api';
        this.token = null;
        this.tokenExpiresAt = null;
        this.refreshToken = null;
        this.refreshTokenExpiresAt = null;
        this.userInfo = null;
        this.tokenTimer = null;
        this.refreshTimer = null;
        this.currentFile = null;

        // Detect if running in Chrome extension
        this.isExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.tabs;

        // Detect if we're in popup mode
        this.isPopup = document.body.classList.contains('popup');

        window.app = this; // Make app instance globally available for onclick handlers

        this.initializeElements();
        this.bindEvents();
        this.init();
    }

    async init() {
        await this.loadTokenAndState();
        this.loadSavedCredentials();
        await this.loadThemePreference();
        this.showInitialSection();
    }

    /**
     * Initialize DOM elements
     */
    initializeElements() {
        // Login elements
        this.loginForm = document.getElementById('loginForm');
        this.usernameInput = document.getElementById('username');
        this.passwordInput = document.getElementById('password');
        this.togglePasswordBtn = document.getElementById('togglePassword');
        this.rememberMeCheckbox = document.getElementById('rememberMe');
        this.loginStatus = document.getElementById('loginStatus');

        // Upload elements
        this.uploadSection = document.getElementById('uploadSection');
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.browseBtn = document.getElementById('browseBtn');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.cancelUpload = document.getElementById('cancelUpload');
        this.fileInfo = document.getElementById('fileInfo');
        this.fileName = document.getElementById('fileName');
        this.fileSize = document.getElementById('fileSize');
        this.uploadStatus = document.getElementById('uploadStatus');

        // Users view elements
        this.siteId = document.getElementById('siteId');
        this.viewUsersBtn = document.getElementById('viewUsersBtn');
        this.usersStatus = document.getElementById('usersStatus');
        this.usersContainer = document.getElementById('usersContainer');

        // Progress elements
        this.progressSection = document.getElementById('progressSection');
        this.progressSteps = {
            upload: document.getElementById('step1'),
            publish: document.getElementById('step2')
        };
        this.overallStatus = document.getElementById('overallStatus');
        this.publishBtn = document.getElementById('publishBtn');

        // Progress timing
        this.stepTimers = {};
        this.stepStartTimes = {};

        // Results elements
        this.resultsSection = document.getElementById('resultsSection');
        this.resultsContainer = document.getElementById('resultsContainer');

        // Navigation elements
        this.navbar = document.getElementById('navbar');
        this.navItems = document.querySelectorAll('#navbar .nav-item');

        // Logout button
        this.logoutBtn = document.getElementById('logoutBtn');
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Theme toggle
        this.themeToggle = document.getElementById('themeToggle');
        if (this.themeToggle) {
            this.themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Login form
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));

        // Password toggle
        if (this.togglePasswordBtn) {
            this.togglePasswordBtn.addEventListener('click', () => this.togglePasswordVisibility());
        }

        // File upload events
        this.browseBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event bubbling to upload area
            this.fileInput.click();
        });
        this.fileInput.addEventListener('change', (e) => this.handleFileSelection(e));
        this.uploadBtn.addEventListener('click', () => this.handleFileUpload());
        this.cancelUpload.addEventListener('click', () => this.resetUpload());

        // Drag and drop events
        this.uploadArea.addEventListener('click', (e) => {
            // Only trigger file input if the click wasn't on the browse button
            if (!e.target.closest('#browseBtn')) {
                this.fileInput.click();
            }
        });
        this.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.uploadArea.addEventListener('drop', (e) => this.handleFileDrop(e));

        // Logout button
        if (this.logoutBtn) {
            this.logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // Profile dropdown
        this.profileBtn = document.getElementById('profileBtn');
        this.profileDropdown = document.getElementById('profileDropdown');
        this.logoutFromHeaderBtn = document.getElementById('logoutFromHeaderBtn');
        this.settingsBtn = document.getElementById('settingsBtn');

        if (this.profileBtn && this.profileDropdown) {
            this.profileBtn.addEventListener('click', (e) => this.toggleProfileDropdown(e));
            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => this.closeProfileDropdown(e));
        }

        if (this.logoutFromHeaderBtn) {
            this.logoutFromHeaderBtn.addEventListener('click', () => this.handleLogout());
        }

        if (this.settingsBtn) {
            this.settingsBtn.addEventListener('click', () => this.showSettings());
        }

        // View users button
        if (this.viewUsersBtn) {
            this.viewUsersBtn.addEventListener('click', () => this.viewUsers());
        }

        // Publish button
        if (this.publishBtn) {
            this.publishBtn.addEventListener('click', () => this.handlePublish());
        }

        // Navigation events
        this.bindNavigationEvents();
    }

    async loadTokenAndState() {
        if (this.isExtension) {
            const result = await chrome.storage.local.get(['authToken', 'authTokenExpiresAt', 'refreshToken', 'refreshTokenExpiresAt', 'userInfo']);
            this.token = result.authToken;
            this.tokenExpiresAt = result.authTokenExpiresAt ? parseInt(result.authTokenExpiresAt) : null;
            this.refreshToken = result.refreshToken;
            this.refreshTokenExpiresAt = result.refreshTokenExpiresAt ? parseInt(result.refreshTokenExpiresAt) : null;
            this.userInfo = result.userInfo;
        } else {
            // Fallback to localStorage for standalone mode
            this.token = localStorage.getItem('authToken');
            this.tokenExpiresAt = localStorage.getItem('authTokenExpiresAt') ? parseInt(localStorage.getItem('authTokenExpiresAt')) : null;
            this.refreshToken = localStorage.getItem('refreshToken');
            this.refreshTokenExpiresAt = localStorage.getItem('refreshTokenExpiresAt') ? parseInt(localStorage.getItem('refreshTokenExpiresAt')) : null;
            const userInfoStr = localStorage.getItem('userInfo');
            if (userInfoStr) {
                try {
                    this.userInfo = JSON.parse(userInfoStr);
                } catch (e) {
                    console.error('Failed to parse stored userInfo:', e);
                    this.userInfo = null;
                }
            }
        }
    }

    /**
     * Check authentication status on app load
     */
    async showInitialSection() {
        if (this.token && !this.isTokenExpired()) {
            // Populate user info if available from storage
            if (this.userInfo) {
                this.displayUserInfo();
                // Bind dashboard navigation buttons for existing sessions
                this.bindNavigationButtons();
            }
            this.showSection('uploadSection');
            // Explicitly start token timers after section is shown
            this.startTokenTimers();
        } else {
            // Clear expired/invalid tokens
            this.clearToken();
            this.showSection('loginSection');
        }
    }

    /**
     * Check if token is expired
     */
    isTokenExpired() {
        if (!this.tokenExpiresAt) return false;
        const expiresAt = parseInt(this.tokenExpiresAt);
        return Date.now() >= expiresAt;
    }

    /**
     * Load and populate saved credentials
     */
    async loadSavedCredentials() {
        let savedCredentials = null;

        if (this.isExtension) {
            const result = await chrome.storage.local.get('savedCredentials');
            savedCredentials = result.savedCredentials;
        } else {
            try {
                const credentials = localStorage.getItem('savedCredentials');
                savedCredentials = credentials ? JSON.parse(credentials) : null;
            } catch {
                savedCredentials = null;
            }
        }

        if (savedCredentials && this.usernameInput && this.passwordInput) {
            this.usernameInput.value = savedCredentials.username;
            this.passwordInput.value = savedCredentials.password;
        }
    }

    /**
     * Save credentials to appropriate storage
     */
    async saveCredentials(username, password) {
        const credentials = { username, password };

        if (this.isExtension) {
            await chrome.storage.local.set({ savedCredentials: credentials });
        } else {
            localStorage.setItem('savedCredentials', JSON.stringify(credentials));
        }
    }

    /**
     * Clear saved credentials from appropriate storage
     */
    async clearSavedCredentials() {
        if (this.isExtension) {
            await chrome.storage.local.remove('savedCredentials');
        } else {
            localStorage.removeItem('savedCredentials');
        }
    }

    /**
     * Clear stored token and expiration
     */
    async clearToken() {
        this.token = null;
        this.tokenExpiresAt = null;

        if (this.isExtension) {
            await chrome.storage.local.remove(['authToken', 'authTokenExpiresAt']);
        } else {
            localStorage.removeItem('authToken');
            localStorage.removeItem('authTokenExpiresAt');
        }
    }

    /**
     * Handle login form submission
     */
    async handleLogin(e) {
        e.preventDefault();

        const username = this.usernameInput.value.trim();
        const password = this.passwordInput.value;

        if (!username || !password) {
            this.showStatus(this.loginStatus, 'Please enter both username and password', 'error');
            return;
        }

        this.showStatus(this.loginStatus, 'Authenticating...', 'info');

        try {
            const response = await this.apiRequest('/login/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userName: username,
                    password: password
                })
            });

            if (response.token) {
                // Store all login response data
                this.userInfo = response;
                this.token = response.token;

                // Store token and userInfo using appropriate storage
                if (this.isExtension) {
                    await chrome.storage.local.set({
                        authToken: this.token,
                        userInfo: this.userInfo
                    });
                } else {
                    localStorage.setItem('authToken', this.token);
                    localStorage.setItem('userInfo', JSON.stringify(this.userInfo));
                }

                // Handle token expiration - set default if not provided
                const expiresIn = response.expiresIn || 30; // Default 30 minutes
                const expiresAt = Date.now() + (expiresIn * 60 * 1000);
                this.tokenExpiresAt = expiresAt.toString();
                if (this.isExtension) {
                    await chrome.storage.local.set({ authTokenExpiresAt: this.tokenExpiresAt });
                } else {
                    localStorage.setItem('authTokenExpiresAt', this.tokenExpiresAt);
                }

                // Handle refresh token if provided
                if (response.refreshToken) {
                    this.refreshToken = response.refreshToken;
                    if (this.isExtension) {
                        await chrome.storage.local.set({ refreshToken: this.refreshToken });
                    } else {
                        localStorage.setItem('refreshToken', this.refreshToken);
                    }

                    // Handle refresh token expiration - set default if not provided
                    const refreshExpiresIn = response.refreshTokenExpiresIn || 7200; // Default 7200 minutes (5 days)
                    const refreshExpiresAt = Date.now() + (refreshExpiresIn * 60 * 1000);
                    this.refreshTokenExpiresAt = refreshExpiresAt.toString();
                    if (this.isExtension) {
                        await chrome.storage.local.set({ refreshTokenExpiresAt: this.refreshTokenExpiresAt });
                    } else {
                        localStorage.setItem('refreshTokenExpiresAt', this.refreshTokenExpiresAt);
                    }
                }

                // Always save credentials persistently for login
                await this.saveCredentials(username, password);

                // Display user info and navigate
                this.displayUserInfo();
                this.bindNavigationButtons();
                this.showStatus(this.loginStatus, 'Login successful!', 'success');
                this.showSection('userInfoSection');

                // Clear form but don't clear username for UX
                this.passwordInput.value = '';
            } else {
                // Provide more detailed error message when no token is received
                let errorMsg = 'Authentication failed - no access token received from server.';
                if (response.responseMessage) {
                    errorMsg += ` Server message: ${response.responseMessage}`;
                }
                if (response.responseCode) {
                    errorMsg += ` (Code: ${response.responseCode})`;
                }
                throw new Error(errorMsg);
            }
        } catch (error) {
            console.error('Login error:', error);

            // Provide more user-friendly error messages
            let userFriendlyMessage = error.message;

            if (error.message.includes('HTTP 401') || error.message.includes('HTTP 403')) {
                userFriendlyMessage = 'Invalid username or password. Please check your credentials and try again.';
            } else if (error.message.includes('HTTP 500') || error.message.includes('HTTP 502') || error.message.includes('HTTP 503')) {
                userFriendlyMessage = 'Server error. Please try again later or contact support if the issue persists.';
            } else if (error.message.includes('Network error') || error.message.includes('Failed to fetch')) {
                userFriendlyMessage = 'Network connection error. Please check your internet connection and try again.';
            } else if (error.message.includes('Authentication failed')) {
                userFriendlyMessage = 'Login failed: Access denied. Please verify you have the correct permissions for this application.';
            }

            this.showStatus(this.loginStatus, `Login failed: ${userFriendlyMessage}`, 'error');
        }
    }

    /**
     * Update active navigation state
     */
    updateNavActiveState(sectionId) {
        if (this.navbar) {
            this.navbar.classList.toggle('hidden', sectionId === 'loginSection');
        }
        if (this.navItems) {
            this.navItems.forEach(item => {
                item.classList.toggle('active', item.dataset.section === sectionId);
            });
        }
    }

    /**
     * Bind navigation events for navbar
     */
    bindNavigationEvents() {
        if (this.navItems) {
            this.navItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const sectionId = item.dataset.section;
                    this.showSection(sectionId);
                });
            });
        }
    }

    /**
     * Show specific section, hide others
     */
    showSection(sectionId) {
        const sections = ['loginSection', 'userInfoSection', 'uploadSection', 'progressSection', 'resultsSection'];
        sections.forEach(id => {
            const section = document.getElementById(id);
            if (section) {
                section.classList.toggle('hidden', id !== sectionId);
            }
        });

        // Update navbar visibility and active state
        this.updateNavActiveState(sectionId);

        // Update profile information and sidebar when showing authenticated sections
        if (sectionId !== 'loginSection' && this.userInfo) {
            this.updateHeaderProfile();
            // Populate sidebar user info for all authenticated sections
            this.displayUserInfo();
        } else if (sectionId === 'loginSection') {
            // Clear sidebar content on login page
            this.clearSidebarContent();
        }

        // Start/stop timers based on current section
        if (sectionId !== 'loginSection') {
            this.startTokenTimers();
        } else {
            this.stopTokenTimers();
        }
    }

    /**
     * Handle user logout
     */
    async handleLogout() {
        this.token = null;
        this.tokenExpiresAt = null;
        this.refreshToken = null;
        this.refreshTokenExpiresAt = null;
        this.userInfo = null;

        // Stop countdown timers
        this.stopTokenTimers();

        // Clear tokens and credentials from appropriate storage
        if (this.isExtension) {
            await chrome.storage.local.remove(['authToken', 'authTokenExpiresAt', 'refreshToken', 'refreshTokenExpiresAt', 'savedCredentials', 'userInfo']);
        } else {
            localStorage.removeItem('authToken');
            localStorage.removeItem('authTokenExpiresAt');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('refreshTokenExpiresAt');
            localStorage.removeItem('savedCredentials');
            localStorage.removeItem('userInfo');
        }

        this.resetUpload();
        this.showSection('loginSection');
        this.showStatus(this.loginStatus, 'Logged out successfully.', 'info');
    }

    /**
     * View users by site ID
     */
    async viewUsers() {
        const siteId = this.siteId.value.trim();

        if (!siteId) {
            this.showStatus(this.usersStatus, 'Please enter a site ID', 'error');
            return;
        }

        if (!this.token) {
            this.showStatus(this.usersStatus, 'Please login first', 'error');
            return;
        }

        this.showStatus(this.usersStatus, 'Fetching users...', 'info');

        try {
            const response = await this.apiRequest(`/pageprint/getBySiteId/${siteId}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            this.displayUsers(response);
            this.showStatus(this.usersStatus, 'Users fetched successfully', 'success');
        } catch (error) {
            console.error('View users error:', error);

            let errorMessage = `Failed to fetch users: ${error.message}`;
            if (error.message.includes('HTTP 500') || error.message.includes('HTTP 401') || error.message.includes('HTTP 403')) {
                // Check for common authentication/token errors
                const errorText = error.message.toLowerCase();
                if (errorText.includes('token') && (errorText.includes('invalid') || errorText.includes('expired') || errorText.includes('not valid'))) {
                    errorMessage = 'Authentication expired - Please logout and login again to refresh your token';
                } else if (errorText.includes('unauthorized') || errorText.includes('forbidden')) {
                    errorMessage = 'Access denied - Please check your permissions or login again';
                } else {
                    errorMessage += ' - Please verify the Site ID is correct (e.g., 21312 or 21478)';
                }
            }
            this.showStatus(this.usersStatus, errorMessage, 'error');
        }
    }

    /**
     * Display users in the container
     */
    displayUsers(data) {
        let html = '<h4>Page Print Configuration & Users:</h4>';

        // Handle the specific API response structure
        if (Array.isArray(data) && data.length > 0 && data[0].userDetails) {
            const config = data[0];
            const users = config.userDetails;

            // Configuration summary
            html += '<div style="background: #eaf2f8; padding: 15px; margin-bottom: 20px; border-radius: 5px;">';
            html += '<h5 style="margin: 0 0 10px 0; color: #2c3e50;">Configuration Summary</h5>';
            html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9rem;">';
            html += `<div><strong>Object ID:</strong> ${config.objectId}</div>`;
            html += `<div><strong>Site ID:</strong> ${config.siteId}</div>`;
            html += `<div><strong>Sum Info ID:</strong> ${config.sumInfoId}</div>`;
            html += `<div><strong>Route Type:</strong> ${config.routeType}</div>`;
            html += `<div><strong>Last Updated:</strong> ${new Date(config.lastUpdated).toLocaleString()}</div>`;
            html += `<div><strong>Start Date:</strong> ${new Date(config.startDate).toLocaleString()}</div>`;
            html += `<div><strong>Custom Users Only:</strong> ${config.customUsersOnly ? 'Yes' : 'No'}</div>`;
            html += `<div><strong>Total Users:</strong> ${users.length}</div>`;
            html += '</div>';
            html += '</div>';

            // Users table
            html += '<h5>User Details:</h5>';
            html += '<table style="border-collapse: collapse; width: 100%; font-size: 0.85rem;">';
            html += '<thead>';
            html += '<tr style="background: #d5dbdb;">';
            html += '<th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Cache Item ID</th>';
            html += '<th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Member Site ID</th>';
            html += '<th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Cobrand ID</th>';
            html += '<th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Type</th>';
            html += '<th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Feature</th>';
            html += '<th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Flow ID</th>';
            html += '<th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Dump URL</th>';
            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';

            users.forEach((user, index) => {
                const rowColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
                html += `<tr style="background: ${rowColor};">`;
                html += `<td style="border: 1px solid #ccc; padding: 8px;">${user.cacheItemId}</td>`;
                html += `<td style="border: 1px solid #ccc; padding: 8px;">${user.memSiteAccId}</td>`;
                html += `<td style="border: 1px solid #ccc; padding: 8px;">${user.cobrandId}</td>`;
                html += `<td style="border: 1px solid #ccc; padding: 8px;">${user.type}</td>`;
                html += `<td style="border: 1px solid #ccc; padding: 8px;">${user.feature || 'N/A'}</td>`;
                html += `<td style="border: 1px solid #ccc; padding: 8px;">${user.flowId}</td>`;
                html += `<td style="border: 1px solid #ccc; padding: 8px; word-wrap: break-word; word-break: break-all;">${user.prodDumpUrl || 'None'}</td>`;
                html += '</tr>';
            });

            html += '</tbody>';
            html += '</table>';
        }
        // Handle string data (fallback)
        else if (typeof data === 'string' && data.trim()) {
            html += '<div style="font-family: monospace; background: #f8f8f8; padding: 10px; border: 1px solid #ddd; overflow-x: auto;"><pre>' + data + '</pre></div>';
        }
        // Handle generic JSON
        else if (Array.isArray(data) && data.length > 0) {
            html += '<ul>';
            data.forEach(user => {
                html += `<li><strong>${user.name || user.username || 'User'}</strong>: ${user.email || user.id || 'Details'}</li>`;
            });
            html += '</ul>';
        } else if (data && typeof data === 'object' && Object.keys(data).length > 0) {
            html += '<table style="border-collapse: collapse; width: 100%;">';
            Object.entries(data).forEach(([key, value]) => {
                html += `<tr><td style="border: 1px solid #ccc; padding: 8px; font-weight: bold;">${key}</td><td style="border: 1px solid #ccc; padding: 8px;">${JSON.stringify(value)}</td></tr>`;
            });
            html += '</table>';
        } else {
            html += '<h5>Raw API Response:</h5><pre>' + JSON.stringify(data, null, 2) + '</pre>';
        }

        this.usersContainer.innerHTML = html;
    }

    /**
     * Handle drag over event
     */
    handleDragOver(e) {
        e.preventDefault();
        this.uploadArea.classList.add('dragover');
    }

    /**
     * Handle drag leave event
     */
    handleDragLeave(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
    }

    /**
     * Handle file selection via input
     */
    handleFileSelection(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.currentFile = files[0];
            this.showFileInfo(files[0]);
        }
    }

    /**
     * Handle file drop event
     */
    handleFileDrop(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.currentFile = files[0];
            this.showFileInfo(files[0]);
        }
    }

    /**
     * Show file information
     */
    showFileInfo(file) {
        this.fileName.textContent = file.name;
        this.fileSize.textContent = this.formatFileSize(file.size);
        this.fileInfo.classList.remove('hidden');
        this.fileInput.value = ''; // Reset input
    }

    /**
     * Handle file upload and processing
     */
    async handleFileUpload() {
        if (!this.currentFile) {
            this.showStatus(this.uploadStatus, 'Please select a file first', 'error');
            return;
        }

        if (!this.token) {
            this.showStatus(this.uploadStatus, 'Please login first', 'error');
            return;
        }

        this.showSection('progressSection');
        this.resetProgress();

        try {
            // Step 1: Upload file
            await this.uploadFile();

            // Show publish button for user confirmation
            this.showPublishButton();

        } catch (error) {
            console.error('Upload process error:', error);
            this.showProcessError(error.message);
        }
    }

    /**
     * Show publish button after successful upload
     */
    showPublishButton() {
        console.log('showPublishButton called, publishBtn element:', this.publishBtn);
        if (this.publishBtn) {
            console.log('Removing hidden class from publish button');
            this.publishBtn.classList.remove('hidden');
            this.publishBtn.textContent = 'Publish to Gatherer';
            this.showStatus(this.overallStatus, 'File uploaded successfully! Click "Publish" to continue.', 'info');
            console.log('Publish button should now be visible');
        } else {
            console.error('publishBtn element not found!');
        }
    }

    /**
     * Handle publish button click
     */
    async handlePublish() {
        if (this.publishBtn) {
            this.publishBtn.classList.add('hidden');
        }

        try {
            // Step 2: Publish to gatherer
            await this.publishToGatherer();

            // Show success
            this.showResults('File uploaded and published successfully!');

        } catch (error) {
            console.error('Publish process error:', error);
            this.showProcessError(error.message);
        }
    }

    /**
     * Upload file to server
     */
    async uploadFile() {
        this.updateProgressStep('upload', 'active');

        const formData = new FormData();
        formData.append('file', this.currentFile);

        try {
            const response = await this.apiRequest('/pageprint/load/sites', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                body: formData
            });

            this.updateProgressStep('upload', 'completed');
        } catch (error) {
            this.updateProgressStep('upload', 'error');
            throw error;
        }
    }

    /**
     * Process uploaded data
     */
    async processData() {
        this.updateProgressStep('process', 'active');

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 2000));

        this.updateProgressStep('process', 'completed');
    }

    /**
     * Publish to gatherer service
     */
    async publishToGatherer() {
        this.updateProgressStep('publish', 'active');

        try {
            const response = await this.apiRequest('/pageprint/gatherer/json/publish', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            this.updateProgressStep('publish', 'completed');
        } catch (error) {
            this.updateProgressStep('publish', 'error');
            throw error;
        }
    }

    /**
     * Reset upload state
     */
    resetUpload() {
        this.currentFile = null;
        this.fileInfo.classList.add('hidden');
        this.fileInput.value = '';
    }

    /**
     * Reset progress indicators
     */
    resetProgress() {
        Object.values(this.progressSteps).forEach(step => {
            step.className = 'progress-step';
            // Reset timing display
            const contentElement = step.querySelector('.step-content p');
            if (contentElement) {
                // Remove timing from the text
                const originalText = contentElement.textContent.split('      ')[0];
                contentElement.textContent = originalText;
            }
        });
        const indicators = this.progressSection.querySelectorAll('.step-indicator');
        indicators.forEach(indicator => {
            indicator.className = 'step-indicator pending';
        });

        // Hide publish button
        if (this.publishBtn) {
            this.publishBtn.classList.add('hidden');
        }

        // Clear all timing data
        Object.keys(this.stepTimers).forEach(step => {
            if (this.stepTimers[step]) {
                clearInterval(this.stepTimers[step]);
            }
        });
        this.stepTimers = {};
        this.stepStartTimes = {};
    }

    /**
     * Update progress step
     */
    updateProgressStep(step, status) {
        const stepElement = this.progressSteps[step];
        if (stepElement) {
            // Handle timing
            if (status === 'active') {
                // Start timing for this step
                this.startStepTimer(step);
            } else if (status === 'completed' || status === 'error') {
                // Stop timing and display elapsed time
                this.stopStepTimer(step);
            }

            stepElement.className = `progress-step ${status}`;

            const indicator = stepElement.querySelector('.step-indicator');
            if (indicator) {
                indicator.className = `step-indicator ${status}`;
            }
        }
    }

    /**
     * Start timing for a progress step
     */
    startStepTimer(step) {
        this.stepStartTimes[step] = performance.now();

        // Clear any existing timer for this step
        if (this.stepTimers[step]) {
            clearInterval(this.stepTimers[step]);
        }

        // Update the step content to show timing
        this.updateStepTimingDisplay(step);
    }

    /**
     * Stop timing for a progress step and display final time
     */
    stopStepTimer(step) {
        if (this.stepTimers[step]) {
            clearInterval(this.stepTimers[step]);
            delete this.stepTimers[step];
        }

        if (this.stepStartTimes[step]) {
            const elapsed = performance.now() - this.stepStartTimes[step];
            const seconds = Math.round(elapsed / 1000);
            this.updateStepTimingDisplay(step, seconds);
            delete this.stepStartTimes[step];
        }
    }

    /**
     * Update the timing display for a step
     */
    updateStepTimingDisplay(step, finalSeconds = null) {
        const stepElement = this.progressSteps[step];
        if (!stepElement) return;

        const contentElement = stepElement.querySelector('.step-content p');
        if (!contentElement) return;

        let timeDisplay = '';
        if (finalSeconds !== null) {
            // Show final time with milliseconds
            timeDisplay = `${finalSeconds}.000s`;
        } else if (this.stepStartTimes[step]) {
            // Show current elapsed time with milliseconds and microseconds
            const elapsed = performance.now() - this.stepStartTimes[step];
            const seconds = Math.floor(elapsed / 1000);
            const ms = Math.floor(elapsed % 1000); // Full milliseconds (0-999)
            const us = Math.floor((elapsed % 1) * 1000); // Microseconds (0-999)
            timeDisplay = `${seconds}.${ms.toString().padStart(3, '0')}.${us.toString().padStart(3, '0')}s`;
        }

        // Check if there's a button inside the paragraph
        const button = contentElement.querySelector('button');
        if (button) {
            // If there's a button, we need to preserve it and only update the text before it
            const textNode = contentElement.firstChild;
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                // Update only the text content, preserving the button
                const originalText = textNode.textContent.split('      ')[0]; // Remove any existing timing
                textNode.textContent = `${originalText}      ${timeDisplay}`;
            }
        } else {
            // No button, safe to replace entire text content
            const originalText = contentElement.textContent.split('      ')[0]; // Remove any existing timing
            contentElement.textContent = `${originalText}      ${timeDisplay}`;
        }
    }

    /**
     * Show process error
     */
    showProcessError(message) {
        this.showStatus(this.overallStatus, `Process failed: ${message}`, 'error');

        // Mark failed step as error
        Object.keys(this.progressSteps).forEach(step => {
            const stepElement = this.progressSteps[step];
            if (stepElement.classList.contains('active')) {
                this.updateProgressStep(step, 'error');
            }
        });
    }

    /**
     * Show results
     */
    showResults(message) {
        this.showStatus(this.overallStatus, message, 'success');
        this.showSection('resultsSection');

        this.resultsContainer.innerHTML = `
            <div class="status-message success">
                <h3>✅ Process Completed Successfully</h3>
                <p>${message}</p>
                <p><strong>File:</strong> ${this.currentFile.name}</p>
                <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
            </div>
        `;
    }

    /**
     * API request helper
     */
    async apiRequest(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;

        const defaultOptions = {
            headers: {
                ...options.headers
            }
        };

        const finalOptions = { ...defaultOptions, ...options };

        try {
            const response = await fetch(url, finalOptions);

            // Check if response has content before parsing JSON
            const contentLength = response.headers.get('content-length');
            if (contentLength === '0') {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return {}; // Return empty object for empty responses
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                // Read response as text first to avoid stream consumption issues
                const textData = await response.text();
                let jsonData;
                try {
                    jsonData = JSON.parse(textData);
                } catch (parseError) {
                    // If JSON parsing fails, provide informative error with response content
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${textData}`);
                    }
                    throw new Error(`Invalid JSON response: ${parseError.message} - Response: ${textData.substring(0, 200)}`);
                }
                if (!response.ok) {
                    // For error responses with JSON, include the error details
                    throw new Error(`HTTP ${response.status}: ${response.statusText} - ${JSON.stringify(jsonData)}`);
                }
                return jsonData;
            } else if (contentType && (contentType.includes('text/plain') || contentType.includes('text/html'))) {
                const textData = await response.text();
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${textData || response.statusText}`);
                }
                return textData; // Return text for plain/HTML responses
            } else {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return {}; // Return empty object for other content types
            }
        } catch (error) {
            if (error.message.includes('HTTP')) {
                throw error;
            } else if (error.message.includes('Unexpected end of JSON input')) {
                return {}; // Return empty object for empty JSON responses
            } else {
                throw new Error(`Network error: ${error.message}`);
            }
        }
    }

    /**
     * Show status message
     */
    showStatus(element, message, type) {
        element.textContent = message;
        element.className = `status-message ${type}`;
    }

    /**
     * Bind event listeners for navigation buttons (called after HTML is inserted)
     */
    bindNavigationButtons() {
        // Add event listeners for navigation buttons
        const navigateUploadBtn = document.getElementById('navigateUploadBtn');
        const navigateUsersBtn = document.getElementById('navigateUsersBtn');
        const logoutFromDashboardBtn = document.getElementById('logoutFromDashboardBtn');

        if (navigateUploadBtn) {
            navigateUploadBtn.addEventListener('click', () => this.navigateToUpload());
        }
        if (navigateUsersBtn) {
            navigateUsersBtn.addEventListener('click', () => this.navigateToUsers());
        }
        if (logoutFromDashboardBtn) {
            logoutFromDashboardBtn.addEventListener('click', () => this.handleLogout());
        }
    }

    /**
     * Display user information in the user info panel
     */
    displayUserInfo() {
        const panel = document.getElementById('userInfoPanel');
        if (!panel || !this.userInfo) return;

        // Update header profile information
        this.updateHeaderProfile();

        let html = '';

        // User details section
        html += '<div class="user-details-card">';
        html += '<h3>User Information</h3>';
        html += '<div class="user-detail-grid">';

        const detailFields = [
            { key: 'displayName', label: 'Display Name', value: this.userInfo.displayName },
            { key: 'userId', label: 'User ID', value: this.userInfo.userId },
            { key: 'userCrawlRole', label: 'User Role', value: this.userInfo.userCrawlRole || 'N/A' }
        ];

        detailFields.forEach(field => {
            html += `<div class="detail-row">
                <span class="detail-label">${field.label}:</span>
                <span class="detail-value">${field.value}</span>
            </div>`;
        });

        html += '</div>';
        html += '</div>';

        // Token information section
        html += '<div class="token-details-card">';
        html += '<h3>Authentication Details</h3>';
        html += '<div class="token-info-grid">';

        const tokenFields = [
            { label: 'Access Token', value: `${this.userInfo.token.substring(0, 20)}...` },
            { label: 'Token Expires In', value: `${this.userInfo.expiresIn} minutes` },
            { label: 'Expiration Unit', value: 'Minutes' },
            { label: 'Token Status', value: 'Active (server validates requests)' },
            { label: 'Refresh Token', value: `${this.userInfo.refreshToken ? this.userInfo.refreshToken.substring(0, 20) + '...' : 'Not provided'}` },
            { label: 'Refresh Token Expires In', value: `${this.userInfo.refreshTokenExpiresIn || 0} minutes` },
            { label: 'Response Code', value: this.userInfo.responseCode },
            { label: 'Response Message', value: this.userInfo.responseMessage || 'None' }
        ];

        tokenFields.forEach(field => {
            html += `<div class="token-detail-row">
                <span class="token-detail-label">${field.label}:</span>
                <span class="token-detail-value">${field.value}</span>
            </div>`;
        });

        html += '</div>';
        html += '</div>';

        // Raw response section
        html += '<div class="raw-response-card">';
        html += '<h3>Raw Login Response</h3>';
        html += '<pre class="json-response">' + JSON.stringify(this.userInfo, null, 2) + '</pre>';
        html += '</div>';

        panel.innerHTML = html;
    }

    /**
     * Update header profile information
     */
    updateHeaderProfile() {
        if (!this.userInfo) {
            console.log('No userInfo available for header profile update');
            return;
        }

        console.log('Updating header profile with userInfo:', this.userInfo);

        const headerUserName = document.getElementById('headerUserName');
        const dropdownDisplayName = document.getElementById('dropdownDisplayName');
        const dropdownUserId = document.getElementById('dropdownUserId');
        const dropdownUserRole = document.getElementById('dropdownUserRole');

        // Use actual API response data
        const displayName = this.userInfo.displayName || 'N/A';
        const userId = this.userInfo.userId || 'N/A';
        const userRole = this.userInfo.userCrawlRole || 'N/A';

        if (headerUserName) {
            // Show first name from display name
            const firstName = displayName.split(',')[0]?.trim() || displayName.split(' ')[0] || 'User';
            headerUserName.textContent = firstName;
            console.log('Set header user name to:', firstName);
        } else {
            console.log('headerUserName element not found');
        }

        if (dropdownDisplayName) {
            dropdownDisplayName.textContent = displayName;
            console.log('Set dropdown display name to:', displayName);
        } else {
            console.log('dropdownDisplayName element not found');
        }

        if (dropdownUserId) {
            dropdownUserId.textContent = userId;
            console.log('Set dropdown user ID to:', userId);
        } else {
            console.log('dropdownUserId element not found');
        }

        if (dropdownUserRole) {
            dropdownUserRole.textContent = userRole;
            console.log('Set dropdown user role to:', userRole);
        } else {
            console.log('dropdownUserRole element not found');
        }
    }

    /**
     * Toggle profile dropdown
     */
    toggleProfileDropdown(e) {
        e.stopPropagation();
        if (this.profileDropdown) {
            this.profileDropdown.classList.toggle('hidden');
        }
    }

    /**
     * Close profile dropdown when clicking outside
     */
    closeProfileDropdown(e) {
        if (this.profileDropdown && !this.profileBtn.contains(e.target) && !this.profileDropdown.contains(e.target)) {
            this.profileDropdown.classList.add('hidden');
        }
    }

    /**
     * Show settings modal with credential storage options
     */
    async showSettings() {
        // Close dropdown
        if (this.profileDropdown) {
            this.profileDropdown.classList.add('hidden');
        }

        // Get current credential storage preference
        let currentStorage = 'persistent';
        if (this.isExtension) {
            const result = await chrome.storage.local.get('credentialStorage');
            currentStorage = result.credentialStorage || 'persistent';
        } else {
            currentStorage = localStorage.getItem('credentialStorage') || 'persistent';
        }

        // Create settings modal
        const modal = document.createElement('div');
        modal.className = 'settings-modal-overlay';
        modal.innerHTML = `
            <div class="settings-modal">
                <div class="settings-header">
                    <h3>⚙️ Application Settings</h3>
                    <button class="settings-close-btn" id="settingsCloseBtn">✕</button>
                </div>
                <div class="settings-content">
                    <div class="settings-section">
                        <h4>Credential Storage</h4>
                        <p class="settings-description">Choose how your login credentials are stored:</p>
                        <div class="radio-options">
                            <label class="radio-option">
                                <input type="radio" id="settingsStoreSession" name="settingsCredentialStorage" value="session" ${currentStorage === 'session' ? 'checked' : ''}>
                                <span class="radio-label">Store in app only (this session)</span>
                                <small class="radio-description">Credentials are cleared when you close the browser tab/window</small>
                            </label>
                            <label class="radio-option">
                                <input type="radio" id="settingsStorePersistent" name="settingsCredentialStorage" value="persistent" ${currentStorage === 'persistent' ? 'checked' : ''}>
                                <span class="radio-label">Remember my credentials (persistent)</span>
                                <small class="radio-description">Credentials are saved and will be remembered across browser sessions</small>
                            </label>
                        </div>
                    </div>
                    <div class="settings-actions">
                        <button class="btn-secondary" id="settingsCancelBtn">Cancel</button>
                        <button class="btn-primary" id="settingsSaveBtn">Save Settings</button>
                    </div>
                </div>
            </div>
        `;

        // Add modal styles
        const style = document.createElement('style');
        style.textContent = `
            .settings-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                animation: fadeIn 0.2s ease-out;
            }
            .settings-modal {
                background: white;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                animation: slideIn 0.2s ease-out;
            }
            .settings-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px 24px;
                border-bottom: 1px solid #e1e8ed;
                background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            }
            .settings-header h3 {
                margin: 0;
                color: #2c3e50;
                font-size: 1.3rem;
            }
            .settings-close-btn {
                background: none;
                border: none;
                font-size: 1.5rem;
                cursor: pointer;
                color: #666;
                padding: 4px;
                border-radius: 50%;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }
            .settings-close-btn:hover {
                background: rgba(0, 0, 0, 0.1);
                color: #333;
            }
            .settings-content {
                padding: 24px;
            }
            .settings-section {
                margin-bottom: 24px;
            }
            .settings-section h4 {
                margin: 0 0 8px 0;
                color: #2c3e50;
                font-size: 1.1rem;
                font-weight: 600;
            }
            .settings-description {
                margin: 0 0 16px 0;
                color: #666;
                font-size: 0.9rem;
                line-height: 1.4;
            }
            .radio-description {
                display: block;
                margin-top: 4px;
                color: #888;
                font-size: 0.8rem;
                line-height: 1.3;
            }
            .settings-actions {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
                padding-top: 20px;
                border-top: 1px solid #e1e8ed;
            }
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideIn {
                from { transform: translateY(-20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);

        // Add modal to page
        document.body.appendChild(modal);

        // Event listeners
        const closeModal = () => {
            modal.remove();
            style.remove();
        };

        document.getElementById('settingsCloseBtn').addEventListener('click', closeModal);
        document.getElementById('settingsCancelBtn').addEventListener('click', closeModal);

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // Save settings
        document.getElementById('settingsSaveBtn').addEventListener('click', async () => {
            const selectedStorage = document.querySelector('input[name="settingsCredentialStorage"]:checked');
            if (selectedStorage) {
                const storageType = selectedStorage.value;

                // Save preference
                if (this.isExtension) {
                    await chrome.storage.local.set({ credentialStorage: storageType });
                } else {
                    localStorage.setItem('credentialStorage', storageType);
                }

                // Handle credential migration if needed
                if (storageType === 'session') {
                    // Move persistent credentials to session storage
                    let credentials = null;
                    if (this.isExtension) {
                        const result = await chrome.storage.local.get('savedCredentials');
                        credentials = result.savedCredentials;
                    } else {
                        try {
                            credentials = JSON.parse(localStorage.getItem('savedCredentials'));
                        } catch (e) {
                            credentials = null;
                        }
                    }

                    if (credentials && typeof sessionStorage !== 'undefined') {
                        sessionStorage.setItem('sessionCredentials', JSON.stringify(credentials));
                        // Clear persistent credentials
                        await this.clearSavedCredentials();
                    }
                } else if (storageType === 'persistent') {
                    // Move session credentials to persistent storage
                    if (typeof sessionStorage !== 'undefined') {
                        try {
                            const sessionCreds = sessionStorage.getItem('sessionCredentials');
                            if (sessionCreds) {
                                const credentials = JSON.parse(sessionCreds);
                                await this.saveCredentials(credentials.username, credentials.password);
                                sessionStorage.removeItem('sessionCredentials');
                            }
                        } catch (e) {
                            console.error('Failed to migrate session credentials:', e);
                        }
                    }
                }

                // Show success message
                this.showStatus(document.getElementById('loginStatus'), 'Settings saved successfully!', 'success');
                closeModal();
            }
        });
    }

    /**
     * Start countdown timers for tokens
     */
    startTokenTimers() {
        this.stopTokenTimers(); // Clear any existing timers

        const updateCountdown = () => {
            const tokenCountdownEl = document.getElementById('tokenCountdown');
            const refreshCountdownEl = document.getElementById('refreshTokenCountdown');
            const headerTokenCountdownEl = document.getElementById('headerTokenCountdown');

            // Update access token countdown
            if (this.tokenExpiresAt && tokenCountdownEl) {
                const tokenRemaining = parseInt(this.tokenExpiresAt) - Date.now();
                if (tokenRemaining <= 0) {
                    tokenCountdownEl.textContent = 'EXPIRED';
                    tokenCountdownEl.classList.add('timer-expired');
                } else {
                    tokenCountdownEl.textContent = this.formatTime(tokenRemaining);
                    tokenCountdownEl.classList.remove('timer-expired');
                    tokenCountdownEl.style.color = tokenRemaining < 60000 ? '#e74c3c' : '#27ae60'; // Red if < 1 min
                }
            }

            // Update refresh token countdown
            if (this.refreshTokenExpiresAt && refreshCountdownEl) {
                const refreshRemaining = parseInt(this.refreshTokenExpiresAt) - Date.now();
                if (refreshRemaining <= 0) {
                    refreshCountdownEl.textContent = 'EXPIRED';
                    refreshCountdownEl.classList.add('timer-expired');
                } else {
                    refreshCountdownEl.textContent = this.formatTime(refreshRemaining);
                    refreshCountdownEl.classList.remove('timer-expired');
                    refreshCountdownEl.style.color = refreshRemaining < 300000 ? '#e74c3c' : '#27ae60'; // Red if < 5 min
                }
            }

            // Update header token countdown
            if (this.tokenExpiresAt && headerTokenCountdownEl) {
                const tokenRemaining = parseInt(this.tokenExpiresAt) - Date.now();
                if (tokenRemaining <= 0) {
                    headerTokenCountdownEl.textContent = 'EXPIRED';
                    headerTokenCountdownEl.classList.add('timer-expired');
                } else {
                    headerTokenCountdownEl.textContent = this.formatTime(tokenRemaining);
                    headerTokenCountdownEl.classList.remove('timer-expired');
                }
            }
        };

        // Update immediately
        updateCountdown();

        // Set interval to update every 100ms for smooth millisecond display
        this.tokenTimer = setInterval(updateCountdown, 100);
    }

    /**
     * Stop countdown timers
     */
    stopTokenTimers() {
        if (this.tokenTimer) {
            clearInterval(this.tokenTimer);
            this.tokenTimer = null;
        }
    }

    /**
     * Navigate to file upload section
     */
    navigateToUpload() {
        this.showSection('uploadSection');
    }

    /**
     * Navigate to users section
     */
    navigateToUsers() {
        // Show upload section which includes the users functionality
        this.showSection('uploadSection');
        // Scroll to the users section
        setTimeout(() => {
            const usersHeading = document.querySelector('h3');
            if (usersHeading && usersHeading.textContent.includes('View Users')) {
                usersHeading.scrollIntoView({ behavior: 'smooth' });
            }
        }, 100);
    }

    /**
     * Format milliseconds to HH:MM:SS
     */
    formatTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    /**
     * Format milliseconds to HH:MM:SS.mmm with millisecond precision
     */
    formatTimeWithMilliseconds(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const ms = Math.floor((milliseconds % 1000) / 100); // Get hundreds of milliseconds

        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms}`;
        } else {
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms}`;
        }
    }

    /**
     * Toggle password visibility
     */
    togglePasswordVisibility() {
        if (!this.passwordInput || !this.togglePasswordBtn) return;

        const isPassword = this.passwordInput.type === 'password';
        this.passwordInput.type = isPassword ? 'text' : 'password';

        // Update button icon and title
        this.togglePasswordBtn.textContent = isPassword ? '🙈' : '👁️';
        this.togglePasswordBtn.title = isPassword ? 'Hide password' : 'Show password';
    }

    /**
     * Clear sidebar content when on login page
     */
    clearSidebarContent() {
        const sidebar = document.getElementById('persistentSidebar');
        if (sidebar) {
            // Clear the user info panel
            const userInfoPanel = document.getElementById('userInfoPanel');
            if (userInfoPanel) {
                userInfoPanel.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;"><h4>Welcome Back</h4><p>Please login to access your dashboard and features.</p></div>';
            }

            // Clear token timers
            const tokenCountdownEl = document.getElementById('tokenCountdown');
            const refreshCountdownEl = document.getElementById('refreshTokenCountdown');
            if (tokenCountdownEl) tokenCountdownEl.textContent = '00:00:00';
            if (refreshCountdownEl) refreshCountdownEl.textContent = '00:00:00';
        }
    }

    /**
     * Toggle between light and dark themes
     */
    async toggleTheme() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        // Apply the theme
        if (newTheme === 'dark') {
            html.setAttribute('data-theme', 'dark');
        } else {
            html.removeAttribute('data-theme');
        }

        // Update the toggle button icon
        if (this.themeToggle) {
            const icon = this.themeToggle.querySelector('.theme-icon');
            if (icon) {
                icon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
                this.themeToggle.title = newTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
            }
        }

        // Save theme preference
        if (this.isExtension) {
            await chrome.storage.local.set({ theme: newTheme });
        } else {
            localStorage.setItem('theme', newTheme);
        }
    }

    /**
     * Load and apply saved theme preference
     */
    async loadThemePreference() {
        let savedTheme = 'light'; // Default to light theme

        if (this.isExtension) {
            const result = await chrome.storage.local.get('theme');
            savedTheme = result.theme || 'light';
        } else {
            savedTheme = localStorage.getItem('theme') || 'light';
        }

        // Apply the saved theme
        const html = document.documentElement;
        if (savedTheme === 'dark') {
            html.setAttribute('data-theme', 'dark');
        } else {
            html.removeAttribute('data-theme');
        }

        // Update the toggle button icon
        if (this.themeToggle) {
            const icon = this.themeToggle.querySelector('.theme-icon');
            if (icon) {
                icon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
                this.themeToggle.title = savedTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
            }
        }
    }

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PagePrintingApp();
});
