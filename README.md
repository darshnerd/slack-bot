# slack-bot

A simple Slack bot built with [Bolt for JavaScript](https://slack.dev/bolt-js/) running in **Socket Mode**. It registers a `/dsb-ping` slash command that replies with a "Pong!" message and the round-trip latency.

## Features

- ⚡ Built on `@slack/bolt`
- 🔌 Runs in Socket Mode (no public URL / webhook required)
- 🏓 `/dsb-ping` slash command that reports latency
- 🔐 Tokens stored safely in a `.env` file (never committed)

## Prerequisites

- [Node.js](https://nodejs.org/en/download) (v18 or newer recommended)
- A Slack workspace where you can install apps
- A Slack app with:
  - A **Bot User OAuth Token** (`xoxb-...`) from **OAuth & Permissions**
  - An **App-Level Token** (`xapp-...`) with the `connections:write` scope from **Basic Information → App-Level Tokens**
  - **Socket Mode** enabled
  - A slash command named `/dsb-ping` configured

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

## Running the bot

```bash
node index.js
```

If everything is configured correctly you will see:

```
bot is running!
```

Then, in any Slack channel, type:

```
/dsb-ping
```

The bot will reply with `Pong!` and the measured latency.

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

## Troubleshooting

- **`npm: command not found`** — Node.js isn't installed. Download it from [nodejs.org](https://nodejs.org/en/download).
- **Nothing happens when you run the command:**
  - Make sure your terminal is in the project folder (the one containing `index.js`).
  - Double-check the tokens: `xoxb-` goes in `SLACK_BOT_TOKEN`, `xapp-` goes in `SLACK_APP_TOKEN`.
  - Watch the terminal running `node index.js` for errors.
  - Confirm the slash command name in your Slack app dashboard matches the one in `index.js`.

## License

This project is licensed under the [MIT License](LICENSE).
