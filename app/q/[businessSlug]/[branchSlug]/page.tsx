import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DigitsOnlyInput } from "@/app/_components/digits-only-input";
import { joinQueue } from "./actions";

type Props = {
  params: Promise<{ businessSlug: string; branchSlug: string }>;
  searchParams: Promise<{ error?: string; service?: string }>;
};

type Service = {
  id: string;
  name: string;
  description: string | null;
  queue_prefix: string;
  estimated_minutes: number | null;
};

type PublicQueue = {
  business: { name: string; slug: string };
  branch: {
    id: string;
    name: string;
    slug: string;
    address: string | null;
    phone: string | null;
    timezone: string;
  };
  services: Service[];
  queue_open: boolean;
  queue_status_message: string;
};

export default async function PublicQueuePage({ params, searchParams }: Props) {
  const route = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_branch_queue", {
    target_business_slug: route.businessSlug,
    target_branch_slug: route.branchSlug,
  });

  if (error || !data) notFound();
  const queue = data as PublicQueue;
  const preselectedServiceId = query.service && queue.services.some((service) => service.id === query.service)
    ? query.service
    : null;

  return (
    <main className="public-queue-shell">
      <section className="public-queue-card">
        <div className="public-queue-brand-row">
          <Link href="/" className="brand-mark">QueueDrop</Link>
          <span className="live-badge">LIVE QUEUE</span>
        </div>

        <header className="public-queue-heading">
          <p className="eyebrow">{queue.business.name}</p>
          <h1>{queue.branch.name}</h1>
          {queue.branch.address ? <p>{queue.branch.address}</p> : null}
        </header>

        {query.error ? <div className="notice notice-error">{query.error}</div> : null}

        {!queue.queue_open ? (
          <div className="notice notice-error public-queue-closed">{queue.queue_status_message || "This branch is currently closed."}</div>
        ) : null}

        {queue.queue_open && queue.services.length ? (
          <form action={joinQueue} className="form-stack public-queue-form">
            <input type="hidden" name="business_slug" value={route.businessSlug} />
            <input type="hidden" name="branch_slug" value={route.branchSlug} />

            <fieldset className="service-picker">
              <legend>Select service</legend>
              {queue.services.map((service) => (
                <label className="service-choice" key={service.id}>
                  <input type="radio" name="service_id" value={service.id} required defaultChecked={service.id === preselectedServiceId} />
                  <span className="service-choice-content">
                    <strong>{service.name}</strong>
                    <small>
                      {service.queue_prefix}
                      {service.estimated_minutes ? ` - about ${service.estimated_minutes} min` : ""}
                    </small>
                    {service.description ? <em>{service.description}</em> : null}
                  </span>
                </label>
              ))}
            </fieldset>

            <label>
              Your name
              <input name="name" type="text" required minLength={1} maxLength={100} autoComplete="name" placeholder="Maria Santos" />
            </label>
            <label>
              Mobile number
              <DigitsOnlyInput name="phone" required maxLength={20} autoComplete="tel" placeholder="09171234567" />
            </label>

            <div className="public-queue-note">
              No app download needed. Keep the ticket page open to see your current position.
            </div>
            <button className="button button-primary" type="submit">Get queue number</button>
          </form>
        ) : (
          <div className="mini-empty">
            <strong>{queue.queue_open ? "No services are available right now." : "Queue joining is closed."}</strong>
            <span>{queue.queue_open ? "Please ask the branch staff for assistance." : "Please return during branch operating hours."}</span>
          </div>
        )}

        {queue.branch.phone ? <p className="public-contact">Branch contact: {queue.branch.phone}</p> : null}
      </section>
    </main>
  );
}
