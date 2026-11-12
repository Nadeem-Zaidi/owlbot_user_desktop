# Deploying Owl Bot (owlbot + react-ts-vite-app) to AWS

This covers the fastest path first — a single EC2 instance running your existing `docker-compose.yml` almost unchanged — then a short note on the scaled-out version for later.

## Why start with EC2, not ECS/EKS

Your stack has one component that doesn't fit "serverless" containers cleanly: **Qdrant** needs a persistent local volume, and Postgres does too. Moving straight to ECS Fargate means solving EFS-backed volumes and a managed Postgres migration on day one. A single EC2 box running `docker compose up` is the same architecture you already have, just on a bigger machine with a public IP — you can graduate to ECS + RDS + a managed vector DB later without rewriting anything now.

---

## 1. Before you touch AWS: rotate your leaked credentials

Earlier in this project your `.env` (OpenAI key, AWS access key `AKIAQUJAFNH5POFKNNZR` + secret, Postgres password, Jira token) was printed in full in this chat. If you haven't rotated these yet, **do it now, before deploying anywhere** — don't ship a fresh server with already-compromised keys baked into it.

- OpenAI: https://platform.openai.com/api-keys → revoke old key, create new one
- AWS: IAM console → Users → that user → Security credentials → deactivate + delete the old access key, create a new one (or better, skip static keys entirely — see step 6)
- Postgres password: just pick a new strong one for the `.env` you deploy with
- Jira token: revoke and reissue from your Atlassian account settings

## 2. Launch the EC2 instance

Console → EC2 → Launch instance:

- **AMI**: Ubuntu 22.04 LTS (or 24.04)
- **Instance type**: `t3.medium` (2 vCPU / 4GB) is the minimum that'll comfortably run app + frontend + grpc + postgres + qdrant together; go `t3.large` if you can, Postgres+Qdrant are the two that want RAM
- **Storage**: bump the root volume to 30–50GB (Postgres/Qdrant data lives here)
- **Key pair**: create/download one — you'll SSH in with it
- **Security group**: allow inbound
  - `22` (SSH) — restrict to your IP, not `0.0.0.0/0`
  - `80` and `443` (HTTP/HTTPS) — open to the world
  - leave `5432`, `6333`, everything else **closed** to the internet — those only need to be reachable *between* your containers, which docker-compose handles internally
- **Elastic IP**: after launch, allocate one and associate it to the instance, so the public IP doesn't change on reboot

## 3. Install Docker on the instance

SSH in, then run:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and back in (or run `newgrp docker`) so your user can run `docker` without `sudo`.

## 4. Get your code onto the instance

Simplest: push both repos to a git host (GitHub/GitLab, private repo) and clone them there:

```bash
git clone <your-owlbot-repo-url> owlbot
git clone <your-react-ts-vite-app-repo-url> react-ts-vite-app
```

If they're not in git yet, `scp` them up from your machine instead:

```bash
scp -i /path/to/your-key.pem -r "C:\Users\nadeem\node_prac\owlbot" ubuntu@<ELASTIC_IP>:~/owlbot
scp -i /path/to/your-key.pem -r "C:\Users\nadeem\javascript_prac\chat_ui_4\react-ts-vite-app" ubuntu@<ELASTIC_IP>:~/react-ts-vite-app
```

(Run that `scp` from a machine that has an OpenSSH client — Windows 10/11 has one built in, or use WSL/Git Bash.)

Make sure the two folders end up as **siblings** on the instance (`~/owlbot` and `~/react-ts-vite-app`), matching whatever relative build context your `Dockerfile`/`docker-compose.yml` expects.

## 5. Write the production `.env`

On the instance, in `~/owlbot`:

```bash
cd ~/owlbot
cp .env .env.example   # keep a template without secrets, if you want to commit it later
nano .env
```

Put in your **rotated** OpenAI key, a fresh Postgres password, and (see next step) either fresh AWS keys or none at all. Do **not** commit this file to git — check it's in `.gitignore`.

