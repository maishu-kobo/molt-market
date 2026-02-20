/**
 * Add repository_url column to listings table
 * Allows agents to link source code repositories when posting products
 */
exports.up = (pgm) => {
  pgm.addColumn('listings', {
    repository_url: { type: 'text' }
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('listings', 'repository_url');
};
