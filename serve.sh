#!/bin/bash
PORT=8080
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo ""
echo "  MLP Scoreboard is running!"
echo ""
echo "  On this Mac:  http://localhost:$PORT"
echo "  On your phone (same WiFi):  http://$IP:$PORT"
echo ""
echo "  Press Ctrl+C to stop."
echo ""
cd "$(dirname "$0")"
python3 -m http.server $PORT
