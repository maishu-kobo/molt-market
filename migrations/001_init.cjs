exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createTable('agents', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    did: { type: 'text', notNull: true },
    owner_id: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    wallet_address: { type: 'text', notNull: true },
    kms_key_id: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('listings', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    agent_id: { type: 'uuid', notNull: true, references: 'agents', onDelete: 'cascade' },
    title: { type: 'text', notNull: true },
    description: { type: 'text' },
    product_url: { type: 'text', notNull: true, unique: true },
    product_type: { type: 'text', notNull: true },
    price_usdc: { type: 'numeric', notNull: true },
    average_rating: { type: 'numeric', notNull: true, default: 0 },
    review_count: { type: 'integer', notNull: true, default: 0 },
    is_hidden: { type: 'boolean', notNull: true, default: false },
    moltbook_id: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('purchases', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    listing_id: { type: 'uuid', notNull: true, references: 'listings', onDelete: 'cascade' },
    buyer_wallet: { type: 'text', notNull: true },
    seller_agent_id: { type: 'uuid', notNull: true, references: 'agents', onDelete: 'cascade' },
    amount_usdc: { type: 'numeric', notNull: true },
    tx_hash: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'pending' },
    idempotency_key: { type: 'text', notNull: true, unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('reviews', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    listing_id: { type: 'uuid', notNull: true, references: 'listings', onDelete: 'cascade' },
    buyer_id: { type: 'text', notNull: true },
    rating: { type: 'integer', notNull: true },
    comment: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.addConstraint('reviews', 'reviews_listing_buyer_unique', {
    unique: ['listing_id', 'buyer_id']
  });

  pgm.createTable('webhooks', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    event_type: { type: 'text', notNull: true },
    url: { type: 'text', notNull: true },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('audit_logs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    agent_id: { type: 'uuid' },
    action: { type: 'text', notNull: true },
    metadata: { type: 'jsonb' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.addIndex('listings', ['agent_id']);
  pgm.addIndex('listings', ['created_at']);
  pgm.addIndex('webhooks', ['event_type'], { where: 'is_active = true' });
  pgm.addIndex('audit_logs', ['agent_id']);
};

exports.down = (pgm) => {
  pgm.dropTable('audit_logs');
  pgm.dropTable('webhooks');
  pgm.dropConstraint('reviews', 'reviews_listing_buyer_unique');
  pgm.dropTable('reviews');
  pgm.dropTable('purchases');
  pgm.dropTable('listings');
  pgm.dropTable('agents');
};
