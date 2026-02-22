exports.shorthands = undefined;

exports.up = (pgm) => {
  // Append-only event log for experiment instrumentation
  pgm.createTable('experiment_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    ts: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    experiment_id: { type: 'text', notNull: true },
    condition: { type: 'text', notNull: true, default: 'A' },
    agent_id: { type: 'text' },
    session_id: { type: 'text' },
    event: { type: 'text', notNull: true },
    product_id: { type: 'uuid' },
    price_usdc: { type: 'numeric' },
    tx_hash: { type: 'text' },
    status: { type: 'text' },
    reason: { type: 'text' },
    metadata: { type: 'jsonb' }
  });

  pgm.addIndex('experiment_events', ['experiment_id', 'ts']);
  pgm.addIndex('experiment_events', ['experiment_id', 'event']);

  // Per agent/experiment budget tracking
  pgm.createTable('experiment_budgets', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    experiment_id: { type: 'text', notNull: true },
    agent_id: { type: 'text', notNull: true },
    initial_budget_usdc: { type: 'numeric', notNull: true },
    current_budget_usdc: { type: 'numeric', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.addConstraint('experiment_budgets', 'experiment_budgets_exp_agent_unique', {
    unique: ['experiment_id', 'agent_id']
  });

  // Condition B task system
  pgm.createTable('experiment_tasks', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    experiment_id: { type: 'text', notNull: true },
    agent_id: { type: 'text', notNull: true },
    title: { type: 'text', notNull: true },
    description: { type: 'text' },
    deadline_ts: { type: 'timestamptz' },
    reward_usdc: { type: 'numeric', notNull: true, default: 0 },
    penalty_type: { type: 'text' },
    penalty_value: { type: 'numeric', default: 0 },
    status: { type: 'text', notNull: true, default: 'assigned' },
    result: { type: 'jsonb' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.addIndex('experiment_tasks', ['experiment_id', 'status']);
  pgm.addIndex('experiment_tasks', ['experiment_id', 'agent_id']);

  // On-chain transaction verification queue
  pgm.createTable('tx_verifications', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tx_hash: { type: 'text', notNull: true, unique: true },
    experiment_id: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'pending' },
    gas_used: { type: 'numeric' },
    revert_reason: { type: 'text' },
    block_number: { type: 'bigint' },
    attempts: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
};

exports.down = (pgm) => {
  pgm.dropTable('tx_verifications');
  pgm.dropTable('experiment_tasks');
  pgm.dropConstraint('experiment_budgets', 'experiment_budgets_exp_agent_unique');
  pgm.dropTable('experiment_budgets');
  pgm.dropTable('experiment_events');
};
