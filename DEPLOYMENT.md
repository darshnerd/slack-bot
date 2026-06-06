# Deployment Guide

How to run this Slack bot 24/7 on an Ubuntu server using **systemd**. These steps were used to deploy on an Ubuntu 25 server (2 vCPU / 2 GB RAM).

> Why systemd? Without it, the bot stops when you disconnect SSH, when the server restarts, or if the process crashes. A systemd service keeps it alive and restarts it automatically.

## 1. Install prerequisites (git, Node.js, npm)

Only needed if the server doesn't already have git and Node.

```bash
apt update
apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
```

> The NodeSource `setup_24.x` script officially targets Ubuntu 24.04. On Ubuntu 25 it usually still works; if it complains, use Ubuntu's own packages instead: `apt install -y nodejs npm`.

Verify the install:

```bash
node --version
npm --version
git --version
```

## 2. Get the code onto the server

```bash
git clone https://github.com/darshnerd/slack-bot.git
cd slack-bot
npm install
```

> **SSH vs HTTPS:** if `git@github.com:...` fails with `Permission denied (publickey)`, the server has no SSH key registered with GitHub. Either clone over **HTTPS** (shown above), or generate a key with `ssh-keygen -t ed25519` and add `~/.ssh/id_ed25519.pub` to **GitHub → Settings → SSH and GPG keys**.

## 3. Create the `.env` file on the server

`.env` is gitignored, so it is **not** included in the clone. Create it manually with your real tokens:

```bash
nano /root/slack-bot/.env
```

```env
SLACK_BOT_TOKEN=xoxb-your-real-bot-token
SLACK_APP_TOKEN=xapp-your-real-app-token
```

Save and exit (in nano: `Ctrl+O`, `Enter`, `Ctrl+X`).

## 4. Find your node path

The service file needs the absolute path to node:

```bash
which node
```

Typically `/usr/bin/node`. If yours differs, update the `ExecStart` line in the next step.

## 5. Create the systemd service

```bash
nano /etc/systemd/system/slackbot.service
```

Paste the following (a copy lives in [`deploy/slackbot.service`](deploy/slackbot.service)). Adjust `WorkingDirectory` and `ExecStart` if your repo path or node path differ:

```ini
[Unit]
Description=Slack Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Restart=always
RestartSec=5
WorkingDirectory=/root/slack-bot
ExecStart=/usr/bin/node index.js
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Save and exit.

## 6. Start and enable the service

```bash
systemctl daemon-reload
systemctl enable --now slackbot.service
```

`enable --now` both starts the service immediately and configures it to start automatically on boot.

## 7. Verify it's running

```bash
systemctl status slackbot.service
journalctl -u slackbot.service -f
```

You should see `Active: active (running)` and a log line `bot is running!`. Then test a command (e.g. `/dsb-darsh-ping`) in Slack.

## Managing the service

```bash
# Watch live logs
journalctl -u slackbot.service -f

# Restart after pulling new code
cd /root/slack-bot && git pull && systemctl restart slackbot.service

# Stop / start
systemctl stop slackbot.service
systemctl start slackbot.service

