# CertChain: tamper-proof certificates for BPDC clubs and departments

**HASH-IT-OUT 2026, Track 1 (Digital Identity): Blockchain-Based Certificate Verification System**

## Deliverables

| Item | Link |
|---|---|
| **Live app** | https://raloith.github.io/Hashitout-Certificate-Registry/ |
| **Repository** | https://github.com/Raloith/Hashitout-Certificate-Registry |
| **Contract (Base Sepolia, chain 84532)** | [`0x5256Ac6F543aFFd4E7a402ee2D8D0e7965441B0f`](https://sepolia.basescan.org/address/0x5256Ac6F543aFFd4E7a402ee2D8D0e7965441B0f) |
| **Proof tx 1: issue C-1042** | [`0xa0e3b8598ca62a086025543a7fcb7d27d2773c16e1110b8d7cbc589eb170b88b`](https://sepolia.basescan.org/tx/0xa0e3b8598ca62a086025543a7fcb7d27d2773c16e1110b8d7cbc589eb170b88b) |
| **Proof tx 2: correct C-1042 (new version)** | [`0xeeaee8052b7de43a7e3a0a5b32f75a39a3a00ea7bb06d47e979a60c59acce624`](https://sepolia.basescan.org/tx/0xeeaee8052b7de43a7e3a0a5b32f75a39a3a00ea7bb06d47e979a60c59acce624) |
| **One-page note** | [NOTE.md](NOTE.md) |
| **Who did what** | Rakshit Sanghi: contract, frontend, deployment |

Try it: open the live app, type **C-1042** and press **Verify**. The result is **✔ Valid (corrected)**, with the full version history.
[Direct link](https://raloith.github.io/Hashitout-Certificate-Registry/?code=C-1042)

---

## Features

* **Verify in two ways, with no wallet:** scan the QR code on a certificate, or type the certificate code (e.g. C-1042). The result is read live from the contract.
* **Scan-to-verify QR certificates:** after a successful check, the site shows a certificate with a QR code that links to `…/?code=C-1042`. You can print it or save it as a PDF from the browser, or download just the QR as a PNG.
* **Downloadable PDF certificate:** an A4 landscape design on the background artwork. It shows the on-chain title, a recipient name (typed in and printed only, **never stored on chain**; defaults to the holder ID), three signature lines and the QR code. A revoked certificate gets a **REVOKED** watermark.
* **Issuer and admin desks:** issue, correct and revoke certificates, and manage issuer wallets with MetaMask. Refusals from the contract are shown as friendly messages.

## What it is

A BPDC club or department issues a certificate for an event or workshop, for example
**C-1042: "Intro to Solidity Workshop", holder S-001**. The certificate is written to a smart contract on the Base Sepolia blockchain.

An internship recruiter types **C-1042** into the website. In a few seconds they see **✔ Valid**, **✔ Valid (corrected)**,
**⛔ Revoked** or **✖ Not found**, plus who issued it and its full history. They need no wallet and no login, and they don't have to trust anyone.

**Why not a shared spreadsheet?** Anyone with edit access can quietly change a spreadsheet, and the reader has to trust its owner.
Here, only approved issuer wallets can post. A correction is a *new version*, and the old one stays visible forever. Anyone can check
the record directly on the public chain.

## The three roles

| Role | Who | What they can do | Enforced by |
|---|---|---|---|
| **Admin** | Student Affairs office (the deploying wallet) | Add or remove issuer wallets | `onlyAdmin` |
| **Issuer** | A club or department wallet (e.g. "BPDC Coding Club") | Issue, correct and revoke **its own** certificates | `onlyIssuer` + original-issuer check |
| **Public** | A recruiter, a university, anyone | Verify a code with no wallet | Free `view` functions |

## What the contract refuses

* **"Only an authorized issuer can post":** a wallet that isn't an approved issuer tries to issue, correct or revoke.
* **"Only the admin can manage issuers":** anyone but the admin tries to add or remove an issuer.
* **"Certificate code already exists":** someone tries to issue a code twice.
* **"Certificate not found":** someone tries to correct or revoke a code that was never issued.
* **"Only the original issuer can correct this":** a different club tries to change another club's certificate.
* **"Certificate is revoked":** someone tries to post anything after a revoke.
* There's no edit or delete function. Every change is appended as a new version.

## Architecture

```
 ┌──────────────────────────── Browser (static website, docs/) ───────────────────────────┐
 │  Verify tab ──(read, no wallet)──► public RPC https://sepolia.base.org ─┐              │
 │  Issuer tab ─┐                                                          │              │
 │  Admin tab  ─┴─(sign with MetaMask)──► MetaMask ──► Base Sepolia ───────┤              │
 └──────────────────────────────────────────────────────────────────────────┼──────────────┘
                                                                            ▼
                                             CertificateRegistry.sol (Base Sepolia)
                                             admin · isIssuer · issuerName · versions[code][]
```

* **Smart contract:** `contracts/CertificateRegistry.sol`, Solidity 0.8.24, fully commented.
  * Each certificate code maps to a **list of versions**. `issue` creates version 0, and `correct` and `revoke` append new ones.
  * Each version stores the holder ID (fake ID or hash), title, reason, issuer wallet, status, timestamp and block number.
  * Events are emitted for every action and are visible on Basescan.
* **Website:** `docs/` is plain HTML, CSS and JavaScript with **ethers.js v6** (bundled in `docs/vendor/`, so there's no build step), served by GitHub Pages.
  * `config.js` holds the contract address and network settings.
  * `contract-artifact.js` holds the compiled ABI and bytecode.
  * `app.js` contains all the logic:
    * Reading through the public RPC.
    * Connecting MetaMask and auto-switching or adding Base Sepolia.
    * Sending transactions.
    * Decoding contract refusals into friendly messages ("Refused by the contract: …").
    * Linking each version to its transaction. It looks up this contract's log for that code in the version's block.
* **Tests:** `test/test.js` deploys to a local Ganache chain and checks every rule and refusal (15 checks).

### On the blockchain vs. only on the page
* **On the blockchain:** the admin, the issuer wallets and their names, and every certificate version.
* **Only on the page:** the Valid / Corrected / Revoked / Not found verdict, which is worked out from the latest version. Also the formatted dates, explorer links, the issuer list view and friendly error text.

## Run locally

```bash
npm install      # solc, ethers, ganache (dev tools only)
npm test         # compile the contract + run the 15 local checks
npx serve docs   # or: cd docs && python3 -m http.server 8080, then open http://localhost:8080
```
MetaMask doesn't work on `file://` pages, so use a local server. To point the site at another deployment, set
`CONTRACT_ADDRESS` in `docs/config.js` or add `?contract=0x…` to the URL. The contract can also be deployed from Remix
(compile 0.8.24 → Injected Provider – MetaMask → Deploy).

## Files
```
contracts/CertificateRegistry.sol   the smart contract
compile.js                          compiles it with solc → artifacts/ + docs/contract-artifact.js
test/test.js                        local tests (every refusal)
docs/                               the website (served by GitHub Pages)
docs/vendor/                        ethers.js, qrcode-generator (QR codes), jsPDF (PDF export), all bundled locally
docs/assets/certificate-bg.png      background artwork for the PDF certificate
NOTE.md                             one-page note
EXPLAIN.md                          line-by-line contract walkthrough
DEMO.md                             demo script and Q&A
```

## Privacy and safety
This runs on testnet only, with fake data only (IDs like S-001) and no real money. In a real deployment, `holderId` would be a salted hash of the
student ID, and names would stay in the university's own system, never on a public chain.

## Who did what
* **Rakshit Sanghi:** contract, frontend, deployment.
