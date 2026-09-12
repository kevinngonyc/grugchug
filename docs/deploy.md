# Deploying grugchug

One box, one process. The Bun API also serves the built web app, so the
browser talks to a single origin: `/api/*` and the chat WebSocket never leave
the host. Cloudflare Tunnel publishes that process at your subdomain and
terminates TLS, which the webcam tracker needs (getUserMedia only works on
HTTPS). Nothing on the box listens to the internet except SSH.

```
browser ── https://study.example.com ──▶ Cloudflare ── tunnel ──▶ bun :3000 on the VPS
                                                                    ├── /api/*   API + WebSocket
                                                                    └── /*       apps/web/dist
```

## 1. The box

Any Ubuntu 24.04 VPS. On Vultr: Cloud Compute, the 2 GB plan (PDF text
extraction on a 15 MB upload wants the headroom), your SSH key. Nothing else
to configure: no firewall rules for HTTP, the tunnel is outbound only.

## 2. Install the app

As root on the box:

```
curl -fsSL https://raw.githubusercontent.com/kevinngonyc/grugchug/main/deploy/install.sh | bash
```

This installs Bun, clones the repo to `/opt/grugchug`, builds both apps, and
starts the `grugchug` systemd service on `localhost:3000`. On the first run
it writes `/opt/grugchug/apps/api/.env`. Open it, add the LLM key and both
model names for the vendor you use (see `.env.example`), then:

```
systemctl restart grugchug
curl -s localhost:3000/api/health
journalctl -u grugchug -n 20
```

The startup log prints which vendor and models it found. To check real calls
work: `cd /opt/grugchug && sudo -u grugchug bun run --filter @grugchug/api check:llm`.

The SQLite file is `/var/lib/grugchug/grugchug.sqlite`. That directory is the
only path the service can write, so leave `SQLITE_PATH` pointing there.

## 3. Publish it with Cloudflare Tunnel

In the Cloudflare dashboard: **Zero Trust → Networks → Tunnels → Create a
tunnel → Cloudflared**. Name it, then copy the Debian install command it
shows, which looks like:

```
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
sudo cloudflared service install <token>
```

Run it on the box. Back in the dashboard add a **Public Hostname**:

| Field     | Value                          |
| --------- | ------------------------------ |
| Subdomain | `study` (or whatever you like) |
| Domain    | your domain                    |
| Type      | HTTP                           |
| URL       | `localhost:3000`               |

Cloudflare creates the DNS record for you. WebSockets pass through the
tunnel by default, so chat presence works with no extra setting. Open
`https://study.yourdomain.com` and the app should load.

## 4. Updating

Re-run the install script; it pulls `main`, rebuilds, and restarts the
service. To deploy another branch: `REPO_BRANCH=my-branch bash install.sh`.

## 5. Things to know

- **One instance only.** SQLite on a local file means the app cannot run on
  two boxes at once. For a study group that is plenty.
- **Back up the state directory.** A Vultr snapshot, or copy
  `/var/lib/grugchug/grugchug.sqlite` somewhere; it is the only state.
- **`WEB_DIST`** points the API at a different web build if you ever serve
  one from elsewhere. The default is `apps/web/dist` next to the checkout.
- **Cloudflare Pages is not used.** The API needs a real Bun runtime, a disk,
  and a WebSocket server, none of which Pages Functions provide, and serving
  the static build from the same process keeps everything on one origin.
