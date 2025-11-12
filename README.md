# Page Printing Chrome Extension

A comprehensive Chrome extension for managing Yodlee AIM API page printing configurations and user workflows.

## Features

- **Authentication**: Secure login with token expiration handling
- **File Upload**: Upload Excel files for site configuration processing
- **User Management**: View and manage users by site ID
- **Dual Interface**:
  - Compact popup for quick access
  - Full application page for detailed work
- **Smart Storage**: Optional credential saving for convenience
- **Responsive Design**: Works on different screen sizes

## Installation

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked" and select the `extension/` folder
5. The extension should now appear in your Chrome toolbar

## Usage

### Basic Usage
1. Click the extension icon in Chrome toolbar
2. Login with your Yodlee AIM credentials
3. Upload Excel files or view user configurations
4. Use "Open Full App" for expanded interface

### Credentials
- Check "Remember my credentials" to save login information
- Credentials are securely stored using Chrome's local storage
- Logout at any time to clear stored data

## API Integration

This extension integrates with the Yodlee AIM API:

- **Base URL**: `https://aim.yodlee.com/aim/api`
- **Authentication**: Bearer token authentication
- **Endpoints**:
  - `POST /login/auth` - User authentication
  - `POST /pageprint/load/sites` - Upload site configurations
  - `POST /pageprint/gatherer/json/publish` - Publish configurations
  - `GET /pageprint/getBySiteId/{siteId}` - Retrieve user configurations

## Development

### Project Structure
```
extension/
├── manifest.json     # Extension configuration
├── popup.html       # Popup interface
├── fullapp.html     # Full application interface
├── app.js          # Main application logic
├── styles.css      # Styling and responsive design
├── index.html      # Standalone web app version (optional)
├── README.md       # This documentation
└── postman_collection.json # API testing collection
```

### Building for Chrome Web Store

1. Remove development-only files (`README.md`, Postman collection, `index.html` if not needed)
2. Update `manifest.json` version number
3. Test all functionality thoroughly
4. Zip the extension folder
5. Upload to Chrome Web Store Developer Dashboard

### Local Development

For standalone web app development:
1. Open `extension/index.html` in a browser
2. Use browser developer tools for debugging
3. Extension-specific features (like expand button) will be hidden

For extension development:
1. Load as unpacked extension in Chrome
2. Use Chrome DevTools on popup or full app pages
3. Check console for API call debugging

## Security Notes

- Credentials are stored locally only if explicitly chosen by user
- Session tokens expire automatically based on API response
- No sensitive data is transmitted except to the official Yodlee API
- Extension requests necessary permissions only (storage, tabs)

## Browser Compatibility

- Chrome/Chromium-based browsers: Full support
- Firefox: May require adjustments for manifest and storage APIs
- Safari: Not supported (WebKit limitations)

## License

[Add your license information here]

## Support

For issues or questions, please create an issue in the repository.
