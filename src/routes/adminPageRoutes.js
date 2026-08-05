const path = require("path");
const express = require("express");

const router = express.Router();
const adminPublicPath = path.join(__dirname, "..", "admin", "public");

router.use(
  express.static(adminPublicPath, {
    etag: false,
    lastModified: false,
    setHeaders(res) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
    },
  })
);

function sendAdminApp(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.sendFile(path.join(adminPublicPath, "index.html"));
}

router.get("/", (req, res) => {
  sendAdminApp(res);
});

router.get("/orders/:orderId", (req, res) => {
  sendAdminApp(res);
});

module.exports = router;
