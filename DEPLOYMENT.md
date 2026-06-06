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

## Continuous deployment with GitHub Actions

The repo includes a workflow at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) that automatically deploys on every push to `main` (and can also be triggered manually from the **Actions** tab). It SSHes into the server, pulls the latest code, installs dependencies, and restarts the service.

### One-time setup

**1. Create a dedicated SSH key for CI** (on your local machine):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/slackbot_deploy
```

Add the **public** key to the server's authorized keys:

```bash
# copy ~/.ssh/slackbot_deploy.pub, then on the server:
echo "ssh-ed25519 AAAA... github-actions-deploy" >> ~/.ssh/authorized_keys
```

**2. Add the repository secrets** in GitHub → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `SSH_HOST` | Server IP or hostname (e.g. `10.60.2.110` or your public address) |
| `SSH_USER` | SSH user (e.g. `root`) |
| `SSH_PORT` | SSH port (usually `22`) |
| `SSH_PRIVATE_KEY` | Contents of the **private** key `~/.ssh/slackbot_deploy` |

**3. Allow the service restart without a password prompt.** The workflow runs `sudo systemctl restart slackbot.service`. If the SSH user is `root` this already works. For a non-root user, add a sudoers rule:

```bash
echo "youruser ALL=(ALL) NOPASSWD: /bin/systemctl restart slackbot.service, /bin/systemctl is-active slackbot.service" \
  | sudo tee /etc/sudoers.d/slackbot
```

### How it runs

- **Push to `main`** → the workflow connects over SSH and runs `git pull`, `npm ci`, and restarts the service.
- **Manual run** → use the **Run workflow** button on the Actions tab (`workflow_dispatch`).
- The final `systemctl is-active` step fails the job if the bot didn't come back up, so a broken deploy shows up as a red ❌ in GitHub.

> The server must be able to `git pull` non-interactively. Since `.env` is gitignored, it stays on the server untouched across deploys — you only set it up once.

## Notes & gotchas

- **Only run one instance.** Slack Socket Mode will bounce commands between instances if the same tokens are used in two places. Stop any local/dev copy (e.g. `node index.js` on your laptop) once the server instance is live.
- **`.env` must exist in `WorkingDirectory`.** The app loads `.env` relative to where it runs, which is the service's `WorkingDirectory`.
- **Updating code:** `git pull` then `systemctl restart slackbot.service`. If you added dependencies, run `npm install` before restarting.
- **Socket Mode "pong/ping timeout" warnings** are usually transient network blips — the bot auto-reconnects.
