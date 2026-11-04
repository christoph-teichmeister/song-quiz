#!/usr/bin/env bash
# Own Wi-Fi for the party, NetworkManager only.
#   ./hotspot.sh alongside   hotspot on a second virtual interface while staying on the venue Wi-Fi (needs sudo; same channel as the venue Wi-Fi)
#   ./hotspot.sh start       hotspot on the only radio; the laptop leaves the venue Wi-Fi (needs a cable/USB tether for YouTube)
#   ./hotspot.sh stop        tear down either one
set -euo pipefail
CON=SongQuizHotspot
IF=$(nmcli -t -f DEVICE,TYPE dev | awk -F: '$2=="wifi" && $1!~/ap$/{print $1; exit}')
AP="${IF}ap"
pw() { nmcli -s -g 802-11-wireless-security.psk con show "$CON" 2>/dev/null || head -c 12 /dev/urandom | base64 | tr -dc 'a-z0-9' | head -c 10; }
case "${1:-}" in
  alongside)
    CH=$(iw dev "$IF" info | awk '/channel/{print $2}'); FREQ=$(iw dev "$IF" info | awk '/channel/{gsub(/[(]/,"");print $3}')
    BAND=bg; [ "$FREQ" -ge 5000 ] && BAND=a
    PW=$(pw); nmcli con delete "$CON" >/dev/null 2>&1 || true
    sudo iw reg set DE   # the world domain forbids 5 GHz AP mode
    iw dev "$AP" info >/dev/null 2>&1 || sudo iw dev "$IF" interface add "$AP" type __ap
    nmcli device set "$AP" managed yes
    nmcli con add type wifi ifname "$AP" con-name "$CON" ssid SongQuiz mode ap 802-11-wireless.band "$BAND" 802-11-wireless.channel "$CH" \
      ipv4.method shared wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PW" connection.autoconnect no >/dev/null
    nmcli con up "$CON" ifname "$AP"
    echo "Hotspot SongQuiz up on channel $CH next to the venue Wi-Fi. Phones reach the laptop at 10.42.0.1." ;;
  start)
    if nmcli -t -f NAME con show | grep -qx "$CON"; then nmcli con up "$CON"
    else nmcli dev wifi hotspot ifname "$IF" con-name "$CON" ssid SongQuiz password "$(pw)"; fi
    echo "Hotspot up (laptop 10.42.0.1)." ;;
  stop)
    nmcli con down "$CON" || true
    iw dev "$AP" info >/dev/null 2>&1 && sudo iw dev "$AP" del
    nmcli dev connect "$IF" || true ;;
  *) echo "usage: $0 alongside|start|stop"; exit 1 ;;
esac
