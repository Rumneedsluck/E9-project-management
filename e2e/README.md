# E9 browser tests

These tests open the E9 site in a real (headless) browser and click through the important flows:
login, adding and editing tracker rows, Ctrl+Z, and billing staying closed until the JMC is signed.
Each test creates its own made-up project, so no real data is used or changed.

Start the website and the API first, then:

```bash
cd e2e
npm install
E9_E2E_EMAIL=you@example.com E9_E2E_PASSWORD='your-local-password' npx playwright test
```

Use a **local** workspace-admin login only. Never put real passwords in this folder.
