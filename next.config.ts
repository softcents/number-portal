import type { NextConfig } from "next";

// When NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, allow Turnstile script and iframe in CSP
const turnstileScriptSrc = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  ? " https://challenges.cloudflare.com"
  : "";
const turnstileFrameSrc = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  ? " https://challenges.cloudflare.com"
  : "";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to all routes except the verify image routes so opening PDFs is not blocked
        source: "/((?!api/verify/[^/]+/image).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Allow inline styles/scripts that Next.js itself emits and unsafe-eval for dev debugging
              `script-src 'self' 'unsafe-inline' 'unsafe-eval'${turnstileScriptSrc}`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' blob: data:",
              "connect-src 'self'",
              `frame-src 'self' blob:${turnstileFrameSrc}`,
              "object-src 'self' blob:",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      {
        // Allow same-origin viewing/framing and new tab opening for verified identity files
        source: "/api/verify/:id/image/:which*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";
    return {
      fallback: [
        {
          source: "/api/:path*",
          destination: `${backendUrl}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
