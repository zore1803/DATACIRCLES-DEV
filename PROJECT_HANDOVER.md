# Project 01 — DataCircles CRM

Markers: ❓ UNKNOWN | ⚠️ VERIFY | 🔴 CRITICAL
No secret values here — only the *names* of settings and where they live.

---

## 1. Overview

| | |
|---|---|
| **Name** | DataCircles CRM |
| **Client / internal** | Internal product of DataCircles Technology, sold to customers |
| **Purpose** | A CRM for Indian businesses: track leads, companies, deals and tasks; raise GST invoices, quotations and purchase orders; manage a team. Customers pay a monthly or yearly subscription. |
| **Status** | Live, with paying customers. Still under active development. |
| **Production URL** | https://app.datacircles.in |
| **Staging URL** | A second server exists (the "VPS" below) running the same app from the DEV repo. ⚠️ VERIFY what URL it is served on, if any. |
| **Start date** | ❓ UNKNOWN. Git history here starts mid-2026. |

---

## 2. Technology Stack

- **Frontend:** React 18, Vite, Tailwind CSS, React Router. Tables use TanStack Table.
- **Backend:** Node.js with Express.
- **Database:** MongoDB (via Mongoose). Redis sits alongside it for caching/queues.
- **Other:** Docker and Docker Compose run everything; GitHub Actions deploys; nginx serves the built frontend.

---

## 3. Architecture

```
          Customer's browser
                  |
        https://app.datacircles.in
                  |
   +--------------v---------------+
   |  nginx  (crm-frontend)       |   serves the built React app
   |  and proxies /api  ----------+--> Express API (crm-backend)
   +------------------------------+              |
                                                 |
          +--------------------+-----------------+------------------+
          |                    |                 |                  |
      MongoDB              Redis            Razorpay          SendGrid / AWS S3
   (all app data)        (cache)        (payments)        (email / file storage)
```

Everything runs as containers on one server, defined in `docker-compose.yml`:
`crm-frontend`, `crm-backend`, `crm-redis`, and `crm-tunnel` (a Cloudflare tunnel to the backend).

---

## 4. Repositories

| Repo | URL | Purpose | Branches | Owner |
|---|---|---|---|---|
| DATACIRCLES-DEV | https://github.com/zore1803/DATACIRCLES-DEV | Development. Git remote named `origin`. | `main` | zore1803 |
| DataCircles-PROD | https://github.com/zore1803/DataCircles-PROD | Production. Git remote named `aws`. | `main` | zore1803 |

Both repos hold the **same code**. The developer pushes to both:
`git push origin main` and `git push aws main`.
🔴 CRITICAL: pushing to only one leaves the other server running old code.

---

## 5. Environments

| Environment | Where | Deploy trigger |
|---|---|---|
| **Development** | A developer's own machine. Frontend `npm run dev` (port 5173), backend `npm start` (port 5000). | — |
| **Staging / DEV server** | VPS at `200.234.34.214`, logged in as `root`, code at `/root/datacircles-crm` | Push to `main` in DATACIRCLES-DEV runs the **Deploy to VPS** workflow |
| **Production** | AWS EC2 at `52.66.183.76`, logged in as `ubuntu`, code at `/home/ubuntu/datacircles-crm` | Push to `main` in DataCircles-PROD runs the **Deploy to AWS** workflow |

Both workflow files exist in both repos; each one checks which repo it's in and skips if it's the wrong one. A grey "skipped" run in GitHub Actions is normal, not a failure.

---

## 6. Infrastructure

- **Hosting:** Production on AWS EC2 (Ubuntu 26.04, 2 GB RAM, 2 CPU, Mumbai region). Staging on a separate VPS.
- **Database:** MongoDB. ⚠️ VERIFY whether this is MongoDB Atlas (hosted) or self-run — the connection string is in `MONGO_URI` on the server.
- **Domain / DNS:** `datacircles.in`, app on `app.datacircles.in`. ⚠️ VERIFY which registrar and whether DNS is on Cloudflare (a Cloudflare tunnel container runs alongside the app).
- **Storage:** AWS S3 for uploaded files, served through CloudFront.
- **CI/CD:** GitHub Actions. Each deploy SSHes into the server, pulls the code, rebuilds only the service that changed, and restarts the containers. The build runs **on the server**, not on GitHub.
- 🔴 The production server is small. The frontend build once ran out of memory and the deploy failed. An extra 2 GB swap file (`/swapfile2`) was added on 2026-09-21 to fix it. Don't remove it.

