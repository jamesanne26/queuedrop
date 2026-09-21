export type PositionableTicket = {
  id: string;
  service_id: string;
  ticket_number: number;
  status: string;
  position?: number | null;
};

export function recalculateQueuePositions<T extends PositionableTicket>(tickets: readonly T[]): T[] {
  const waitingByService = new Map<string, T[]>();
  for (const ticket of tickets) {
    if (ticket.status !== "waiting") continue;
    const list = waitingByService.get(ticket.service_id) ?? [];
    list.push(ticket);
    waitingByService.set(ticket.service_id, list);
  }

  const positions = new Map<string, number>();
  for (const list of waitingByService.values()) {
    [...list]
      .sort((a, b) => a.ticket_number - b.ticket_number)
      .forEach((ticket, index) => positions.set(ticket.id, index + 1));
  }

  return tickets.map((ticket) => ({
    ...ticket,
    position: ticket.status === "waiting" ? (positions.get(ticket.id) ?? null) : null,
  }));
}
