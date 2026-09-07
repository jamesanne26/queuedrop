"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

type Appearance = {
  terminal_theme?: string | null;
  terminal_page_bg_color?: string | null;
  terminal_press_bg_color?: string | null;
  terminal_accent_color?: string | null;
  terminal_text_color?: string | null;
  terminal_muted_text_color?: string | null;
  terminal_background_image_url?: string | null;
  terminal_logo_url?: string | null;
  terminal_background_overlay?: number | null;
};

type Props = { action: (formData: FormData) => void | Promise<void>; businessName: string; appearance: Appearance };

const THEMES = {
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

type ThemeKey = keyof typeof THEMES;

function safeTheme(value?: string | null): ThemeKey { return value && value in THEMES ? value as ThemeKey : "classic"; }

export function TerminalAppearanceForm({ action, businessName, appearance }: Props) {
  const initialTheme = safeTheme(appearance.terminal_theme);
  const [theme, setTheme] = useState<ThemeKey>(initialTheme);
  const [page, setPage] = useState(appearance.terminal_page_bg_color || THEMES[initialTheme].page);
  const [press, setPress] = useState(appearance.terminal_press_bg_color || THEMES[initialTheme].press);
  const [accent, setAccent] = useState(appearance.terminal_accent_color || THEMES[initialTheme].accent);
  const [text, setText] = useState(appearance.terminal_text_color || THEMES[initialTheme].text);
  const [muted, setMuted] = useState(appearance.terminal_muted_text_color || THEMES[initialTheme].muted);
  const [overlay, setOverlay] = useState(appearance.terminal_background_overlay ?? 18);
  const [backgroundPreview, setBackgroundPreview] = useState(appearance.terminal_background_image_url || "");
  const [logoPreview, setLogoPreview] = useState(appearance.terminal_logo_url || "");

  const previewStyle = useMemo(() => ({
    "--terminal-page": page,
    "--terminal-press": press,
    "--terminal-accent": accent,
    "--terminal-text": text,
    "--terminal-muted": muted,
    "--terminal-overlay": String(overlay / 100),
    backgroundImage: backgroundPreview ? `linear-gradient(rgba(0,0,0,${overlay / 100}),rgba(0,0,0,${overlay / 100})),url("${backgroundPreview}")` : undefined,
  }) as CSSProperties, [page, press, accent, text, muted, overlay, backgroundPreview]);

  function applyTheme(next: ThemeKey) {
    const preset = THEMES[next];
    setTheme(next); setPage(preset.page); setPress(preset.press); setAccent(preset.accent); setText(preset.text); setMuted(preset.muted);
  }

  function previewFile(file: File | undefined, setter: (value: string) => void) {
    if (!file) return;
    setter(URL.createObjectURL(file));
  }

  return <form action={action} className="terminal-appearance-settings" encType="multipart/form-data">
    <div className="terminal-theme-grid" role="radiogroup" aria-label="Terminal themes">
      {(Object.entries(THEMES) as [ThemeKey, typeof THEMES[ThemeKey]][]).map(([key, preset]) => (
        <label key={key} className={`terminal-theme-option ${theme === key ? "is-selected" : ""}`}>
          <input type="radio" name="terminal_theme" value={key} checked={theme === key} onChange={() => applyTheme(key)} />
          <span className="terminal-theme-swatches"><i style={{ background: preset.page }} /><i style={{ background: preset.press }} /><i style={{ background: preset.accent }} /></span>
          <strong>{preset.name}</strong><small>{preset.note}</small>
        </label>
      ))}
    </div>

    <div className="terminal-appearance-workspace">
      <div className="terminal-appearance-controls">
        <div className="terminal-color-grid">
          <label>Page background <span><input type="color" name="terminal_page_bg_color" value={page} onChange={e=>setPage(e.target.value)} /><code>{page}</code></span></label>
          <label>PRESS HERE background <span><input type="color" name="terminal_press_bg_color" value={press} onChange={e=>setPress(e.target.value)} /><code>{press}</code></span></label>
          <label>Accent color <span><input type="color" name="terminal_accent_color" value={accent} onChange={e=>setAccent(e.target.value)} /><code>{accent}</code></span></label>
          <label>Main label / heading <span><input type="color" name="terminal_text_color" value={text} onChange={e=>setText(e.target.value)} /><code>{text}</code></span></label>
          <label>Secondary label <span><input type="color" name="terminal_muted_text_color" value={muted} onChange={e=>setMuted(e.target.value)} /><code>{muted}</code></span></label>
        </div>

        <div className="terminal-upload-grid">
          <label className="terminal-upload-box"><strong>Business logo</strong><small>PNG, JPG or WebP · up to 5 MB</small><input type="file" name="terminal_logo" accept="image/png,image/jpeg,image/webp" onChange={e=>previewFile(e.target.files?.[0], setLogoPreview)} /></label>
          <label className="terminal-upload-box"><strong>Background picture</strong><small>Landscape photos work best · up to 5 MB</small><input type="file" name="terminal_background" accept="image/png,image/jpeg,image/webp" onChange={e=>previewFile(e.target.files?.[0], setBackgroundPreview)} /></label>
        </div>
        <label className="terminal-overlay-control"><span><strong>Background dark overlay</strong><small>{overlay}%</small></span><input type="range" name="terminal_background_overlay" min="0" max="90" value={overlay} onChange={e=>setOverlay(Number(e.target.value))} /></label>
        <div className="terminal-image-actions">
          <label><input type="checkbox" name="remove_terminal_logo" value="1" onChange={e=>{if(e.target.checked)setLogoPreview("")}} /> Remove saved logo</label>
          <label><input type="checkbox" name="remove_terminal_background" value="1" onChange={e=>{if(e.target.checked)setBackgroundPreview("")}} /> Remove saved background</label>
        </div>
        <button className="button button-primary" type="submit">Save terminal appearance</button>
      </div>

      <div className="terminal-preview-wrap">
        <div className="terminal-preview-label"><span>Live preview</span><small>Terminal look</small></div>
        <div className={`terminal-design-preview theme-${theme}`} style={previewStyle}>
          <div className="terminal-preview-qd">QueueDrop</div>
          <div className="terminal-preview-center">
            {logoPreview ? <img src={logoPreview} alt="Business logo preview" /> : <div className="terminal-preview-logo-placeholder">{businessName.slice(0,1).toUpperCase()}</div>}
            <p>{businessName}</p><h3>Commonwealth</h3>
            <label><span>Choose service</span><div>Haircut <b>⌄</b></div></label>
            <button type="button"><strong>PRESS HERE</strong><span>to get stub</span></button>
          </div>
        </div>
      </div>
    </div>
  </form>;
}
