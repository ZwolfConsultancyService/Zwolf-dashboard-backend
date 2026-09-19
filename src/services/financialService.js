import Client from '../models/Client.js';
import Payment from '../models/Payment.js';

/**
 * Recalculates totalPaid and remainingAmount for a client
 * based on all its payment records. Backend is the source of truth.
 */
export const recalculateClientTotals = async (clientId) => {
  const client = await Client.findById(clientId);
  if (!client) return null;

  const result = await Payment.aggregate([
    { $match: { client: client._id } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  const totalPaid = result[0]?.total || 0;
  const remainingAmount = Math.max(0, client.totalAmount - totalPaid);

  client.totalPaid = totalPaid;
  client.remainingAmount = remainingAmount;
  await client.save();

  return client;
};