# Logged — Full Setup Guide

Everything you need to go from local dev to working payments + Gmail.
Do these steps in order — each one feeds into the next.

---

## Step 1: Chrome Web Store Developer Account

This gets you an extension ID, which ExtensionPay and Google both need.

1. Go to https://chrome.google.com/webstore/devconsole
2. Sign in with your Google account (stormgraser@gmail.com)
3. Pay the one-time $5 registration fee
4. Accept the developer agreement

**Time:** ~5 minutes

---

## Step 2: Upload Extension to Chrome Web Store (Unlisted)

You don't need to publish publicly yet — just upload as "unlisted" to get your extension ID.

1. In the CWS developer dashboard, click **"New Item"**
2. You need a ZIP of the `dist/` folder. Run this in terminal:
   ```
   cd ~/workspace/projects/Logged && zip -r logged-extension.zip dist/
   ```
   (Claude will do this for you — just say "zip it")
3. Upload `logged-extension.zip`
4. Fill in the bare minimum listing info:
   - **Name:** Logged — Job Application Tracker
   - **Description:** Passively tracks your job applications. Apply like normal — Logged remembers everything.
   - **Category:** Productivity
   - **Language:** English
   - You'll need at least one screenshot (440x280 or 1280x800) — we can make a placeholder
5. Set **Visibility** to **"Unlisted"** (not Public)
6. Click **"Save Draft"** (you don't need to submit for review yet)
7. **Copy your Extension ID** — it'll be shown in the dashboard URL or on the item page. It looks like: `abcdefghijklmnopqrstuvwxyz1234` (32 characters)

**Give me the Extension ID when you have it.**

**Time:** ~10 minutes

---

## Step 3: ExtensionPay Account + Stripe

1. Go to https://extensionpay.com
2. Click **"Sign Up"** — create an account
3. Click **"Add Extension"**
   - Extension ID: paste the ID from Step 2
   - Extension name: `logged-tracker` (this is the internal name used in code)
4. **Connect Stripe:**
   - ExtensionPay will walk you through connecting a Stripe account
   - If you don't have Stripe: it'll create one during the flow
   - You'll need: email, bank account info for payouts
5. **Create a Plan:**
   - Go to your extension's page on ExtensionPay
   - Click "Add Plan" or "Manage Plans"
   - Name: `Logged Pro`
   - Nickname: `pro`
   - Price: `$5.00`
   - Interval: `Monthly`
   - Save

**Time:** ~15 minutes (mostly Stripe onboarding)

---

## Step 4: Google Cloud Console (Gmail API)

1. Go to https://console.cloud.google.com/
2. Sign in with the same Google account
3. Click the project dropdown (top bar) → **"New Project"**
   - Name: `Logged Extension`
   - Click "Create"
   - Wait for it to create, then select it

4. **Enable Gmail API:**
   - Go to "APIs & Services" → "Library" (left sidebar)
   - Search for **"Gmail API"**
   - Click it → click **"Enable"**

5. **Configure OAuth Consent Screen:**
   - Go to "APIs & Services" → "OAuth consent screen"
   - Select **"External"** → "Create"
   - App name: `Logged — Job Application Tracker`
   - User support email: `stormgraser@gmail.com`
   - Developer contact: `stormgraser@gmail.com`
   - Click "Save and Continue"
   - **Scopes:** Click "Add or Remove Scopes"
     - Search for `gmail.readonly` or paste: `https://www.googleapis.com/auth/gmail.readonly`
     - Check it → "Update" → "Save and Continue"
   - **Test users:** Add `stormgraser@gmail.com` → "Save and Continue"
   - Review → "Back to Dashboard"

6. **Create OAuth Client ID:**
   - Go to "APIs & Services" → "Credentials"
   - Click **"Create Credentials"** → **"OAuth 2.0 Client ID"**
   - Application type: **"Chrome extension"**
   - Name: `Logged Extension`
   - Item ID: paste your **Chrome Web Store Extension ID** from Step 2
   - Click "Create"
   - **Copy the Client ID** — it looks like: `123456789-abcdefg.apps.googleusercontent.com`

**Give me the Client ID when you have it.**

**Time:** ~15 minutes

---

## Step 5: Claude Updates the Code

Once you give me:
- [ ] Chrome Web Store Extension ID
- [ ] Google OAuth Client ID

I'll update `manifest.json` with the real values, rebuild, and you're ready to reload.

---

## Step 6: Reload the Extension

Since we added new permissions (`identity`, `downloads`) and a new content_script (ExtPay.js), you need to **remove and re-add** the extension:

1. Go to `chrome://extensions`
2. Find "Logged" → click **"Remove"**
3. Click **"Load unpacked"**
4. Browse to: `\\wsl.localhost\Ubuntu-24.04\home\redrumrogue\workspace\projects\Logged\dist`
5. Verify in Details: "Site access" should now include `extensionpay.com`

---

## Step 7: Test Everything

1. **ExtensionPay test:** Open popup → you should see the upgrade banner at the bottom. Click "Upgrade" → should open ExtensionPay checkout page.
2. **Salary detection:** Navigate to the test page:
   ```
   cd ~/workspace/projects/Logged/test && python3 -m http.server 8765
   ```
   Go to `http://localhost:8765/careers/premium-test.html?gh_jid=456`
   Click "Submit Application" → check popup for the new entry with salary info.
3. **CSV export:** With some applications in the list, click the download icon in the header.
4. **Analytics:** Click the "Analytics" tab in popup.
5. **Gmail:** Click the gear icon → "Connect Gmail" → authorize → "Check Now"
