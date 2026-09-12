#!/usr/bin/env bash
# Install or update grugchug on a fresh Ubuntu 24.04 box (a Vultr Cloud
# Compute instance, say). Idempotent: run it again to deploy a new version.
#
#   curl -fsSL https://raw.githubusercontent.com/kevinngonyc/grugchug/main/deploy/install.sh | sudo bash
#   # or, from a checkout:  sudo REPO_BRANCH=main ./deploy/install.sh
#
# What it does:
#   1. installs git, curl, unzip and Bun (to /usr/local/bin/bun)
#   2. creates the `grugchug` system user and clones the repo to /opt/grugchug
#   3. bun install + bun run build (API to dist/, web to apps/web/dist)
#   4. writes apps/api/.env on first run — EDIT IT to add the LLM keys
#   5. installs and (re)starts the systemd unit deploy/grugchug.service
#
# Then publish localhost:3000 with Cloudflare Tunnel; see docs/deploy.md.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/kevinngonyc/grugchug.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/grugchug}"
APP_USER="${APP_USER:-grugchug}"
STATE_DIR="/var/lib/${APP_USER}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run as root (sudo)" >&2
  exit 1
fi

echo "==> packages"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl unzip ca-certificates

if ! command -v bun >/dev/null 2>&1; then
  echo "==> bun"
  curl -fsSL https://bun.sh/install | BUN_INSTALL=/tmp/bun-install bash >/dev/null
  install -m 0755 /tmp/bun-install/bin/bun /usr/local/bin/bun
  rm -rf /tmp/bun-install
fi
echo "    bun $(bun --version)"

if ! id "${APP_USER}" >/dev/null 2>&1; then
  echo "==> user ${APP_USER}"
  useradd --system --home-dir "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi
install -d -o "${APP_USER}" -g "${APP_USER}" "${STATE_DIR}"

if [[ -d "${APP_DIR}/.git" ]]; then
  echo "==> update ${APP_DIR} (${REPO_BRANCH})"
  git -C "${APP_DIR}" fetch --quiet origin "${REPO_BRANCH}"
  git -C "${APP_DIR}" checkout --quiet "${REPO_BRANCH}"
  git -C "${APP_DIR}" reset --quiet --hard "origin/${REPO_BRANCH}"
else
  echo "==> clone ${REPO_URL} (${REPO_BRANCH}) to ${APP_DIR}"
  git clone --quiet --branch "${REPO_BRANCH}" "${REPO_URL}" "${APP_DIR}"
fi
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

echo "==> install and build"
sudo -u "${APP_USER}" -H bash -c "cd '${APP_DIR}' && bun install --frozen-lockfile && bun run build"

ENV_FILE="${APP_DIR}/apps/api/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "==> first run: writing ${ENV_FILE} — add your LLM keys to it"
  cat >"${ENV_FILE}" <<EOF
# Filled in by deploy/install.sh on first install. See .env.example for every
# setting. The service reads only this file.
PORT=3000
SQLITE_PATH=${STATE_DIR}/grugchug.sqlite

# Pick a vendor and give it all three values.
LLM_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_FLASH_MODEL=
GEMINI_PRO_MODEL=
GROQ_API_KEY=
GROQ_FLASH_MODEL=
GROQ_PRO_MODEL=
EOF
  chown "${APP_USER}:${APP_USER}" "${ENV_FILE}"
  chmod 0600 "${ENV_FILE}"
fi

echo "==> systemd"
install -m 0644 "${APP_DIR}/deploy/grugchug.service" /etc/systemd/system/grugchug.service
systemctl daemon-reload
systemctl enable --quiet grugchug
systemctl restart grugchug
sleep 2
systemctl --no-pager --lines=5 status grugchug || true

echo
echo "grugchug is listening on http://localhost:3000"
echo "  health:  curl -s localhost:3000/api/health"
echo "  logs:    journalctl -u grugchug -f"
echo "  config:  ${ENV_FILE}  (then: systemctl restart grugchug)"
echo "Publish it with Cloudflare Tunnel: docs/deploy.md"
