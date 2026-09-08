import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeSmsProviderUrl,
  buildGenericSmsRequest,
  readPath,
  semaphoreHttpConfig,
  smsProviderCredentialEnvKey,
} from "../../lib/notifications/sms-provider-config.ts";

test("generic provider builds Semaphore-compatible form request from configuration", () => {
  const request = buildGenericSmsRequest({
    apiBaseUrl: "https://api.semaphore.co/api/v4/messages",
    apiKey: "secret-test-key",
    senderName: "QueueDrop",
    recipient: "639171234567",
    message: "Your queue is ready",
    config: semaphoreHttpConfig(),
  });
  const body = new URLSearchParams(request.body);
  assert.equal(body.get("apikey"), "secret-test-key");
  assert.equal(body.get("number"), "639171234567");
  assert.equal(body.get("message"), "Your queue is ready");
  assert.equal(body.get("sendername"), "QueueDrop");
  assert.equal(request.headers["content-type"], "application/x-www-form-urlencoded");
});

test("generic provider supports JSON plus header API key without provider-specific code", () => {
  const request = buildGenericSmsRequest({
    apiBaseUrl: "https://sms.example.com/v1/send",
    apiKey: "abc123",
    senderName: "QueueDrop",
    recipient: "639171234567",
    message: "Hello",
    config: {
      transport: "generic_http",
      body_format: "json",
      api_key_location: "header",
      api_key_field: "X-API-Key",
      recipient_field: "to",
      message_field: "text",
      sender_field: "from",
      static_params: { type: "sms" },
    },
  });
  assert.equal(request.headers["X-API-Key"], "abc123");
  assert.deepEqual(JSON.parse(request.body), {
    type: "sms",
    to: "639171234567",
    text: "Hello",
    from: "QueueDrop",
  });
});

test("generic provider supports Bearer and query API-key modes", () => {
  const bearer = buildGenericSmsRequest({
    apiBaseUrl: "https://sms.example.com/send",
    apiKey: "token",
    recipient: "639171234567",
    message: "Hello",
    config: { transport: "generic_http", api_key_location: "bearer" },
  });
  assert.equal(bearer.headers.Authorization, "Bearer token");

  const query = buildGenericSmsRequest({
    apiBaseUrl: "https://sms.example.com/send",
    apiKey: "token",
    recipient: "639171234567",
    message: "Hello",
    config: { transport: "generic_http", api_key_location: "query", api_key_field: "key" },
  });
  assert.equal(new URL(query.url).searchParams.get("key"), "token");
});

test("generic provider supports GET and Basic auth for providers with account-style credentials", () => {
  const request = buildGenericSmsRequest({
    apiBaseUrl: "https://sms.example.com/send",
    apiKey: "password-token",
    recipient: "639171234567",
    message: "Hello",
    config: {
      transport: "generic_http",
      http_method: "GET",
      api_key_location: "basic",
      api_key_username: "account-id",
      recipient_field: "to",
      message_field: "body",
    },
  });
  assert.equal(request.method, "GET");
  assert.equal(request.body, undefined);
  assert.equal(new URL(request.url).searchParams.get("to"), "639171234567");
  assert.equal(request.headers.Authorization, `Basic ${Buffer.from("account-id:password-token").toString("base64")}`);
});

test("generic provider extracts nested provider message IDs", () => {
  assert.equal(readPath([{ message_id: 123 }], "0.message_id"), "123");
  assert.equal(readPath({ data: { id: "msg-8" } }, "data.id"), "msg-8");
  assert.equal(readPath({ data: {} }, "data.id"), null);
});

test("generic provider blocks non-HTTPS and local/private endpoints", () => {
  assert.throws(() => assertSafeSmsProviderUrl("http://sms.example.com/send"), /HTTPS/);
  assert.throws(() => assertSafeSmsProviderUrl("https://localhost/send"), /local\/private/);
  assert.throws(() => assertSafeSmsProviderUrl("https://192.168.1.4/send"), /local\/private/);
  assert.doesNotThrow(() => assertSafeSmsProviderUrl("https://sms.example.com/send"));
});


test("provider credentials are server-only and derive from provider code", () => {
  assert.equal(smsProviderCredentialEnvKey("semaphore"), "SEMAPHORE_API_KEY");
  assert.equal(smsProviderCredentialEnvKey("My SMS Provider"), "SMS_PROVIDER_MY_SMS_PROVIDER_API_KEY");
  assert.throws(() => smsProviderCredentialEnvKey(""), /Provider code is required/);
});
