import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TERMINAL_THEME, TERMINAL_ASSET_MAX_BYTES, TERMINAL_THEMES,
  isHexColor, isSafeTerminalAssetPath, isValidTerminalOverlay, safeTerminalTheme,
  terminalAppearanceDefaults, terminalAssetExtension, terminalAssetPath, validateTerminalAsset,
} from "../../lib/terminal/appearance.ts";

test("falls back to classic for unknown themes", () => assert.equal(safeTerminalTheme("unknown"), DEFAULT_TERMINAL_THEME));
test("accepts every configured theme", () => { for (const key of Object.keys(TERMINAL_THEMES)) assert.equal(safeTerminalTheme(key), key); });
test("validates six digit hex colors", () => { assert.equal(isHexColor("#12abEF"), true); assert.equal(isHexColor("#fff"), false); assert.equal(isHexColor("12abef"), false); });
test("overlay accepts inclusive 0-90 integer range", () => { assert.equal(isValidTerminalOverlay(0), true); assert.equal(isValidTerminalOverlay(90), true); assert.equal(isValidTerminalOverlay(91), false); assert.equal(isValidTerminalOverlay(1.5), false); });
test("maps supported image MIME types to extensions", () => { assert.equal(terminalAssetExtension("image/png"), "png"); assert.equal(terminalAssetExtension("image/jpeg"), "jpg"); assert.equal(terminalAssetExtension("image/webp"), "webp"); assert.equal(terminalAssetExtension("image/gif"), null); });
test("accepts supported logo at max size", () => assert.equal(validateTerminalAsset({ size: TERMINAL_ASSET_MAX_BYTES, type: "image/png" }, "logo"), null));
test("rejects oversized background", () => assert.match(validateTerminalAsset({ size: TERMINAL_ASSET_MAX_BYTES + 1, type: "image/jpeg" }, "background") ?? "", /5 MB/));
test("rejects unsupported image type", () => assert.match(validateTerminalAsset({ size: 100, type: "image/gif" }, "logo") ?? "", /PNG, JPG, or WebP/));
test("builds a business-scoped asset path", () => assert.equal(terminalAssetPath("business-1", "logo", "image/webp", "123-abc"), "business-1/logo-123-abc.webp"));
test("throws when creating unsupported asset path", () => assert.throws(() => terminalAssetPath("b", "logo", "image/gif", "x"), /Unsupported/));
test("accepts only expected business asset prefix", () => { assert.equal(isSafeTerminalAssetPath("b1/logo-123.png", "b1", "logo"), true); assert.equal(isSafeTerminalAssetPath("b2/logo-123.png", "b1", "logo"), false); });
test("blocks path traversal and backslash paths", () => { assert.equal(isSafeTerminalAssetPath("b1/logo-../secret.png", "b1", "logo"), false); assert.equal(isSafeTerminalAssetPath("b1\\logo-123.png", "b1", "logo"), false); });
test("theme defaults are internally consistent", () => { const defaults = terminalAppearanceDefaults("ocean"); assert.equal(defaults.theme, "ocean"); assert.equal(defaults.page, TERMINAL_THEMES.ocean.page); assert.equal(defaults.overlay, 18); });
