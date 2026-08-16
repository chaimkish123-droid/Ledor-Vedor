# Running it at home, for free

This is the way to start: no bill, nothing to sign up for, and your family's
history stays on a machine in your house.

It is written in three stages on purpose. Do stage one today. Only do stage two
when you actually want to show somebody. Stage three is for when the family has
started using it and you want it to be permanent.

---

## Stage one — on your own machine, today

Nothing here touches the internet. Nobody else can reach it, including you from
your phone. This is for seeing whether you like it.

### 1. Install Docker

Docker is the thing that runs the application without you having to install
anything else.

- **Mac or Windows** — download **Docker Desktop** from docker.com and install
  it like any other program. Open it once and leave it running until it says
  *Engine running*.
- **Raspberry Pi or another Linux machine** — in a terminal:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  ```
  Then log out and back in.

> **On Windows**, Docker Desktop needs a component called WSL 2. Its installer
> normally sets that up and asks you to restart. If it complains that
> virtualisation is disabled, that is a setting in your computer's BIOS —
> search for your model plus "enable virtualisation", as the key to press
> differs by manufacturer.

### 2. Get the code onto that machine

**If you have Git**, in a terminal — Terminal on a Mac, PowerShell on Windows:

```bash
git clone https://github.com/chaimkish123-droid/Claude-code.git ldor-vador
cd ldor-vador
```

**If you do not**, and would rather not install it: open the repository page on
GitHub, press the green **Code** button, choose **Download ZIP**, and unzip it
somewhere simple like `C:\ldor-vador`. Then open a terminal in that folder — on
Windows, shift-right-click inside it and choose *Open PowerShell window here*.

Git is worth having later, because updating becomes `git pull` rather than
downloading the whole thing again.

> **Closing the PowerShell window deletes nothing.** It is a window onto your
> computer, not the thing itself — the files stay in the folder and the
> application keeps running in the background. It matters only in one way: a
> fresh window starts in your home folder, not in the project, so commands like
> `docker compose` will not find anything to run. To get back:
>
> ```powershell
> cd C:\ldor-vador
> dir
> ```
>
> If that list includes `Dockerfile` and `docker-compose.yml`, you are in the
> right place. If it does not — or if it says the path does not exist — find the
> folder in File Explorer, click the address bar, copy what is there, and use
> that after `cd` instead.
>
> One thing to watch for after unzipping: Windows often puts the contents inside
> a *second* folder of the same name, so the real project is at
> `C:\ldor-vador\Claude-code-main`. If `dir` shows a single folder and no
> `Dockerfile`, `cd` into it.

### 3. Start it

```bash
docker compose up -d
```

The first time takes a few minutes, because it is building everything. You will
know it worked when the last line does not say `error`.

The `-d` means *detached* — it does the work silently and hands you back the
prompt, which is unnerving the first time because it looks like nothing
happened. While you are getting started, leave it off:

```bash
docker compose up --build
```

Now you see every step as it goes, and the window stays busy until you press
`Ctrl-C`. That is the version to run if anything seems stuck.

### 4. Open it

Go to **http://localhost:3000** in your browser.

You should see *Begin your family's archive*. Make your account — you are the
first person, so you are the administrator.

> **If signing in seems to do nothing**, stop the app (`docker compose down`),
> open `docker-compose.yml`, and add this line under `environment:`
>
> ```yaml
>       LDOR_COOKIE_SECURE: 'false'
> ```
>
> then `docker compose up -d` again. Some browsers refuse to keep a login on a
> plain `http://` address, and this tells it to allow it while you are on your
> own machine. Take the line out again if you later put it on the internet.

### 5. Have a go

Add yourself, your parents, a grandparent. Try the search. Add a memory. See
whether it is something you would actually want your family in.

**To stop it:** `docker compose down`. Your data stays.
**To start it again:** `docker compose up -d`.
**To update it after I change something:** `git pull` then
`docker compose up -d --build`.

---

## Stage two — showing it to a few relatives

When you want somebody else to see it, you need an address on the internet.
This gives you a temporary one, free, in one command, without touching your
router.

### 1. Install cloudflared

- **Mac:** `brew install cloudflared`
- **Windows:** download `cloudflared.exe` from Cloudflare's downloads page
- **Linux or Pi:** `sudo apt install cloudflared`, or the `.deb` from the same page

### 2. Point it at the application

With the application still running, in a second terminal window:

```bash
cloudflared tunnel --url http://localhost:3000
```

It prints an address like `https://something-random-here.trycloudflare.com`.
That address works from anywhere, over HTTPS, and only shows a sign-in page to
anyone who has not been invited.

### 3. Invite one person

Send them an invitation from the menu under your initials. Check that it works
for them **before** you send it to the whole family.

### What to know about this stage

- **The address changes** every time you stop and restart that command. Fine for
  showing a few people this week; not something to put on a family group chat.
- **The tunnel only runs while that terminal window is open.** Close it and the
  address dies. Your data is untouched.
- Cloudflare passes the traffic through their network, so in principle they can
  see it in transit. For a trial with a handful of relatives, that is a
  reasonable trade for not opening anything on your router.

---

## Stage three — the family is using it

Now you want an address that does not change and a machine that is always on.
Two ways, both fine:

**Keep it at home, add a permanent address.** Buy a domain — about £10 a year —
put it on Cloudflare, and make a *named* tunnel that survives restarts.
Cloudflare's own guide covers it, and I can write the steps when you get there.

**Or move it to a host** and stop thinking about the machine. See
[DEPLOYING.md](DEPLOYING.md). Moving is copying one file, which is the next
section.

---

## Backups — do this even during the trial

Your archive is one file, inside Docker's storage. Copy it out regularly:

```bash
# Makes a folder called family-backups next to you, with everything in it
docker compose exec ldor-vador sh -c 'ls /data/backups'
docker cp ldor-vador:/data/backups ./family-backups
```

The application already backs itself up every day and keeps the last fourteen.
But those copies live on the same machine — if the laptop dies, they die with
it. Once a month, drag that `family-backups` folder somewhere else: another
computer, an external drive, a cloud drive of your choosing.

**That one habit matters more than which hosting you pick.**

To move everything to another machine or a paid host later, it is that same
file: copy `family.db` onto the new machine's `/data`, start it, and the whole
family is there — people, stories, photographs, history and all.
