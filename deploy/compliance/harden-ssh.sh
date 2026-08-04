#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

DROP_IN=/etc/ssh/sshd_config.d/90-pjsktools-hardening.conf
mode="${1:---check}"

preflight() {
  [[ "$EUID" -eq 0 ]] || { echo "run as root" >&2; exit 1; }
  command -v sshd >/dev/null || { echo "sshd is not installed" >&2; exit 1; }
  id ubuntu >/dev/null 2>&1 || { echo "ubuntu account does not exist" >&2; exit 1; }
  home="$(getent passwd ubuntu | cut -d: -f6)"
  keys="$home/.ssh/authorized_keys"
  [[ -f "$keys" && ! -L "$keys" && -s "$keys" ]] || { echo "ubuntu authorized_keys is missing or empty" >&2; exit 1; }
  [[ "$(stat -c '%U' "$keys")" == "ubuntu" ]] || { echo "authorized_keys must be owned by ubuntu" >&2; exit 1; }
  sshd -t
  echo "preflight passed; effective settings before change:"
  sshd -T | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|maxauthtries|x11forwarding|allowusers) '
}

preflight
if [[ "$mode" == "--check" ]]; then
  exit 0
fi
if [[ "$mode" != "--apply" || "${2:-}" != "--confirmed-second-session" ]]; then
  echo "usage: $0 --apply --confirmed-second-session" >&2
  echo "keep two independently verified ubuntu SSH sessions open before applying" >&2
  exit 2
fi
[[ ! -e "$DROP_IN" ]] || { echo "refusing to overwrite existing SSH drop-in: $DROP_IN" >&2; exit 1; }

# Require two live SSH connections to reduce lockout risk. The explicit flag
# above additionally confirms that the operator tested both sessions.
connections="$(ss -Htn state established '( sport = :22 )' 2>/dev/null | wc -l)"
(( connections >= 2 )) || { echo "at least two established SSH sessions are required" >&2; exit 1; }

timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
backup_dir="/var/backups/pjsktools-ssh/${timestamp}"
install -d -m 0700 "$backup_dir"
cp -a -- /etc/ssh/sshd_config "$backup_dir/sshd_config"

temporary="${DROP_IN}.tmp.$$"
cat >"$temporary" <<'EOF'
# Managed by pjsktools compliance hardening.
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
AllowUsers ubuntu
EOF
chmod 0600 "$temporary"
mv -- "$temporary" "$DROP_IN"

if ! sshd -t; then
  rm -f -- "$DROP_IN"
  echo "sshd validation failed; original drop-in restored" >&2
  exit 1
fi

systemctl reload ssh
sleep 1
systemctl is-active --quiet ssh || {
  rm -f -- "$DROP_IN"
  sshd -t && systemctl restart ssh
  echo "SSH service check failed; original drop-in restored" >&2
  exit 1
}

echo "SSH hardening applied. Keep both current sessions open and test a third login now."
echo "Rollback backup: $backup_dir"
sshd -T | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|maxauthtries|x11forwarding|allowusers) '
