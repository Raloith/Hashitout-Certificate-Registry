# CertChain: one-page note (HASH-IT-OUT 2026, Track 1)

**Team:** Rakshit Sanghi (solo): contract, frontend, deployment. **Network:** Base Sepolia (chain 84532).

* **Live app:** https://raloith.github.io/Hashitout-Certificate-Registry/
* **Repo:** https://github.com/Raloith/Hashitout-Certificate-Registry
* **Contract:** [0x5256Ac6F543aFFd4E7a402ee2D8D0e7965441B0f](https://sepolia.basescan.org/address/0x5256Ac6F543aFFd4E7a402ee2D8D0e7965441B0f)
* **Tx 1, issue C-1042:** https://sepolia.basescan.org/tx/0xa0e3b8598ca62a086025543a7fcb7d27d2773c16e1110b8d7cbc589eb170b88b
* **Tx 2, correct C-1042:** https://sepolia.basescan.org/tx/0xeeaee8052b7de43a7e3a0a5b32f75a39a3a00ea7bb06d47e979a60c59acce624

### 1. The user and their one task
An **internship recruiter** gets a CV from a BPDC student that lists "C-1042: Intro to Solidity Workshop – Participant (BPDC Coding Club)". In seconds, with no wallet or login, they type the code into CertChain and see whether it is **Valid, Valid (corrected), Revoked or Not found**, who issued it, and its full history. The **issuers** are BPDC clubs and departments, approved by the **admin** (the Student Affairs office). Their one task is to issue, or fix, a certificate without anyone being able to fake one.

### 2. On the blockchain
* The admin wallet.
* The list of approved issuer wallets with display names.
* For every certificate code, an **append-only list of versions**. Each version holds a holder ID (a fake ID like S-001, or a hash), title, reason for the change, issuer wallet, status (issued, corrected or revoked), time and block number.
* Events for every action.

### 3. Only on the page
* The big verdict (Valid, Valid (corrected), Revoked or Not found), worked out from the latest version.
* Readable dates and Basescan links. The page finds each version's transaction from the block it was posted in.
* The issuer's name next to its wallet.
* The issuer list for the admin.
* Friendly error messages decoded from the contract's refusal.
* The user's own list of transaction hashes, saved in their browser.

### 4. What the contract refuses
* A wallet that isn't an approved issuer can't post: **"Only an authorized issuer can post."**
* Only the admin can add or remove issuers: **"Only the admin can manage issuers."**
* A certificate code can't be issued twice: **"Certificate code already exists."**
* You can't correct or revoke a code that was never issued: **"Certificate not found."**
* Only the club that issued a certificate can correct or revoke it: **"Only the original issuer can correct this."**
* Nothing can change after a revoke: **"Certificate is revoked."**
* There is no function to edit or delete anything. A correction is always a new version.

### 5. How to run it
1. Open https://raloith.github.io/Hashitout-Certificate-Registry/
2. **Verify tab:** type a code like **C-1042** and press Verify. No wallet needed.
3. **Issuer and Admin tabs:** press Connect MetaMask. The site switches to Base Sepolia by itself.
4. To try a refusal, connect any wallet that isn't an issuer and press Issue.

Locally: `npm install && npm test`, then `npx serve docs`.

### 6. Path to real life
Unlike a shared spreadsheet, no issuer can quietly edit a record: every change is a new public version. A recruiter can check a code without trusting the admin or emailing the club. In a real deployment, we would store only a salted **hash of the student ID** on-chain, never names or marks, and the Student Affairs office would run the admin wallet, with each club or department holding its own issuer wallet.
