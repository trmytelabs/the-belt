#!/usr/bin/env bash
# One-time setup of The Belt on the patchnotes.ca server, where Docker, Caddy and the `deploy` user already serve
# Next Level. Run as root from a copy of this folder (deploy/server/):
#
#   DEPLOY_PUBKEY="ssh-ed25519 AAAA... thebelt-deploy@belt-pc" bash setup.sh [--dry-run]
#
# It installs deploy-the-belt and deploy-the-belt-gate under /usr/local/bin, lets `deploy` run the former as root
# through sudo, adds the belt's deploy key to `deploy`'s authorized_keys forced to the gate, and gives Caddy a site
# block for DOMAIN cloned from TEMPLATE_HOST's (so TLS, the Cloudflare-only rule and logging stay exactly as Next
# Level's), proxied to the belt container's loopback port. Every step is idempotent; --dry-run only prints.
#
# Settings (environment): DOMAIN (thebelt.fun), PORT (8081), TEMPLATE_HOST (nextlevel.patchnotes.ca),
# DEPLOY_USER (deploy), DEPLOY_PUBKEY (required unless the key is already installed), CADDYFILE (/etc/caddy/Caddyfile),
# TLS_CERT and TLS_KEY (paths of a certificate for DOMAIN, e.g. a Cloudflare origin certificate for thebelt.fun; the
# cloned block's own `tls` line is for the template's domain and is replaced with these when given).
set -euo pipefail

DOMAIN=${DOMAIN:-thebelt.fun}
PORT=${PORT:-8081}
TEMPLATE_HOST=${TEMPLATE_HOST:-nextlevel.patchnotes.ca}
DEPLOY_USER=${DEPLOY_USER:-deploy}
DEPLOY_PUBKEY=${DEPLOY_PUBKEY:-}
CADDYFILE=${CADDYFILE:-/etc/caddy/Caddyfile}
TLS_CERT=${TLS_CERT:-}
TLS_KEY=${TLS_KEY:-}
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
HERE=$(cd "$(dirname "$0")" && pwd)

say() { echo "[setup] $*"; }
do_or_show() { if [ $DRY = 1 ]; then echo "  would run: $*"; else "$@"; fi; }

