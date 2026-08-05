const msLookup = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

function parseExpiryToDate(value) {
  if (!value || typeof value !== "string") {
    return new Date(Date.now() + 7 * msLookup.d);
  }

  const match = value.trim().match(/^(\d+)([mhd])$/i);

  if (!match) {
    return new Date(Date.now() + 7 * msLookup.d);
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const duration = amount * msLookup[unit];

  return new Date(Date.now() + duration);
}

module.exports = {
  parseExpiryToDate,
};
