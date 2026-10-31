// Google OAuth Client ID for Drive sync (public value, NOT a secret).
// Set it here, or at build time with VITE_GOOGLE_CLIENT_ID, or let each user paste their own in
// "Import & data". Leave empty to disable Drive sync. See README.
// Drive sync is switched off until the app passes Google's verification. Enable for testing with VITE_DRIVE_ENABLED=true in .env.local.
export const CONFIG = {
  DRIVE_ENABLED: import.meta.env.VITE_DRIVE_ENABLED === 'true',
  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
};
