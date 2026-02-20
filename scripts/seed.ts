import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if already seeded
    const existing = await client.query('SELECT count(*) FROM agents');
    if (Number(existing.rows[0].count) > 0) {
      console.log('[Seed] Data already exists, skipping.');
      return;
    }

    // --- Agents (using Anvil default accounts for wallet addresses) ---
    const agent1 = await client.query(
      `INSERT INTO agents (id, did, owner_id, name, wallet_address, kms_key_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING *`,
      ['did:ethr:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 'owner-alice', 'OpenClaw Alpha', '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', "local:m/44'/60'/0'/0/10"]
    );
    const agent2 = await client.query(
      `INSERT INTO agents (id, did, owner_id, name, wallet_address, kms_key_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING *`,
      ['did:ethr:0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 'owner-bob', 'DeepBuilder Beta', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', "local:m/44'/60'/0'/0/11"]
    );

    const a1 = agent1.rows[0];
    const a2 = agent2.rows[0];
    console.log(`[Seed] Agent: ${a1.name} (${a1.id})`);
    console.log(`[Seed] Agent: ${a2.name} (${a2.id})`);

    // --- Listings ---
    const listings = [
      { agent: a1, title: 'TaskFlow — AI Task Manager', desc: 'Intelligent task management web app with auto-prioritization powered by GPT-4.', url: 'https://taskflow.openclaw.dev', type: 'web', price: 29.99 },
      { agent: a1, title: 'CodeLens CLI', desc: 'CLI tool that analyzes codebases and generates architecture diagrams.', url: 'https://codelens.openclaw.dev', type: 'cli', price: 14.99 },
      { agent: a1, title: 'DataPipe API', desc: 'RESTful API for real-time data transformation and ETL pipelines.', url: 'https://datapipe.openclaw.dev', type: 'api', price: 49.99 },
      { agent: a2, title: 'PixelForge — Image Generator', desc: 'AI-powered image generation service with style transfer capabilities.', url: 'https://pixelforge.openclaw.dev', type: 'web', price: 19.99 },
      { agent: a2, title: 'chat-widget.js', desc: 'Embeddable chat widget library with AI support agent built in.', url: 'https://chatwidget.openclaw.dev', type: 'library', price: 9.99 },
    ];

    const listingIds: string[] = [];
    for (const l of listings) {
      const result = await client.query(
        `INSERT INTO listings (id, agent_id, title, description, product_url, product_type, price_usdc)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6) RETURNING id`,
        [l.agent.id, l.title, l.desc, l.url, l.type, l.price]
      );
      listingIds.push(result.rows[0].id);
      console.log(`[Seed] Listing: ${l.title} ($${l.price})`);
    }

    // --- Reviews ---
    const reviews = [
      { listing: 0, buyer: 'buyer-carol', rating: 5, comment: 'Incredibly useful! Auto-prioritization saved me hours every week.' },
      { listing: 0, buyer: 'buyer-dave', rating: 4, comment: 'Great product. UI could be a bit more polished.' },
      { listing: 0, buyer: 'buyer-eve', rating: 5, comment: 'Best task manager I have used. The AI suggestions are spot on.' },
      { listing: 1, buyer: 'buyer-carol', rating: 4, comment: 'Really helpful for documenting legacy codebases.' },
      { listing: 2, buyer: 'buyer-dave', rating: 5, comment: 'Rock-solid API. Handles millions of records without breaking a sweat.' },
      { listing: 3, buyer: 'buyer-eve', rating: 3, comment: 'Image quality is good but generation is a bit slow.' },
      { listing: 3, buyer: 'buyer-carol', rating: 4, comment: 'Style transfer feature is amazing!' },
      { listing: 4, buyer: 'buyer-dave', rating: 5, comment: 'Drop-in solution. Had it running in 5 minutes.' },
    ];

    for (const r of reviews) {
      await client.query(
        `INSERT INTO reviews (id, listing_id, buyer_id, rating, comment)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [listingIds[r.listing], r.buyer, r.rating, r.comment]
      );
    }

    // Update listing stats
    for (let i = 0; i < listingIds.length; i++) {
      await client.query(
        `UPDATE listings SET
           average_rating = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM reviews WHERE listing_id = $1), 0),
           review_count = (SELECT COUNT(*) FROM reviews WHERE listing_id = $1)
         WHERE id = $1`,
        [listingIds[i]]
      );
    }

    console.log(`[Seed] ${reviews.length} reviews added`);

    await client.query('COMMIT');
    console.log('[Seed] Done!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed] Failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
