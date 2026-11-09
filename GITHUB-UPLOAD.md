# GitHub-এ আপলোড করার নিয়ম

ওয়েবসাইটের সব ফাইল **`site`** ফোল্ডারে রাখা আছে। শুধু এই ৪টা ফাইল আপলোড করবে:

```
site/
├── index.html
├── style.css
├── app.js
└── firebase-config.js
```

(`START.bat`, `server.ps1`, `README.md`, `database.rules.json` আপলোড করার দরকার নেই।)

---

## ধাপ ১: Repository খোলো

1. <https://github.com>-এ লগইন করো।
2. ডান দিকের ওপরে **+** → **New repository**-এ ক্লিক করো।
3. Repository name দাও, যেমন: `retro-messenger`
4. **Public** সিলেক্ট করো। (ফ্রি GitHub Pages-এর জন্য Public লাগে।)
5. **Create repository** চাপো।

## ধাপ ২: ফাইল আপলোড করো

1. নতুন repo পেজে **uploading an existing file** লিংকে ক্লিক করো।
   (অথবা **Add file → Upload files**)
2. কম্পিউটারে `chat\site` ফোল্ডারটা খোলো।
3. ভেতরের **৪টা ফাইল সিলেক্ট করে** browser-এ টেনে আনো।
   ⚠️ `site` ফোল্ডারটা নয়, ভেতরের ফাইলগুলো, যাতে `index.html` repo-র একদম শুরুতে থাকে।
4. নিচে **Commit changes** চাপো।

## ধাপ ৩: GitHub Pages চালু করো

1. Repo-র ওপরে **Settings** → বাম দিকে **Pages**।
2. **Source:** `Deploy from a branch`
3. **Branch:** `main` এবং ফোল্ডার `/ (root)` সিলেক্ট করে **Save** চাপো।
4. ১-২ মিনিট অপেক্ষা করে পেজ রিফ্রেশ করো। ওপরে লিংক দেখাবে:

```
https://তোমার-username.github.io/retro-messenger/
```

এই লিংক Priya-কে পাঠাও। ফোন বা কম্পিউটার, দুটোতেই চলবে।

---

## পরে কিছু বদলাতে চাইলে

Repo-তে ফাইলের নামে ক্লিক করো → পেন্সিল (✏️) আইকনে ক্লিক করে এডিট করো → **Commit changes**।
অথবা একই নামের নতুন ফাইল আবার **Upload files** দিয়ে দিলে পুরনোটা বদলে যাবে।
১-২ মিনিট পর সাইট আপডেট হয়ে যাবে।

## ⚠️ জরুরি: নিরাপত্তা

Repo public হওয়ায় `firebase-config.js` সবাই দেখতে পাবে। এটা স্বাভাবিক, Firebase-এর apiKey গোপন কিছু না। কিন্তু database এখন **open**, তাই লিংক বা database URL যে পাবে সে-ই মেসেজ পড়তে ও লিখতে পারবে।

আসলভাবে ব্যবহারের আগে `README.md`-এর **Private mode** ধাপগুলো করো:
1. Firebase-এ Email/Password লগইন চালু করো, Anik আর Priya-র জন্য দুটো account বানাও।
2. `database.rules.json`-এ দুজনের UID বসিয়ে Firebase Console-এ Rules publish করো।
3. `site/firebase-config.js`-এ `USE_AUTH = true` করো আর দুজনের email বসাও, তারপর GitHub-এ আবার আপলোড করো।
4. Firebase Console → **Authentication → Settings → Authorized domains**-এ `তোমার-username.github.io` যোগ করো।
