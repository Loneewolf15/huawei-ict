# Huawei ICT Accountability Partner System

A fair, transparent accountability-partner matching system for Huawei ICT Academy students. Students register with their name and track, receive a number, then an admin runs a cryptographic shuffle to pair them with a partner from the same track.

---

## ⚡ Quick Start

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project (remember your database password)
3. In the left sidebar → **SQL Editor** → paste the contents of `schema.sql` and click **Run**
4. In **Project Settings → API**, copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon public key** (long JWT string)

### 2. Configure the app

Open `js/config.js` and fill in your credentials:

```js
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
const ADMIN_PASSWORD = 'your-secret-password';  // change this!
```

### 3. Deploy

#### Option A — Netlify Drop (easiest, free)
1. Go to [netlify.com/drop](https://app.netlify.com/drop)
2. Drag the entire project folder onto the page
3. Done! You'll get a live URL instantly.

#### Option B — GitHub Pages
1. Push the project to a GitHub repository
2. Go to **Settings → Pages → Source: main branch / root**
3. Your site will be live at `https://yourusername.github.io/huawei-ict-accountability/`

#### Option C — Any static host
Upload all files to any web server (cPanel, Vercel, Surge.sh, etc.)

---

## 📄 Pages

| Page | URL | Purpose |
|---|---|---|
| Registration | `index.html` | Students enter name + track → get their number |
| Partner Lookup | `results.html` | Enter number + track → see accountability partner |
| Admin Panel | `admin.html` | View stats, trigger shuffle, view all pairs |

---

## 🔀 How the Shuffle Works

1. Students register and are assigned sequential numbers **per track** (1, 2, 3…)
2. Admin opens `admin.html` and enters the password
3. Admin clicks **"Run Accountability Shuffle"** after everyone registers
4. The algorithm:
   - Splits all participants by track
   - Within each track: runs a **Fisher-Yates shuffle using `crypto.getRandomValues()`** (cryptographically secure — cannot be predicted or manipulated)
   - Pairs people sequentially: 1↔2, 3↔4, 5↔6…
   - If the track has an odd number of people, the last person joins the previous pair as a **trio**
5. Results are written to Supabase and **locked** — the shuffle cannot be re-run
6. Students visit `results.html` and look up their number to see their partner

### Why is it fair?
- Uses `crypto.getRandomValues()` — not `Math.random()`, which is predictable
- Uses **rejection sampling** to eliminate modulo bias (a subtle but real fairness issue)
- Results are stored in a database, not generated fresh each lookup (everyone sees the same result)
- The admin cannot choose or influence pairs — the algorithm is deterministic once triggered

---

## 🗄 Database Schema

```sql
participants (
  id UUID PRIMARY KEY,
  name TEXT,
  track TEXT (Cloud | Network | Computing | AI),
  number INTEGER,
  partner_id UUID → participants(id),
  created_at TIMESTAMPTZ
)

shuffle_state (
  id INTEGER = 1,  -- singleton row
  shuffled BOOLEAN,
  shuffled_at TIMESTAMPTZ
)
```

---

## 🔧 Customisation

| What | Where |
|---|---|
| Change tracks | `js/config.js` → `TRACKS` array + update HTML `<option>` tags |
| Change max per track | `js/config.js` → `MAX_PER_TRACK` |
| Change admin password | `js/config.js` → `ADMIN_PASSWORD` |
| Change branding/colors | `css/styles.css` → `:root` variables |

---

## 🚨 Security Notes

- The admin password is stored in `config.js` (client-side). This is fine for a closed academic event but **not suitable for a public production app**.
- For stronger security: replace the password gate with [Supabase Auth](https://supabase.com/docs/guides/auth) and move the shuffle logic to a [Supabase Edge Function](https://supabase.com/docs/guides/functions) using the service role key.
- RLS policies currently allow any client to update `partner_id`. For production, restrict updates to authenticated admins only.

---

## 📁 File Structure

```
huawei-ict-accountability/
├── index.html          ← registration page
├── results.html        ← partner lookup page
├── admin.html          ← admin dashboard
├── schema.sql          ← Supabase database schema (run once)
├── css/
│   └── styles.css      ← all styles (Huawei red + dark theme)
├── js/
│   ├── config.js       ← ⚙️ edit this with your credentials
│   ├── register.js     ← registration logic
│   ├── results.js      ← partner lookup logic
│   └── admin.js        ← admin panel logic (shuffle algorithm lives here)
└── README.md
```

