#!/usr/bin/env bash
# Own Wi-Fi for the party: `./hotspot.sh start` then `npm start`; `./hotspot.sh stop` rejoins the normal Wi-Fi.
# Needs NetworkManager. The Wi-Fi radio is busy while hosting: give the laptop internet via cable/USB tether (YouTube).
set -euo pipefail
CON=SongQuizHotspot
IF=$(nmcli -t -f DEVICE,TYPE dev | awk -F: '$2=="wifi"{print $1; exit}')
case "${1:-}" in
  start)
    if nmcli -t -f NAME con show | grep -qx "$CON"; then nmcli con up "$CON"
    else nmcli dev wifi hotspot ifname "$IF" con-name "$CON" ssid SongQuiz password "$(head -c 12 /dev/urandom | base64 | tr -dc 'a-z0-9' | head -c 10)"; fi
    echo "Hotspot up (laptop 10.42.0.1). Now (re)start the server: npm start" ;;
  stop) nmcli con down "$CON" || true; nmcli dev connect "$IF" ;;
  *) echo "usage: $0 start|stop"; exit 1 ;;
esac
