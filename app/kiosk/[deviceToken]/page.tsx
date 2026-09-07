import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StubTerminal } from "./stub-terminal";
import { DEFAULT_TERMINAL_OVERLAY, TERMINAL_THEMES, safeTerminalTheme } from "@/lib/terminal/appearance";

type Props = {
  params: Promise<{ deviceToken: string }>;
  searchParams: Promise<{ from?: string }>;
};

type TerminalInfo = {
  device_id: string;
  device_name: string;
  branch_id: string;
  branch_name: string;
  business_name: string;
  service_id: string;
  service_name: string;
  stub_mode_enabled: boolean;
  queue_active: boolean;
  branch_open: boolean;
  exit_pin_configured?: boolean;
  terminal_theme?: string;
  terminal_page_bg_color?: string;
  terminal_press_bg_color?: string;
  terminal_accent_color?: string;
  terminal_text_color?: string;
  terminal_muted_text_color?: string;
  terminal_background_image_url?: string | null;
  terminal_logo_url?: string | null;
  terminal_background_overlay?: number;
};

export default async function StubTerminalPage({ params, searchParams }: Props) {
  const [{ deviceToken }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_stub_terminal", { target_device_token: deviceToken });
  if (error || !data) notFound();
  const terminal = data as TerminalInfo;

  const theme = safeTerminalTheme(terminal.terminal_theme);
  const preset = TERMINAL_THEMES[theme];
  const overlay = Math.max(0, Math.min(90, Number(terminal.terminal_background_overlay ?? DEFAULT_TERMINAL_OVERLAY))) / 100;
  const shellStyle = {
    "--terminal-page": terminal.terminal_page_bg_color || preset.page,
    "--terminal-press": terminal.terminal_press_bg_color || preset.press,
    "--terminal-accent": terminal.terminal_accent_color || preset.accent,
    "--terminal-text": terminal.terminal_text_color || preset.text,
    "--terminal-muted": terminal.terminal_muted_text_color || preset.muted,
    backgroundImage: terminal.terminal_background_image_url
      ? `linear-gradient(rgba(0,0,0,${overlay}),rgba(0,0,0,${overlay})),url("${terminal.terminal_background_image_url}")`
      : undefined,
  } as CSSProperties;

  return (
    <main className={`stub-terminal-shell terminal-theme-${theme}`} style={shellStyle}>
      <StubTerminal deviceToken={deviceToken} terminal={terminal} protectedExit={query.from === "dashboard"} />
    </main>
  );
}
