require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { App } = require("@slack/bolt");
const axios = require("axios");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true
});

// ---------------------------------------------------------------------------
// Trivia game state + score persistence
// ---------------------------------------------------------------------------

const SCORES_FILE = path.join(__dirname, "scores.json");

// In-memory map of the currently active question per user.
// { [userId]: { question, correct, options: ["A","B",...], answers: {A: "...", ...} } }
const activeQuestions = {};

// Load scores from disk (persists across restarts). Shape: { [userId]: { name, score } }
function loadScores() {
  try {
    return JSON.parse(fs.readFileSync(SCORES_FILE, "utf8"));
  } catch (err) {
    return {};
  }
}

function saveScores(scores) {
  try {
    fs.writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2));
  } catch (err) {
    console.error("Failed to save scores:", err.message);
  }
}

let scores = loadScores();

// Decode HTML entities returned by the Open Trivia DB API.
function decodeHtml(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&eacute;/g, "é")
    .replace(/&rsquo;/g, "’")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&hellip;/g, "…");
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ---------------------------------------------------------------------------
// Basic commands
// ---------------------------------------------------------------------------

app.command("/dsb-darsh-ping", async ({ command, ack, respond }) => {
  const start = Date.now();
  await ack();
  const latency = Date.now() - start;
  await respond({ text: `Pong!\nLatency: ${latency}ms` });
});

app.command("/dsb-darsh-help", async ({ ack, respond }) => {
  await ack();
  await respond({
    text:
`Available Commands:
/dsb-darsh-ping - Check bot latency
/dsb-darsh-help - Show this list of commands
/dsb-darsh-catfact - Get a cat fact
/dsb-darsh-joke - Get a random joke
/dsb-darsh-trivia - Get a trivia question
/dsb-darsh-answer [A/B/C/D] - Answer the current trivia question
/dsb-darsh-score - Show the trivia leaderboard`
  });
});

app.command("/dsb-darsh-catfact", async ({ ack, respond }) => {
  await ack();

  try {
    const response = await axios.get("https://catfact.ninja/fact");
    await respond({ text: `Cat Fact:\n${response.data.fact}` });
  } catch (err) {
    await respond({ text: "Failed to fetch a cat fact." });
  }
});

app.command("/dsb-darsh-joke", async ({ ack, respond }) => {
  await ack();

  try {
    const response = await axios.get("https://official-joke-api.appspot.com/random_joke");
    await respond({
      text:
`${response.data.setup}

${response.data.punchline}`
    });
  } catch (err) {
    await respond({ text: "Failed to fetch a joke." });
  }
});

// ---------------------------------------------------------------------------
// Trivia game
// ---------------------------------------------------------------------------

// Fetch and present a new trivia question for the user.
app.command("/dsb-darsh-trivia", async ({ command, ack, respond }) => {
  await ack();

  try {
    const response = await axios.get("https://opentdb.com/api.php?amount=1&type=multiple");
    const result = response.data.results[0];

    const question = decodeHtml(result.question);
    const correct = decodeHtml(result.correct_answer);
    const incorrect = result.incorrect_answers.map(decodeHtml);

    // Build a shuffled list of all answers and map them to letters.
    const all = shuffle([correct, ...incorrect]);
    const letters = ["A", "B", "C", "D"];
    const answers = {};
    all.forEach((ans, i) => {
      answers[letters[i]] = ans;
    });

    // Remember the correct letter for this user.
    const correctLetter = letters[all.indexOf(correct)];
    activeQuestions[command.user_id] = { question, correctLetter, answers };

    const optionsText = letters
      .map((l) => `*${l}.* ${answers[l]}`)
      .join("\n");

    await respond({
      text:
`*Trivia!* (${decodeHtml(result.category)} — ${result.difficulty})
${question}

${optionsText}

Answer with \`/dsb-darsh-answer A\` (or B/C/D).`
    });
  } catch (err) {
    await respond({ text: "Failed to fetch a trivia question. Try again." });
  }
});

// Submit an answer to the user's active question.
app.command("/dsb-darsh-answer", async ({ command, ack, respond }) => {
  await ack();

  const userId = command.user_id;
  const current = activeQuestions[userId];

  if (!current) {
    await respond({ text: "You don't have an active question. Start one with `/dsb-darsh-trivia`." });
    return;
  }

  const guess = (command.text || "").trim().toUpperCase();
  if (!["A", "B", "C", "D"].includes(guess)) {
    await respond({ text: "Please answer with a letter: `/dsb-darsh-answer A` (or B/C/D)." });
    return;
  }

  // Clear the active question so it can't be answered twice.
  delete activeQuestions[userId];

  const correctLetter = current.correctLetter;
  const correctText = current.answers[correctLetter];

  if (guess === correctLetter) {
    // Update and persist the score.
    if (!scores[userId]) {
      scores[userId] = { name: command.user_name || userId, score: 0 };
    }
    scores[userId].name = command.user_name || scores[userId].name;
    scores[userId].score += 1;
    saveScores(scores);

    await respond({
      text: `✅ Correct! The answer was *${correctLetter}. ${correctText}*.\nYour score is now *${scores[userId].score}*.`
    });
  } else {
    await respond({
      text: `❌ Wrong! You answered *${guess}*. The correct answer was *${correctLetter}. ${correctText}*.`
    });
  }
});

// Show the leaderboard.
app.command("/dsb-darsh-score", async ({ command, ack, respond }) => {
  await ack();

  const entries = Object.values(scores).sort((a, b) => b.score - a.score);

  if (entries.length === 0) {
    await respond({ text: "No scores yet! Play with `/dsb-darsh-trivia`." });
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const leaderboard = entries
    .map((e, i) => `${medals[i] || `${i + 1}.`} ${e.name} — ${e.score}`)
    .join("\n");

  await respond({
    text: `*Trivia Leaderboard*\n${leaderboard}`
  });
});

(async () => {
  await app.start();
  console.log("bot is running!");
})();
