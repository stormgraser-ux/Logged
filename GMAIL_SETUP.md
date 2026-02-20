# Gmail API Setup for Logged Extension

## Prerequisites
- Google account
- Chrome Web Store extension ID (get this after first publish)

## Steps

### 1. Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" > "New Project"
3. Name: `Logged Extension`
4. Click "Create"

### 2. Enable Gmail API
1. Go to "APIs & Services" > "Library"
2. Search for "Gmail API"
3. Click "Enable"

### 3. Configure OAuth Consent Screen
1. Go to "APIs & Services" > "OAuth consent screen"
2. Select "External" user type > "Create"
3. Fill in:
   - App name: `Logged — Job Application Tracker`
   - User support email: your email
   - Developer contact: your email
4. Scopes: Add `https://www.googleapis.com/auth/gmail.readonly`
5. Test users: Add your own email for testing
6. Save

### 4. Create OAuth Client ID
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client ID"
3. Application type: **Chrome extension**
4. Name: `Logged Extension`
5. Item ID: Your Chrome Web Store extension ID
6. Click "Create"
7. Copy the Client ID

### 5. Update manifest.json
Replace `YOUR_GOOGLE_CLIENT_ID` in `public/manifest.json`:
```json
"oauth2": {
  "client_id": "YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com",
  "scopes": ["https://www.googleapis.com/auth/gmail.readonly"]
}
```

### 6. Rebuild and Test
```bash
npm run build
```
Then reload the extension in Chrome and test Gmail connection from Settings.

## Notes
- The `gmail.readonly` scope only reads emails — it cannot send, delete, or modify anything
- OAuth consent screen must be "published" (not "testing") for production users
- Google may require verification for `gmail.readonly` scope — submit for review early
- Token refresh is handled automatically by `chrome.identity`
