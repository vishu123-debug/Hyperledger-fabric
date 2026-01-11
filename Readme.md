````md
# Procurement Transparency Prototype (Hyperledger Fabric Audit Trail)

This repository contains a working prototype that demonstrates how a **permissioned blockchain audit layer** can improve **verifiability** and **transparency** of procurement records by recording key tender lifecycle actions as **immutable, traceable events**.

The prototype is intentionally scoped: it does **not** attempt to implement full procurement automation, bid optimisation, or ERP-style workflow. It focuses on a clean minimum that can be evaluated reliably:

- Tender lifecycle actions: **Create Draft → Publish → Award**
- Audit trail: **who did what, when, and under what organisational authority (MSP)**
- Governance: **Authority can write; Auditor is read-only and write attempts are denied at chaincode level**

---

## Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Project Layout](#project-layout)
- [Quick Start](#quick-start)
- [Deploy / Upgrade Chaincode](#deploy--upgrade-chaincode)
- [Run the API + UI](#run-the-api--ui)
- [How to Use the Prototype](#how-to-use-the-prototype)
- [Verifying “Ledger vs World State”](#verifying-ledger-vs-world-state)
- [Common Issues & Fixes](#common-issues--fixes)
- [Notes for Evaluation](#notes-for-evaluation)
- [License](#license)

---

## Architecture

**End-to-end flow**

1. **Bootstrap UI** (browser)
2. **Node/Express API** (local server)
3. **Fabric Gateway client** (SDK connection)
4. **Peer + Chaincode** (Hyperledger Fabric)
5. **Ledger + World State** (immutable history + latest state)

**What is stored where**
- **World state** holds the *latest tender record* (current status: DRAFT/PUBLISHED/AWARDED).
- **Ledger** holds the *full history* of state transitions and audit events (append-only).

---

## Prerequisites

You need a standard Fabric dev setup:

- macOS/Linux
- Docker + Docker Compose
- Node.js (LTS recommended)
- jq (used by some scripts)
- Hyperledger Fabric binaries + samples (`fabric-samples`)

If you can run the Fabric `test-network` sample successfully, you are good.

---

## Project Layout

This prototype assumes a setup similar to:

- `~/fabric/fabric-samples/test-network`  → Fabric network
- `~/fabric/fabric-samples/chaincode/procurecc/javascript` → chaincode source (JS)
- `~/fabric/fabric-api` → Node API + public UI

Key pieces:

- **Chaincode**: JS contract implementing tenders + audit history
- **API**: Express server exposing `/api/*` routes and serving `public/`
- **UI**: Plain HTML/JS (Bootstrap) for interacting with the API

---

## Quick Start

### 1) Start the Fabric network

From the test network folder:

```bash
cd ~/fabric/fabric-samples/test-network
./network.sh down
./network.sh up createChannel -c mychannel
````

Confirm containers are running:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

You should see peers, orderer, and (often) CouchDB containers.

---

## Deploy / Upgrade Chaincode

### Chaincode name

This project uses the chaincode name:

* **Chaincode name**: `tender`
* **Channel**: `mychannel`

### Packaging/deploy

If you’re using the Fabric test-network deploy script style:

```bash
cd ~/fabric/fabric-samples/test-network

# Example deploy command (adjust if your deploy script differs)
./network.sh deployCC -c mychannel -ccn tender -ccp ../chaincode/procurecc/javascript -ccl javascript
```

After deploy, confirm it is committed:

```bash
peer lifecycle chaincode querycommitted -C mychannel -n tender
```

Expected output includes `Version: 1.0` and `Sequence: <number>`.

> If you redeploy with changes and the network is already up, you may need to increment the chaincode sequence/version depending on your deploy approach.

---

## Run the API + UI

### 1) Install API dependencies

```bash
cd ~/fabric/fabric-api
npm install
```

### 2) Start the server

```bash
node server.js
```

Expected log:

* Server running on `http://localhost:3000`
* It should print the static path for `public/`

### 3) Open the UI

Visit:

* `http://localhost:3000/`

The UI is served from:

* `fabric-api/public/index.html`

---

## How to Use the Prototype

The UI supports two modes:

* **Authority (Org1MSP)** — can write: create/publish/award
* **Auditor (Org2MSP)** — read-only: can view tenders + audit trail

### Basic scenario (recommended for evaluation)

1. Switch to **Authority**
2. Create tender `TND-001` and click **Save Draft**
3. Confirm it appears in the list with **DRAFT**
4. Open **View** and confirm details display cleanly
5. Click **Publish**, confirm status becomes **PUBLISHED**
6. Click **Award**, confirm status becomes **AWARDED**
7. Open **Audit Trail** and confirm events are listed (Create/Publish/Award)
8. Switch to **Auditor**
9. Confirm Auditor can view tender + audit trail
10. Attempt a write action as Auditor (Save Draft/Publish/Award) and confirm denial

---

## Verifying “Ledger vs World State”

This is an important concept and easy to demonstrate properly.

### World state (current tender record)

* What you see in the tender list/status is the **latest state**.

This is the operational “current value”.

### Ledger history (immutable audit trail)

* The audit trail view is generated by calling **history** from chaincode (Fabric history iterator).

This is “what happened over time”.

**Practical proof (in prototype)**

* World state shows only the latest status.
* Audit trail shows a sequence of events for the same tender ID.

If you want to confirm CouchDB (if enabled by test-network):

* Open `http://localhost:5984/_utils`
* Login is typically `admin / adminpw`
* You can browse the channel database for the current record.

> Note: CouchDB shows *world state*, not the full ledger history.

---

## Common Issues & Fixes

### 1) “No .pem file found in keystore” / “Invalid key type”

Fabric test-network identities often use `priv_sk` rather than `.pem`.

Fix approach:

* Your gateway code should locate the actual private key file present in:
  `.../msp/keystore/`

Check it:

```bash
ls -la ~/fabric/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp/keystore
```

If you see `priv_sk`, your code must load that.

---

### 2) “FAILED_PRECONDITION: no peers available to evaluate”

Usually one of these:

* network not up
* wrong peer address / TLS config
* containers stopped

Fix:

```bash
cd ~/fabric/fabric-samples/test-network
./network.sh down
./network.sh up createChannel -c mychannel
```

Confirm:

```bash
docker ps | grep peer0.org1.example.com
```

---

### 3) Static files not loading (CSS 404)

Ensure:

* the server uses `express.static()` to serve `public/`
* filenames match exactly (e.g., `style.css` vs `styles.css`)
* your HTML references the correct file

Quick check:

```bash
curl -I http://localhost:3000/style.css
```

---

### 4) “ABORTED: failed to endorse transaction”

This is a wrapper error. The root cause is typically:

* chaincode container crash
* chaincode name mismatch
* policy/identity mismatch
* chaincode threw an error

Check peer logs:

```bash
docker logs peer0.org1.example.com --tail 120
```

If the message includes access denial for Org2MSP, that’s expected in Auditor mode.

---

## Notes for Evaluation

This prototype is designed for evidence capture.

Recommended evidence set:

* Authority create tender (filled form) + tender list showing DRAFT
* Publish/Award status transitions
* Audit trail showing event history + MSP authority label
* Auditor view access + write denial evidence

The evaluation claim is strictly:

* **immutability + traceability + role enforcement** for key tender actions

It does not claim:

* procurement optimisation
* integration with GeM/CPPP
* production deployment feasibility

---

## License

Internal academic prototype for dissertation evaluation. Not intended for production deployment.

```
::contentReference[oaicite:0]{index=0}
```
