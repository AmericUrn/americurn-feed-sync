// sync.mjs
// Pulls every variant's color_v2 metafield from Shopify, resolves the metaobject
// references to their `label`, joins with "/", and writes the result to a Google
// Sheet that GMC reads as a supplemental data source.
//
// Uses a static Admin API access token obtained via the one-time OAuth flow in
// get-token.mjs. The token is permanent (offline access mode) and gets revoked
// only if the app is uninstalled or scopes change.

import 'dotenv/config';
import { createAdminApiClient } from '@shopify/admin-api-client';
import { google } from 'googleapis';

// --- Config ---------------------------------------------------------------

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './service-account.json';

function assertConfig() {
  const missing = [];
  if (!SHOPIFY_STORE) missing.push('SHOPIFY_STORE');
  if (!SHOPIFY_ACCESS_TOKEN) missing.push('SHOPIFY_ACCESS_TOKEN');
  if (!GOOGLE_SHEET_ID) missing.push('GOOGLE_SHEET_ID');
  if (missing.length) {
    console.error('Missing required env vars:', missing.join(', '));
    console.error('If you have not generated a SHOPIFY_ACCESS_TOKEN yet, run: npm run get-token');
    process.exit(1);
  }
}

// --- Shopify GraphQL query -----------------------------------------------

const QUERY = `
  query GetVariantColors($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          legacyResourceId
          variants(first: 100) {
            edges {
              node {
                id
                legacyResourceId
                metafield(namespace: "custom", key: "color_v2") {
                  value
                  type
                  references(first: 10) {
                    edges {
                      node {
                        ... on Metaobject {
                          type
                          handle
                          fields {
                            key
                            value
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

async function fetchAllVariantColors(shopify) {
  const rows = [['id', 'color']]; // header row
  let cursor = null;
  let hasNextPage = true;
  let productCount = 0;
  let variantWithColorCount = 0;

  while (hasNextPage) {
    const response = await shopify.request(QUERY, {
      variables: { cursor },
    });

    if (response.errors) {
      console.error('GraphQL errors:', JSON.stringify(response.errors, null, 2));
      throw new Error('Shopify query failed');
    }

    const data = response.data;
    const products = data.products.edges;

    for (const productEdge of products) {
      const product = productEdge.node;
      const productId = product.legacyResourceId;

      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node;
        const variantId = variant.legacyResourceId;

        const refs = variant.metafield?.references?.edges;
        if (!refs || refs.length === 0) continue;

        // Find the field value - try common field key names
        const colors = refs
          .map((refEdge) => {
            const fields = refEdge.node?.fields;
            if (!fields) return null;
            // Look for label, name, or any single-line text field that looks like a color name
            const labelField =
              fields.find((f) => f.key === 'label') ||
              fields.find((f) => f.key === 'name') ||
              fields.find((f) => f.key === 'title');
            return labelField?.value;
          })
          .filter((label) => typeof label === 'string' && label.trim().length > 0);

        if (colors.length === 0) continue;

        const colorString = colors.join('/');
        const itemId = `shopify_ZZ_${productId}_${variantId}`;

        rows.push([itemId, colorString]);
        variantWithColorCount++;
      }
    }

    productCount += products.length;
    console.log(
      `Processed ${productCount} products, ${variantWithColorCount} variants with colors so far`
    );

    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;

    // small breather between pages so we don't slam the API
    if (hasNextPage) await sleep(500);
  }

  return rows;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Google Sheets --------------------------------------------------------

async function writeToSheet(rows) {
  const auth = new google.auth.GoogleAuth({
    keyFile: GOOGLE_SERVICE_ACCOUNT_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Find the first sheet's name from the spreadsheet metadata
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: GOOGLE_SHEET_ID,
  });

  const firstSheet = meta.data.sheets[0];
  const sheetName = firstSheet.properties.title;
  console.log(`Writing to sheet tab: "${sheetName}"`);

  // Clear existing data
  await sheets.spreadsheets.values.clear({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: sheetName,
  });

  // Write new data (RAW so slash-separated strings aren't interpreted as formulas)
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });

  console.log(`Wrote ${rows.length - 1} variant rows to sheet`);
}

// --- Main -----------------------------------------------------------------

async function main() {
  assertConfig();

  console.log('Starting sync...');
  console.log(`Store: ${SHOPIFY_STORE}.myshopify.com`);
  console.log(`Sheet: ${GOOGLE_SHEET_ID}`);
  console.log('');

  const shopify = createAdminApiClient({
    storeDomain: `${SHOPIFY_STORE}.myshopify.com`,
    apiVersion: '2026-07',
    accessToken: SHOPIFY_ACCESS_TOKEN,
  });

  console.log('\nFetching variant colors from Shopify...');
  const rows = await fetchAllVariantColors(shopify);
  console.log(`\nTotal variants with color data: ${rows.length - 1}`);
  console.log('');

  console.log('Writing to Google Sheet...');
  await writeToSheet(rows);

  console.log('\n✓ Sync complete');
}

main().catch((err) => {
  console.error('\nError:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
