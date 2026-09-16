"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TERMINAL_ASSET_BUCKET, TERMINAL_THEMES, safeTerminalTheme, terminalAssetPath, validateTerminalAsset, type TerminalThemeKey } from "@/lib/terminal/appearance";
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

type Props = { action: (formData: FormData) => void | Promise<void>; businessId: string; businessName: string; branchId: string; branchName: string; previewServiceName?: string; appearance: Appearance; canApplyAll?: boolean };

export function TerminalAppearanceForm({ action, businessId, businessName, branchId, branchName, previewServiceName = "Service preview", appearance, canApplyAll = false }: Props) {
  const initialTheme = safeTerminalTheme(appearance.terminal_theme);
  const [theme, setTheme] = useState<TerminalThemeKey>(initialTheme);
  const [page, setPage] = useState(appearance.terminal_page_bg_color || TERMINAL_THEMES[initialTheme].page);
  const [press, setPress] = useState(appearance.terminal_press_bg_color || TERMINAL_THEMES[initialTheme].press);
  const [accent, setAccent] = useState(appearance.terminal_accent_color || TERMINAL_THEMES[initialTheme].accent);
  const [text, setText] = useState(appearance.terminal_text_color || TERMINAL_THEMES[initialTheme].text);
  const [muted, setMuted] = useState(appearance.terminal_muted_text_color || TERMINAL_THEMES[initialTheme].muted);
  const [overlay, setOverlay] = useState(appearance.terminal_background_overlay ?? 18);
  const [backgroundPreview, setBackgroundPreview] = useState(appearance.terminal_background_image_url || "");
  const [logoPreview, setLogoPreview] = useState(appearance.terminal_logo_url || "");
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const previewStyle = useMemo(() => ({
    "--terminal-page": page,
    "--terminal-press": press,
    "--terminal-accent": accent,
    "--terminal-text": text,
    "--terminal-muted": muted,
    "--terminal-overlay": String(overlay / 100),
    backgroundImage: backgroundPreview ? `linear-gradient(rgba(0,0,0,${overlay / 100}),rgba(0,0,0,${overlay / 100})),url("${backgroundPreview}")` : undefined,
  }) as CSSProperties, [page, press, accent, text, muted, overlay, backgroundPreview]);

  function applyTheme(next: TerminalThemeKey) {
    const preset = TERMINAL_THEMES[next];
    setTheme(next); setPage(preset.page); setPress(preset.press); setAccent(preset.accent); setText(preset.text); setMuted(preset.muted);
  }

  function previewFile(file: File | undefined, setter: (value: string) => void) {
    if (!file) return;
    setter(URL.createObjectURL(file));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setUploadError("");

    try {
      const formData = new FormData(event.currentTarget);
      const supabase = createClient();

      async function uploadDirect(inputName: string, kind: "logo" | "background") {
        const value = formData.get(inputName);
        formData.delete(inputName);
        if (!(value instanceof File) || value.size === 0) return;
        const validationError = validateTerminalAsset(value, kind);
        if (validationError) throw new Error(validationError);

        const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const path = terminalAssetPath(businessId, kind, value.type, nonce);
        const { error } = await supabase.storage.from(TERMINAL_ASSET_BUCKET).upload(path, value, { contentType: value.type, upsert: false });
        if (error) throw new Error(error.message);
        formData.set(kind === "logo" ? "terminal_logo_path" : "terminal_background_path", path);
      }

      await uploadDirect("terminal_logo", "logo");
      await uploadDirect("terminal_background", "background");
      await action(formData);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to save terminal appearance.");
      setSaving(false);
    }
  }

  return <form onSubmit={handleSubmit} className="terminal-appearance-settings">
    <input type="hidden" name="branch_id" value={branchId} />
    <div className="terminal-appearance-scope">
      <div><strong>{branchName}</strong><small>Appearance is saved for this branch unless you apply it to all branches.</small></div>{canApplyAll ? <label className="terminal-apply-all"><input type="checkbox" name="apply_to_all_branches" value="1" /> Apply to all branches</label> : null}
    </div>
    <div className="terminal-theme-grid" role="radiogroup" aria-label="Terminal themes">
      {(Object.entries(TERMINAL_THEMES) as [TerminalThemeKey, typeof TERMINAL_THEMES[TerminalThemeKey]][]).map(([key, preset]) => (
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
        {uploadError ? <p className="form-error" role="alert">{uploadError}</p> : null}
        <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save terminal appearance"}</button>
      </div>

      <div className="terminal-preview-wrap">
        <div className="terminal-preview-label"><span>Live preview</span><small>Terminal look</small></div>
        <div className={`terminal-design-preview theme-${theme}`} style={previewStyle}>
          <div className="terminal-preview-qd">QueueDrop</div>
          <div className="terminal-preview-center">
            {logoPreview ? <Image unoptimized src={logoPreview} alt="Business logo preview" width={120} height={120} /> : <div className="terminal-preview-logo-placeholder">{businessName.slice(0,1).toUpperCase()}</div>}
            <p>{businessName}</p><h3>{branchName}</h3>
            <label><span>Choose service</span><div>{previewServiceName} <b>⌄</b></div></label>
            <button type="button"><strong>PRESS HERE</strong><span>to get stub</span></button>
          </div>
        </div>
      </div>
    </div>
  </form>;
}
