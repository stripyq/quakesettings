/**
 * Cloudflare Worker for Decap CMS GitHub OAuth
 *
 * Deploy this worker to Cloudflare and set the following secrets:
 *   - GITHUB_CLIENT_ID: Your GitHub OAuth App Client ID
 *   - GITHUB_CLIENT_SECRET: Your GitHub OAuth App Client Secret
 *
 * Setup:
 * 1. Create a GitHub OAuth App at https://github.com/settings/developers
 *    - Application name: QL Pro Settings CMS
 *    - Homepage URL: https://stripyq.github.io/quakesettings/
 *    - Authorization callback URL: https://YOUR-WORKER.workers.dev/callback
 *
 * 2. Deploy this worker to Cloudflare Workers
 * 3. Add secrets: wrangler secret put GITHUB_CLIENT_ID
 *                 wrangler secret put GITHUB_CLIENT_SECRET
 *
 * 4. Update public/admin/config.yml with:
 *    backend:
 *      base_url: https://YOUR-WORKER.workers.dev
 *      auth_endpoint: /auth
 */

const OAUTH_HOST = 'github.com';
const OAUTH_TOKEN_HOST = 'github.com';
const OAUTH_AUTHORIZATION_PATH = '/login/oauth/authorize';
const OAUTH_TOKEN_PATH = '/login/oauth/access_token';
const OAUTH_SCOPES = 'repo,user';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    try {
      if (path === '/auth') {
        return handleAuth(request, env);
      } else if (path === '/callback') {
        return handleCallback(request, env);
      } else if (path === '/success') {
        return handleSuccess(request);
      } else if (path === '/') {
        return new Response('Decap CMS OAuth Provider', {
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Error:', error);
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  },
};

function handleAuth(request, env) {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') || 'github';
  const scope = url.searchParams.get('scope') || OAUTH_SCOPES;

  if (provider !== 'github') {
    return new Response('Only GitHub provider is supported', { status: 400 });
  }

  if (!env.GITHUB_CLIENT_ID) {
    return new Response('GITHUB_CLIENT_ID not configured', { status: 500 });
  }

  const authUrl = new URL(`https://${OAUTH_HOST}${OAUTH_AUTHORIZATION_PATH}`);
  authUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', `${url.origin}/callback`);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('state', crypto.randomUUID());

  return Response.redirect(authUrl.toString(), 302);
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code) {
    return new Response('Missing authorization code', { status: 400 });
  }

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return new Response('GitHub credentials not configured', { status: 500 });
  }

  // Exchange code for access token
  const tokenResponse = await fetch(`https://${OAUTH_TOKEN_HOST}${OAUTH_TOKEN_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code: code,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    return new Response(`OAuth error: ${tokenData.error_description || tokenData.error}`, {
      status: 400,
    });
  }

  const token = tokenData.access_token;
  const provider = 'github';

  // Redirect to success page with token
  const successUrl = new URL(`${url.origin}/success`);
  successUrl.searchParams.set('token', token);
  successUrl.searchParams.set('provider', provider);

  return Response.redirect(successUrl.toString(), 302);
}

function handleSuccess(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const provider = url.searchParams.get('provider');

  // Return an HTML page that sends the token to the parent window (Decap CMS)
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>OAuth Success</title>
</head>
<body>
  <script>
    (function() {
      function receiveMessage(e) {
        console.log("receiveMessage", e);
        window.opener.postMessage(
          'authorization:${provider}:success:{"token":"${token}","provider":"${provider}"}',
          e.origin
        );
        window.close();
      }
      window.addEventListener("message", receiveMessage, false);
      window.opener.postMessage("authorizing:${provider}", "*");
    })();
  </script>
  <p>Authorizing with GitHub...</p>
  <p>If this window doesn't close automatically, you can close it manually.</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
    },
  });
}
