# americurn-feed-sync

Syncs variant color data from the AmericUrn Shopify store to a Google Sheet, which Google Merchant Center reads as a supplemental data source. Fixes multi-color attributes for products that need them (e.g., Hummingbird Sunset → "Pink/Orange/Purple") without paying for a third-party feed app.

## What it does

For every product variant in the store, this script:

1. Reads the `custom.color_v2` variant metafield (a list of `americurn_color` metaobject references).
2. Resolves each reference to its `label` field (e.g., "Blue", "Gold").
3. Joins the labels with a slash (e.g., "Blue/Gold").
4. Writes the result to a Google Sheet as `shopify_ZZ_<product_id>_<variant_id>` + color, one row per variant.

GMC pulls the sheet automatically every 24 hours and applies the color attribute to matching products in the feed.

## Data flow

```
Shopify (custom.color_v2 metafield, source of truth)
        │
        │  This script (daily, GitHub Actions cron)
        ▼
Google Sheet (id + color rows)
        │
        │  GMC fetches automatically every 24 hours
        ▼
Google Merchant Center color attribute
```

## How William should think about it

- Add or edit colors on a variant in Shopify (the `custom.color_v2` metafield) like normal.
- Within 24-48 hours the change flows through to Google.
- The sheet and GitHub repo are auto-maintained. Don't edit the sheet manually - it gets overwritten daily.

## Local development

Requires Node.js 18+.

```bash
# Install dependencies
npm install

# Copy the env template and fill in real values
cp .env.example .env
# then edit .env

# Save your Google service account JSON as service-account.json in the project root.
# (Get it from Google Cloud Console → IAM & Admin → Service Accounts → Keys.)

# Run the sync once
npm run sync
```

## Production

Runs daily at 08:00 UTC via GitHub Actions cron (see `.github/workflows/sync.yml`).

### Required GitHub Actions secrets

Under repo Settings → Secrets and variables → Actions, add:

- `SHOPIFY_STORE` - subdomain only, e.g. `americurn`
- `SHOPIFY_CLIENT_ID` - from the AmericUrn custom app in Shopify Partner Dashboard
- `SHOPIFY_CLIENT_SECRET` - from the same custom app
- `GOOGLE_SHEET_ID` - from the sheet URL between `/d/` and `/edit`
- `GOOGLE_SERVICE_ACCOUNT_KEY` - the entire contents of the service account JSON file, pasted as-is

### How Shopify auth works (2026)

Since January 2026, Shopify no longer issues permanent admin API tokens for custom apps. The script uses the **client credentials grant flow**: at the start of each run, it exchanges the app's client_id + client_secret for a fresh 24-hour access token, then uses that token for all API calls in the run. Tokens are not stored.

### Manual trigger

GitHub repo → Actions tab → Daily Color Sync → Run workflow. Useful for testing or pushing changes immediately after editing a variant in Shopify.

## Architecture notes

- **No paid app.** Free GitHub Actions + free Google Sheets + free Shopify Admin API.
- **No race conditions.** Script does a full sheet replacement on every run (clears then writes). Idempotent.
- **Logs visible.** GitHub Actions → Daily Color Sync → run details show how many variants were processed, errors, etc.

## If something breaks

- **No data in sheet after a run** - check Actions logs for Shopify auth errors. Most likely the access token expired.
- **Wrong color showing in GMC** - check the Shopify `custom.color_v2` metafield on that variant. The script is a passthrough; whatever's in Shopify wins.
- **Sync didn't run** - GitHub Actions schedule can drift if the repo has been inactive for 60+ days. Trigger it manually via workflow_dispatch to wake it up.

## Maintenance

Almost none. If Shopify's Admin API changes major versions (every couple of years), update `apiVersion` in `sync.mjs`. Otherwise this should run untouched.
