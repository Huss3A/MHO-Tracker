// Google OAuth Client ID for Drive sync (public value, NOT a secret).
// Set it here, or at build time with VITE_GOOGLE_CLIENT_ID, or let each user paste their own in
// "Data & sync". Leave empty to disable Drive sync. See README.
export const CONFIG = {
  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
};
