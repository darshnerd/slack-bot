# slack-bot

A simple Slack bot built with [Bolt for JavaScript](https://slack.dev/bolt-js/) running in **Socket Mode**. It provides several slash commands — a latency check, a help menu, API-backed commands (a random cat fact and a random joke), and a trivia game with a persistent leaderboard.

## Features

- ⚡ Built on `@slack/bolt`
- 🔌 Runs in Socket Mode (no public URL / webhook required)
- 🏓 `/dsb-darsh-ping` — reports the bot's latency
- 📖 `/dsb-darsh-help` — lists all available commands
- 🐱 `/dsb-darsh-catfact` — fetches a random cat fact from an API
- 😂 `/dsb-darsh-joke` — fetches a random joke from an API
- 🧠 `/dsb-darsh-trivia` — a multiple-choice trivia game with a persistent leaderboard
- 🔐 Tokens stored safely in a `.env` file (never committed)

## Commands

| Command | Description | Source |
| --- | --- | --- |
| `/dsb-darsh-ping` | Replies with `Pong!` and the round-trip latency in ms | local |
| `/dsb-darsh-help` | Lists all available commands | local |
| `/dsb-darsh-catfact` | Returns a random cat fact | [catfact.ninja](https://catfact.ninja) |
| `/dsb-darsh-joke` | Returns a random joke (setup + punchline) | [official-joke-api](https://official-joke-api.appspot.com) |
| `/dsb-darsh-trivia` | Asks a multiple-choice trivia question | [Open Trivia DB](https://opentdb.com) |
| `/dsb-darsh-answer [A/B/C/D]` | Answers the current trivia question | local |
| `/dsb-darsh-score` | Shows the trivia leaderboard | local |

### Trivia game

1. Run `/dsb-darsh-trivia` to get a random multiple-choice question (A–D).
2. Answer with `/dsb-darsh-answer A` (or B/C/D). A correct answer adds 1 point to your score.
3. Run `/dsb-darsh-score` to see the leaderboard (sorted high → low, with 🥇🥈🥉 for the top three).

Scores are persisted to a `scores.json` file in the project root, so they survive restarts. That file is gitignored (it holds per-user data, not code). Each user has their own active question, so multiple people can play at once.

> **Note on naming:** Slash command names must be **unique across an entire Slack workspace**. These commands use the `dsb-darsh-` prefix to avoid clashing with commands registered by other people in the same workspace.

## Prerequisites

- [Node.js](https://nodejs.org/en/download) (v18 or newer recommended)
- A Slack workspace where you can install apps
- A Slack app with:
  - A **Bot User OAuth Token** (`xoxb-...`) from **OAuth & Permissions**
  - An **App-Level Token** (`xapp-...`) with the `connections:write` scope from **Basic Information → App-Level Tokens**
  - **Socket Mode** enabled
  - The slash commands above configured (see [Registering commands](#registering-commands-in-slack))

## Setup

1. **Clone the repository**

   ```bash
   git clone git@github-darsh:darshnerd/slack-bot.git
   cd slack-bot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   Create a `.env` file in the project root:

   ```env
   SLACK_BOT_TOKEN=xoxb-...   # Bot User OAuth Token (from OAuth & Permissions)
   SLACK_APP_TOKEN=xapp-...   # App-Level Token (from Basic Information → App-Level Tokens)
   ```

   > The `.env` file is listed in `.gitignore` so your secrets never get committed.

## Registering commands in Slack

In your Slack app dashboard, go to **Slash Commands** and create each command so the names match the ones in `index.js`:

- `/dsb-darsh-ping`
- `/dsb-darsh-help`
- `/dsb-darsh-catfact`
- `/dsb-darsh-joke`
- `/dsb-darsh-trivia`
- `/dsb-darsh-answer`
- `/dsb-darsh-score`

In Socket Mode the Request URL can be left as a placeholder. Reinstall the app to your workspace if Slack prompts you.

## Running the bot

```bash
npm start
# or
node index.js
```

If everything is configured correctly you will see:

```
bot is running!
```

Then, in any Slack channel, type one of the commands (e.g. `/dsb-darsh-ping`). The bot will reply accordingly.

## How the command works

```js
app.command("/command-name", async ({ ack, respond }) => {
  // your code here
});
```

| Part            | What it does                                      |
| --------------- | ------------------------------------------------- |
| `app.command()` | Registers a slash command                         |
| `"/command-name"` | The command Slack listens for                   |
| `async`         | Allows asynchronous operations like API calls     |
| `ack()`         | Acknowledges the command to Slack                 |
| `respond()`     | Sends a message back to Slack                     |

> `ack()` is required and must run within ~3 seconds. If you don't acknowledge in time, Slack treats the command as failed and shows the user an error.

### How the API-backed commands work

The cat fact and joke commands follow the same flow:

1. The user runs a slash command
2. The bot acknowledges it with `ack()`
3. The bot sends a request to an external API using `axios`
4. The API returns data
5. The bot sends that data back into Slack with `respond()`

The common ingredients:

- **`axios`** — to make the API request
- **`try/catch`** — so a failed/rate-limited request doesn't crash the bot
- **`respond()`** — to send the result back to Slack

You can repeat this pattern for any free API (browse [free-apis.github.io](https://free-apis.github.io)). Just remember to register each new command in the Slack dashboard, and keep any API keys in `.env` — never in your code.

## Troubleshooting

- **`npm: command not found`** — Node.js isn't installed. Download it from [nodejs.org](https://nodejs.org/en/download).
- **`This command is already in use` when registering a command** — the name is taken by someone else in the workspace. Use a more unique prefix and update both `index.js` and the dashboard.
- **Nothing happens when you run the command:**
  - Make sure your terminal is in the project folder (the one containing `index.js`).
  - Restart the bot after editing `index.js` (Ctrl+C, then `node index.js`).
  - Confirm the command name in the Slack dashboard exactly matches the one in `index.js`.
  - Double-check the tokens: `xoxb-` goes in `SLACK_BOT_TOKEN`, `xapp-` goes in `SLACK_APP_TOKEN`.
  - Watch the terminal running `node index.js` for errors (e.g. `invalid_auth` means wrong tokens).

## Makefile shortcuts

A `Makefile` provides convenient shortcuts. Run `make help` to list them all.

| Target | What it does |
| --- | --- |
| `make install` | Install npm dependencies |
| `make env` | Create `.env` from `.env.example` if missing |
| `make run` | Run the bot locally (`node index.js`) |
| `make dev` | Install deps then run locally |
| `make deploy` | (server) `git pull`, `npm install`, restart the service |
| `make logs` | (server) Follow the systemd service logs |
| `make status` | (server) Show the systemd service status |
| `make restart` / `make stop` | (server) Restart / stop the service |
| `make enable` / `make disable` | (server) Enable / disable on boot |

## Deployment

To run the bot 24/7 on a server (Ubuntu + systemd), see the [Deployment Guide](DEPLOYMENT.md). A ready-to-use service file is provided at [`deploy/slackbot.service`](deploy/slackbot.service). The server-side `make` targets above wrap the common `systemctl` commands.

## License

This project is licensed under the [MIT License](LICENSE).
