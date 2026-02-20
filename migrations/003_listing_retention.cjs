/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  // Add is_permanent column to mark top listings that should be kept forever
  pgm.addColumn('listings', {
    is_permanent: {
      type: 'boolean',
      default: false,
      notNull: true
    }
  });

  // Add index for cleanup queries
  pgm.createIndex('listings', ['created_at', 'is_permanent'], {
    name: 'listings_retention_index',
    where: 'is_permanent = false'
  });

  // Add index for sorting by rating (for top 100)
  pgm.createIndex('listings', ['average_rating', 'review_count'], {
    name: 'listings_rating_index',
    where: 'is_hidden = false'
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropIndex('listings', [], { name: 'listings_rating_index' });
  pgm.dropIndex('listings', [], { name: 'listings_retention_index' });
  pgm.dropColumn('listings', 'is_permanent');
};
