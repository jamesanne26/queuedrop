import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Ignore framework output and generated test artifacts. Playwright's HTML
  // report contains bundled/minified third-party JavaScript that must never be
  // linted as application source.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
