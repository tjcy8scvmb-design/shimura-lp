#!/bin/bash
cd "$(dirname "$0")"
open "http://127.0.0.1:8765/index.html" 2>/dev/null || open "index.html"
exit 0
