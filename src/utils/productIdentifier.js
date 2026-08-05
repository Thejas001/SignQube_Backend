const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getProductLookupWhere(productIdentifier) {
  if (typeof productIdentifier === "string" && UUID_PATTERN.test(productIdentifier)) {
    return { id: productIdentifier };
  }

  if (typeof productIdentifier === "number" && Number.isInteger(productIdentifier) && productIdentifier > 0) {
    return { publicId: productIdentifier };
  }

  return { id: productIdentifier };
}

module.exports = {
  getProductLookupWhere,
};
