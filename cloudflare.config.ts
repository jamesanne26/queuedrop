import { bindings, defineConfig, defineWorker } from "cf/config";
import { createWorkersResponseStoreSelfContainedConfig } from "@vinext/cloudflare/cache/config";

const isProduction = process.env.QUEUEDROP_CLOUDFLARE_TARGET === "production";
const workerName = isProduction ? "queuedrop" : "queuedrop-test";
const cache = await createWorkersResponseStoreSelfContainedConfig({
  worker: workerName,
  bucket: isProduction ? "queuedrop-response-store-cache-bodies" : "queuedrop-test-response-store-cache-bodies",
});

export default defineConfig({
  worker: defineWorker({
    ...cache,
    name: workerName,
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
      ...(isProduction ? {
        PAYMONGO_SECRET_KEY: bindings.secret(),
        PAYMONGO_WEBHOOK_SECRET: bindings.secret(),
        CRON_SECRET: bindings.secret(),
        QUEUEDROP_SUPPORT_EMAIL: bindings.secret(),
        RESEND_API_KEY: bindings.secret(),
        SEMAPHORE_API_KEY: bindings.secret(),
      } : {}),
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
    },
  }),
});
