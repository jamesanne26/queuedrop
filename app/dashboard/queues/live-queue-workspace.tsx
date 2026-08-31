"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { DigitsOnlyInput } from "@/app/_components/digits-only-input";
import { ResponsiveBranchSelect } from "@/app/dashboard/_components/responsive-branch-select";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  callNextAction,
  returnLastCustomerAction,
  loadServiceHistoryAction,
  loadTicketChangeHistoryAction,
  staffAssistedJoinAction,
  updateCustomerDetailsAction,
  updateTicketAction,
  type AssistedJoinState,
  type ServiceHistoryTicket,
  type TicketCustomerChange,
} from "./actions";

type Role = "owner" | "admin" | "manager" | "staff";

type Branch = {
  id: string;
  name: string;
  address: string | null;
};

type Service = {
  id: string;
  name: string;
  qrDataUrl: string;
};

type ServiceDropdownProps = {
  services: Service[];
  customerChoiceOption?: { value: string; label: string };
  value: string;
  ariaLabel: string;
  compact?: boolean;
  includeAll?: boolean;
  allLabel?: string;
  onChange: (serviceId: string) => void;
};

function QueueSubmitButton({
  children,
  pendingLabel,
  className,
  disabled = false,
}: {
  children: ReactNode;
  pendingLabel: string;
  className: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className}
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

function ServiceDropdown({
  services,
  value,
  ariaLabel,
  compact = false,
  includeAll = false,
  allLabel = "All services",
  customerChoiceOption,
  onChange,
}: ServiceDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = services.find((service) => service.id === value) ?? null;
  const customerChoiceSelected = customerChoiceOption?.value === value;

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={
        compact
          ? "qd-service-dropdown qd-service-dropdown-compact"
          : "qd-service-dropdown"
      }
    >
      <button
        type="button"
        className="qd-service-dropdown-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{customerChoiceSelected ? customerChoiceOption?.label : selected?.name ?? (includeAll && value === "" ? allLabel : "Select service")}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m5 7 5 5 5-5" />
        </svg>
      </button>

      {open ? (
        <div
          className="qd-service-dropdown-menu"
          role="listbox"
          aria-label={ariaLabel}
        >
          {includeAll ? (
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              className={value === "" ? "qd-service-dropdown-option qd-service-dropdown-option-selected" : "qd-service-dropdown-option"}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {allLabel}
            </button>
          ) : null}
          {customerChoiceOption ? (
            <button
              type="button"
              role="option"
              aria-selected={value === customerChoiceOption.value}
              className={value === customerChoiceOption.value ? "qd-service-dropdown-option qd-service-dropdown-option-selected" : "qd-service-dropdown-option"}
              onClick={() => {
                onChange(customerChoiceOption.value);
                setOpen(false);
              }}
            >
              {customerChoiceOption.label}
            </button>
          ) : null}
          {services.length ? (
            services.map((service) => (
              <button
                key={service.id}
                type="button"
                role="option"
                aria-selected={service.id === value}
                className={
                  service.id === value
                    ? "qd-service-dropdown-option qd-service-dropdown-option-selected"
                    : "qd-service-dropdown-option"
                }
                onClick={() => {
                  onChange(service.id);
                  setOpen(false);
                }}
              >
                {service.name}
              </button>
            ))
          ) : (
            <span className="qd-service-dropdown-empty">
              No active services
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}



type Ticket = {
  id: string;
  display_number: string;
  status: "waiting" | "called" | "serving";
  service_id: string;
  service_name: string;
  position: number | null;
  customer_name: string;
  customer_phone: string;
  joined_at: string;
  called_at: string | null;
  serving_at: string | null;
  updated_at: string;
  session_token: string | null;
};


function ordinalPosition(position: number | null) {
  if (!position || position < 1) return "-";
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
  if (position % 10 === 1) return `${position}st`;
  if (position % 10 === 2) return `${position}nd`;
  if (position % 10 === 3) return `${position}rd`;
  return `${position}th`;
}


type Props = {
  role: Role;
  businessName: string;
  selectedBranchId: string;
  selectedBranch: Branch;
  branches: Branch[];
  services: Service[];
  branchQrDataUrl: string;
  initialServiceId: string | null;
  tickets: Ticket[];
  canEditName: boolean;
  canEditMobile: boolean;
  successMessage?: string;
  errorMessage?: string;
};

type ModalName =
  | null
  | "assist"
  | "qr"
  | "customer"
  | "edit"
  | "history"
  | "service-history"
  | "confirm-exit"
  | "confirm-name-visibility"
  | "confirm-call-next"
  | "confirm-return-last"
  | "result";

const initialAssistState: AssistedJoinState = {
  ok: false,
  message: "",
  requestId: null,
};

export function LiveQueueWorkspace({
  role,
  businessName,
  selectedBranchId,
  selectedBranch,
  branches,
  services,
  branchQrDataUrl,
  initialServiceId,
  tickets,
  canEditName,
  canEditMobile,
  successMessage,
  errorMessage,
}: Props) {
  const router = useRouter();
  const [isBranchSwitching, startBranchTransition] = useTransition();
  const defaultServiceId =
    initialServiceId && services.some((service) => service.id === initialServiceId)
      ? initialServiceId
      : services[0]?.id ?? "";

  const [serviceId, setServiceId] = useState(defaultServiceId);
  const [qrServiceId, setQrServiceId] = useState<string>("customer-selects-service");
  const [assistServiceId, setAssistServiceId] = useState("");
  const [modal, setModal] = useState<ModalName>(null);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [showNames, setShowNames] = useState(false);
  const [queueServiceFilter, setQueueServiceFilter] = useState("all");
  const [serviceHistory, setServiceHistory] = useState<ServiceHistoryTicket[]>([]);
  const [serviceHistoryLoading, setServiceHistoryLoading] = useState(false);
  const [ticketHistory, setTicketHistory] = useState<TicketCustomerChange[]>([]);
  const [ticketHistoryLoading, setTicketHistoryLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(
    errorMessage
      ? { type: "error", message: errorMessage }
      : successMessage
        ? { type: "success", message: successMessage }
        : null,
  );
  const [assistState, assistAction, assistPending] = useActionState(
    staffAssistedJoinAction,
    initialAssistState,
  );

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId) ?? null,
    [serviceId, services],
  );

  const selectedQrService = useMemo(
    () => services.find((service) => service.id === qrServiceId) ?? null,
    [qrServiceId, services],
  );
  const selectedQrDataUrl = qrServiceId === "customer-selects-service"
    ? branchQrDataUrl
    : selectedQrService?.qrDataUrl ?? branchQrDataUrl;
  const selectedQrLabel = qrServiceId === "customer-selects-service"
    ? "Customer selects service"
    : selectedQrService?.name ?? "Customer selects service";

  const activeTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === activeTicketId) ?? null,
    [activeTicketId, tickets],
  );

  const filteredTickets = useMemo(
    () =>
      queueServiceFilter === "all"
        ? tickets
        : tickets.filter(
            (ticket) => ticket.service_id === queueServiceFilter,
          ),
    [queueServiceFilter, tickets],
  );

  const servingTickets = useMemo(
    () =>
      filteredTickets
        .filter((ticket) => ticket.status === "serving")
        .sort((a, b) =>
          new Date(a.serving_at ?? a.updated_at).getTime() -
          new Date(b.serving_at ?? b.updated_at).getTime(),
        ),
    [filteredTickets],
  );

  const pendingTickets = useMemo(
    () =>
      filteredTickets
        .filter((ticket) => ticket.status === "called")
        .sort((a, b) =>
          new Date(a.called_at ?? a.updated_at).getTime() -
          new Date(b.called_at ?? b.updated_at).getTime(),
        ),
    [filteredTickets],
  );

  const waitingTickets = useMemo(
    () =>
      filteredTickets
        .filter((ticket) => ticket.status === "waiting")
        .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)),
    [filteredTickets],
  );

  useEffect(() => {
    if (!assistState.ok) return;

    // Close the assisted-join modal immediately after the server action
    // succeeds. Do not wait for router.refresh(), otherwise the modal can
    // remain visible for an extra render while the refreshed queue loads.
    window.dispatchEvent(new Event("qd:submit-complete"));
    queueMicrotask(() => setModal(null));

    // Refresh the queue data in a transition so the successful close remains
    // responsive while the updated ticket list is fetched.
    startTransition(() => {
      router.refresh();
    });
  }, [assistState.requestId, router]);

  const serviceIdsKey = services.map((service) => service.id).join("|");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const nextServiceId =
        initialServiceId &&
        services.some((service) => service.id === initialServiceId)
          ? initialServiceId
          : services[0]?.id ?? "";

      setServiceId(nextServiceId);
      setQueueServiceFilter(nextServiceId || "all");
      queueMicrotask(() => setModal(null));
      setActiveTicketId(null);
    });

    return () => cancelAnimationFrame(frame);
    // Service IDs, not the array identity, intentionally drive this reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialServiceId, selectedBranchId, serviceIdsKey]);

  useEffect(() => {
    document.body.dataset.qdModalOpen = modal ? "true" : "false";
    return () => {
      delete document.body.dataset.qdModalOpen;
    };
  }, [modal]);

  useEffect(() => {
    if (!errorMessage && !successMessage) return;

    const frame = requestAnimationFrame(() => {
      window.dispatchEvent(new Event("qd:submit-complete"));
      if (errorMessage) {
        setResultMessage({ type: "error", message: errorMessage });
        setModal("result");
      } else if (successMessage) {
        setResultMessage({ type: "success", message: successMessage });
        setModal("result");
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [successMessage, errorMessage]);

  function openTicket(ticketId: string) {
    setActiveTicketId(ticketId);
    setModal("customer");
  }

  function closeModal() {
    queueMicrotask(() => setModal(null));
  }

  function navigateBranch(branchId: string) {
    if (!branchId || branchId === selectedBranchId || isBranchSwitching) return;

    startBranchTransition(() => {
      router.replace(`/dashboard/queues?branch=${encodeURIComponent(branchId)}`, {
        scroll: false,
      });
    });
  }

  function selectService(nextServiceId: string) {
    setServiceId(nextServiceId);
    setQueueServiceFilter(nextServiceId || "all");
    // Keep the queue service selector and the QR/service selector in sync
    // whenever a specific service is chosen. The special All services flow
    // continues to use Customer selects service via showAllServices().
    if (nextServiceId) setQrServiceId(nextServiceId);
  }

  function selectQrService(nextServiceId: string) {
    setQrServiceId(nextServiceId);
    // Selecting a concrete service from the QR panel should also focus the
    // queue on that same service. Customer selects service intentionally does
    // not change the queue filter so the existing All services behavior stays
    // intact.
    if (nextServiceId !== "customer-selects-service") {
      setServiceId(nextServiceId);
      setQueueServiceFilter(nextServiceId);
    }
  }

  function showAllServices() {
    setQueueServiceFilter("all");
    // All-services queue view uses the branch QR so the customer chooses a service.
    setQrServiceId("customer-selects-service");
  }

  function openAssist() {
    setAssistServiceId(qrServiceId === "customer-selects-service" ? "" : qrServiceId);
    setModal("assist");
  }

  function requestCallNext() {
    if (!selectedService) return;
    setModal("confirm-call-next");
  }

  function requestReturnLast() {
    if (!selectedService) return;
    setModal("confirm-return-last");
  }

  function requestExit() {
    setModal("confirm-exit");
  }

  function requestToggleNames() {
    setModal("confirm-name-visibility");
  }

  function confirmToggleNames() {
    setShowNames((current) => !current);
    queueMicrotask(() => setModal(null));
  }

  async function openServiceHistory() {
    setModal("service-history");
    setServiceHistoryLoading(true);
    try {
      const rows = await loadServiceHistoryAction(selectedBranchId);
      setServiceHistory(rows);
    } finally {
      setServiceHistoryLoading(false);
    }
  }

  async function openTicketHistory() {
    if (!activeTicket) return;
    setModal("history");
    setTicketHistoryLoading(true);
    try {
      const rows = await loadTicketChangeHistoryAction(activeTicket.id);
      setTicketHistory(rows);
    } finally {
      setTicketHistoryLoading(false);
    }
  }

  return (
    <main className="live-queue-shell live-queue-shell-refined">
      {isBranchSwitching ? (
        <div className="qd-loading-backdrop qd-branch-switch-backdrop" role="status" aria-live="polite" aria-label="Loading branch queue">
          <section className="qd-branch-switch-modal">
            <span className="qd-branch-switch-spinner" aria-hidden="true" />
            <strong>Please wait</strong>
          </section>
        </div>
      ) : null}
      <header className="live-queue-banner">
        <div className="live-banner-branches">
          {branches.length > 1 ? (
            <>
              <ResponsiveBranchSelect
                branches={branches.map((branch) => ({
                  id: branch.id,
                  name: branch.name,
                }))}
                selectedBranchId={selectedBranchId}
                onNavigate={navigateBranch}
                isNavigating={isBranchSwitching}
              />
              <div className="live-banner-branch-links-desktop">
                {branches.map((branch) => (
                  <Link
                    key={branch.id}
                    href={`/dashboard/queues?branch=${branch.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      navigateBranch(branch.id);
                    }}
                    aria-disabled={isBranchSwitching || branch.id === selectedBranchId}
                    className={
                      branch.id === selectedBranchId
                        ? "live-banner-branch live-banner-branch-active"
                        : "live-banner-branch"
                    }
                  >
                    {branch.name}
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <div className="live-banner-single-branch">
              <strong>{selectedBranch.name}</strong>
              {selectedBranch.address ? (
                <small>{selectedBranch.address}</small>
              ) : null}
            </div>
          )}
        </div>

        <div className="live-banner-center">
          <span className="live-dot" />
          <strong>Live queue</strong>
          <small>{businessName}</small>
        </div>

        <div className="live-banner-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={openServiceHistory}
          >
            History
          </button>

          <button
            type="button"
            className="button button-secondary live-exit-button"
            onClick={requestExit}
          >
            Exit live view
          </button>
        </div>
      </header>

      <section className="live-queue-workspace live-queue-workspace-refined">
        <section className="live-queue-list-panel">
          <div className="live-panel-heading">
            <div>
              <p className="eyebrow">Current queue</p>
            </div>
            <div className="live-queue-heading-actions">
              <div className="live-queue-heading-primary-actions">
                <button type="button" className="button button-primary button-small live-heading-action-button" disabled={!selectedService} onClick={requestCallNext}>
                  Call Next<br />Customer
                </button>
                <button type="button" className="button button-secondary button-small live-heading-action-button" disabled={!selectedService} onClick={requestReturnLast}>
                  Return last<br />customer<br />to queue
                </button>
              </div>
              <button
                type="button"
                className={
                  queueServiceFilter === "all"
                    ? "button button-small live-all-services-button live-all-services-button-active"
                    : "button button-secondary button-small live-all-services-button"
                }
                onClick={showAllServices}
              >
                All services
              </button>
              <span className="status-chip">{filteredTickets.length} Active</span>
            </div>
          </div>

          <div className="live-queue-mobile-controls" aria-label="Mobile queue controls">
            <div className="live-queue-mobile-service-filter">
              <span>Queue service</span>
              <ServiceDropdown
                services={services}
                value={queueServiceFilter === "all" ? "" : queueServiceFilter}
                ariaLabel="Filter queue by service"
                includeAll
                onChange={(nextServiceId) => nextServiceId ? selectService(nextServiceId) : showAllServices()}
              />
            </div>
            <div className="live-queue-mobile-primary-actions">
              <button type="button" className="button button-primary live-mobile-queue-action" disabled={!selectedService} onClick={requestCallNext}>
                Call Next<br />Customer
              </button>
              <button type="button" className="button button-secondary live-mobile-queue-action" disabled={!selectedService} onClick={requestReturnLast}>
                Return last<br />customer<br />to queue
              </button>
            </div>
            {queueServiceFilter === "all" && selectedService ? (
              <small className="live-mobile-action-note">Actions will use {selectedService.name}. Choose another service above the QR panel to change it.</small>
            ) : null}
          </div>

          <div className="live-queue-table-wrap live-queue-only-scroll">
            <table className="live-queue-table">
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>
                    <ServiceDropdown
                      services={services}
                      value={
                        queueServiceFilter === "all"
                          ? ""
                          : queueServiceFilter
                      }
                      ariaLabel="Filter queue by service"
                      compact
                      onChange={selectService}
                    />
                  </th>
                  <th>Position</th>
                  <th>
                    <div className="live-name-header">
                      <span>Name</span>
                      <button
                        type="button"
                        className="name-visibility-button"
                        aria-label={showNames ? "Hide customer names" : "Show customer names"}
                        title={showNames ? "Hide customer names" : "Show customer names"}
                        onClick={requestToggleNames}
                      >
                        {showNames ? (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                            <circle cx="12" cy="12" r="2.8" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M3 3l18 18" />
                            <path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.2 2.8" />
                            <path d="M6.1 6.1C3.7 8 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.4 4-.9" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </th>
                  <th>Status</th>
                  <th className="live-queue-header-actions-cell">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr className="live-queue-section-row live-queue-section-serving">
                  <td colSpan={6}><span>Serving</span></td>
                </tr>
                {servingTickets.map((ticket, index) => (
                  <tr key={ticket.id}>
                    <td data-label="Queue"><button type="button" className="queue-code-button" onClick={() => openTicket(ticket.id)}>{ticket.display_number}</button></td>
                    <td data-label="Service"><strong>{ticket.service_name}</strong></td>
                    <td data-label="Position"><strong>{index + 1}</strong></td>
                    <td data-label="Customer">
                      <button type="button" className={showNames ? "live-customer-name live-customer-name-button" : "live-customer-name live-customer-name-hidden live-customer-name-button"} onClick={() => openTicket(ticket.id)} aria-label={`Open customer view for ${ticket.display_number}`}>
                        {showNames ? ticket.customer_name : "Hidden"}
                      </button>
                    </td>
                    <td data-label="Status"><span className="ticket-status-chip ticket-status-serving">serving</span></td>
                    <td data-label="Actions">
                      <div className="live-row-actions">
                        <form action={updateTicketAction} data-no-global-loading="true">
                          <input type="hidden" name="branch_id" value={selectedBranchId} />
                          <input type="hidden" name="service_id" value={ticket.service_id} />
                          <input type="hidden" name="ticket_id" value={ticket.id} />
                          <input type="hidden" name="action" value="complete" />
                          <QueueSubmitButton className="button button-primary button-small" pendingLabel="Completing...">Complete</QueueSubmitButton>
                        </form>
                        <form action={updateTicketAction} data-no-global-loading="true">
                          <input type="hidden" name="branch_id" value={selectedBranchId} />
                          <input type="hidden" name="service_id" value={ticket.service_id} />
                          <input type="hidden" name="ticket_id" value={ticket.id} />
                          <input type="hidden" name="action" value="pending" />
                          <QueueSubmitButton className="button button-secondary button-small" pendingLabel="Moving...">Move to pending</QueueSubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}

                <tr className="live-queue-section-row live-queue-section-pending">
                  <td colSpan={6}><span>Pending</span></td>
                </tr>
                {pendingTickets.map((ticket, index) => (
                  <tr key={ticket.id}>
                    <td data-label="Queue"><button type="button" className="queue-code-button" onClick={() => openTicket(ticket.id)}>{ticket.display_number}</button></td>
                    <td data-label="Service"><strong>{ticket.service_name}</strong></td>
                    <td data-label="Position"><strong>{index + 1}</strong></td>
                    <td data-label="Customer">
                      <button type="button" className={showNames ? "live-customer-name live-customer-name-button" : "live-customer-name live-customer-name-hidden live-customer-name-button"} onClick={() => openTicket(ticket.id)} aria-label={`Open customer view for ${ticket.display_number}`}>
                        {showNames ? ticket.customer_name : "Hidden"}
                      </button>
                    </td>
                    <td data-label="Status"><span className="ticket-status-chip ticket-status-called">pending</span></td>
                    <td data-label="Actions">
                      <div className="live-row-actions">
                        <form action={updateTicketAction} data-no-global-loading="true">
                          <input type="hidden" name="branch_id" value={selectedBranchId} />
                          <input type="hidden" name="service_id" value={ticket.service_id} />
                          <input type="hidden" name="ticket_id" value={ticket.id} />
                          <input type="hidden" name="action" value="serve" />
                          <QueueSubmitButton className="button button-secondary button-small" pendingLabel="Moving...">Move to serving</QueueSubmitButton>
                        </form>
                        <form action={updateTicketAction} data-no-global-loading="true">
                          <input type="hidden" name="branch_id" value={selectedBranchId} />
                          <input type="hidden" name="service_id" value={ticket.service_id} />
                          <input type="hidden" name="ticket_id" value={ticket.id} />
                          <input type="hidden" name="action" value="no_show" />
                          <QueueSubmitButton className="button button-secondary button-small" pendingLabel="Saving...">No-show</QueueSubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}

                <tr className="live-queue-section-row live-queue-section-waiting">
                  <td colSpan={6}><span>Waiting</span></td>
                </tr>
                {waitingTickets.map((ticket, index) => (
                  <tr key={ticket.id}>
                    <td data-label="Queue"><button type="button" className="queue-code-button" onClick={() => openTicket(ticket.id)}>{ticket.display_number}</button></td>
                    <td data-label="Service"><strong>{ticket.service_name}</strong></td>
                    <td data-label="Position"><strong>{queueServiceFilter === "all" ? ticket.position ?? index + 1 : index + 1}</strong></td>
                    <td data-label="Customer">
                      <button type="button" className={showNames ? "live-customer-name live-customer-name-button" : "live-customer-name live-customer-name-hidden live-customer-name-button"} onClick={() => openTicket(ticket.id)} aria-label={`Open customer view for ${ticket.display_number}`}>
                        {showNames ? ticket.customer_name : "Hidden"}
                      </button>
                    </td>
                    <td data-label="Status"><span className="ticket-status-chip ticket-status-waiting">waiting</span></td>
                    <td data-label="Actions"><span className="live-no-actions" aria-hidden="true">—</span></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filteredTickets.length ? (
              <div className="mini-empty">
                <strong>
                  {queueServiceFilter === "all"
                    ? "No active queue tickets."
                    : "No active tickets for this service."}
                </strong>
                <span>
                  {queueServiceFilter === "all"
                    ? "Select a service and show its QR code."
                    : "Choose All services or another service to view its queue."}
                </span>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="live-service-panel live-service-panel-refined">
          <div className="live-panel-heading live-service-heading">
            <div>
              <p className="eyebrow">Service/s</p>
            </div>
          </div>

          <ServiceDropdown
            services={services}
            value={qrServiceId}
            ariaLabel="Select QR code"
            customerChoiceOption={{ value: "customer-selects-service", label: "Customer selects service" }}
            onChange={selectQrService}
          />

          {services.length ? (
            <div className="live-qr-card live-qr-card-refined">
              <button
                type="button"
                className="live-qr-image-button"
                onClick={() => setModal("qr")}
                aria-label={`Maximize QR code for ${selectedQrLabel}`}
              >
                <img
                  src={selectedQrDataUrl}
                  alt={`QR code for ${selectedQrLabel}`}
                  className="live-qr-image"
                />
              </button>

              <p>{qrServiceId === "customer-selects-service" ? "Scan this QR code and let the customer choose a service." : `Scan this QR code to preselect ${selectedQrLabel}.`}</p>

              <div className="live-qr-actions live-qr-actions-stacked">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={openAssist}
                >
                  Fill up for customer
                </button>


              </div>
            </div>
          ) : services.length === 0 ? (
            <div className="live-service-empty">
              <strong>No active services.</strong>
            </div>
          ) : null}
        </aside>
      </section>

      {modal === "qr" ? (
        <div className="qd-modal-backdrop qd-qr-modal-backdrop" role="presentation">
          <section className="qd-qr-max-modal" role="dialog" aria-modal="true" aria-label={`QR code for ${selectedQrLabel}`}>
            <img src={selectedQrDataUrl} alt={`QR code for ${selectedQrLabel}`} />
            <button className="button button-secondary qd-qr-cancel" type="button" onClick={closeModal}>Cancel</button>
          </section>
        </div>
      ) : null}

      {modal === "assist" && services.length ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section className="qd-modal" role="dialog" aria-modal="true" aria-labelledby="assist-title">
            <div className="qd-modal-header">
              <div>
                <h2 id="assist-title">Fill up customer details</h2>
                <span className="queue-service-name">{assistServiceId ? services.find((service) => service.id === assistServiceId)?.name ?? "Select service" : "Customer selects service"}</span>
              </div>
            </div>

            <form action={assistAction} className="form-stack" data-no-global-loading="true">
              <input type="hidden" name="branch_id" value={selectedBranchId} />
              <label>
                Service
                <select name="service_id" required value={assistServiceId} onChange={(event) => setAssistServiceId(event.target.value)}>
                  <option value="" disabled>Select service</option>
                  {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                </select>
              </label>
              <label>
                Customer name
                <input name="name" required minLength={1} maxLength={100} placeholder="Enter your name" />
              </label>
              <label>
                Mobile number
                <DigitsOnlyInput name="phone" required maxLength={20} autoComplete="tel" placeholder="09171234567" />
              </label>
              {assistState.message && !assistState.ok ? <div className="notice notice-error">{assistState.message}</div> : null}
              <div className="qd-modal-actions">
                <button className="button button-secondary" type="button" onClick={closeModal}>Cancel</button>
                <button className="button button-primary" type="submit" disabled={assistPending || !assistServiceId}>{assistPending ? "Adding..." : "Add to queue"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {modal === "customer" && activeTicket ? (
        <div className="qd-modal-backdrop qd-customer-preview-backdrop" role="presentation">
          <section className="qd-customer-preview-modal" role="dialog" aria-modal="true" aria-labelledby="customer-preview-title">
            <div className="qd-customer-preview-toolbar">
              <div>
                <p className="eyebrow">Staff preview</p>
                <strong id="customer-preview-title">{activeTicket.display_number} customer view</strong>
              </div>
              <div className="qd-customer-preview-toolbar-actions">
                {(canEditName || canEditMobile) ? <button className="button button-secondary button-small" type="button" onClick={() => setModal("edit")}>Edit customer</button> : null}
                <button className="button button-secondary button-small" type="button" onClick={openTicketHistory}>Change history</button>
                <button className="button button-primary button-small" type="button" onClick={closeModal}>Close</button>
              </div>
            </div>
            {activeTicket.session_token ? (
              <iframe
                className="qd-customer-preview-frame"
                src={`/q/status/${activeTicket.session_token}`}
                title={`Customer view for ${activeTicket.display_number}`}
              />
            ) : (
              <div className="mini-empty qd-customer-preview-unavailable">
                <strong>Customer view is unavailable for this ticket.</strong>
                <span>The ticket does not have a customer session link.</span>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {modal === "edit" && activeTicket ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section
            className="qd-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-title"
          >
            <div className="qd-modal-header">
              <div>
                <p className="eyebrow">{activeTicket.display_number}</p>
                <h2 id="edit-title">Edit customer details</h2>
              </div>
            </div>

            <form action={updateCustomerDetailsAction} className="form-stack" data-no-global-loading="true">
              <input type="hidden" name="branch_id" value={selectedBranchId} />
              <input type="hidden" name="service_id" value={serviceId} />
              <input type="hidden" name="ticket_id" value={activeTicket.id} />

              {canEditName ? (
                <label>
                  Name
                  <input
                    name="name"
                    required
                    maxLength={100}
                    defaultValue={activeTicket.customer_name}
                  />
                </label>
              ) : (
                <input type="hidden" name="name" value={activeTicket.customer_name} />
              )}

              {canEditMobile ? (
                <label>
                  Mobile number
                  <DigitsOnlyInput
                    name="phone"
                    required
                    maxLength={20}
                    autoComplete="tel"
                    defaultValue={activeTicket.customer_phone}
                  />
                </label>
              ) : (
                <input
                  type="hidden"
                  name="phone"
                  value={activeTicket.customer_phone}
                />
              )}

              <div className="qd-modal-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setModal("customer")}
                >
                  Cancel
                </button>
                <QueueSubmitButton
                  className="button button-primary"
                  pendingLabel="Saving..."
                >
                  Save
                </QueueSubmitButton>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {modal === "history" && activeTicket ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section
            className="qd-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
          >
            <div className="qd-modal-header">
              <div>
                <p className="eyebrow">{activeTicket.display_number}</p>
                <h2 id="history-title">Change history</h2>
              </div>
            </div>

            <div className="qd-history-list">
              {ticketHistoryLoading ? (
                <div className="mini-empty">
                  <strong>Loading change history...</strong>
                </div>
              ) : ticketHistory.length ? (
                ticketHistory.map((item) => (
                  <article className="qd-history-row" key={item.id}>
                    <div>
                      <strong>
                        {item.field_name === "mobile" ? "Mobile" : item.field_name === "queue_position" ? "Queue position" : "Name"}
                      </strong>
                      <span>
                        {item.old_value || "-"} {"->"} {item.new_value || "-"}
                      </span>
                    </div>
                    <small>
                      {item.changed_by_label ?? item.changed_by_type} - {" "}
                      {new Date(item.created_at).toLocaleString()}
                    </small>
                  </article>
                ))
              ) : (
                <div className="mini-empty">
                  <strong>No changes yet.</strong>
                  <span>No customer detail or queue-position changes have been recorded.</span>
                </div>
              )}
            </div>

            <div className="qd-modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setModal("customer")}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {modal === "service-history" ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section
            className="qd-modal qd-service-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="service-history-title"
          >
            <div className="qd-service-history-header">
              <div>
                <p className="eyebrow">Service history</p>
                <h2 id="service-history-title">
                  {role === "owner" || role === "admin"
                    ? "All branch history"
                    : role === "manager"
                      ? "Assigned branch history"
                      : "Current branch history"}
                </h2>
                <span>
                  {serviceHistoryLoading
                    ? "Loading history..."
                    : `${serviceHistory.length} historical ticket${
                        serviceHistory.length === 1 ? "" : "s"
                      }`}
                </span>
              </div>

              <button
                className="button button-secondary qd-service-history-close"
                type="button"
                onClick={closeModal}
              >
                Close
              </button>
            </div>

            <div className="qd-service-history-list">
              {serviceHistoryLoading ? (
                <div className="mini-empty">
                  <strong>Loading service history...</strong>
                </div>
              ) : serviceHistory.length ? (
                serviceHistory.map((ticket) => (
                  <article className="qd-service-history-row" key={ticket.id}>
                    <div className="qd-service-history-main">
                      <div>
                        <strong>{ticket.display_number}</strong>
                        <span>{ticket.service_name}</span>
                      </div>
                      <span
                        className={`ticket-status-chip ticket-status-${ticket.status}`}
                      >
                        {ticket.status.replace("_", " ")}
                      </span>
                    </div>

                    <div className="qd-service-history-meta">
                      <span><b>Branch:</b> {ticket.branch_name}</span>
                      <span><b>Customer:</b> {ticket.customer_name}</span>
                      <span><b>Mobile:</b> {ticket.customer_phone}</span>
                      <span>
                        <b>Joined:</b>{" "}
                        {new Date(ticket.joined_at).toLocaleString()}
                      </span>
                      {ticket.completed_at ? (
                        <span>
                          <b>Completed:</b>{" "}
                          {new Date(ticket.completed_at).toLocaleString()}
                        </span>
                      ) : null}
                      {ticket.cancelled_at ? (
                        <span>
                          <b>Cancelled:</b>{" "}
                          {new Date(ticket.cancelled_at).toLocaleString()}
                        </span>
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <div className="mini-empty">
                  <strong>No service history yet.</strong>
                  <span>Completed, cancelled, and no-show tickets will appear here.</span>
                </div>
              )}
            </div>

          </section>
        </div>
      ) : null}

      {modal === "confirm-call-next" && selectedService ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section className="qd-modal qd-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-call-next-title">
            <div className="qd-confirm-icon" aria-hidden="true">?</div>
            <div className="qd-confirm-copy"><h2 id="confirm-call-next-title">Call next customer?</h2><p>Are you sure you want to call the next waiting customer for <strong>{selectedService.name}</strong>?</p></div>
            <form action={callNextAction} className="qd-modal-actions" data-no-global-loading="true">
              <input type="hidden" name="branch_id" value={selectedBranchId} /><input type="hidden" name="service_id" value={selectedService.id} />
              <button className="button button-secondary" type="button" onClick={closeModal}>Cancel</button>
              <QueueSubmitButton className="button button-primary" pendingLabel="Calling...">Yes, call next</QueueSubmitButton>
            </form>
          </section>
        </div>
      ) : null}

      {modal === "confirm-return-last" && selectedService ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section className="qd-modal qd-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-return-last-title">
            <div className="qd-confirm-icon" aria-hidden="true">?</div>
            <div className="qd-confirm-copy"><h2 id="confirm-return-last-title">Return last customer to queue?</h2><p>Are you sure you want to return the last customer for <strong>{selectedService.name}</strong> back to the waiting queue?</p></div>
            <form action={returnLastCustomerAction} className="qd-modal-actions" data-no-global-loading="true">
              <input type="hidden" name="branch_id" value={selectedBranchId} /><input type="hidden" name="service_id" value={selectedService.id} />
              <button className="button button-secondary" type="button" onClick={closeModal}>Cancel</button>
              <QueueSubmitButton className="button button-primary" pendingLabel="Returning...">Yes, return customer</QueueSubmitButton>
            </form>
          </section>
        </div>
      ) : null}

      {modal === "confirm-exit" ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section className="qd-modal qd-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-exit-title">
            <div className="qd-confirm-icon">!</div>
            <div className="qd-confirm-copy">
              <h2 id="confirm-exit-title">Exit live queue?</h2>
              <p>Are you sure you want to exit the live queue view?</p>
            </div>
            <div className="qd-modal-actions">
              <button className="button button-secondary" type="button" onClick={closeModal}>Cancel</button>
              <button className="button button-primary" type="button" onClick={() => router.push("/dashboard")}>Yes, exit</button>
            </div>
          </section>
        </div>
      ) : null}

      {modal === "confirm-name-visibility" ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section className="qd-modal qd-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-name-title">
            <div className="qd-confirm-icon">?</div>
            <div className="qd-confirm-copy">
              <h2 id="confirm-name-title">{showNames ? "Hide customer names?" : "Show customer names?"}</h2>
              <p>
                {showNames
                  ? "Are you sure you want to hide customer names from the live queue list?"
                  : "Are you sure you want to show customer names on the live queue list?"}
              </p>
            </div>
            <div className="qd-modal-actions">
              <button className="button button-secondary" type="button" onClick={closeModal}>Cancel</button>
              <button className="button button-primary" type="button" onClick={confirmToggleNames}>
                {showNames ? "Yes, hide names" : "Yes, show names"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {modal === "result" && resultMessage ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section
            className="qd-modal qd-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-result-title"
          >
            <div
              className={
                resultMessage.type === "error"
                  ? "qd-confirm-icon qd-confirm-icon-danger"
                  : "qd-confirm-icon"
              }
            >
              {resultMessage.type === "error" ? "!" : "OK"}
            </div>

            <div className="qd-confirm-copy">
              <h2 id="live-result-title">
                {resultMessage.type === "error"
                  ? "Unable to complete action"
                  : "Action completed"}
              </h2>
              <p>{resultMessage.message}</p>
            </div>

            <div className="qd-modal-actions">
              <button
                className="button button-primary"
                type="button"
                onClick={() => {
                  queueMicrotask(() => setModal(null));
                  setResultMessage(null);
                  router.replace(
                    `/dashboard/queues?branch=${selectedBranchId}${
                      serviceId ? `&service=${serviceId}` : ""
                    }`,
                    { scroll: false },
                  );
                }}
              >
                OK
              </button>
            </div>
          </section>
        </div>
      ) : null}

    </main>
  );
}