---

## 7. Accounts & Services

| Service | Purpose | Login email | Account owner | Recovery owner | Credential location | If owner leaves? |
|---|---|---|---|---|---|---|
| GitHub | Code, deploys | ❓ | zore1803 | ❓ | — | 🔴 Both repos are under one personal account. Move to an organisation. |
| AWS | Production server, S3, CloudFront | ❓ | ❓ | ❓ | SSH key file `CRM 2.0.pem` on the developer's laptop | 🔴 Only one copy of that key is known to exist |
| VPS provider (staging) | Staging server | ❓ | ❓ | ❓ | SSH key file `vps_key.txt` on the developer's laptop | 🔴 Same |
| Razorpay | Taking payments | ❓ | ❓ | ❓ | Keys in server `.env` | 🔴 |
| Auth0 | Google / social login | ❓ | ❓ | ❓ | Server and frontend `.env` | |
| SendGrid | Sending email | ❓ | ❓ | ❓ | Server `.env` | |
| MongoDB | Database | ❓ | ❓ | ❓ | Server `.env` | |
| Intercom | Customer chat widget | ❓ | ❓ | ❓ | Server and frontend `.env` | |
| Cloudflare | DNS / tunnel ⚠️ VERIFY | ❓ | ❓ | ❓ | — | |

❓ Every blank above needs an answer from the team. This is the weakest part of the handover.

---

## 8. Environment Variables (names only)

**Backend** (`backend/.env` on each server; GitHub never has them):

| Name | Purpose | Secret? |
|---|---|---|
| `MONGO_URI` | Database connection | Yes |
| `REDIS_URL` | Redis connection | Yes |
| `PORT`, `NODE_ENV`, `FRONTEND_URL` | Basic server settings | No |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `SUPER_ADMIN_JWT_SECRET` | Signing login tokens | Yes |
| `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID`, `AUTH0_NAMESPACE` | Social login | Partly |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Payments | Yes |
| `CAW_MANDATE_CEILING_RUPEES` | Max auto-pay amount (default ₹15,000) | No |
| `RAZORPAY_AUTO_REFUND_REJECTED_MANDATE` | Whether to auto-refund when a bank rejects auto-pay | No |
| `SENDGRID_API_KEY`, `EMAIL_USER`, `EMAIL_PASS`, `MAIL_USER`, `MAIL_PASS` | Email | Yes |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME`, `CLOUDFRONT_DOMAIN` | File storage | Yes |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google sign-in | Yes |
| `DECENTRO_CLIENT_ID`, `DECENTRO_CLIENT_SECRET`, `DECENTRO_MODULE_SECRET` | Banking/KYC API ⚠️ VERIFY if still used | Yes |
| `FAST2SMS_KEY` | SMS / OTP | Yes |
| `ZOOM_API_KEY`, `ZOOM_API_SECRET` | Meetings ⚠️ VERIFY if still used | Yes |
| `INTERCOM_SECRET_KEY` | Chat widget | Yes |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME` | Admin account used by `scripts/resetSuperAdmin.js` | Yes |

**Frontend** (`frontend/.env`, baked in at build time, so anyone can read them in the browser — never put a secret here):
`VITE_APP_API_URL`, `VITE_APP_AUTH0_DOMAIN`, `VITE_APP_AUTH0_CLIENT_ID`, `VITE_APP_AUTH0_AUDIENCE`, `VITE_INTERCOM_APP_ID`

