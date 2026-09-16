const test = require("node:test");
const assert = require("node:assert/strict");
const { scheduleConversationWork, isConversationBusy } = require("../src/services/conversationQueue");

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

test("never runs work for the same conversation in parallel", async () => {
  let running = 0;
  let maxRunning = 0;

  const work = async () => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
  };

  await Promise.all([
    scheduleConversationWork("c1", work),
    scheduleConversationWork("c1", work),
    scheduleConversationWork("c1", work),
  ]);

  assert.equal(maxRunning, 1);
  assert.equal(isConversationBusy("c1"), false);
});

test("coalesces a burst into one follow-up run", async () => {
  const gate = deferred();
  let runs = 0;

  const work = async () => {
    runs += 1;
    if (runs === 1) {
      await gate.promise;
    }
  };

  const first = scheduleConversationWork("c2", work);
  const second = scheduleConversationWork("c2", work);
  const third = scheduleConversationWork("c2", work);

  assert.equal(second, first, "later callers share the in-flight promise");
  assert.equal(third, first);

  gate.resolve();
  await first;

  assert.equal(runs, 2, "one initial run plus one coalesced follow-up");
});

test("different conversations run independently", async () => {
  const gate = deferred();
  const order = [];

  const slow = scheduleConversationWork("a", async () => {
    await gate.promise;
    order.push("a");
  });
  await scheduleConversationWork("b", async () => {
    order.push("b");
  });

  gate.resolve();
  await slow;

  assert.deepEqual(order, ["b", "a"]);
});

test("rejects callers when the last run fails, and frees the conversation", async () => {
  const originalError = console.error;
  console.error = () => {};

  try {
    await assert.rejects(
      scheduleConversationWork("c3", async () => {
        throw new Error("boom");
      }),
      /boom/
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(isConversationBusy("c3"), false);

  let ran = false;
  await scheduleConversationWork("c3", async () => {
    ran = true;
  });
  assert.equal(ran, true);
});
