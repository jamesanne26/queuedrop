import { bindings, defineConfig, defineWorker } from "cf/config";
import { createWorkersResponseStoreSelfContainedConfig } from "@vinext/cloudflare/cache/config";

const cache = await createWorkersResponseStoreSelfContainedConfig({
  worker: "queuedrop-test",
  bucket: "queuedrop-test-response-store-cache-bodies",
});

export default defineConfig({
  worker: defineWorker({
    ...cache,
    name: "queuedrop-test",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-05",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ...cache.env,
      NEXT_PUBLIC_APP_ENV: bindings.secret(),
      NEXT_PUBLIC_APP_URL: bindings.secret(),
      NEXT_PUBLIC_SITE_URL: bindings.secret(),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: bindings.secret(),
      NEXT_PUBLIC_SUPABASE_URL: bindings.secret(),
      SMS_DELIVERY_PAUSED: bindings.secret(),
      SMS_DRY_RUN: bindings.secret(),
      SUPABASE_ANON_KEY: bindings.secret(),
      SUPABASE_SERVICE_ROLE_KEY: bindings.secret(),
      SUPABASE_URL: bindings.secret(),
      VERCEL_GIT_COMMIT_SHA: bindings.secret(),
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
    },
  }),
});
