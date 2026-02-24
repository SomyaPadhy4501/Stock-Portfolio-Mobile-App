#!/bin/bash
# Run mobile app with Node 18 (required for Expo)
export PATH="/opt/homebrew/opt/node@18/bin:$PATH"
cd "$(dirname "$0")/mobile"
npx expo start "$@"
