import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite o Next dev server aceitar HMR de tunnels (ngrok, etc.) durante demo.
  // Lista vazia em prod (esse campo só vale em dev).
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io", "*.trycloudflare.com"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      // Allow images from the backend if needed in future
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_PROXY_TARGET ?? "http://localhost:8080"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
