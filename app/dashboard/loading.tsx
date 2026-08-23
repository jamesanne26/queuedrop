export default function DashboardLoading() {
  return (
    <section className="dashboard-content dashboard-content-loading" aria-label="Loading QueueDrop workspace">
      <div className="dashboard-loading-line dashboard-loading-title" />
      <div className="dashboard-loading-grid">
        <div className="dashboard-loading-card" />
        <div className="dashboard-loading-card" />
        <div className="dashboard-loading-card" />
      </div>
      <div className="dashboard-loading-panel" />
    </section>
  );
}
