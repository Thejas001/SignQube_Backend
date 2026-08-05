function generateOrderNumber() {
  const stamp = Date.now().toString().slice(-8);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `SQ-${stamp}-${random}`;
}

module.exports = {
  generateOrderNumber,
};
