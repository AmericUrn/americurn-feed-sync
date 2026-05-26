// get-token.mjs
// One-time helper to obtain a permanent (offline) Admin API access token via
// the OAuth authorization code grant flow. Run this once, save the resulting
// token to .env as SHOPIFY_ACCESS_TOKEN, then sync.mjs uses it for every run.

import 'dotenv/config';
import readline from 'node:readline';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

if (!SHOPIFY_STORE || !SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
  console.error('Missing env vars. Need SHOPIFY_STORE, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET');
  process.exit(1);
}

// This must match the redirect URI configured in the app's Partner Dashboard settings.
const REDIRECT_URI = 'https://americurn.com';
const SCOPES = 'read_products,read_metaobjects,read_metaobject_definitions';
const STATE = Math.random().toString(36).substring(2, 15);

const authUrl =
  `https://${SHOPIFY_STORE}.myshopify.com/admin/oauth/authorize?` +
  new URLSearchParams({
    client_id: SHOPIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state: STATE,
  }).toString();

console.log('───────────────────────────────────────────────────────────');
console.log('Shopify Admin API access token - one-time setup');
console.log('───────────────────────────────────────────────────────────');
console.log('');
console.log('STEP 1: Open this URL in a browser where you are signed into the AmericUrn admin:');
console.log('');
console.log(authUrl);
console.log('');
console.log('STEP 2: Approve the app install (or re-approve if already installed).');
console.log('');
console.log('STEP 3: Shopify will redirect you to:');
console.log(`  ${REDIRECT_URI}?code=AUTH_CODE&hmac=...&shop=...&state=${STATE}&timestamp=...`);
console.log('');
console.log('  The americurn.com homepage will load (the redirect URL is just a placeholder).');
console.log('  COPY THE ENTIRE URL FROM THE BROWSER ADDRESS BAR and paste it below.');
console.log('  (Or paste just the code value - the script will figure it out.)');
console.log('');
console.log('  Note: codes are single-use and expire in ~10 minutes - act fast.');
console.log('');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste here: ', async (input) => {
  rl.close();

  const raw = (input || '').trim();
  if (!raw) {
    console.error('No input provided. Exiting.');
    process.exit(1);
  }

  // Extract the code - handle either a full URL or just the code value
  let trimmed;
  if (raw.includes('code=')) {
    // User pasted the full URL or query string - extract the code parameter
    try {
      const url = raw.startsWith('http') ? new URL(raw) : new URL(`https://example.com/?${raw}`);
      trimmed = url.searchParams.get('code');
    } catch {
      // Fallback regex if URL parsing fails
      const match = raw.match(/code=([^&\s]+)/);
      trimmed = match ? match[1] : null;
    }
  } else {
    // User pasted just the code value
    trimmed = raw;
  }

  if (!trimmed) {
    console.error('Could not extract code from input. Exiting.');
    process.exit(1);
  }

  console.log(`Extracted code: ${trimmed.substring(0, 12)}...`);

  console.log('');
  console.log('Exchanging code for access token...');

  const response = await fetch(
    `https://${SHOPIFY_STORE}.myshopify.com/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        code: trimmed,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    console.error(`Failed: ${response.status} ${response.statusText}`);
    console.error(text);
    process.exit(1);
  }

  const data = await response.json();
  console.log('');
  console.log('───────────────────────────────────────────────────────────');
  console.log('✓ Got access token');
  console.log('───────────────────────────────────────────────────────────');
  console.log('');
  console.log('Scopes:', data.scope);
  console.log('');
  console.log('Add this line to your .env file (replace any existing SHOPIFY_ACCESS_TOKEN):');
  console.log('');
  console.log(`SHOPIFY_ACCESS_TOKEN=${data.access_token}`);
  console.log('');
  console.log('Token is permanent (non-expiring) for offline access.');
  console.log('Then run: npm run sync');
});
