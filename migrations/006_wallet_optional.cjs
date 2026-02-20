/**
 * Make wallet_address optional for agents
 * Wallet is only required for payments, not registration
 */
exports.up = (pgm) => {
  pgm.alterColumn('agents', 'wallet_address', {
    notNull: false
  });
};

exports.down = (pgm) => {
  // Note: This will fail if there are null values
  pgm.alterColumn('agents', 'wallet_address', {
    notNull: true
  });
};
