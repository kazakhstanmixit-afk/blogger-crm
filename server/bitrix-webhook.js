/**
 * Bitrix24 Open Lines webhook receiver — Stage 1 only.
 *
 * Receives Bitrix24 events and stores a minimal event record in lowdb.
 * It deliberately does NOT send messages or modify blogger statuses/prices.
 *
 * Render environment variable required:
 *   BITRIX_EVENT_TOKEN = long random token used in the registered event URL:
 *   https://<render-host>/webhooks/bitrix24/events?token=<BITRIX_EVENT_TOKEN>
 */
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

module.exports = function bitrixWebhookModule(app, db) {
  db.defaults({ bitrix_events: [] }).write();

  const token = process.env.BITRIX_EVENT_TOKEN || '';

  function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
    const aa = Buffer.from(a);
    const bb = Buffer.from(b);
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
  }

  function getValue(obj, paths) {
    for (const path of paths) {
      let value = obj;
      for (const part of path.split('.')) value = value && value[part];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
  }

  function parseMaybeJson(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return value;
    try { return JSON.parse(trimmed); } catch (_) { return value; }
  }

  // Bitrix24 commonly sends application/x-www-form-urlencoded with nested data[...].
  app.post(
    '/webhooks/bitrix24/events',
    require('express').urlencoded({ extended: true, limit: '256kb' }),
    require('express').json({ limit: '256kb' }),
    (req, res) => {
      if (!token) {
        console.error('[Bitrix webhook] BITRIX_EVENT_TOKEN is not configured');
        return res.status(503).json({ ok: false, error: 'Webhook receiver is not configured' });
      }
      if (!safeEqual(req.query.token, token)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const data = parseMaybeJson(body.data || {});
      const dataObject = data && typeof data === 'object' ? data : {};
      // Supported shapes:
      // 1) ONIMBOTV2MESSAGEADD: data.chat + data.message
      // 2) ONOPENLINEMESSAGEADD: data.DATA[0].chat/message/connector
      // 3) Legacy nested PARAMS payloads (kept for compatibility).
      const lineItem = Array.isArray(dataObject.DATA) ? (dataObject.DATA[0] || {}) : {};
      const messageObject = dataObject.message || lineItem.message || {};
      const chatObject = dataObject.chat || lineItem.chat || {};
      const connectorObject = dataObject.connector || lineItem.connector || {};
      const params = dataObject.PARAMS || {};

      const eventName = String(body.event || body.EVENT || 'UNKNOWN').slice(0, 120);
      const messageId = getValue(messageObject, ['id', 'message_id', 'messageId']) ||
        getValue(lineItem, ['message.id', 'MESSAGE_ID', 'ID']) ||
        getValue(dataObject, ['PARAMS.MESSAGE_ID', 'PARAMS.ID', 'MESSAGE_ID', 'message_id']);
      const chatId = getValue(chatObject, ['id', 'chat_id', 'chatId']) ||
        getValue(connectorObject, ['chat_id', 'CHAT_ID']) ||
        getValue(params, ['CHAT_ID', 'TO_CHAT_ID', 'chat_id']);
      const senderId = getValue(messageObject, ['user_id', 'author_id', 'authorId', 'userId']) ||
        getValue(chatObject, ['user_id', 'USER_ID']) ||
        getValue(connectorObject, ['user_id', 'USER_ID']) ||
        getValue(params, ['FROM_USER_ID', 'AUTHOR_ID', 'from_user_id']);
      const messageText = getValue(messageObject, ['text', 'TEXT']) ||
        getValue(lineItem, ['MESSAGE', 'message_text']) ||
        getValue(params, ['MESSAGE', 'message', 'TEXT']);
      const lineId = getValue(connectorObject, ['line_id', 'LINE_ID']) ||
        getValue(dataObject, ['LINE', 'LINE_ID', 'PARAMS.LINE_ID', 'PARAMS.OPENLINE_ID']) ||
        getValue(params, ['LINE_ID', 'OPENLINE_ID', 'line_id']);

      const eventKey = messageId
        ? `${eventName}:${String(messageId)}`
        : `${eventName}:${uuidv4()}`;
      const existing = db.get('bitrix_events').find({ event_key: eventKey }).value();
      if (existing) return res.status(200).json({ ok: true, duplicate: true });

      const record = {
        id: uuidv4(),
        event_key: eventKey,
        event_name: eventName,
        message_id: messageId === null ? null : String(messageId),
        chat_id: chatId === null ? null : String(chatId),
        sender_id: senderId === null ? null : String(senderId),
        line_id: lineId === null ? null : String(lineId),
        message_text: messageText === null ? null : String(messageText).slice(0, 10000),
        received_at: new Date().toISOString()
      };

      db.get('bitrix_events').push(record).write();
      // Keep the event log bounded while preserving recent messages for diagnostics.
      const events = db.get('bitrix_events').value() || [];
      if (events.length > 1000) {
        db.set('bitrix_events', events.slice(-1000)).write();
      }

      console.log('[Bitrix webhook] event received', JSON.stringify({
        event_name: record.event_name,
        message_id: record.message_id,
        chat_id: record.chat_id,
        line_id: record.line_id,
        has_message_text: Boolean(record.message_text)
      }));

      return res.status(200).json({ ok: true, duplicate: false });
    }
  );

  app.get('/webhooks/bitrix24/health', (_req, res) => {
    res.json({
      ok: true,
      receiver: 'bitrix24',
      token_configured: Boolean(token),
      mode: 'receive-only'
    });
  });
};
