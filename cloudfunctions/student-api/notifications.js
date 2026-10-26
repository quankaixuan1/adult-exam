const { createHash } = require('crypto');

const eventId = (type, registrationId, version) => createHash('sha256')
  .update(`notification:${type}:${registrationId}:${version}`).digest('hex');

async function withTransaction(db, operation) {
  const transaction = await db.startTransaction();
  try {
    const result = await operation(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    try { await transaction.rollback(); } catch (_) { /* Preserve the original error. */ }
    throw error;
  }
}

async function addNotification(transaction, event) {
  const id = eventId(event.type, event.registrationId, `${event.registrationCreatedAt}:${event.version}`);
  await transaction.collection('notification_events').doc(id).set({
    data: { ...event, readBy: {} }
  });
}

function createInbox(db, identity, fail) {
  const readerKey = createHash('sha256').update(`${identity.audience}:${identity.readerId}`).digest('hex');
  const readField = `readBy.${readerKey}`;

  function query({ unread = true, id } = {}) {
    const match = { audience: identity.audience };
    if (identity.recipientId) match.recipientId = identity.recipientId;
    if (unread) match[readField] = db.command.exists(false);
    if (id) match._id = id;
    return db.collection('notification_events').aggregate()
      .match(match)
      .lookup({ from: 'registrations', localField: 'registrationId', foreignField: '_id', as: 'registration' })
      .unwind('$registration')
      .addFields({ currentRegistration: db.command.aggregate.eq(['$registration.createdAt', '$registrationCreatedAt']) })
      .match({ currentRegistration: true })
      .match(identity.registrationScope);
  }

  return {
    async list() {
      const [rows, count] = await Promise.all([
        query().sort({ createdAt: -1, _id: -1 }).limit(20).project({
          _id: 1, type: 1, registrationId: 1, createdAt: 1, kind: 1,
          status: 1, remark: 1, studentName: '$registration.name'
        }).end(),
        query().count('total').end()
      ]);
      return {
        notifications: rows.list.map(item => ({ ...item, id: item._id })),
        unreadTotal: count.list.length ? count.list[0].total : 0
      };
    },
    async read(id) {
      if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw fail('消息参数无效', 'INVALID_INPUT');
      const result = await query({ unread: false, id }).limit(1).end();
      if (!result.list.length) throw fail('消息不存在或无权查看', 'FORBIDDEN');
      await db.collection('notification_events').doc(id).update({
        data: { [readField]: new Date().toISOString() }
      });
      return { ok: true };
    }
  };
}

module.exports = { withTransaction, addNotification, createInbox };
