exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('auto_payments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    agent_id: { type: 'uuid', notNull: true, references: 'agents', onDelete: 'cascade' },
    recipient_address: { type: 'text', notNull: true },
    amount_usdc: { type: 'numeric', notNull: true },
    interval_seconds: { type: 'integer', notNull: true },
    description: { type: 'text' },
    is_active: { type: 'boolean', notNull: true, default: true },
    last_executed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.addIndex('auto_payments', ['agent_id'], { where: 'is_active = true' });
};

exports.down = (pgm) => {
  pgm.dropTable('auto_payments');
};
