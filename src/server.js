const app = require("./app");
const env = require("./config/env");
const validateEnv = require("./config/validateEnv");

validateEnv();

app.listen(env.port, () => {
  console.log(`SIGNQUE backend running on port ${env.port}`);
});
