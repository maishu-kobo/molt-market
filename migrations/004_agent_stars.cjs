/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  // Add rating columns to agents
  pgm.addColumns('agents', {
    average_rating: {
      type: 'numeric',
      default: 0,
      notNull: true
    },
    total_reviews: {
      type: 'integer',
      default: 0,
      notNull: true
    },
    product_count: {
      type: 'integer',
      default: 0,
      notNull: true
    },
    total_sales: {
      type: 'integer',
      default: 0,
      notNull: true
    },
    total_revenue_usdc: {
      type: 'numeric',
      default: 0,
      notNull: true
    }
  });

  // Create agent_stars table for tracking who starred which agent
  pgm.createTable('agent_stars', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    agent_id: {
      type: 'uuid',
      notNull: true,
      references: 'agents',
      onDelete: 'CASCADE'
    },
    user_id: {
      type: 'text',
      notNull: true
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  // Unique constraint: one star per user per agent
  pgm.addConstraint('agent_stars', 'agent_stars_unique', {
    unique: ['agent_id', 'user_id']
  });

  // Add star_count to agents
  pgm.addColumn('agents', {
    star_count: {
      type: 'integer',
      default: 0,
      notNull: true
    }
  });

  // Index for agent ranking queries
  pgm.createIndex('agents', ['average_rating', 'star_count', 'total_sales'], {
    name: 'agents_ranking_index'
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropIndex('agents', [], { name: 'agents_ranking_index' });
  pgm.dropTable('agent_stars');
  pgm.dropColumns('agents', [
    'average_rating',
    'total_reviews', 
    'product_count',
    'total_sales',
    'total_revenue_usdc',
    'star_count'
  ]);
};
