#!/usr/bin/env node
/**
 * Blogger CRM — MCP Server (read-only)
 * Ключ передаётся прямо в URL, OAuth Client ID оставить пустым.
 *
 * URL для коннектора Claude:
 * https://blogger-crm.onrender.com/mcp/<MCP_KEY>
 */

const readline = require('readline');

// Ключ берётся из переменной окружения или первого аргумента
const API_KEY = process.env.MCP_KEY || process.argv[2] || '';
const CRM_BASE = process.env.CRM_URL || 'https://blogger-crm.onrender.com';

async function callCRM(path) {
  const url = `${CRM_BASE}/mcp${path}`;
  const res = await fetch(url, { headers: { 'x-api-key': API_KEY } });
  if (!res.ok) throw new Error(`CRM error ${res.status}: ${await res.text()}`);
  return res.json();
}

const TOOLS = [
  {
    name: 'get_bloggers',
    description: 'Все блогеры: ник, ссылки, подписчики, охваты, цены, статус, менеджер.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_payments',
    description: 'Все оплаты: сумма, статус, блогер, менеджер, дата.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_barters',
    description: 'Все бартеры: блогер, город, адрес, товары, статус, менеджер.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_tz_requests',
    description: 'Все запросы ТЗ: ник, товар, формат, статус, менеджер.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_products',
    description: 'Товары и варианты ТЗ.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_expenses',
    description: 'Расходы.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_stats',
    description: 'Сводная статистика CRM по всем менеджерам.',
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

const rl = readline.createInterface({ input: process.stdin });

async function handle(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return { id, result: {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'mixit-crm', version: '1.0.0' },
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