# Disable auto-start on boot
systemctl disable slackbot.service
```

## Continuous deployment with GitHub Actions (self-hosted runner)

The repo includes a workflow at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) that automatically deploys on every push to `main` (or manually from the **Actions** tab).

> **Why a self-hosted runner instead of SSH?** Nest sits behind a bastion/gateway (`hackclub.app`) that only accepts SSH keys registered to your Hack Club account — keys added to the container's local `~/.ssh/authorized_keys` are rejected before the connection reaches the container. That makes the usual "SSH from GitHub" deploy impractical. Instead, we install a **GitHub Actions runner on Nest itself**, so the deploy job runs locally and needs no inbound SSH.

### One-time setup: install the runner on Nest

**1. Get the runner download + token.** In GitHub: repo → **Settings → Actions → Runners → New self-hosted runner → Linux x64**. GitHub shows you a `curl` download command and a `./config.sh ... --token <TOKEN>` command. Run them on Nest:

```bash
cd ~
mkdir -p actions-runner && cd actions-runner
# (use the exact URL/version GitHub shows you)
curl -o actions-runner.tar.gz -L https://github.com/actions/runner/releases/download/v2.X.X/actions-runner-linux-x64-2.X.X.tar.gz
tar xzf actions-runner.tar.gz
./config.sh --url https://github.com/darshnerd/slack-bot --token <TOKEN>
```

Accept the defaults at the prompts (runner name, labels — keep `self-hosted`, work folder `_work`).

**2. Run the runner as a service** so it survives reboots and keeps listening:

```bash
sudo ./svc.sh install        # or: ./svc.sh install   (user mode)
sudo ./svc.sh start
sudo ./svc.sh status
```

> On Nest (no real root / user-level systemd) you can instead run it under your user systemd, or simply `./run.sh` inside a `tmux`/`screen` session for a quick setup. The `svc.sh` approach is preferred if it works in your container.

**3. Make sure the bot service + `.env` already exist** on Nest (see the systemd sections above). The workflow restarts `slackbot.service`; it does not create it or your tokens.

### How it runs

- **Push to `main`** (or manual run) → GitHub queues the job; the Nest runner picks it up locally.
- The job checks out the latest code, runs `npm ci`, rsyncs it into `~/slack-bot` (excluding `.git`, `.env`, and `scores.json` so your secrets and scores are untouched), then `systemctl --user restart slackbot.service`.
- The final `systemctl --user is-active` step fails the job red if the bot didn't come back up.

> Because the runner runs *on* Nest, `.env` and `scores.json` already live there and are excluded from the sync — you set tokens up once.

## Running on Hack Club Nest (user-level systemd)

On a full VM/root server you use **system-level** systemd (`systemctl`, service file in `/etc/systemd/system/`). On **Nest** you don't have root, so you use **user-level** systemd instead:

- Put the service file in `~/.config/systemd/user/slackbot.service` (the same contents work; set `WorkingDirectory` to your project path on Nest, e.g. `/home/youruser/slack-bot`).
- Manage it with the `--user` flag:

```bash
systemctl --user daemon-reload
systemctl --user enable --now slackbot.service
systemctl --user status slackbot.service
journalctl --user -u slackbot.service
```

- To keep the service running after you log out, enable lingering once: `loginctl enable-linger $USER`.
- For CI deploys on Nest, drop the `sudo` from the workflow and use `systemctl --user restart slackbot.service`.

## Troubleshooting

Check the logs first:

```bash
# system service
journalctl -u slackbot.service -f
# user service (Nest)
journalctl --user -u slackbot.service
```

Common deployment issues:

- **Wrong token** — confirm `xoxb-` is in `SLACK_BOT_TOKEN` and `xapp-` is in `SLACK_APP_TOKEN` (an `invalid_auth` error means they're wrong or swapped).
- **Missing `.env`** — it lives on the server, not in your repo (it's gitignored). Recreate it if a fresh clone is missing it.
- **Wrong working directory** — the `WorkingDirectory=` line in the service file must point to the absolute path of the project on the server.
- **Missing dependencies** — re-run `npm install` inside the project folder.

## Lifecycle commands

```bash
# system service
systemctl start slackbot.service
systemctl stop slackbot.service
systemctl restart slackbot.service

# user service (Nest)
systemctl --user start slackbot.service
systemctl --user stop slackbot.service
systemctl --user restart slackbot.service
```

## Further reading

- [Slack API Docs](https://api.slack.com/)
- [Slack Bolt for JavaScript](https://slack.dev/bolt-js/tutorial/getting-started)
- [Node.js Docs](https://nodejs.org/en/docs)
- [Nest Quickstart Guide](https://guides.hackclub.app/index.php/Quickstart)

## Ideas to extend the bot

- Daily standup reporter (posts a summary at 9am)
- Fun facts bot (`/dsb-darsh-fact`)
- Moderation: auto-flag messages with banned words
- Games: trivia bot with score tracking
- Integrations: post GitHub PR updates

## Notes & gotchas

- **Only run one instance.** Slack Socket Mode will bounce commands between instances if the same tokens are used in two places. Stop any local/dev copy (e.g. `node index.js` on your laptop) once the server instance is live.
- **`.env` must exist in `WorkingDirectory`.** The app loads `.env` relative to where it runs, which is the service's `WorkingDirectory`.
- **Updating code:** `git pull` then `systemctl restart slackbot.service`. If you added dependencies, run `npm install` before restarting.
- **Socket Mode "pong/ping timeout" warnings** are usually transient network blips — the bot auto-reconnects.