## 6. Give the instance an IAM role instead of static AWS keys

Since your S3 access keys already leaked once, don't put new static keys in `.env` at all. Instead:

1. IAM console → Roles → Create role → AWS service → EC2
2. Attach a policy scoped to just your bucket, e.g.:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::YOUR-BUCKET-NAME",
        "arn:aws:s3:::YOUR-BUCKET-NAME/*"
      ]
    }
  ]
}
```

3. EC2 console → your instance → Actions → Security → Modify IAM role → attach the role you just created
4. On the instance, remove `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` from `.env` entirely

The AWS SDK v3 (`@aws-sdk/client-s3`) automatically picks up credentials from the instance's IAM role when no explicit keys are configured — as long as your `S3Client` is constructed as `new S3Client({ region: "..." })` without a `credentials:` block. If your `s3_client.ts` currently does `credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, ... }`, drop that block (or make it conditional on the env vars being set) so it falls through to the instance role.

## 7. Bring the stack up

```bash
cd ~/owlbot
docker compose up -d --build
docker compose ps
```

All five services (`app`, `frontend`, `grpc`, `postgres`, `qdrant`) should show `Up`. Tail logs if anything's not healthy:

```bash
docker compose logs -f app
```

At this point `http://<ELASTIC_IP>` should serve your frontend, proxying `/api`, `/list_files`, `/upload`, `/delete` to the backend exactly like it does locally.

## 8. Put a real domain + HTTPS in front of it

1. Route 53 (or your existing DNS provider) → point an A record at your Elastic IP
2. On the instance, install certbot and get a cert for that domain, then have nginx terminate TLS — either:
   - run certbot directly against the `frontend` container's nginx config (needs port 80 briefly reachable, which it already is), or
   - simpler for a single box: put an `nginx` or Caddy reverse proxy **in front of** your existing stack, handling only TLS termination and forwarding to the frontend container's port 80

If you want the least fuss, swap the reverse-proxy layer for **Caddy** instead of certbot+nginx — it gets you automatic HTTPS with a 5-line Caddyfile:

```
your-domain.com {
    reverse_proxy localhost:80
}
```

Run it as one more service in `docker-compose.yml` (or standalone), pointing `frontend`'s exposed port to something other than 80 (e.g. `8080:80`) so Caddy can own 80/443.

## 9. Backups (don't skip this)

Postgres and Qdrant data live in Docker volumes on that one EBS root volume — if the instance dies, so does your data, unless you back it up.

- **Cheapest**: enable EBS snapshot automation (Data Lifecycle Manager) on the root volume — daily snapshot, retain 7.
- **App-level**: a cron job dumping Postgres to S3:

```bash
# /etc/cron.d/pg-backup — runs nightly at 2am
0 2 * * * root docker exec owlbot-postgres-1 pg_dump -U postgres owlbot | gzip > /home/ubuntu/backups/owlbot-$(date +\%F).sql.gz && aws s3 cp /home/ubuntu/backups/owlbot-$(date +\%F).sql.gz s3://YOUR-BACKUP-BUCKET/
```

(container name may differ — check with `docker compose ps`)

---

## When you outgrow one EC2 box

Once this is working and you want zero-downtime deploys, auto-restart on crash, and to stop worrying about one box falling over:

- **App + frontend + grpc** → ECS Fargate services behind an Application Load Balancer (ACM handles TLS for free)
- **Postgres** → RDS for PostgreSQL — pgvector is supported as of Postgres 15+ on RDS, so your `pgvector/pgvector:pg16` image maps directly to an RDS Postgres 16 instance with the `vector` extension enabled (`CREATE EXTENSION vector;`)
- **Qdrant** → either Qdrant Cloud (managed, easiest) or self-hosted on a small dedicated EC2/ECS-with-EFS setup, since it still needs persistent storage
- **S3** stays exactly as-is

That's a bigger lift (new Dockerfiles targeting ECS task definitions, an RDS migration, load balancer + target groups) — worth doing once you have real traffic, not before.
