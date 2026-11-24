# DEMO.md: deploy, submit, pitch

Time needed: about 15 minutes to deploy and record the two transactions, plus a 5-minute pitch.
**Never share your MetaMask Secret Recovery Phrase with anyone or any website. This app never asks for it.**

---

## Part 1: One-time MetaMask setup (5 min)

1. Install the **MetaMask** browser extension (metamask.io) and create a wallet, or open your existing one.
2. Turn on test networks and add Base Sepolia. The site can do this for you: press **Connect MetaMask** and approve
   "Add network" / "Switch network". Manual values if you need them:
   * Network name: `Base Sepolia`
   * RPC URL: `https://sepolia.base.org`
   * Chain ID: `84532`
   * Currency: `ETH`
   * Explorer: `https://sepolia.basescan.org`
3. Get free test ETH: use the faucet link in the hackathon channel, or one listed at
   https://docs.base.org/base-chain/tools/network-faucets (e.g. Coinbase Developer Platform faucet, Alchemy,
   QuickNode). About **0.01 test ETH** is plenty.
4. Create a **second account** for the refusal demo: MetaMask → account menu → **Add account** → "Account 2".
   It doesn't need any ETH for the normal refusal demo.

## Part 2: Deploy (2 min). No Remix needed.

1. Open the live site → **Admin** tab → **Connect MetaMask** (Account 1).
2. Press **Deploy contract** → confirm in MetaMask → wait about 5 s.
3. The page shows **"✅ Deployed! Contract address: 0x…"**. **Copy that address.** Account 1 is now the **admin**.
4. Make it the default for everyone: on GitHub, open `docs/config.js` → ✏️ Edit → paste the address into
   `CONTRACT_ADDRESS: "0x…"` → Commit. Pages updates in about 1 minute. Until then, the share link
   `…/?contract=0x…` works.
5. Also paste the address into the top of `README.md` and `NOTE.md`.

**Backup (Remix), if the Deploy button gives you trouble:**
1. Open remix.ethereum.org → new file `CertificateRegistry.sol` → paste from `contracts/`.
2. Solidity compiler 0.8.24 → **Compile**.
3. Deploy & Run → Environment **Injected Provider – MetaMask** (check that it says chain 84532) → **Deploy** → confirm.
4. Copy the address under "Deployed Contracts" and put it into `docs/config.js`.

## Part 3: Set up the story and record the TWO submission transactions (5 min)

Still on Account 1 (the admin):

