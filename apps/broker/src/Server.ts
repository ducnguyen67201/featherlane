import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import { DecisionSchema, RequestInputSchema } from '@featherlane/contracts';
import { AccessErrorCode, connections, DomainError } from './domain/Access.js';
import type { AccessService } from './application/AccessService.js';
import type { BrokerConfig } from './Config.js';

function matches(value: string, expected: string): boolean {
  const a = Buffer.from(value);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * HTTP boundary: validate untrusted payloads and authenticate each role before
 * calling the access service. Separate Fastify scopes keep owner-only operations
 * out of the agent API; host/origin checks supplement, not replace, bearer auth.
 */
export async function createServer(
  config: BrokerConfig,
  service: AccessService,
  staticDir?: string,
) {
  const app = Fastify({ logger: false, bodyLimit: 8192, requestTimeout: 10_000 });

  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  if (staticDir) {
    await app.register(fastifyStatic, { root: staticDir });
  }

  const origins = new Set([
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:' + config.port,
    'http://localhost:' + config.port,
  ]);

  app.addHook('onRequest', async (request, reply) => {
    // Loopback binding alone does not prevent DNS rebinding or hostile browser origins.
    if (!['127.0.0.1', 'localhost'].includes(request.hostname)) {
      return reply.code(403).send({ error: 'forbidden_host' });
    }

    if (request.headers.origin && !origins.has(request.headers.origin)) {
      return reply.code(403).send({ error: 'forbidden_origin' });
    }
  });

  /*
   * Return stable error codes, not raw exceptions or validation issues that could
   * contain submitted data. Expected domain errors remain actionable for callers.
   */
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: 'invalid_request' });
    }

    if (error instanceof DomainError) {
      return reply
        .code(error.code === AccessErrorCode.NOT_FOUND ? 404 : 409)
        .send({ error: error.code });
    }

    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;

    return reply
      .code(statusCode && statusCode >= 400 && statusCode < 500 ? statusCode : 500)
      .send({ error: 'request_failed' });
  });

  app.get('/health', async () => ({
    service: 'featherlane-broker',
    protocol: 'v1',
    mode: 'synthetic',
    browserExecution: false,
  }));

  await app.register(
    async (agent) => {
      agent.decorateRequest('actorId', '');

      agent.addHook('onRequest', async (request, reply) => {
        const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';

        const identity = config.agents.find(
          (item) =>
            matches(token, item.token) && request.headers.authorization?.startsWith('Bearer '),
        );

        if (!identity) {
          return reply.code(401).send({ error: 'unauthorized' });
        }

        /* Derive identity from the configured token, never from an agent's payload. */
        request.actorId = identity.id;
      });

      agent.get('/connections', async () => connections);

      agent.post('/access', async (request, reply) =>
        reply
          .code(201)
          .send(await service.request(RequestInputSchema.parse(request.body), request.actorId)),
      );

      agent.get('/access/:id', async (request) =>
        service.get(z.object({ id: z.uuid() }).parse(request.params).id, request.actorId),
      );

      agent.post('/access/:id/release', async (request) =>
        service.release(z.object({ id: z.uuid() }).parse(request.params).id, request.actorId),
      );

      agent.post('/browser/execute', async (_request, reply) =>
        reply.code(501).send({ error: 'protected_browser_runtime_not_implemented' }),
      );
    },
    { prefix: '/v1' },
  );

  await app.register(
    async (owner) => {
      owner.addHook('onRequest', async (request, reply) => {
        if (!matches(request.headers.authorization ?? '', 'Bearer ' + config.ownerToken)) {
          return reply.code(401).send({ error: 'unauthorized' });
        }
      });

      owner.get('/access', async () => (await service.list()).slice(0, 200));
      owner.get('/audit', async () => service.audit());

      owner.post('/access/:id/decision', async (request) =>
        service.decision(
          z.object({ id: z.uuid() }).parse(request.params).id,
          DecisionSchema.parse(request.body).decision,
        ),
      );

      owner.post('/access/:id/revoke', async (request) =>
        service.release(z.object({ id: z.uuid() }).parse(request.params).id),
      );
    },
    { prefix: '/v1/owner' },
  );

  return app;
}

declare module 'fastify' {
  interface FastifyRequest {
    actorId: string;
  }
}
