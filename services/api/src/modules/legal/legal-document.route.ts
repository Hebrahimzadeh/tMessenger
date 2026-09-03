import type { FastifyInstance } from 'fastify';
import { legalCurrentResponseSchema } from '@taavon/contracts';
import { createPrismaLegalDocumentRepository } from './legal-document.repository';
import { getCurrentLegalDocuments, type LegalDocumentRepository } from './legal-document.service';

export interface LegalRouteOptions {
  appOrigin: string;
  /** Test seam - defaults to the real Prisma-backed repository via app.db. */
  repository?: LegalDocumentRepository;
}

// GET /v1/legal/current is public (see the MVP endpoint list: health, legal
// current, and OTP request/verify are the only unauthenticated routes) - no
// session or role check here, by design, not by omission.
export async function legalRoutes(app: FastifyInstance, opts: LegalRouteOptions) {
  // Resolved per-request, not once at plugin registration: server.ts
  // registers databasePlugin *after* buildApp() (which registers this
  // plugin), and Fastify boots plugins in registration order, so app.db
  // would still be undefined if read here at registration time instead.
  app.get('/current', async () => {
    const repository = opts.repository ?? createPrismaLegalDocumentRepository(app.db);
    const current = await getCurrentLegalDocuments(repository, opts.appOrigin);
    return legalCurrentResponseSchema.parse(current);
  });
}
