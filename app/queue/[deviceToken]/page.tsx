import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrowserQueueTerminal } from "./queue-terminal";

type Props = { params: Promise<{ deviceToken: string }>; searchParams: Promise<{ from?: string }> };
export default async function BrowserQueuePage({ params, searchParams }: Props) {
  const { deviceToken } = await params; const query = await searchParams; const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_stub_terminal", { target_device_token: deviceToken });
  if (error || !data) notFound();
  return <main className="stub-terminal-shell"><BrowserQueueTerminal deviceToken={deviceToken} terminal={data as any} protectedExit={query.from === "dashboard"} /></main>;
}
