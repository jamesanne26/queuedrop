import test from "node:test";
import assert from "node:assert/strict";
import { assertSafeSmsProviderUrl, buildGenericSmsRequest, isSafeProviderField, readPath, smsProviderCredentialEnvKey } from "../../lib/notifications/sms-provider-config.ts";

test("provider credential env names are normalized", () => {
  assert.equal(smsProviderCredentialEnvKey("semaphore"), "SEMAPHORE_API_KEY");
  assert.equal(smsProviderCredentialEnvKey("Twilio PH"), "SMS_PROVIDER_TWILIO_PH_API_KEY");
  assert.throws(() => smsProviderCredentialEnvKey("---"), /required/);
});

test("provider field names reject unsafe input", () => {
  assert.equal(isSafeProviderField("payload.message"), true);
  assert.equal(isSafeProviderField("headers[X-Key]"), true);
  assert.equal(isSafeProviderField("bad field"), false);
  assert.equal(isSafeProviderField("x&y"), false);
});

test("provider URLs require HTTPS and block local/private networks", () => {
  assert.equal(assertSafeSmsProviderUrl("https://api.example.com/send").hostname, "api.example.com");
  for (const url of ["http://api.example.com", "https://localhost/x", "https://127.0.0.1/x", "https://10.1.2.3/x", "https://192.168.1.5/x", "https://172.16.0.1/x"]) {
    assert.throws(() => assertSafeSmsProviderUrl(url));
  }
});

test("generic form POST request places body API key safely", () => {
  const req = buildGenericSmsRequest({ apiBaseUrl:"https://sms.example.com/send", apiKey:"secret", senderName:"QueueDrop", recipient:"639171234567", message:"hello", config:{transport:"generic_http"} });
  assert.equal(req.method, "POST");
  assert.equal(req.headers["content-type"], "application/x-www-form-urlencoded");
  const body = new URLSearchParams(req.body);
  assert.equal(body.get("number"), "639171234567");
  assert.equal(body.get("message"), "hello");
  assert.equal(body.get("apikey"), "secret");
});

test("generic JSON request supports bearer auth", () => {
  const req = buildGenericSmsRequest({ apiBaseUrl:"https://sms.example.com/send", apiKey:"abc", recipient:"639171234567", message:"hello", config:{transport:"generic_http", body_format:"json", api_key_location:"bearer"} });
  assert.equal(req.headers.Authorization, "Bearer abc");
  assert.equal(JSON.parse(req.body).message, "hello");
});

test("readPath resolves object and array response IDs", () => {
  assert.equal(readPath({ data:{ id:123 } }, "data.id"), "123");
  assert.equal(readPath([{ message_id:"m1" }], "0.message_id"), "m1");
  assert.equal(readPath({ data:{} }, "data.none"), null);
});
