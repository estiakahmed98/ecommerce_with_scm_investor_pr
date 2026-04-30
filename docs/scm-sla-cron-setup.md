# SCM SLA Daily Cron Setup

This project now supports automatic Phase-2 SLA evaluation via:

- API endpoint: `/api/cron/scm/sla-evaluate`
- Local trigger script: `npm run cron:sla:trigger`
- GitHub Actions workflow: `.github/workflows/sla-daily-cron.yml`

## 1) Required environment variables

Set these in your runtime environment:

- `CRON_SECRET` (required): shared secret used by cron endpoints.
- `SLA_CRON_URL` (optional for local script): defaults to `http://localhost:3000/api/cron/scm/sla-evaluate`
- `SLA_CRON_TIMEOUT_MS` (optional): request timeout for local script (default `30000`).
- `SLA_CRON_SUPPLIER_ID` (optional): run SLA cron for one supplier.

## 2) Manual test

After starting the app:

```bash
npm run cron:sla:trigger
```

Expected: success log + JSON response from `/api/cron/scm/sla-evaluate`.

## 3) GitHub Actions daily scheduler (recommended)

Workflow file:

- `.github/workflows/sla-daily-cron.yml`

Required GitHub repository secrets:

- `SLA_CRON_URL` (example: `https://your-domain.com/api/cron/scm/sla-evaluate`)
- `CRON_SECRET` (must match app env `CRON_SECRET`)

Schedule is daily `00:30 UTC` (about `06:30 Asia/Dhaka`).

You can also run it manually from Actions tab with optional `supplier_id`.

## 4) Windows Task Scheduler option

Use this script:

- `scripts/cron/run-sla-eval.ps1`

Example action command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\Universal_Ecommerce\scripts\cron\run-sla-eval.ps1"
```

Make sure the scheduled task environment has `CRON_SECRET` and (if needed) `SLA_CRON_URL`.

## 5) Linux crontab option

Example:

```cron
30 0 * * * cd /opt/universal_ecommerce && CRON_SECRET='your-secret' SLA_CRON_URL='https://your-domain.com/api/cron/scm/sla-evaluate' npm run cron:sla:trigger >> /var/log/sla-cron.log 2>&1
```

## 6) Security checklist

- Never expose `CRON_SECRET` in code.
- Rotate `CRON_SECRET` if leaked.
- Keep cron route private and only called by trusted schedulers.
