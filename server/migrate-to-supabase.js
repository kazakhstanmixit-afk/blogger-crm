/**
 * Migration script: lowdb (db.json) → Supabase PostgreSQL
 * Run once on Render: node migrate-to-supabase.js
 */

const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const { Pool } = require('pg');

const NEW_DB_URL = process.env.NEW_SUPABASE_URL ||
  'postgresql://postgres:AdminMarkt123!@db.aponjetlwtorjhavtudv.supabase.co:5432/postgres';

const pool = new Pool({
  connectionString: NEW_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

const adapter = new FileSync('db.json');
const db = low(adapter);

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function safe(v) {
  if (v === undefined || v === null || v === '' || v === 'undefined') return null;
  return v;
}

function safeNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

async function migrate() {
  const client = await pool.connect();
  console.log('Connected to new Supabase');

  try {
    // ── Create tables ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS bloggers (
        id TEXT PRIMARY KEY,
        name TEXT,
        instagram_url TEXT,
        tiktok_url TEXT,
        instagram_followers NUMERIC,
        tiktok_followers NUMERIC,
        instagram_avg_reach NUMERIC,
        tiktok_avg_reach NUMERIC,
        price_reels NUMERIC,
        price_tiktok NUMERIC,
        price_both NUMERIC,
        price_stories NUMERIC,
        cpv_reels NUMERIC,
        cpv_tiktok NUMERIC,
        cpv_both NUMERIC,
        status TEXT,
        category TEXT,
        manager_name TEXT,
        assigned_manager_id TEXT,
        manager_instagram TEXT,
        last_comment TEXT,
        notes TEXT,
        in_work BOOLEAN DEFAULT false,
        agent_status TEXT,
        agent_conversation JSONB,
        agent_extracted_prices JSONB,
        agent_last_action TIMESTAMPTZ,
        created_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ
      );
    `);
    console.log('✓ bloggers table created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        blogger_id TEXT,
        blogger_name TEXT,
        manager_id TEXT,
        manager_name TEXT,
        recipient_name TEXT,
        iin TEXT,
        payment_name TEXT,
        kaspi TEXT,
        amount NUMERIC,
        amount_video NUMERIC,
        amount_product NUMERIC,
        status TEXT,
        approval_url TEXT,
        notes TEXT,
        linked_payment_id TEXT,
        approval_groups JSONB,
        created_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ
      );
    `);
    console.log('✓ payments table created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'manager',
        instagram TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ users table created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_tasks (
        id TEXT PRIMARY KEY,
        blogger_id TEXT NOT NULL,
        manager_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        priority INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        scheduled_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ agent_tasks table created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_settings (
        key TEXT PRIMARY KEY,
        value JSONB,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Default settings
    await client.query(`
      INSERT INTO agent_settings (key, value) VALUES
        ('enabled', 'false'::jsonb),
        ('max_concurrent', '3'::jsonb),
        ('gemini_model', '"gemini-1.5-flash"'::jsonb)
      ON CONFLICT (key) DO NOTHING;
    `);
    console.log('✓ agent_settings table created');

    // ── Migrate users ──────────────────────────────────────────
    const users = db.get('users').value() || [];
    console.log(`Migrating ${users.length} users...`);
    for (const u of users) {
      await client.query(`
        INSERT INTO users (id, username, password_hash, role, instagram, created_at)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (id) DO UPDATE SET
          username=EXCLUDED.username, role=EXCLUDED.role,
          instagram=EXCLUDED.instagram
      `, [
        safe(u.id), safe(u.username), safe(u.password || u.passwordHash),
        safe(u.role) || 'manager', safe(u.instagram),
        safe(u.created_at) || new Date().toISOString()
      ]);
    }
    console.log(`✓ ${users.length} users migrated`);

    // ── Migrate bloggers ───────────────────────────────────────
    const bloggers = db.get('bloggers').value() || [];
    console.log(`Migrating ${bloggers.length} bloggers...`);
    const bChunks = chunk(bloggers, 100);
    let bCount = 0;
    for (const ch of bChunks) {
      for (const b of ch) {
        await client.query(`
          INSERT INTO bloggers (
            id,name,instagram_url,tiktok_url,
            instagram_followers,tiktok_followers,instagram_avg_reach,tiktok_avg_reach,
            price_reels,price_tiktok,price_both,price_stories,
            cpv_reels,cpv_tiktok,cpv_both,
            status,category,manager_name,assigned_manager_id,manager_instagram,
            last_comment,notes,in_work,created_at,updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
            $16,$17,$18,$19,$20,$21,$22,$23,$24,$25
          )
          ON CONFLICT (id) DO UPDATE SET
            name=EXCLUDED.name, instagram_url=EXCLUDED.instagram_url,
            status=EXCLUDED.status, manager_name=EXCLUDED.manager_name,
            assigned_manager_id=EXCLUDED.assigned_manager_id,
            price_reels=EXCLUDED.price_reels, price_tiktok=EXCLUDED.price_tiktok,
            price_both=EXCLUDED.price_both, price_stories=EXCLUDED.price_stories,
            notes=EXCLUDED.notes, updated_at=EXCLUDED.updated_at
        `, [
          safe(b.id), safe(b.name), safe(b.instagram_url), safe(b.tiktok_url),
          safeNum(b.instagram_followers), safeNum(b.tiktok_followers),
          safeNum(b.instagram_avg_reach), safeNum(b.tiktok_avg_reach),
          safeNum(b.price_reels), safeNum(b.price_tiktok),
          safeNum(b.price_both), safeNum(b.price_stories),
          safeNum(b.cpv_reels), safeNum(b.cpv_tiktok), safeNum(b.cpv_both),
          safe(b.status), safe(b.category), safe(b.manager_name),
          safe(b.assigned_manager_id), safe(b.manager_instagram),
          safe(b.last_comment), safe(b.notes),
          b.in_work === true || b.in_work === 'true' ? true : false,
          safe(b.created_at) || new Date().toISOString(),
          safe(b.updated_at) || new Date().toISOString()
        ]);
        bCount++;
      }
      process.stdout.write(`\r  ${bCount}/${bloggers.length} bloggers...`);
    }
    console.log(`\n✓ ${bCount} bloggers migrated`);

    // ── Migrate payments ───────────────────────────────────────
    const payments = db.get('payments').value() || [];
    console.log(`Migrating ${payments.length} payments...`);
    let pCount = 0;
    for (const p of payments) {
      await client.query(`
        INSERT INTO payments (
          id,blogger_id,blogger_name,manager_id,manager_name,
          recipient_name,iin,payment_name,kaspi,
          amount,amount_video,amount_product,
          status,approval_url,notes,linked_payment_id,approval_groups,
          created_at,updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
        )
        ON CONFLICT (id) DO UPDATE SET
          status=EXCLUDED.status, amount=EXCLUDED.amount,
          notes=EXCLUDED.notes, updated_at=EXCLUDED.updated_at,
          linked_payment_id=EXCLUDED.linked_payment_id
      `, [
        safe(p.id), safe(p.blogger_id), safe(p.blogger_name),
        safe(p.manager_id), safe(p.manager_name),
        safe(p.recipient_name), safe(p.iin), safe(p.payment_name), safe(p.kaspi),
        safeNum(p.amount), safeNum(p.amount_video), safeNum(p.amount_product),
        safe(p.status), safe(p.approval_url), safe(p.notes),
        safe(p.linked_payment_id),
        p.approval_groups ? JSON.stringify(p.approval_groups) : null,
        safe(p.created_at) || new Date().toISOString(),
        safe(p.updated_at) || new Date().toISOString()
      ]);
      pCount++;
    }
    console.log(`✓ ${pCount} payments migrated`);

    // ── Verify ─────────────────────────────────────────────────
    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM bloggers) as bloggers,
        (SELECT COUNT(*) FROM payments) as payments,
        (SELECT COUNT(*) FROM users) as users
    `);
    console.log('\n=== Migration complete ===');
    console.log('Bloggers in Supabase:', counts.rows[0].bloggers);
    console.log('Payments in Supabase:', counts.rows[0].payments);
    console.log('Users in Supabase:', counts.rows[0].users);

  } catch (e) {
    console.error('Migration error:', e.message);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(e => {
  console.error(e);
  process.exit(1);
});
