import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StubTerminal } from "./stub-terminal";

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
};

export default async function StubTerminalPage({ params, searchParams }: Props) {
  const [{ deviceToken }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_stub_terminal", { target_device_token: deviceToken });
  if (error || !data) notFound();
  const terminal = data as TerminalInfo;

  return (
    <main className="stub-terminal-shell">
      <StubTerminal deviceToken={deviceToken} terminal={terminal} protectedExit={query.from === "dashboard"} />
    </main>
  );
}
