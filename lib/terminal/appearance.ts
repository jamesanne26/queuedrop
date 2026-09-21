export const TERMINAL_ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const TERMINAL_ASSET_BUCKET = "terminal-assets";
export const TERMINAL_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type TerminalImageMimeType = typeof TERMINAL_IMAGE_MIME_TYPES[number];

export const TERMINAL_THEMES = {
  classic: { name: "QueueDrop Classic", note: "Fresh green and clean cards", page: "#f4fbf7", press: "#11915f", accent: "#0d6b49", text: "#10231a", muted: "#5b7166" },
  ocean: { name: "Ocean Blue", note: "Cool blue, bright and professional", page: "#eef8ff", press: "#1479c9", accent: "#075f9f", text: "#102535", muted: "#617582" },
  midnight: { name: "Midnight Glass", note: "Deep navy with luminous controls", page: "#0e1726", press: "#21a8f6", accent: "#70cfff", text: "#f6fbff", muted: "#b1c3d0" },
  sunset: { name: "Sunset Orange", note: "Warm energetic counter style", page: "#fff7ed", press: "#ea6a24", accent: "#bd4812", text: "#321b11", muted: "#796258" },
  rose: { name: "Rose Boutique", note: "Soft premium salon look", page: "#fff3f7", press: "#d94f7d", accent: "#a82d58", text: "#35151f", muted: "#7b6069" },
  violet: { name: "Violet Modern", note: "Modern purple technology theme", page: "#f7f3ff", press: "#7652d6", accent: "#5635ae", text: "#24183f", muted: "#70677f" },
  cafe: { name: "Warm Café", note: "Earthy and welcoming", page: "#fbf6ee", press: "#9b6841", accent: "#6f482b", text: "#2d2119", muted: "#76685e" },
  clean: { name: "Clean White", note: "Minimal bright reception display", page: "#ffffff", press: "#111827", accent: "#111827", text: "#111827", muted: "#6b7280" },
  tropical: { name: "Tropical", note: "Vibrant teal for busy service counters", page: "#ecfffb", press: "#07988b", accent: "#057267", text: "#102b29", muted: "#617c79" },
  dark: { name: "Modern Dark", note: "High contrast dark terminal", page: "#171a1f", press: "#2bb673", accent: "#58db98", text: "#f5f7f6", muted: "#b1bbb6" },
} as const;

export type TerminalThemeKey = keyof typeof TERMINAL_THEMES;
export type TerminalAssetKind = "logo" | "background";
export const DEFAULT_TERMINAL_THEME: TerminalThemeKey = "classic";
export const DEFAULT_TERMINAL_OVERLAY = 18;

export function safeTerminalTheme(value?: string | null): TerminalThemeKey {
  return value && value in TERMINAL_THEMES ? value as TerminalThemeKey : DEFAULT_TERMINAL_THEME;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function isValidTerminalOverlay(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 90;
}

export function terminalAssetExtension(mimeType: string): "png" | "webp" | "jpg" | null {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/jpeg") return "jpg";
  return null;
}

export function validateTerminalAsset(file: Pick<File, "size" | "type">, kind: TerminalAssetKind): string | null {
  const label = kind === "logo" ? "Logo" : "Background";
  if (file.size > TERMINAL_ASSET_MAX_BYTES) return `${label} image must be 5 MB or smaller.`;
  if (!TERMINAL_IMAGE_MIME_TYPES.includes(file.type as TerminalImageMimeType)) return `${label} must be PNG, JPG, or WebP.`;
  return null;
}

export function terminalAssetPath(businessId: string, kind: TerminalAssetKind, mimeType: string, nonce: string): string {
  const extension = terminalAssetExtension(mimeType);
  if (!extension) throw new Error("Unsupported terminal image type.");
  return `${businessId}/${kind}-${nonce}.${extension}`;
}

export function isSafeTerminalAssetPath(path: string, businessId: string, kind: TerminalAssetKind): boolean {
  if (!path || path.includes("..") || path.includes("\\")) return false;
  return path.startsWith(`${businessId}/${kind}-`) && /^[a-zA-Z0-9/_\-.]+$/.test(path);
}

export function terminalAppearanceDefaults(themeValue?: string | null) {
  const theme = safeTerminalTheme(themeValue);
  return { theme, ...TERMINAL_THEMES[theme], overlay: DEFAULT_TERMINAL_OVERLAY };
}
