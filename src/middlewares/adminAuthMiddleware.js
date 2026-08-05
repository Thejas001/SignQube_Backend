const crypto = require("crypto");
const env = require("../config/env");

function safeEquals(left, right) {
  const leftBuffer = Buffer.from(left || "", "utf8");
  const rightBuffer = Buffer.from(right || "", "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function adminAuthMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="SIGNQUE Admin"');
    return res.status(401).send("Admin authentication required.");
  }

  const encoded = header.slice("Basic ".length);
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  const username = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : "";
  const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

  const isValid =
    safeEquals(username, env.adminUsername) && safeEquals(password, env.adminPassword);

  if (!isValid) {
    res.set("WWW-Authenticate", 'Basic realm="SIGNQUE Admin"');
    return res.status(401).send("Invalid admin credentials.");
  }

  req.admin = { username };
  return next();
}

module.exports = adminAuthMiddleware;
