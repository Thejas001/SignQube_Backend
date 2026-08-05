const prisma = require("../prisma/client");
const AppError = require("../utils/appError");
const { verifyAccessToken } = require("../utils/jwt");

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new AppError("Authentication required", 401));
  }

  let decoded;

  try {
    const token = authHeader.split(" ")[1];
    decoded = verifyAccessToken(token);
  } catch (error) {
    return next(error);
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    return next(new AppError("User not found", 401));
  }

  req.user = user;
  return next();
}

module.exports = authMiddleware;
