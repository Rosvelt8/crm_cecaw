import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Le service worker doit toujours être revalidé, sinon une mise à jour de l'application peut tarder à arriver.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/offline.html", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