[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
for tool in docker caddy python3 sudo visudo; do command -v "$tool" >/dev/null || { echo "missing: $tool" >&2; exit 1; }; done
[ -f "$HERE/deploy-the-belt" ] && [ -f "$HERE/deploy-the-belt-gate" ] || { echo "run from deploy/server/" >&2; exit 1; }

# ---- 1. the scripts ----
say "installing /usr/local/bin/deploy-the-belt and deploy-the-belt-gate"
do_or_show install -m 755 -o root -g root "$HERE/deploy-the-belt" /usr/local/bin/deploy-the-belt
do_or_show install -m 755 -o root -g root "$HERE/deploy-the-belt-gate" /usr/local/bin/deploy-the-belt-gate

# ---- 2. the deploy user may run deploy-the-belt as root, and nothing else through this rule ----
id -u "$DEPLOY_USER" >/dev/null 2>&1 || { say "creating user $DEPLOY_USER"; do_or_show useradd -m -s /bin/bash "$DEPLOY_USER"; }
SUDOERS=/etc/sudoers.d/deploy-the-belt
RULE="$DEPLOY_USER ALL=(root) NOPASSWD: /usr/local/bin/deploy-the-belt"
if [ -f "$SUDOERS" ] && grep -qxF "$RULE" "$SUDOERS"; then
  say "sudo rule already in place"
else
  say "writing $SUDOERS"
  if [ $DRY = 1 ]; then echo "  $RULE"; else
    printf '%s\n' "$RULE" > "$SUDOERS.tmp" && chmod 440 "$SUDOERS.tmp"
    visudo -cf "$SUDOERS.tmp" >/dev/null && mv "$SUDOERS.tmp" "$SUDOERS"
  fi
fi

# ---- 3. the deploy key, forced to the gate ----
AUTH="/home/$DEPLOY_USER/.ssh/authorized_keys"
OPTS='command="/usr/local/bin/deploy-the-belt-gate",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty'
if [ -n "$DEPLOY_PUBKEY" ]; then
  KEYBODY=$(awk '{print $2}' <<< "$DEPLOY_PUBKEY")
  if [ -f "$AUTH" ] && grep -qF "$KEYBODY" "$AUTH"; then
    say "deploy key already in $AUTH"
  else
    say "adding the belt's deploy key to $AUTH"
    if [ $DRY = 1 ]; then echo "  $OPTS $DEPLOY_PUBKEY"; else
      install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$(dirname "$AUTH")"
      printf '%s %s\n' "$OPTS" "$DEPLOY_PUBKEY" >> "$AUTH"
      chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH" && chmod 600 "$AUTH"
    fi
  fi
elif [ -f "$AUTH" ] && grep -q "deploy-the-belt-gate" "$AUTH"; then
  say "deploy key already in $AUTH"
else
  echo "set DEPLOY_PUBKEY to the public line of the belt's deploy key (thebelt_deploy.pub on the owner's PC)" >&2; exit 1
fi

# ---- 4. the Caddy site: Next Level's block with the host and upstream port swapped ----
if grep -qE "^\s*(https?://)?$DOMAIN\b" "$CADDYFILE"; then
  say "$CADDYFILE already has a site block for $DOMAIN"
else
  say "cloning $TEMPLATE_HOST's site block for $DOMAIN -> 127.0.0.1:$PORT"
  BLOCK=$(python3 - "$CADDYFILE" "$TEMPLATE_HOST" "$DOMAIN" "$PORT" "$TLS_CERT" "$TLS_KEY" <<'PY'
import re, sys
path, template, domain, port, tls_cert, tls_key = sys.argv[1:7]
lines = open(path).read().split('\n')
head = re.compile(r'^\s*(https?://)?' + re.escape(template) + r'\b.*\{\s*$')
start = next((i for i, l in enumerate(lines) if head.match(l)), None)
if start is None:
    sys.exit('no site block starting with "%s {" in %s; write one for %s by hand (reverse_proxy 127.0.0.1:%s)' % (template, path, domain, port))
depth, end = 0, None
for i in range(start, len(lines)):
    depth += lines[i].count('{') - lines[i].count('}')
    if depth == 0:
        end = i
        break
if end is None:
    sys.exit('unbalanced braces in the template block')
block = '\n'.join(lines[start:end + 1])
block = block.replace(template, domain)
block, n = re.subn(r'(reverse_proxy\s+\S*?:)\d+', lambda m: m.group(1) + port, block)
if n == 0:
    sys.exit('the template block has no reverse_proxy <host>:<port> line to point at the belt')
# log file names and the like
block = block.replace('nextlevel', 'the-belt')
if tls_cert and tls_key:
    block, n = re.subn(r'(\btls\s+)\S+\s+\S+', lambda m: m.group(1) + tls_cert + ' ' + tls_key, block)
    if n == 0:
        block = block.replace('{', '{\n\ttls ' + tls_cert + ' ' + tls_key, 1)
elif re.search(r'\btls\s+\S+\s+\S+', block):
    print("WARNING: the cloned block keeps the template domain's certificate; give TLS_CERT and TLS_KEY for " + domain + ' or Cloudflare will not trust the origin', file=sys.stderr)
print(block)
PY
  )
  echo "$BLOCK" | sed 's/^/    /'
  if [ $DRY = 0 ]; then
    BACKUP="$CADDYFILE.bak-$(date +%Y%m%d-%H%M%S)"
    cp "$CADDYFILE" "$BACKUP"
    printf '\n# The Belt (deploy/server/setup.sh in trmytelabs/the-belt)\n%s\n' "$BLOCK" >> "$CADDYFILE"
    if caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null; then
      systemctl reload caddy
      say "Caddy reloaded (backup at $BACKUP)"
    else
      cp "$BACKUP" "$CADDYFILE"
      echo "caddy validate rejected the new block; $CADDYFILE restored from $BACKUP" >&2; exit 1
    fi
  fi
fi

say "done. Next: $DOMAIN's A record at Cloudflare pointing at this server (proxied, like the template host), the repository's production secrets, then push to main."
say "By hand: deploy-the-belt <sha> < the-belt-site.tar.gz   (a gzipped tar of Dockerfile, deploy/container.Caddyfile and a built dist/)"
