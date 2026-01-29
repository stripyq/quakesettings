# Cloudflare Workers OAuth for Decap CMS

This worker provides GitHub OAuth authentication for the Decap CMS admin panel.

## Setup Instructions

### 1. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: QL Pro Settings CMS
   - **Homepage URL**: `https://stripyq.github.io/quakesettings/`
   - **Authorization callback URL**: `https://quakesettings-oauth.YOUR-SUBDOMAIN.workers.dev/callback`
4. Click "Register application"
5. Note your **Client ID**
6. Generate and note your **Client Secret**

### 2. Deploy the Cloudflare Worker

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   wrangler login
   ```

3. Deploy the worker (from the workers directory):
   ```bash
   cd workers
   wrangler deploy
   ```

4. Add your GitHub credentials as secrets:
   ```bash
   wrangler secret put GITHUB_CLIENT_ID
   # Enter your GitHub OAuth App Client ID when prompted

   wrangler secret put GITHUB_CLIENT_SECRET
   # Enter your GitHub OAuth App Client Secret when prompted
   ```

### 3. Update the CMS Configuration

Update `public/admin/config.yml` with your worker URL:

```yaml
backend:
  name: github
  repo: stripyq/quakesettings
  branch: main
  base_url: https://quakesettings-oauth.YOUR-SUBDOMAIN.workers.dev
  auth_endpoint: /auth
```

### 4. Test the Setup

1. Go to `https://stripyq.github.io/quakesettings/admin/`
2. Click "Login with GitHub"
3. Authorize the OAuth app
4. You should be redirected back and logged into the CMS

## Troubleshooting

- **Error: GITHUB_CLIENT_ID not configured** - Make sure you've added the secrets with `wrangler secret put`
- **OAuth error: redirect_uri_mismatch** - Make sure the callback URL in your GitHub OAuth App matches `https://YOUR-WORKER.workers.dev/callback`
- **Window doesn't close after auth** - This can happen if popups are blocked. Try allowing popups for the site.
