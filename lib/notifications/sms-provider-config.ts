export type SmsBodyFormat = "form" | "json";
export type SmsApiKeyLocation = "body" | "header" | "query" | "bearer" | "basic";

export type SmsHttpProviderConfig = {
  transport: "generic_http";
  http_method?: "POST" | "GET";
  body_format?: SmsBodyFormat;
  api_key_location?: SmsApiKeyLocation;
  api_key_field?: string;
  api_key_prefix?: string;
  api_key_username?: string;
  recipient_field?: string;
  message_field?: string;
  sender_field?: string;
  response_message_id_path?: string;
  static_params?: Record<string, string>;
  headers?: Record<string, string>;
};

export type GenericSmsRequestInput = {
  apiBaseUrl: string;
  apiKey: string;
  senderName?: string | null;
  recipient: string;
  message: string;
  config: SmsHttpProviderConfig;
};


export function smsProviderCredentialEnvKey(providerCode: string | null | undefined) {
  const normalized = (providerCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) throw new Error("Provider code is required to derive the server credential key.");
  if (normalized === "SEMAPHORE") return "SEMAPHORE_API_KEY";
  return `SMS_PROVIDER_${normalized}_API_KEY`;
}

export type GenericSmsRequest = {
  url: string;
  headers: Record<string, string>;
  method: "POST" | "GET";
  body: string | undefined;
};

const SAFE_FIELD = /^[A-Za-z0-9_.\-[\]]{1,80}$/;

export function isSafeProviderField(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return text.length > 0 && SAFE_FIELD.test(text);
}

export function assertSafeSmsProviderUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("SMS provider API URL is invalid.");
  }

  if (url.protocol !== "https:") {
    throw new Error("SMS provider API URL must use HTTPS.");
  }

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error("SMS provider API URL cannot target a local/private address.");
  }

  return url;
}

function normalizedConfig(config: SmsHttpProviderConfig) {
  const httpMethod: "POST" | "GET" = config.http_method === "GET" ? "GET" : "POST";
  const bodyFormat: SmsBodyFormat = config.body_format === "json" ? "json" : "form";
  const apiKeyLocation: SmsApiKeyLocation = ["header", "query", "bearer", "basic"].includes(config.api_key_location ?? "")
    ? (config.api_key_location as SmsApiKeyLocation)
    : "body";

  const recipientField = config.recipient_field?.trim() || "number";
  const messageField = config.message_field?.trim() || "message";
  const senderField = config.sender_field?.trim() || "sendername";
  const apiKeyField = config.api_key_field?.trim() || "apikey";

  for (const [label, value] of [
    ["recipient", recipientField],
    ["message", messageField],
    ["sender", senderField],
    ["API key", apiKeyField],
  ] as const) {
    if (!isSafeProviderField(value)) throw new Error(`SMS provider ${label} field name is invalid.`);
  }

  return { httpMethod, bodyFormat, apiKeyLocation, recipientField, messageField, senderField, apiKeyField };
}

export function buildGenericSmsRequest(input: GenericSmsRequestInput): GenericSmsRequest {
  const url = assertSafeSmsProviderUrl(input.apiBaseUrl);
  const { httpMethod, bodyFormat, apiKeyLocation, recipientField, messageField, senderField, apiKeyField } = normalizedConfig(input.config);

  const params: Record<string, string> = {
    ...(input.config.static_params ?? {}),
    [recipientField]: input.recipient,
    [messageField]: input.message,
  };
  if (input.senderName?.trim()) params[senderField] = input.senderName.trim();

  const headers: Record<string, string> = { ...(input.config.headers ?? {}) };
  const keyValue = `${input.config.api_key_prefix ?? ""}${input.apiKey}`;

  if (input.apiKey) {
    if (apiKeyLocation === "body") params[apiKeyField] = keyValue;
    else if (apiKeyLocation === "query") url.searchParams.set(apiKeyField, keyValue);
    else if (apiKeyLocation === "header") headers[apiKeyField] = keyValue;
    else if (apiKeyLocation === "bearer") headers.Authorization = `Bearer ${keyValue}`;
    else {
      const username = input.config.api_key_username?.trim() ?? "";
      headers.Authorization = `Basic ${Buffer.from(`${username}:${keyValue}`, "utf8").toString("base64")}`;
    }
  }

  let body: string | undefined;
  if (httpMethod === "GET") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  } else if (bodyFormat === "json") {
    headers["content-type"] = headers["content-type"] || "application/json";
    body = JSON.stringify(params);
  } else {
    headers["content-type"] = headers["content-type"] || "application/x-www-form-urlencoded";
    body = new URLSearchParams(params).toString();
  }

  return { url: url.toString(), headers, method: httpMethod, body };
}

export function readPath(value: unknown, path: string | null | undefined) {
  const normalized = path?.trim();
  if (!normalized) return null;
  let current: unknown = value;
  for (const part of normalized.split(".").filter(Boolean)) {
    if (Array.isArray(current) && /^\d+$/.test(part)) current = current[Number(part)];
    else if (current && typeof current === "object") current = (current as Record<string, unknown>)[part];
    else return null;
  }
  return typeof current === "string" || typeof current === "number" ? String(current) : null;
}

export function semaphoreHttpConfig(): SmsHttpProviderConfig {
  return {
    transport: "generic_http",
    http_method: "POST",
    body_format: "form",
    api_key_location: "body",
    api_key_field: "apikey",
    recipient_field: "number",
    message_field: "message",
    sender_field: "sendername",
    response_message_id_path: "0.message_id",
  };
}
