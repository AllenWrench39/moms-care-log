# Mom's Care Log 💜

A private web app for our family (5–7 people) to coordinate Mom's care from our phones.

**What it does:**
- 📋 **Today** — vitals (BP, blood sugar, temp, O2, weight, pain, mood), symptom toggles with automatic diarrhea med-hold warning, meals, fluids with a 64 oz goal bar, and shared notes
- 💊 **Meds** — all 26 medications pre-loaded and grouped by time; Give or Hold (with reason) each dose, with DO-NOT-HOLD and hold-on-diarrhea safety flags; editable schedule
- 🛁 **Care** — bowel movements, urine color, hygiene checklist, cleaning tasks, and PT exercises with sets/reps
- 📈 **Charts** — blood pressure and blood sugar over 30 days, fluids by type over 7 days
- 📅 **History** — tap any past day to see everything that was logged
- 📌 **Notes** — pinned caregiver instructions with a full change log
- 🗓 **Appts** — upcoming appointments, where, and who's driving
- ✅ **Tasks** — errands and care shifts, assignable to a family member
- 📤 **Export** — CSV download for the doctor (cleaning excluded), plus a read-only doctor view (👁 View)

Sign-in is by **email magic link** — no passwords. Only emails on the family list can see or add anything.

---

## One-time setup (about 20 minutes)

### Step 1 — Create the Supabase project

1. Go to [supabase.com](https://supabase.com), sign in, and click **New project**.
2. Name it `moms-care-log`, pick any region near you, set a database password (you won't need it again), and create it.
3. When it finishes, go to **Project Settings → API** and copy two values:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (a long string)

### Step 2 — Create the database tables

1. Open `supabase/schema.sql` from this repo.
2. **Edit the bottom of the file** — replace the example emails with each family member's real email and first name. Emails must be lowercase.
3. In the Supabase dashboard, go to **SQL Editor**, paste the whole file, and click **Run**.

> To add or remove a family member later: **Table Editor → family_members** in the Supabase dashboard.

### Step 3 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com), sign in with GitHub, and click **Add New → Project**.
2. Import this repository (`moms-care-log`).
3. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your Project URL from Step 1
   - `VITE_SUPABASE_ANON_KEY` = your anon public key from Step 1
4. Click **Deploy**. You'll get a URL like `https://moms-care-log.vercel.app`.

### Step 4 — Tell Supabase about your app URL

So magic links open the app (not localhost):

1. In Supabase: **Authentication → URL Configuration**.
2. Set **Site URL** to your Vercel URL (e.g. `https://moms-care-log.vercel.app`).
3. Under **Redirect URLs**, add the same URL.

### Step 5 — Share it with the family

Text everyone the Vercel URL. On their phone they:

1. Open the link, type their email, tap **Send sign-in link**.
2. Open the email **on the same phone** and tap the link — they're in.
3. **Add to home screen** so it feels like a real app:
   - **iPhone:** Share button → *Add to Home Screen*
   - **Android:** browser menu (⋮) → *Add to Home screen* / *Install app*

They stay signed in — the magic link is usually a one-time thing per device.

---

## Notes & tips

- **Someone gets "Not on the family list":** add their email (lowercase) to the `family_members` table in Supabase.
- **Magic link emails:** Supabase's built-in email works for a small family but is limited to a few per hour. If links stop arriving, wait an hour or set up a custom SMTP sender in Supabase (**Authentication → Emails**).
- **Free tiers** of Supabase and Vercel are more than enough for 7 people.

## Local development

```bash
cp .env.example .env   # fill in your Supabase URL + anon key
npm install
npm run dev
```