**GitHub Actions secrets** (one set per repo): `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
🔴 These differ per repo: PROD points at the AWS server as `ubuntu`, DEV at the VPS as `root`. Changing `VPS_USER` by mistake broke production deploys on 2026-09-21.

---

## 9. Integrations

- **Razorpay** — subscriptions and payments. Customers either set up **auto-pay** (UPI AutoPay or card) or choose **pay manually**, where a payment link is emailed each renewal. Razorpay tells us about payments through a webhook at `POST /api/subscription/webhook`, verified with a signature.
- **Auth0** — Google and social login. Email/password and phone logins are handled by our own backend.
- **SendGrid** — all outgoing email (trial reminders, renewal notices, invoices).
- **AWS S3 + CloudFront** — uploaded files and documents.
- **Fast2SMS** — SMS / phone OTP.
- **Intercom** — the chat bubble in the app.
- **Decentro / Zoom** — keys exist; ⚠️ VERIFY whether they are still used.

---

## 10. How the System Works

**1. Signing up and the free trial.** A new user registers at `/register` (email/password, phone, or Google). The backend creates a User and an Organization, and starts a 7-day trial. Reminder emails go out 48h and 24h before it ends.

**2. Logging in.** Three ways, all ending in a token the frontend sends on every request: email/password, phone OTP, or Google via Auth0. `middlewares/userSync.js` turns that token into the matching user; if it can't find one, it replies `428 REGISTRATION_REQUIRED` and the app sends you to registration.

**3. Subscribing.** The customer picks a plan on Manage Subscription, then chooses a payment method in a popup. We create a Razorpay link (`subscriptionController.createSubscription`), they pay, and Razorpay's webhook activates the subscription. Pricing (add-ons, coupons, referral rewards, GST) is all computed in `utils/invoiceEngine.js`.

**4. Renewals.** A scheduled job runs hourly (`jobs/renewalLifecycleJobs.js`).
- *Auto-pay customers:* `utils/renewalEngine.js` charges the saved mandate. Failures become "past due" and are retried.
- *Manual customers:* `utils/manualRenewal.js` emails a payment link, reminds them on days 3 and 6, and makes the workspace read-only from day 7 until they pay.

**5. Payment that didn't register.** If a customer paid but didn't get their subscription, a super admin opens **Payment Repair** (`/super-admin/login` → wrench icon), enters the Razorpay payment id, and re-applies it.

**6. Daily CRM use.** Contacts, Companies, Deals and Tasks are list pages with filters, saved columns and bulk actions, backed by REST endpoints under `/api/...`.

**7. Documents.** Invoices, quotations, purchase orders and delivery challans. The templates live in `shared/templates/` so the browser preview and the server-generated PDF come from the same file.

**8. Access control when unpaid.** `middlewares/subscriptionGate.js` decides what a customer can do: trial, active and past-due have full access; suspended is read-only; cancelled/expired is locked.

---

## 11. Critical / Protected Areas

| Area | Where | Why it's risky | Before changing |
|---|---|---|---|
| 🔴 Billing & subscriptions | `backend/controllers/subscriptionController.js` (~7,000 lines), `utils/renewalEngine.js`, `utils/invoiceEngine.js`, `utils/manualRenewal.js` | Real money. Mistakes double-charge customers or give away paid plans. Logic is subtle and heavily commented — read the comments. | Read `CONTRIBUTING.md` and `backend/docs/audit/`. Coordinate with the team first. |
| 🔴 Razorpay webhook | `subscriptionController.handleWebhook` | The only way we learn a payment succeeded. Breaking it silently stops activations. | Test in Razorpay test mode first. |
| 🔴 Login / user lookup | `middlewares/userSync.js`, `controllers/authController.js` | A mistake locks every customer out. | Test all three login types. |
| 🔴 Deploy workflows and secrets | `.github/workflows/deploy-*.yml` | Each repo targets a different server and user. | Don't copy secrets between repos. |
| ⚠️ Forms | `backend/docs/FORMS_*.md` | Its own versioning/publishing design. | Read those docs first. |
| ⚠️ Shared document templates | `shared/templates/` | Used by both the browser and the PDF generator. | Check both outputs after editing. |

`OWNERSHIP.md` and `.github/CODEOWNERS` say who to coordinate with. Today, Billing and Forms have **no named owner**, which is itself a risk.

---

## 12. Deployment & Operations

**Run locally**
```
cd backend  && npm install && npm start      # needs backend/.env, runs on :5000
cd frontend && npm install && npm run dev    # runs on :5173
```

**Deploy:** commit, then push to both remotes. Each push builds and restarts the containers on its server (about 3–8 minutes).
```
git push origin main    # DEV / VPS
git push aws main       # PROD / AWS
```

**Watch a deploy:** `gh run watch -R zore1803/DataCircles-PROD`
**Server logs:** `ssh -i "CRM 2.0.pem" ubuntu@52.66.183.76 "docker logs --since 10m crm-backend"`

**Backups:** ❓ UNKNOWN — no backup or restore process is written down anywhere. 🔴 Find out whether MongoDB backups exist, and test a restore.

**Troubleshooting**
- *Deploy fails with "Killed"* — the server ran out of memory during the frontend build. Re-run it; check `/swapfile2` still exists.
- *Deploy fails with "handshake failed"* — wrong SSH secret in that repo.
- *Customer paid but has no subscription* — use Payment Repair.

**Never do**
- Never push to only one repo and assume both are updated.
- Never run `resetSuperAdmin.js` on production unless the admin login is genuinely lost — it replaces the account.
- Never put a secret in a `VITE_...` variable; those are public.
- Never edit billing code without reading the comments and docs around it.

---

## 13. Known Issues

- `backend/docs/KNOWN_BILLING_GAPS.md` lists billing gaps, including that UPI subscriptions can't have their amount changed at Razorpay.
- Net Banking can't be used for auto-pay: Razorpay requires a ₹0 setup for that, and our flow charges the first invoice up front. Manual payment covers those customers.
- The production server is memory-tight; frontend builds are close to the limit even with extra swap.
- Several frontend pages are very large (3,000+ lines) and the same table layout is copy-pasted across them, so UI fixes must be repeated per page.
- Duplicate libraries in `frontend/package.json` (two toast libraries, two rich-text editors, two drag-and-drop libraries).
- The git history contains at least one merge that silently reverted a fix, so check deploy settings after merges.

---

## 14. Ownership

| Role | Who |
|---|---|
| Technical owner | Rohit Zore (rohit.zore@datacircles.in), GitHub `zore1803` |
| Business owner | ❓ UNKNOWN |
| Team | `OWNERSHIP.md` mentions a teammate covering CRM features, dashboard and UI; Billing and Forms have no assigned owner. ❓ Names unknown. |
| Emergency contact | ❓ UNKNOWN |

---

## 15. History / Decisions

- **Billing was rebuilt** from Razorpay's managed Subscriptions to a "Charge-at-Will" model: we store a mandate and charge it ourselves, so we control pricing, proration and add-ons. See `backend/docs/audit/RAZORPAY_MIGRATION.md` and `CAW_BILLING_DESIGN.md`.
- **Two repos, two servers** rather than branches, so production is updated deliberately.
- **Document templates were moved to `shared/`** so the browser and the PDF generator can't drift apart.
- **Manual (non-auto-pay) billing was added** in September 2026 so customers can pay by net banking or wallet.
- ❓ Previous developers: unknown. The commit history is almost entirely one account.

---

## 16. Missing Information — questions for the team

1. Who owns the AWS, Razorpay, Auth0, SendGrid, MongoDB and domain accounts, and who can recover them? Where are those logins stored?
2. **Are there database backups?** How often, where, and has a restore ever been tested? (Biggest gap.)
3. Are the SSH keys (`CRM 2.0.pem`, `vps_key.txt`) stored anywhere besides one laptop?
4. Is MongoDB hosted (Atlas) or self-run? Who maintains it?
5. Where is DNS managed, and what is the Cloudflare tunnel container for?
6. Is the staging/VPS server used by anyone, and does it have a URL?
7. Are Decentro and Zoom still used, or can those keys be removed?
8. Who owns Billing and Forms now that `OWNERSHIP.md` lists no one?
9. Is there any error monitoring or uptime alerting, or do we only find out when a customer complains?
10. What should happen to customer data on cancellation — any retention or deletion policy?
