import { Prisma, type PrismaClient, type ReservationState } from '@taavon/database';
import type { DirectConversationPort } from '../messaging/direct-conversation.port';
import type { ReservationRecord, ReservationRepository } from './reservation.service';

type CardReservationRow = Prisma.CardReservationGetPayload<Record<string, never>>;

function toRecord(row: CardReservationRow): ReservationRecord {
  return {
    id: row.id,
    cardId: row.cardId,
    ownerId: row.ownerId,
    reserverId: row.reserverId,
    state: row.state,
    version: row.version,
    conversationId: row.conversationId,
    closeReason: row.closeReason,
  };
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

const CARD_EVENT_TYPE: Record<ReservationState, string> = {
  ACTIVE: 'card.reservation_reopened',
  RESERVED: 'card.reservation_reserved',
  IN_USE: 'card.reservation_marked_in_use',
  RESERVATION_CLOSED: 'card.reservation_closed',
};

export function createPrismaReservationRepository(
  prisma: PrismaClient,
  conversationPort: DirectConversationPort
): ReservationRepository {
  return {
    async getCardForReservation(cardId) {
      const card = await prisma.card.findUnique({
        where: { id: cardId },
        select: { authorId: true, status: true, space: { select: { status: true } } },
      });
      return card ? { ownerId: card.authorId, cardStatus: card.status, spaceStatus: card.space.status } : null;
    },

    async findByCardId(cardId) {
      const row = await prisma.cardReservation.findUnique({ where: { cardId } });
      return row ? toRecord(row) : null;
    },

    async findById(id) {
      const row = await prisma.cardReservation.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    },

    async reserve({ cardId, ownerId, reserverId }) {
      return prisma.$transaction(async (tx) => {
        let row = await tx.cardReservation.findUnique({ where: { cardId } });

        if (!row) {
          try {
            row = await tx.cardReservation.create({
              data: { cardId, ownerId, reserverId, state: 'RESERVED', version: 1 },
            });
          } catch (err) {
            if (isUniqueConstraintViolation(err)) return null; // someone else's concurrent first-reserve won
            throw err;
          }
        } else {
          const updated = await tx.cardReservation.updateMany({
            where: { id: row.id, version: row.version, state: 'ACTIVE' },
            data: { state: 'RESERVED', reserverId, version: { increment: 1 } },
          });
          if (updated.count === 0) return null; // lost the CAS race, or it was no longer ACTIVE
          row = await tx.cardReservation.findUniqueOrThrow({ where: { id: row.id } });
        }

        const conversation = await conversationPort.getOrCreateDirectConversation(tx, ownerId, reserverId);
        row = await tx.cardReservation.update({ where: { id: row.id }, data: { conversationId: conversation.conversationId } });

        await tx.cardEvent.create({
          data: {
            cardId,
            eventType: CARD_EVENT_TYPE.RESERVED,
            actorId: reserverId,
            payload: { reservationId: row.id, conversationId: conversation.conversationId },
          },
        });
        await tx.awarenessEvent.create({
          data: {
            type: 'RESERVED',
            actorId: reserverId,
            subjectId: cardId,
            deepLink: `/cards/${cardId}`,
            idempotencyKey: `reservation:${row.id}:v${row.version}:RESERVED`,
          },
        });
        await tx.awarenessEvent.create({
          data: {
            type: 'PRIVATE_CHAT_STARTED',
            actorId: reserverId,
            subjectId: cardId,
            deepLink: `/chats/${conversation.conversationId}`,
            idempotencyKey: `reservation:${row.id}:v${row.version}:PRIVATE_CHAT_STARTED`,
          },
        });

        return { reservation: toRecord(row) };
      });
    },

    async transition({ id, expectedVersion, toState, actorId, reserverId, releaseReason, closeReason, logAwarenessClosed }) {
      return prisma.$transaction(async (tx) => {
        const data: Prisma.CardReservationUncheckedUpdateManyInput = { state: toState, version: { increment: 1 } };
        if (reserverId !== undefined) data.reserverId = reserverId;
        if (releaseReason !== undefined) data.releaseReason = releaseReason;
        if (closeReason !== undefined && closeReason !== null) data.closeReason = closeReason;
        if (toState === 'IN_USE') data.inUseAt = new Date();
        if (toState === 'RESERVATION_CLOSED') data.closedAt = new Date();

        const updated = await tx.cardReservation.updateMany({ where: { id, version: expectedVersion }, data });
        if (updated.count === 0) return null;

        const row = await tx.cardReservation.findUniqueOrThrow({ where: { id } });

        await tx.cardEvent.create({
          data: {
            cardId: row.cardId,
            eventType: CARD_EVENT_TYPE[toState],
            actorId,
            payload: { reservationId: row.id, toState, closeReason: row.closeReason },
          },
        });

        if (logAwarenessClosed) {
          await tx.awarenessEvent.create({
            data: {
              type: 'RESERVATION_CLOSED',
              actorId,
              subjectId: row.cardId,
              deepLink: `/cards/${row.cardId}`,
              idempotencyKey: `reservation:${row.id}:v${row.version}:RESERVATION_CLOSED`,
            },
          });
        }

        return toRecord(row);
      });
    },
  };
}
