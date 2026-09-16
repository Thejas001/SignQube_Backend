// Serializes agent work per conversation so two messages arriving close
// together never run two agent loops in parallel (double replies, racing
// draft-order writes, duplicate place_order calls).
//
// Work that is scheduled while a run is already in flight is coalesced: the
// running loop simply goes around once more when it finishes, so a burst of
// messages gets one reply that covers all of them instead of one per message.
// Every caller for a given key must pass equivalent work — the first caller's
// function is the one that runs.
//
// This is in-process only. Running more than one server instance needs a
// shared lock instead; place_order also claims the conversation atomically in
// the DB so a duplicate order can't slip through even then.
const runners = new Map();

function scheduleConversationWork(conversationId, work) {
  const existing = runners.get(conversationId);

  if (existing) {
    existing.rerun = true;
    return existing.promise;
  }

  const runner = { rerun: false, promise: null };
  runners.set(conversationId, runner);

  runner.promise = (async () => {
    let lastError = null;

    try {
      do {
        runner.rerun = false;
        lastError = null;

        try {
          await work();
        } catch (error) {
          lastError = error;
          console.error(`Conversation ${conversationId} processing failed:`, error.message);
        }
      } while (runner.rerun);
    } finally {
      runners.delete(conversationId);
    }

    if (lastError) {
      throw lastError;
    }
  })();

  return runner.promise;
}

function isConversationBusy(conversationId) {
  return runners.has(conversationId);
}

module.exports = {
  scheduleConversationWork,
  isConversationBusy,
};
