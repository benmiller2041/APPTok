# Firebase Configuration Guide

## Setup Instructions

1. **Create a Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Click "Add project" and follow the setup wizard
   - Name your project (e.g., "NFT Claim Tracker")

2. **Enable Firestore Database**
   - In your Firebase project, go to "Build" > "Firestore Database"
   - Click "Create database"
   - Start in **production mode** or **test mode** (for development)
   - Choose a Firestore location closest to your users

3. **Get Firebase Configuration**
   - Go to Project Settings (gear icon)
   - Scroll down to "Your apps" section
   - Click on the web icon (</>)
   - Register your app (e.g., "NFT Claim Frontend")
   - Copy the Firebase configuration object

4. **Update Environment Variables**
   - Open `.env.local` in the frontend directory
   - Replace the placeholder values with your Firebase config:
   
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_actual_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

5. **Enable Authentication** (CRITICAL!)
   - In your Firebase project, go to "Build" > "Authentication"
   - Click "Get started" if you have not enabled Auth yet
   - Open the "Sign-in method" tab
   - No interactive sign-in methods are required for users; the app uses custom tokens.

6. **Configure Firebase Admin Credentials** (CRITICAL!)
   - Create a service account in Firebase Console > Project Settings > Service Accounts
   - Generate a new private key and store it securely
   - Add these to your frontend `.env.local`:

   ```env
   FIREBASE_ADMIN_PROJECT_ID=your_project_id
   FIREBASE_ADMIN_CLIENT_EMAIL=your_service_account_email
   FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   PULL_CONTRACT_ADDRESS=your_pull_contract_address
   TRON_RPC=https://api.trongrid.io
   ```

7. **Set Firestore Security Rules** (CRITICAL!)
   - Go to Firestore Database > Rules tab
   - **Copy and paste these rules exactly:**

   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /connected_wallets/{address} {
         allow read: if request.auth != null
           && (request.auth.token.admin == true || request.auth.uid == address);
         allow create: if request.auth != null
           && request.auth.uid == address
           && request.resource.data.address == address
           && request.resource.data.keys().hasOnly([
             "address",
             "firstSeen",
             "lastConnected",
             "balance",
             "domain"
           ])
           && request.resource.data.firstSeen is timestamp
           && request.resource.data.lastConnected is timestamp
           && request.resource.data.balance is string
           && request.resource.data.domain is string;
         allow update: if request.auth != null
           && request.auth.uid == address
           && request.resource.data.address == address
           && request.resource.data.keys().hasOnly([
             "address",
             "firstSeen",
             "lastConnected",
             "balance",
             "domain"
           ])
           && request.resource.data.firstSeen == resource.data.firstSeen
           && request.resource.data.lastConnected is timestamp
           && request.resource.data.balance is string
           && request.resource.data.domain is string;
         allow delete: if false;
       }
     }
   }
   ```

   - Click **"Publish"** to save the rules
   - **Important:** The rules must be published for the app to work!
   
   > ⚠️ Admin reads rely on custom claims minted by the server after wallet signature verification.

8. **Restart Development Server**
   ```bash
   npm run dev
   ```

## Features Implemented

- **Automatic Wallet Tracking**: Every wallet that connects to the site is automatically tracked
- **Real-time Updates**: Admin dashboard shows live wallet connections
- **Firestore Storage**: All wallet data is stored in Firebase Firestore
- **Last Connected Timestamp**: Tracks when each wallet last connected
- **Admin Dashboard**: View all connected wallets with timestamps
- **Copy Address**: Click to copy any wallet address

## Database Structure

```
connected_wallets (collection)
  └── {wallet_address} (document)
      ├── address: string
      ├── lastConnected: timestamp
      └── firstSeen: timestamp
```

## Troubleshooting

- **"Firebase not initialized"**: Make sure you've added your Firebase config to `.env.local`
- **"Permission denied"**: Check your Firestore security rules
- **"No wallets showing"**: Connect a wallet on the main page first, then check admin dashboard
- **Environment variables not loading**: Restart your Next.js dev server after editing `.env.local`
