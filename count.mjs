// count.mjs
// Quick utility to count products by status. Helps diagnose whether sync.mjs
// is processing the full catalog or missing some products.

import 'dotenv/config';
import { createAdminApiClient } from '@shopify/admin-api-client';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
  console.error('Missing SHOPIFY_STORE or SHOPIFY_ACCESS_TOKEN in .env');
  process.exit(1);
}

const shopify = createAdminApiClient({
  storeDomain: `${SHOPIFY_STORE}.myshopify.com`,
  apiVersion: '2026-07',
  accessToken: SHOPIFY_ACCESS_TOKEN,
});

const QUERY = `
  query Counts {
    all: productsCount { count }
    active: productsCount(query: "status:active") { count }
    draft: productsCount(query: "status:draft") { count }
    archived: productsCount(query: "status:archived") { count }
  }
`;

const response = await shopify.request(QUERY);

if (response.errors) {
  console.error('GraphQL errors:', JSON.stringify(response.errors, null, 2));
  process.exit(1);
}

const { all, active, draft, archived } = response.data;

console.log('');
console.log('Product counts in AmericUrn:');
console.log('');
console.log(`  All:      ${all.count}`);
console.log(`  Active:   ${active.count}`);
console.log(`  Draft:    ${draft.count}`);
console.log(`  Archived: ${archived.count}`);
console.log('');
console.log(`sync.mjs processed: 156 products`);
console.log('');

if (all.count > 156) {
  console.log(`⚠ Mismatch: ${all.count - 156} products are not being processed by sync.mjs`);
  console.log('  Likely cause: GraphQL products() query defaults to only published/active products.');
  console.log('  Fix: add a status filter to the query in sync.mjs');
} else {
  console.log('✓ Counts match - sync.mjs is processing the full catalog.');
}
