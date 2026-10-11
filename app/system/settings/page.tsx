import { requireSystemOwner } from "@/lib/auth/system-owner";
import { createClient } from "@/lib/supabase/server";
import { updatePlatformContact } from "./actions";
import { PendingSubmitButton } from "@/app/dashboard/_components/pending-submit-button";
export default async function PlatformSettings({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  await requireSystemOwner();
  const [supabase, notices] = await Promise.all([createClient(), searchParams]);
  const { data, error } = await supabase.from("platform_public_contact").select("phone").eq("id", true).maybeSingle();
  return <section className="dashboard-content"><p className="eyebrow">Platform settings</p><h1>Public QueueDrop contact</h1><p>This number is displayed on customers’ mobile queue pages. Leave it empty to hide the contact link.</p>
    {notices.error || error ? <p role="alert" className="notice notice-error">{notices.error ?? "Unable to load platform contact."}</p> : null}
    {notices.message ? <p role="status" className="notice notice-success">{notices.message}</p> : null}
    <form action={updatePlatformContact} className="form-stack"><label>Public contact number<input type="tel" name="contact_phone" maxLength={30} defaultValue={data?.phone ?? ""} placeholder="+639171234567" /></label><PendingSubmitButton className="button button-primary" idle="Save public contact" pending="Saving…" /></form></section>;
}
