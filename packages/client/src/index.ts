import { z } from 'zod';
import { validateAndFormatBrokerUrl } from './validation/broker-url.js';
import {
  AccessSchema,
  ConnectionsSchema,
  HealthSchema,
  RequestInputSchema,
  type RequestInput,
} from '@featherlane/contracts';

/** Exposes HTTP status without copying potentially sensitive upstream response bodies. */
export class BrokerError extends Error {
  constructor(public readonly status: number) {
    super('Broker request failed (' + status + ')');
  }
}

/**
 * Agent-facing transport shared by CLI and MCP integrations. The broker owns
 * authorization decisions; this client validates the wire contract, not policy.
 * It intentionally provides no owner approval methods or automatic retries.
 */
export class FeatherlaneClient {
  private readonly baseUrl: string;

  constructor(private readonly options: { baseUrl: string; token: string; fetch?: typeof fetch }) {
    const baseUrl = validateAndFormatBrokerUrl(options.baseUrl);

    if (!options.token) {
      throw new Error('An agent token is required');
    }

    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    /*
     * Reject redirects so credential-bearing calls stay at the configured endpoint.
     * Bound the wait and validate successful responses before exposing them to callers.
     */
    const response = await (this.options.fetch ?? fetch)(this.baseUrl + path, {
      method,
      headers: {
        authorization: 'Bearer ' + this.options.token,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });

    if (!response.ok) {
      throw new BrokerError(response.status);
    }

    return schema.parse(await response.json());
  }

  health() {
    return this.request('/health', HealthSchema);
  }

  connections() {
    return this.request('/v1/connections', ConnectionsSchema);
  }

  /**
   * Keep the same idempotency key and payload when retrying an uncertain result.
   * A new key means a new request, not a retry of an existing authorization.
   */
  requestAccess(input: RequestInput) {
    return this.request('/v1/access', AccessSchema, 'POST', RequestInputSchema.parse(input));
  }

  getAccess(id: string) {
    return this.request('/v1/access/' + encodeURIComponent(id), AccessSchema);
  }

  releaseAccess(id: string) {
    return this.request(
      '/v1/access/' + encodeURIComponent(id) + '/release',
      AccessSchema,
      'POST',
      {},
    );
  }
}
