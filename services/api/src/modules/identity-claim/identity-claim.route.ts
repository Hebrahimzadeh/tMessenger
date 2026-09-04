import type { FastifyInstance } from 'fastify';
import { myIdentityClaimResponseSchema, submitIdentityClaimBodySchema } from '@taavon/contracts';
import { apiError } from '../../lib/api-error';
import { requireSession } from '../auth/session-guard';
import { createPrismaIdentityClaimRepository } from './identity-claim.repository';
import { EmptyEvidenceError, submitIdentityClaim, type IdentityClaimRepository } from './identity-claim.service';

export interface IdentityClaimRouteOptions {
  sessionHmacKey: string;
  phoneEncryptionKey: string;
  identityClaimRepository?: IdentityClaimRepository;
}

export async function identityClaimRoutes(app: FastifyInstance, opts: IdentityClaimRouteOptions) {
  function repo(): IdentityClaimRepository {
    return opts.identityClaimRepository ?? createPrismaIdentityClaimRepository(app.db);
  }

  app.get('/identity-claim', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;

    const claim = await repo().findByUserId(user.userId);
    if (!claim) {
      return reply.code(404).send(apiError(request, 'CLAIM_NOT_FOUND', 'هنوز مدرکی ثبت نکرده‌اید.'));
    }
    return myIdentityClaimResponseSchema.parse(claim);
  });

  app.post('/identity-claim', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const body = submitIdentityClaimBodySchema.parse(request.body);

    try {
      await submitIdentityClaim(repo(), opts.phoneEncryptionKey, user.userId, body.evidence);
      return myIdentityClaimResponseSchema.parse({ status: 'PENDING' });
    } catch (err) {
      if (err instanceof EmptyEvidenceError) {
        return reply.code(422).send(apiError(request, 'EVIDENCE_REQUIRED', 'ارائهٔ مدرک الزامی است.'));
      }
      throw err;
    }
  });
}
