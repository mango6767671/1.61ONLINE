import { botConfig } from "./config.js";

export class CommunityApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "CommunityApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${botConfig.apiBaseUrl}/v1/integrations/discord${path}`, {
      method,
      headers: {
        accept: "application/json",
        "x-community-bot-key": botConfig.apiKey,
        ...(body === undefined ? {} : { "content-type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000)
    });
  } catch (error) {
    throw new CommunityApiError(
      error instanceof Error && error.name === "TimeoutError"
        ? "The community API timed out."
        : "The community API is unreachable.",
      0
    );
  }

  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const errorCode = typeof payload.error === "string" ? payload.error : "api_request_failed";
    throw new CommunityApiError(errorCode, response.status, payload);
  }
  return payload as T;
}

export const communityApi = {
  status: () => request<Record<string, any>>("GET", "/status"),
  signup: (data: unknown) => request<Record<string, any>>("POST", "/signup", data),
  player: (discordUserId: string) => request<Record<string, any>>("GET", `/players/${encodeURIComponent(discordUserId)}`),
  players: (query?: string, limit = 10) => request<Record<string, any>>("GET", `/players?limit=${limit}${query ? `&query=${encodeURIComponent(query)}` : ""}`),
  sessions: () => request<Record<string, any>>("GET", "/sessions"),
  announcements: () => request<Record<string, any>>("GET", "/announcements"),
  submitReport: (data: unknown) => request<Record<string, any>>("POST", "/reports", data),
  reports: (status = "open", limit = 25) => request<Record<string, any>>("GET", `/reports?status=${status}&limit=${limit}`),
  resolveReport: (reportId: string, data: unknown) => request<Record<string, any>>("PATCH", `/reports/${encodeURIComponent(reportId)}`, data),
  ban: (discordUserId: string, data: unknown) => request<Record<string, any>>("POST", `/players/${encodeURIComponent(discordUserId)}/ban`, data),
  unban: (discordUserId: string, data: unknown) => request<Record<string, any>>("DELETE", `/players/${encodeURIComponent(discordUserId)}/ban`, data),
  createAnnouncement: (data: unknown) => request<Record<string, any>>("POST", "/announcements", data),
  removeAnnouncement: (announcementId: string, data: unknown) => request<Record<string, any>>("DELETE", `/announcements/${encodeURIComponent(announcementId)}`, data),
  setMaintenance: (data: unknown) => request<Record<string, any>>("PUT", "/maintenance", data),
  audit: (limit = 25) => request<Record<string, any>>("GET", `/audit?limit=${limit}`),
  recordAudit: (data: unknown) => request<Record<string, any>>("POST", "/audit", data),
  createTicket: (data: unknown) => request<Record<string, any>>("POST", "/tickets", data),
  linkTicketChannel: (ticketId: string, channelId: string) => request<Record<string, any>>("PUT", `/tickets/${encodeURIComponent(ticketId)}/channel`, { channelId }),
  ticketByChannel: (channelId: string) => request<Record<string, any>>("GET", `/tickets/by-channel/${encodeURIComponent(channelId)}`),
  closeTicket: (ticketId: string, data: unknown) => request<Record<string, any>>("POST", `/tickets/${encodeURIComponent(ticketId)}/close`, data),
  tickets: () => request<Record<string, any>>("GET", "/tickets"),
  createSuggestion: (data: unknown) => request<Record<string, any>>("POST", "/suggestions", data),
  suggestions: (status = "pending", limit = 25) => request<Record<string, any>>("GET", `/suggestions?status=${status}&limit=${limit}`),
  updateSuggestion: (suggestionId: string, data: unknown) => request<Record<string, any>>("PATCH", `/suggestions/${encodeURIComponent(suggestionId)}`, data)
};
