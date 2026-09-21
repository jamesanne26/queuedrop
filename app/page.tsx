import Link from "next/link";

const features = [
  ["No app required", "Customers tap GET STUB, then scan only if they want live status."],
  ["Built for branches", "Each branch can run its own services, queue settings, staff, and operating hours."],
  ["Real-time operations", "Staff can call, serve, complete, cancel, and mark no-shows from one live workspace."],
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <nav className="topbar">
          <Link href="/" className="brand-mark">QueueDrop</Link>
          <div className="topbar-actions">
            <Link href="/pricing" className="button button-secondary">Pricing</Link>
            <Link href="/auth/login" className="button button-secondary">Sign in</Link>
            <Link href="/auth/signup" className="button button-primary">Get started</Link>
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <span className="pill">Digital queues. Less waiting.</span>
            <h1>One tap for a stub. Live queue status when they need it.</h1>
            <p>
              QueueDrop is a web-based queue management platform for salons, clinics, repair shops, service centers, and multi-branch businesses.
            </p>
            <div className="hero-actions">
              <Link href="/pricing" className="button button-primary button-large">View plans & subscribe</Link>
              <a href="#how-it-works" className="button button-secondary button-large">See how it works</a>
            </div>
          </div>

          <div className="queue-demo" aria-label="QueueDrop queue preview">
            <div className="demo-header">
              <div><span className="demo-dot" /><span className="demo-dot" /><span className="demo-dot" /></div>
              <span>Live queue</span>
            </div>
            <div className="demo-body">
              <p className="eyebrow">Service A</p>
              <div className="position-number">5th</div>
              <h2>position in queue</h2>
              <div className="demo-person">
                <div><strong>Stub A-023</strong><span>No customer name required</span></div>
                <span className="live-badge">Live</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="feature-section" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">Designed for real queues</p>
          <h2>Simple for customers. Powerful for businesses.</h2>
        </div>
        <div className="feature-grid">
          {features.map(([title, copy], index) => (
            <article className="feature-card" key={title}>
              <span className="feature-number">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="flow-section">
        <div className="flow-copy">
          <p className="eyebrow">Stub flow</p>
          <h2>Join in seconds.</h2>
          <p>Choose a service and get a printed stub instantly. Scan the QR code for live status, and add a mobile number only if you want SMS alerts.</p>
        </div>
        <ol className="flow-steps">
          <li><span>1</span>Choose service</li>
          <li><span>2</span>Get printed stub</li>
          <li><span>3</span>Scan QR for live status</li>
          <li><span>4</span>Optional SMS alerts</li>
        </ol>
      </section>

      <footer className="footer">
        <div><strong>QueueDrop</strong><p>Modern queue management for service businesses.</p></div>
        <span><Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/refunds">Refunds</Link></span>
      </footer>
    </main>
  );
}
