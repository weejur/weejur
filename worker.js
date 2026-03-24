// =============================================================================
// Cloudflare Worker for GitHub OAuth token exchange
// =============================================================================
//
// Setup:
// 1. Install Wrangler: npm install -g wrangler
// 2. Login: wrangler login
// 3. Set your GitHub OAuth App's client secret:
//      wrangler secret put GITHUB_CLIENT_SECRET
// 4. Update wrangler.toml with your GITHUB_CLIENT_ID and ALLOWED_ORIGIN
// 5. Deploy: wrangler deploy
//
// This worker does one thing: exchanges an OAuth code for an access token.
// This is needed because the exchange requires the client_secret, which
// cannot be exposed in browser-side JavaScript.
// =============================================================================

export default {
  async fetch(request, env) {
    // CORS headers — restrict to your site's origin
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/auth" && request.method === "POST") {
      try {
        const { code } = await request.json();

        if (!code) {
          return new Response(JSON.stringify({ error: "Missing code" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Exchange code for access token
        const tokenRes = await fetch(
          "https://github.com/login/oauth/access_token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              client_id: env.GITHUB_CLIENT_ID,
              client_secret: env.GITHUB_CLIENT_SECRET,
              code,
            }),
          }
        );

        const tokenData = await tokenRes.json();

        if (tokenData.error) {
          return new Response(
            JSON.stringify({ error: tokenData.error_description }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        return new Response(
          JSON.stringify({ access_token: tokenData.access_token }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};
