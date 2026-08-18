# Running it free on Oracle Cloud, forever

Oracle gives away a small server permanently — not a trial that expires. It runs
this application exactly as built, stays on whether or not your laptop is, and
costs nothing.

The trade is that you look after a Linux server. That sounds worse than it is:
it is a list of commands, and every one you need is below. Copy them in order.

**Time:** about an hour the first time, most of it waiting.
**Cost:** nothing. Oracle asks for a card to prove you are a person. Stay on
Always Free resources and it is not charged. It is worth checking your account
is set to a free tier and not upgraded to pay-as-you-go.

---

## Part 1 — Make the server

1. Sign up at **cloud.oracle.com**, choosing the Free Tier. Pick a home region
   near your family and remember which one — you cannot change it later.

2. In the console, go to **Compute → Instances → Create Instance**.

3. **Name it** something you will recognise: `ldor-vador`.

4. **Image and shape** — press *Edit* next to it:
   - Image: **Canonical Ubuntu 24.04** (or 22.04; either is fine).
   - Shape: press *Change shape*, choose **Ampere** and
     **VM.Standard.A1.Flex**, then set **2 OCPUs and 12 GB of memory**.
     Everything up to 4 OCPUs and 24 GB is free.

   > **If it says "out of capacity"** — this is the one genuinely annoying part
   > of Oracle's free tier, and it is common. Either try a different
   > *availability domain* in the dropdown, try again in a few hours, or fall
   > back to **VM.Standard.E2.1.Micro** (AMD), which is nearly always
   > available. The Micro has only 1 GB of memory, which is enough to *run*
   > this but tight to *build* it — Part 3 adds swap space, which solves that.

5. **Add an SSH key.** Choose *Generate a key pair for me* and **download the
   private key**. This file is the only way into your server — keep it
   somewhere safe, like your password manager. Losing it means starting over.

6. Leave the networking defaults, and press **Create**.

After a minute or two it shows **Running** and a **Public IP address**. Write
that number down; it is your server.

---

## Part 2 — Let the world reach it

Oracle blocks everything by default, in two separate places. You have to open
both, and forgetting the second one is the single most common reason people
give up on Oracle.

### The cloud firewall

1. On your instance page, click the **subnet** link, then the **default
   security list**.
2. **Add Ingress Rules**, twice:

   | Source CIDR | IP Protocol | Destination Port |
   | --- | --- | --- |
   | `0.0.0.0/0` | TCP | `80` |
   | `0.0.0.0/0` | TCP | `443` |

### The firewall inside the machine

This is the one people miss. Connect to the server first — on a Mac or Linux
machine, in a terminal; on Windows, in PowerShell:

```bash
chmod 600 ~/Downloads/ssh-key-*.key          # Mac and Linux only
ssh -i ~/Downloads/ssh-key-*.key ubuntu@YOUR_IP_ADDRESS
```

Say `yes` when it asks about authenticity. You are now on the server.

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## Part 3 — Prepare the machine

Still connected over SSH.

```bash
sudo apt update && sudo apt upgrade -y
```

Add swap space. On a small machine this is what stops the build running out of
memory, and it is sensible on any size:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Install Docker:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

Now **disconnect and reconnect** (`exit`, then the same `ssh` command), so that
last line takes effect. Check it worked:

```bash
docker run --rm hello-world
```

---

## Part 4 — A free address that does not change

Your server has an IP address, but people cannot type that and it cannot have
HTTPS. **DuckDNS** gives you a permanent name, free, in two minutes.

1. Go to **duckdns.org** and sign in with any account they offer.
2. Choose a name — say `kishfamily` — and press *add domain*. You now own
   `kishfamily.duckdns.org`.
3. Put your server's **public IP address** in the box beside it and press
   *update ip*.

Check it points at your server:

```bash
ping -c1 kishfamily.duckdns.org
```

The address it prints should be your server's IP.

> Prefer a proper name like `kishfamily.com`? Buy one for about £10 a year and
> point its DNS `A` record at the same IP. Everything below is identical.

---

## Part 5 — Start it

```bash
git clone -b claude/ldor-vador-vision-qr7q80 https://github.com/chaimkish123-droid/Claude-code.git ldor-vador
cd ldor-vador

# Use your own address here
export LDOR_DOMAIN=kishfamily.duckdns.org
docker compose -f docker-compose.https.yml up -d --build
```

The first build takes several minutes on a small machine. Watch it with:

```bash
docker compose -f docker-compose.https.yml logs -f
```

Press `Ctrl-C` to stop watching — that does not stop the application.

Now open **https://kishfamily.duckdns.org** in a browser. The certificate is
fetched automatically the first time, so give it a few seconds if the first
attempt looks odd.

You should see **Begin your family's archive**. Make your account — you are the
administrator.

### Make it survive a reboot

```bash
echo "LDOR_DOMAIN=kishfamily.duckdns.org" > ~/ldor-vador/.env
```

The `restart: unless-stopped` in the compose file does the rest: if Oracle
reboots the machine, the application comes back on its own.

---

## Part 6 — Backups off the machine

The application backs itself up every night, verifies each copy, and keeps the
last fourteen — but they live on the same server. Once a month, from your own
computer, pull them down:

```bash
scp -i ~/Downloads/ssh-key-*.key -r ubuntu@YOUR_IP:/var/lib/docker/volumes/ldor-vador_family-archive/_data/backups ./family-backups
```

If that path gives permission trouble, do it in two steps instead — on the
server:

```bash
docker compose -f docker-compose.https.yml exec ldor-vador sh -c 'cp /data/backups/$(ls -t /data/backups | head -1) /tmp/latest.db'
docker compose -f docker-compose.https.yml cp ldor-vador:/tmp/latest.db ~/latest.db
```

then from your own computer:

```bash
scp -i ~/Downloads/ssh-key-*.key ubuntu@YOUR_IP:~/latest.db ./family-backup.db
```

**Do this.** It is the difference between losing an account and losing your
family's history.

---

## Looking after it

**Updating**, when the code changes:

```bash
cd ~/ldor-vador && git pull
docker compose -f docker-compose.https.yml up -d --build
```

Your data is on a volume and is not touched.

**Security updates**, monthly:

```bash
sudo apt update && sudo apt upgrade -y && sudo reboot
```

**Is it alive?** `https://your-address/api/health` should say `{"status":"ok"}`.

---

## When something goes wrong

| What you see | What it is |
| --- | --- |
| The browser never connects | A firewall. Part 2 — and it is almost always the *second* one, inside the machine. |
| Certificate warnings that never clear | DuckDNS is not pointing at this server yet, or port 80 is closed. Caddy needs 80 to get the certificate, even though people use 443. |
| The build is killed part-way | Out of memory. Add the swap from Part 3, then build again. |
| Signing in does not stick | You are on `http://`, not `https://`. |
| Everything vanished after a reboot | The volume was not used. Check `docker volume ls` shows `ldor-vador_family-archive`. |

For anything else: `docker compose -f docker-compose.https.yml logs --tail 50`
usually says plainly what happened. Copy the red text and bring it back.
