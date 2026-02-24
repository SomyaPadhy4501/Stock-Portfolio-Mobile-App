# StockAI — Deployment Guide

## Option 1: Web App on Vercel (Easiest — Recruiters click a link)

### Steps:
```bash
cd ~/Desktop/Mobile\ App/mobile

# Export as a web app
npx expo export --platform web

# Install Vercel CLI
npm install -g vercel

# Deploy (creates a live URL like stockai-xyz.vercel.app)
cd dist
vercel --prod
```

Follow the prompts → you get a URL like `https://stockai-somya.vercel.app`

Put this link on your resume / LinkedIn / GitHub.

---

## Option 2: EAS Build (Real Mobile App — TestFlight / APK)

### Setup:
```bash
npm install -g eas-cli
cd ~/Desktop/Mobile\ App/mobile
eas login
eas build:configure
```

### iOS (TestFlight):
```bash
eas build --platform ios --profile preview
```
This creates an .ipa file. Upload to TestFlight → share a link with recruiters.
Requires Apple Developer account ($99/year).

### Android (APK):
```bash
eas build --platform android --profile preview
```
This creates an .apk file. Share the download link directly.
Free — no Google Play account needed.

---

## Option 3: Expo Go Link (Quick Demo)

```bash
cd ~/Desktop/Mobile\ App/mobile
npx expo start
```
Press 's' to switch to Expo Go → scan QR code.
Only works if recruiter has Expo Go installed.

---

## Option 4: GitHub Pages (Free Web Hosting)

```bash
cd ~/Desktop/Mobile\ App/mobile
npx expo export --platform web

# Push the 'dist' folder to a gh-pages branch
cd dist
git init
git add .
git commit -m "deploy"
git remote add origin https://github.com/YOUR_USERNAME/stockai.git
git push -f origin main:gh-pages
```

Live at: `https://YOUR_USERNAME.github.io/stockai`

---

## Recommended for Resume:
1. Deploy web version to Vercel (5 min)
2. Push code to GitHub (shows the codebase)
3. Add both links to resume:
   - Live Demo: https://stockai-somya.vercel.app
   - Source Code: https://github.com/somya/stockai
