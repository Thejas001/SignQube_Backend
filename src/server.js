const app = require("./app");
const env = require("./config/env");
const validateEnv = require("./config/validateEnv");
const aiAgentService = require("./services/aiAgentService");

validateEnv();

app.listen(env.port, () => {
  console.log(`SIGNQUE backend running on port ${env.port}`);

  aiAgentService
    .resumePendingConversations()
    .then((count) => {
      if (count > 0) {
        console.log(`Resuming ${count} WhatsApp conversation(s) with unanswered messages`);
      }
    })
    .catch((error) => {
      console.error("Failed to resume pending WhatsApp conversations:", error.message);
    });
});