1. **Admin tab → Add an issuer:** paste **your own Account 1 address** (copy it from MetaMask), name `BPDC Coding Club` → **Add issuer** → confirm.
   *(Setup step. You're acting as both Student Affairs and the club for the demo.)*
2. **Issuer tab → Issue:** code `C-1042`, holder `S-001`, title `Intro to Solidity Workshop – Participant` → **Issue certificate** → confirm.
   → **Submission transaction #1 (issue).**
3. **Issuer tab → Correct:** code `C-1042`, new title `Intro to Solidity Workshop – Winner`, reason `Wrong award typed` → confirm.
   → **Submission transaction #2 (correction, a new version; the old one stays).**
4. **Where to copy the hashes:** scroll to **"Your transactions (this browser)"** at the bottom of the page → **Copy hash** next to
   "Issue C-1042" and "Correct C-1042". Clicking a hash opens it on Basescan. You can also find them in MetaMask → Activity → the
   transaction → "View on block explorer".
   Explorer links look like `https://sepolia.basescan.org/tx/<hash>`.
5. For the live demo (needed for the revoke step): issue a second certificate, `C-1043` / `S-002` / `Web3 Bootcamp – Volunteer`, and keep it untouched so you
   can show a plain **✔ Valid** as well.

### Submission form
* **Repo link:** `https://github.com/Raloith/hashitout-certificate-registry` (live site: `https://raloith.github.io/hashitout-certificate-registry/`)
* **Contract address:** the address from Part 2.
* **Two transaction hashes:** #1 Issue C-1042 and #2 Correct C-1042, each with its `https://sepolia.basescan.org/tx/…` link.
* **One-page note:** paste `NOTE.md`.
* **Who did what:** `Rakshit Sanghi: contract, frontend, deployment`

---

## Part 4: The 5-minute pitch + demo script

Before you start, have the site open in two browser windows: one with MetaMask on **Account 1**, and the Verify tab ready.

**0:00–0:40 The problem.**
"When I apply for internships, I list certificates from clubs and workshops. A recruiter has no fast way to check them. They'd have to
email the club, or trust a PDF anyone can edit in Canva. Even if the club keeps a Google Sheet, anyone with edit access can quietly change it,
and the recruiter still has to trust the sheet's owner."

**0:40–1:00 The one user, one task.**
"CertChain is for that recruiter. Their one task: type a certificate code and know in five seconds whether it's real."

**1:00–2:00 Demo: Verify (no wallet).**
1. Verify tab → type `C-1042` → **Verify**.
2. "It says **Valid (corrected)**, issued by BPDC Coding Club. The history shows version 0 said *Participant*, and version 1 corrected it to *Winner*
   with a reason. The old version is still there. Nothing is ever deleted."
3. Click a Basescan link: "This is read live from the contract on Base Sepolia, not from my server."
4. Type `C-9999` → **Not found**.

**2:00–3:15 Demo: the rules, live refusals (the important bit).**
1. Switch MetaMask to **Account 2** (a stranger, not an issuer). The badge says **Not an issuer**.
2. Issuer tab → try to issue `C-2000` → the page shows **"⛔ Refused by the contract: Only an authorized issuer can post."**
   "The website didn't block this. The smart contract did. Even if someone writes their own script, the contract refuses."
3. Admin tab → try to add yourself as an issuer → **"Refused by the contract: Only the admin can manage issuers."** That's two roles enforced on-chain.
4. *(Optional, if Account 2 has a little test ETH:)* tick **Demo mode** and send again. Now a **failed transaction** shows on Basescan as public proof.

**3:15–4:00 Demo: the issuer flow.**
Switch back to Account 1 (BPDC Coding Club).
1. Issuer tab → **Revoke** `C-1043`, reason `Issued by mistake`.
2. Verify shows **⛔ Revoked** with the reason.
3. Try to correct it → **"Certificate is revoked."**

**4:00–5:00 Path to real life + close.**
"Student Affairs holds the admin wallet, and each club or department gets an issuer wallet. Only a salted hash of the student ID goes on-chain,
never names. Why not a spreadsheet? Issuers can't quietly edit, every correction is visible, and anyone can verify without trusting
the admin. Next steps: a QR code on each certificate PDF that opens the verify link. Thank you!"

---

## Part 5: Likely judge questions

**Why blockchain and not a database or spreadsheet?**
A database owner can edit rows silently, and a verifier has to trust them. Here the rules live in public code that nobody can change, every
change is a new public version with a timestamp, and anyone can verify with no account.

**What stops a fake club from issuing certificates?**
`onlyIssuer`: the contract checks `isIssuer[msg.sender]`. Only the admin can add wallets to that list (`onlyAdmin`). I showed both refusals live.

**What if a club makes a typo?**
They call `correct`, which appends a new version with a reason. The original stays visible, so a correction can't hide anything.

**Can a different club correct another club's certificate?**
No. `"Only the original issuer can correct this"`: the contract compares `msg.sender` with the issuer of version 0.

**What happens if a club wallet is removed?**
It can't post anymore, but its old certificates stay verifiable. The page shows a "no longer an issuer" tag.

**Isn't the holder's identity public?**
Only a fake ID is stored, and in real life it would be a salted hash of the student ID. Names stay off-chain, with the university.

**What if the admin key is lost or stolen?**
In production, the admin would be a multisig (e.g. Safe) held by several staff members. A future version could add a `transferAdmin` function.

**What does it cost?**
On Base, an issue costs a fraction of a cent at mainnet prices. Verifying is a free read.

**Why is the verdict computed on the page?**
The contract stores facts (the versions). The page interprets them: if the last version is revoked it shows Revoked, if there's more than one version it shows Corrected. This keeps the contract simple and cheap.

**How does the page show transaction links if the contract doesn't store hashes?**
Each version stores its block number. The page asks the node for this contract's log for that code in that one block, which gives the transaction hash.

**Did you use AI?**
Yes, as allowed. I can explain every line. See EXPLAIN.md.
