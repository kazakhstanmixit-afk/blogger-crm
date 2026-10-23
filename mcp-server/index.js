#!/usr/bin/env node
/**
 * Blogger CRM — MCP Server (read-only)
 * Подключается к CRM и даёт Claude читать все данные.
 *
 * Запуск: node index.js
 * Требует: node 18+
 */

const readline = require('readline');

const CRM_URL = process.env.CRM_URL || 'https://blogger-crm.onrender.com';
const API_KEY = process.env.CRM_API_KEY || 'mixit-crm-readonly-2026';

async function callCRM(path) {
  const url = `${CRM_URL}/mcp${path}`;
  const res = await fetch(url, { headers: { 'x-api-key': API_KEY } });
  if (!res.ok) throw new Error(`CRM error ${res.status}: ${await res.text()}`);
  return res.json();
}

const TOOLS = [
  {
    name: 'get_bloggers',
    description: 'Получить список всех блогеров из CRM. Возвращает ник, ссылки, подписчиков, охваты, цены, статус, менеджера.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_payments',
    description: 'Получить все оплаты блогерам. Возвращает сумму, статус, блогера, менеджера, дату.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_barters',
    description: 'Получить все бартерные запросы. Возвращает блогера, город, адрес, товары, статус, менеджера.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_tz_requests',
    description: 'Получить все запросы ТЗ (технические задания). Возвращает ник, товар, формат, статус, менеджера.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_products',
    description: 'Получить список товаров с их ТЗ (техническими заданиями).',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_expenses',
    description: 'Получить список расходов.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_stats',
    description: 'Получить сводную статистику CRM: общие цифры и разбивку по менеджерам.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

const TOOL_MAP = {
  get_bloggers:    () => callCRM('/bloggers'),
  get_payments:    () => callCRM('/payments'),
  get_barters:     () => callCRM('/barters'),
  get_tz_requests: () => callCRM('/tz-requests'),
  get_products:    () => callCRM('/products'),
  get_expenses:    () => callCRM('/expenses'),
  get_stats:       () => callCRM('/stats'),
};

// ── MCP JSON-RPC over stdio ───────────────────────────────────
const rl = readline.createInterface({ input: process.stdin });

async function handle(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return { id, result: {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'blogger-crm', version: '1.0.0' },
      capabilities: { tools: {} },
    }};
  }

  if (method === 'tools/list') {
    return { id, result: { tools: TOOLS } };
  }

  if (method === 'tools/call') {
    const { name } = params;
    const fn = TOOL_MAP[name];
    if (!fn) return { id, error: { code: -32601, message: `Unknown tool: ${name}` } };
    try {
      const data = await fn();
      return { id, result: {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      }};
    } catch (e) {
      return { id, error: { code: -32000, message: e.message } };
    }
  }

  if (method === 'notifications/initialized') return null;

  return { id, error: { code: -32601, message: `Unknown method: ${method}` } };
}

rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const response = await handle(msg);
  if (response) process.stdout.write(JSON.stringify(response) + '\n');
});
