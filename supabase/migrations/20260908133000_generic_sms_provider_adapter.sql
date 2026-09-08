-- Generic HTTP SMS provider adapter configuration.
-- QueueDrop already stores provider-specific non-secret settings in config JSONB.
-- This migration converts Semaphore to the same UI-driven adapter used by future
-- REST providers, so changing providers does not require queue/business-logic code.

update public.sms_delivery_methods
set config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
      'transport', 'generic_http',
      'http_method', 'POST',
      'body_format', 'form',
      'api_key_location', 'body',
      'api_key_field', 'apikey',
      'recipient_field', 'number',
      'message_field', 'message',
      'sender_field', 'sendername',
      'response_message_id_path', '0.message_id'
    ),
    api_base_url = coalesce(nullif(api_base_url, ''), 'https://api.semaphore.co/api/v4/messages'),
    secret_env_key = coalesce(nullif(secret_env_key, ''), 'SEMAPHORE_API_KEY'),
    updated_at = now()
where lower(coalesce(provider_code, '')) = 'semaphore';

comment on column public.sms_delivery_methods.config is
  'Non-secret provider adapter settings. Generic HTTP supports form/JSON body, API key in body/header/query/Bearer, field mappings, static params, headers, and response message-id path. Actual API secrets stay in server environment variables referenced by secret_env_key.';
