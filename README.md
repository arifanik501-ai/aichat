# Retro Messenger

A tiny, text-only, two-person messenger (Anik ↔ Priya) built with vanilla HTML/CSS/JS and Firebase Realtime Database.

```
chat/
├── index.html               # ← website (these 4 files are required on GitHub)
├── style.css                #   retro terminal styling, responsive
├── app.js                   #   all app logic
├── firebase-config.js       #   ← YOUR CREDENTIALS GO HERE
├── START.bat                # double-click to run on this PC
├── server.ps1               # tiny local server used by START.bat
├── database.rules.json      # secure rules for two authenticated users
└── GITHUB-UPLOAD.md         # step-by-step GitHub Pages guide (Bengali)
```

No build step, no npm, no frameworks. Firebase is loaded from Google's CDN (modular SDK v10). Only the Realtime Database module is loaded; the Auth module is loaded only when `USE_AUTH = true`.

---

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> → **Add project** (Analytics can be turned off).
2. In the project, click the **Web** icon (`</>`) to register a web app. Hosting is optional.
3. Firebase shows a `firebaseConfig` object. Keep that page open.

## 2. Create the Realtime Database

1. Left menu → **Build → Realtime Database → Create database**.
2. Pick a location, then start in **locked mode**.
3. Copy the database URL shown at the top, for example `https://your-project-default-rtdb.firebaseio.com`.

## 3. Insert your credentials

Open **`firebase-config.js`** and replace every `YOUR_...` value with the values from step 1.3. Make sure `databaseURL` is the URL from step 2.3:

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
```

The Firebase web `apiKey` is not a secret. It only identifies the project. **Your security rules are what protect your data.**

## 4. Run it

The app uses ES modules, so it has to be served over HTTP (opening `index.html` directly with `file://` will not work).

- **On this PC:** double-click `START.bat`. Keep the window open while chatting.
- **Online:** upload the files in this folder to GitHub Pages (at least the 4 website files). See `GITHUB-UPLOAD.md`.
- Any other static host (Netlify, Vercel, Firebase Hosting) works too. Deploy this folder.

---

## Security: please read

**Choosing a profile on the landing page is not authentication.** Anyone with the URL can pick "Anik" or "Priya". With `USE_AUTH = false` you need open database rules, so anyone who knows your database URL can read and write your messages. Use that mode only for a quick test.

### Quick test mode only (not secure)

Set `USE_AUTH = false` and paste these rules into **Realtime Database → Rules**:

```json
{
  "rules": {
    "messages": {
      ".read": true,
      ".write": true,
      ".indexOn": ["timestamp"]
    },
    "control":  { ".read": true, ".write": true },
    "presence": { ".read": true, ".write": true },
    "typing":   { ".read": true, ".write": true },
    "seen":     { ".read": true, ".write": true }
  }
}
```

### Private mode (recommended)

1. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
2. **Authentication → Users → Add user** twice, once for Anik and once for Priya, each with an email and a strong password.
3. Copy each user's **User UID** from the Users table.
4. Open `database.rules.json`, replace every `ANIK_UID` and `PRIYA_UID` (use Find & Replace) with the real UIDs, then paste the whole file into **Realtime Database → Rules → Publish**.
5. In `firebase-config.js`, set:
   ```js
   export const USE_AUTH = true;
   export const authEmails = {
     anik: "the-email-you-used-for-anik",
     priya: "the-email-you-used-for-priya"
   };
   ```
6. (Recommended) **Authentication → Settings → Authorized domains**: keep only the domain(s) where you host the app.

When private mode is on, clicking **CHAT AS ANIK / PRIYA** asks for that user's password. The Firebase session is remembered, so you stay logged in after a reload. **SWITCH USER** signs you out.

What the rules enforce:

- Only the two UIDs can read messages. Everyone else is denied.
- Anik can only write messages with `sender: "anik"`, and Priya only with `sender: "priya"`. Nobody can impersonate the other person.
- Single messages can't be edited or deleted after they are sent (`!data.exists()`). Only the kill switch can delete, and it deletes everything at once.
- Text must be 1–1000 characters, the timestamp must be the server time, and extra fields are rejected.

---

## Coin toss and kill switch

- The app always opens on a **coin toss game**. Pick HEADS/TAILS and press TOSS. After the result, a **🎁 FREE REDEEM CODE** box appears (disguised as a game promo).
- Enter the code (`ACCESS_CODE` in `firebase-config.js`, default `2645`) to open the messenger. After 3 wrong codes the box hides until the next toss. Reloading the page always goes back to the game.
- **■ KILL SWITCH** (above the chat): the screen goes back to the game instantly, **all messages are permanently deleted** for both people, and the other person's screen also jumps back to the game. There is no undo.
- **Auto-lock:** if the app stays in the background (other tab or app, screen off) for `AUTO_LOCK_SECONDS` (default 60), it returns to the game. Messages are not deleted.
- The code only hides the messenger from casual eyes.

## Chat extras

- **Online / last on:** the header shows whether the other person has the chat open right now, or when they were last on.
- **Typing indicator:** "PRIYA is typing…" appears above the input. It is written only when typing starts or stops, not on every key.
- **Ticks** on your own messages: `…` sending, `✓` sent, `✓✓` (green) seen by the other person. Anyone can read it in the page source. Real protection comes from `USE_AUTH` plus the security rules.

---

## Data structure

```
messages
  └── <pushId>
        ├── sender:    "anik" | "priya"
        ├── receiver:  "priya" | "anik"
        ├── text:      "Hello!"
        └── timestamp: 1731100000000   (server time)
presence/{anik|priya}: { conns: { <deviceId>: true }, at: last-on server time }
typing/{anik|priya}:   true/false
seen/{anik|priya}:     server time when that person last viewed new messages
control
  └── kill
        ├── id: "lx3k9a2f8q"           (set by the kill switch; a new id tells the other device to lock)
        └── at: 1731100000000
```

The timestamp uses `serverTimestamp()` rather than `Date.now()`, so messages stay in the correct order even if one phone's clock is wrong.

## Performance notes

- Only the newest `MESSAGE_LIMIT` (default 100) messages are loaded: `orderByChild("timestamp") + limitToLast(100)`, backed by the `.indexOn` rule.
- `onChildAdded` downloads each message once. New messages arrive one at a time; the full list is never fetched again.
- Listeners are removed when you switch users.
- No images and no web fonts. The whole app is about 15 KB plus the Firebase SDK.
