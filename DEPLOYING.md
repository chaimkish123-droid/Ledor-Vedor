# Putting L'Dor VaDor somewhere your family can reach it

## Never done this before? Start here

You need two accounts and about twenty minutes. No terminal, no commands.

**What you are doing:** your code sits on GitHub. A hosting company reads it,
builds it, and runs it at a web address. You give that address to your family.

**What it costs:** roughly five US dollars a month. Prices change, so check the
host's own page rather than trusting this line.

### Before you start

You need the code on GitHub, which it already is, and a card for the host. That
is all.

### Step by step, on Railway

Railway is the gentlest of these because almost everything is done by clicking.

1. Go to **railway.com** and sign in with your GitHub account.
2. Press **New Project**, then **Deploy from GitHub repo**.
3. Choose this repository. Railway will ask for permission to read it — that is
   normal, and you can limit it to this one repository.
4. It will find the `Dockerfile` on its own and start building. The first build
   takes a few minutes. Watch the log; it should end with something like
   *Compiled successfully*.
5. **The important step.** Open your service, go to **Settings → Volumes**, and
   add a volume mounted at exactly:

   ```
   /data
   ```

   This is where your family's archive lives. Without it, everything you enter
   disappears the next time the application restarts. Do not skip this.
6. Still in **Settings**, find **Networking** and press **Generate Domain**.
   You will get an address like `ldor-vador-production.up.railway.app`.
   HTTPS is automatic.
7. Open that address. It should show **Begin your family's archive**. Create
   your account — you are the first person, so you become the administrator.

That is it. It is live.

### If you would rather pay less and use the terminal

Fly.io costs roughly half as much, and the `fly.toml` in this repository is
already written for it:

```bash
# Install their tool once, then:
fly auth login
fly launch --no-deploy
fly volumes create family_archive --size 3
fly deploy
```

### The first things to do once it is live

1. **Add yourself**, then a parent, then a grandparent. Check the tree looks
   right.
2. **Invite one relative** — the menu under your initials, top right. Send them
   the link and make sure it works for them before inviting everyone.
3. **Make a second administrator.** If you are the only one and you are
   unreachable, nobody can help a relative who is locked out.
4. **Copy a backup off the host.** See *Backups* below. This is the step people
   skip and then regret.

### When something goes wrong

The build log and the application log are both in the host's dashboard, and
almost every problem shows up plainly in one of them. Copy the red text and
bring it back — that is usually enough to fix it in one go.

Two that are worth knowing in advance:

- **Everything disappeared after a restart** — the volume is missing or mounted
  somewhere other than `/data`. Step 5.
- **Signing in does nothing, or it forgets you immediately** — the address is
  not on HTTPS. Session cookies refuse to travel over plain HTTP.

---

Everything here needs three things and nothing else:

1. Somewhere that runs a container.
2. A **persistent disk** mounted at `/data`. This is not optional — it is where
   the family's archive lives.
3. **HTTPS.** Session cookies are marked `secure` in production and will not
   survive plain HTTP.

Serverless hosts such as Vercel are the one place this will not work: SQLite
needs a disk that survives between requests.

---

## The shape of it

The image carries no data. Everything — the archive, the photographs inside it,
and its backups — lives on the volume, so redeploying the application never
touches the family's history. Upgrading is: build the new image, restart, done.
Schema changes apply themselves on start-up, adding to the database rather than
rebuilding it.

```
your-host
├── the container   ← replaced on every deploy, holds nothing
└── /data           ← never replaced
    ├── family.db          the entire archive: people, stories, photographs
    └── backups/           verified copies, pruned to the most recent 14
```

---

## Any host that takes a container

```bash
docker build -t ldor-vador .
docker volume create family-archive
docker run -d --name ldor-vador \
  --restart unless-stopped \
  -p 3000:3000 \
  -v family-archive:/data \
  ldor-vador
```

Or with the compose file in this repository:

```bash
docker compose up -d
```

Then put it behind HTTPS — a managed host does this for you; on your own
machine, Caddy is two lines:

```
family.example.com {
    reverse_proxy localhost:3000
}
```

## Fly.io

```bash
fly launch --no-deploy          # detects the Dockerfile
fly volumes create family_archive --size 3   # gigabytes; photographs live here too
fly deploy
```

`fly.toml` in this repository already mounts the volume at `/data` and points
the health check at `/api/health`.

## Railway or Render

Both take the Dockerfile as it is. Add a volume mounted at `/data`, and set the
port to 3000. Nothing else is needed.

---

## Settings

Everything has a working default; none of these are required.

| Variable | Default | What it does |
| --- | --- | --- |
| `LDOR_DATA_DIR` | `/data` in the image | Where the archive lives. |
| `LDOR_BACKUP_DIR` | `<data>/backups` | Where backups are written. |
| `LDOR_BACKUP_HOURS` | `24` | Hours between automatic backups; `0` turns them off. |
| `LDOR_BACKUP_KEEP` | `14` | How many to keep before pruning the oldest. |
| `LDOR_MAX_PHOTO_MB` | `8` | Largest photograph accepted, after the browser resizes it. |
| `LDOR_SEED_DEMO` | off in production | `true` loads the demonstration family deliberately. |

---

## The first five minutes

1. Open the address. A new instance sends you to **`/setup`**.
2. Create the founding account. That page then disappears for good — everyone
   else arrives by invitation.
3. Find yourself in the family, or add yourself if the archive is empty.
4. Invite one relative from the menu under your initials, and check the link
   works for them.
5. Take a backup by hand (**Who has an account → ** or `npm run backup`) and
   **copy it off the machine**. See below.

---

## Backups, and the part people skip

The application backs itself up daily, verifies each copy by opening it and
running an integrity check, and keeps the most recent fourteen. That protects
you from a mistake inside the application — someone deleting the wrong person,
an import that went badly.

It does **not** protect you from losing the machine. Those backups are on the
same disk as the original, which makes them half a backup. Copy them somewhere
else on a schedule:

```bash
# From anywhere with access to the host, nightly:
rsync -az --delete your-host:/data/backups/ ~/family-archive-backups/
```

On Fly.io, `fly ssh sftp get /data/backups/...`; with Docker,
`docker cp ldor-vador:/data/backups ./`.

Restoring, if it ever comes to that:

```bash
npm run restore                          # lists what is available
npm run restore -- family-2026-08-16....db
```

The archive being replaced is itself copied aside first, so a restore can never
be the step that loses something.

---

## If somebody cannot get in

There is no password email, deliberately: it would mean mail credentials to
keep, deliverability to worry about, and another thing to fail at the moment
somebody needs it. Instead an administrator opens **Who has an account**, presses
*They cannot sign in*, and sends the link the way they would normally reach that
relative. It works once, expires after two days, and signs that account out
everywhere when it is used.

Keep at least two administrators, so nobody is locked out of the archive because
one person is unreachable.

---

## Worth checking after you deploy

- `https://your-address/api/health` returns `{"status":"ok"}`.
- The address redirects to `/setup` before you make an account, and to `/signin`
  afterwards.
- An invitation link works in a browser that has never signed in.
- A backup appears in `/data/backups` within a day, and you can copy one off the
  machine.
- Restarting the container leaves the family exactly as it was.
