const prisma = require("../prisma/client");

async function createAddress(userId, payload) {
  return prisma.address.create({
    data: {
      userId,
      fullName: payload.fullName,
      phone: payload.phone,
      line1: payload.line1,
      line2: payload.line2 || null,
      city: payload.city,
      state: payload.state,
      postalCode: payload.postalCode,
      country: payload.country || "India",
    },
  });
}

async function getAddresses(userId) {
  return prisma.address.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

module.exports = {
  createAddress,
  getAddresses,
};
