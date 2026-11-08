'use strict';

/**
 * Public order numbers: SQ-2026-000123
 *
 * The counter comes from a Postgres sequence (`order_number_seq`, created in the
 * first migration), so two concurrent orders can never be handed the same
 * number — unlike a `MAX(order_number) + 1` read.
 */

/** @param {number|bigint} seq @param {number} [year] */
function formatOrderNumber(seq, year = new Date().getFullYear()) {
  const n = typeof seq === 'bigint' ? seq : BigInt(Math.trunc(Number(seq)));
  return `SQ-${year}-${n.toString().padStart(6, '0')}`;
}

/**
 * Pull the next value from the sequence. Takes a Prisma client or transaction
 * client, so it can run inside the order-creation transaction.
 *
 * @param {{ $queryRaw: Function }} prismaOrTx
 * @returns {Promise<string>}
 */
async function nextOrderNumber(prismaOrTx) {
  const rows = await prismaOrTx.$queryRaw`SELECT nextval('order_number_seq') AS seq`;
  const seq = rows[0].seq;
  return formatOrderNumber(seq);
}

module.exports = { formatOrderNumber, nextOrderNumber };
