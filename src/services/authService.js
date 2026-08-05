const bcrypt = require("bcrypt");
const crypto = require("crypto");
const prisma = require("../prisma/client");
const AppError = require("../utils/appError");
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require("../utils/jwt");
const { parseExpiryToDate } = require("../utils/token");
const env = require("../config/env");

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  createdAt: true,
  updatedAt: true,
};

async function issueAuthTokens(userId) {
  const tokenId = crypto.randomUUID();
  const accessToken = signAccessToken({ userId, tokenId });
  const refreshToken = signRefreshToken({ userId, tokenId });

  await prisma.refreshToken.create({
    data: {
      userId,
      token: refreshToken,
      expiresAt: parseExpiryToDate(env.refreshTokenExpiresIn),
    },
  });

  return { accessToken, refreshToken };
}

async function registerUser(payload) {
  const existingUser = await prisma.user.findUnique({
    where: { email: payload.email.toLowerCase() },
  });

  if (existingUser) {
    throw new AppError("User already exists with this email", 409);
  }

  const passwordHash = await bcrypt.hash(payload.password, 10);

  const user = await prisma.user.create({
    data: {
      name: payload.name,
      email: payload.email.toLowerCase(),
      passwordHash,
      phone: payload.phone || null,
    },
    select: userSelect,
  });

  const tokens = await issueAuthTokens(user.id);

  return {
    ...tokens,
    user,
  };
}

async function loginUser(payload) {
  const user = await prisma.user.findUnique({
    where: { email: payload.email.toLowerCase() },
  });

  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  const isPasswordValid = await bcrypt.compare(payload.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new AppError("Invalid email or password", 401);
  }

  const tokens = await issueAuthTokens(user.id);

  return {
    ...tokens,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  };
}

async function refreshUserToken(refreshToken) {
  const decoded = verifyRefreshToken(refreshToken);

  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: {
      user: {
        select: userSelect,
      },
    },
  });

  if (!storedToken || storedToken.userId !== decoded.userId) {
    throw new AppError("Refresh token is invalid", 401);
  }

  if (storedToken.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { token: refreshToken } });
    throw new AppError("Refresh token has expired", 401);
  }

  await prisma.refreshToken.delete({ where: { token: refreshToken } });
  const tokens = await issueAuthTokens(storedToken.userId);

  return {
    ...tokens,
    user: storedToken.user,
  };
}

async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: userSelect,
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return user;
}

module.exports = {
  registerUser,
  loginUser,
  refreshUserToken,
  getCurrentUser,
};
