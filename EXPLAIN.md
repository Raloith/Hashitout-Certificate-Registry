# EXPLAIN.md: the contract, line by line (for beginners)

File: `contracts/CertificateRegistry.sol`. Read this alongside the code.

## The header
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
```
* Line 1 is the license tag. Compilers warn if it's missing.
* `pragma solidity ^0.8.20` means "compile with Solidity 0.8.20 or newer, but below 0.9". Since 0.8, maths overflow is checked automatically.

```solidity
contract CertificateRegistry {
```
* A **contract** is like a class whose data lives permanently on the blockchain. Once it's deployed, its code can't be changed.

## Status constants
```solidity
uint8 public constant STATUS_ISSUED = 0;
uint8 public constant STATUS_CORRECTED = 1;
uint8 public constant STATUS_REVOKED = 2;
```
* These are named numbers, so the code reads `STATUS_REVOKED` instead of a mysterious `2`. `constant` means they're baked into the code and don't use storage. `uint8` is a small unsigned integer (0–255).

## The Version struct
```solidity
struct Version {
    string holderId; string title; string note;
    address issuer; uint8 status; uint64 timestamp; uint64 blockNumber;
}
```
* A **struct** groups fields together, like a row in a table. One certificate has many versions (rows).
* `holderId`: a fake ID like S-001. In real life it would be a hash, **never a name**.
* `title`: what the certificate is for.
* `note`: the reason for a correction or revocation (empty for the first version).
* `address issuer`: the wallet that posted this version.
* `status`: 0, 1 or 2 (see above).
* `timestamp`: when it was posted (seconds since 1970, set by the block).
* `blockNumber`: which block it was posted in. The website uses this to find the transaction hash.

## State variables (the stored data)
```solidity
address public admin;
mapping(address => bool) public isIssuer;
mapping(address => string) public issuerName;
address[] public issuerList;
mapping(string => Version[]) private versions;
```
* `admin`: one wallet address, the deployer.
* `mapping(address => bool) isIssuer`: a lookup table that gives `true` if a wallet may issue. Every address starts as `false`.
* `issuerName`: a display name for each issuer wallet, e.g. "BPDC Coding Club".
* `issuerList`: an array of every wallet ever added, so the admin screen can list them. (A mapping can't be looped over.)
* `versions`: certificate code → array of versions. **The heart of the system.** We only ever `push` (append) to these arrays. No function removes or overwrites one.
* `public` makes Solidity create a free "getter" function automatically. For example, the website can call `isIssuer(0xabc…)`.
* `versions` is `private`, so we write our own getters below. That's because a public mapping of arrays would need two indexes and is awkward to use.

## Events
```solidity
event CertificateIssued(string indexed code, string holderId, string title, address indexed issuer);
...
```
* Events are a public log that's cheap to write and easy to search. Basescan shows them under the "Logs" tab of a transaction.
* `indexed` makes a field searchable. The website searches by `code` to find a version's transaction hash.
  (An indexed string is stored as its keccak256 hash, and that's what the page searches for.)

## Modifiers (the rules)
```solidity
modifier onlyAdmin() {
    require(msg.sender == admin, "Only the admin can manage issuers");
    _;
}
modifier onlyIssuer() {
    require(isIssuer[msg.sender], "Only an authorized issuer can post");
    _;
}
```
* `msg.sender` is the wallet that signed the transaction. Nobody can fake it, because it comes from the signature.
* `require(condition, "message")`: if the condition is false, the whole transaction is **reverted**. Nothing changes, and the message is
  sent back. This is the "refusal" the website shows.
* `_;` means "now run the body of the function that uses this modifier".

## Constructor
```solidity
constructor() { admin = msg.sender; }
```
* This runs exactly once, when the contract is deployed. Whoever deploys it becomes the admin.

## Admin functions
```solidity
function addIssuer(address issuer, string calldata name) external onlyAdmin {
    require(issuer != address(0), "Invalid wallet address");
    require(bytes(name).length > 0, "Issuer name is required");
    require(!isIssuer[issuer], "Wallet is already an issuer");
    if (bytes(issuerName[issuer]).length == 0) { issuerList.push(issuer); }
    isIssuer[issuer] = true;
    issuerName[issuer] = name;
    emit IssuerAdded(issuer, name);
}
```
* `external`: this can be called from outside (by wallets or websites).
* `calldata`: read-only input data. It's cheaper than `memory` for inputs.
* `onlyAdmin`: the rule runs first.
* `address(0)` is the empty address (0x000…0), so we refuse it.
* A name is required, so every issuer shows up with a readable label.
* We push to `issuerList` only the first time a wallet is added (when it has no name yet), so re-adding a removed wallet doesn't create duplicates.
* `emit` writes the event.

```solidity
function removeIssuer(address issuer) external onlyAdmin {
    require(isIssuer[issuer], "Wallet is not an issuer");
    isIssuer[issuer] = false;
    emit IssuerRemoved(issuer);
}
```
* This only flips the permission off. The wallet's old certificates are untouched and still verify.

## Issuer functions
```solidity
function issue(string calldata code, string calldata holderId, string calldata title) external onlyIssuer {
    require(bytes(code).length > 0, "Certificate code is required");
    require(versions[code].length == 0, "Certificate code already exists");
    versions[code].push(Version(holderId, title, "", msg.sender, STATUS_ISSUED, uint64(block.timestamp), uint64(block.number)));
    emit CertificateIssued(code, holderId, title, msg.sender);
}
```
* `bytes(code).length > 0` refuses an empty code.
* `versions[code].length == 0` means "this code has never been used", which prevents duplicates.
* `push(Version(...))` appends version 0. The fields are in the same order as the struct.
* `block.timestamp` and `block.number` come from the block that includes this transaction. `uint64(...)` converts them to a smaller number type.
* The website upper-cases codes, so `c-1042` and `C-1042` are the same certificate.

```solidity
function correct(string calldata code, string calldata newTitle, string calldata reason) external onlyIssuer {
    Version storage last = _checkCanChange(code);
    versions[code].push(Version(last.holderId, newTitle, reason, msg.sender, STATUS_CORRECTED, ...));
    emit CertificateCorrected(code, newTitle, reason, msg.sender);
}
```
* This first runs the shared checks (below), which return the latest version.
* It appends a **new** version that copies the holder ID, uses the new title, and records the reason. **The old version stays.**
* `storage` means `last` points at the data on-chain rather than a copy.

```solidity
function revoke(string calldata code, string calldata reason) external onlyIssuer { ... STATUS_REVOKED ... }
```
* This works the same way, but appends a version with status `REVOKED` and the reason.

```solidity
function _checkCanChange(string calldata code) private view returns (Version storage) {
    Version[] storage list = versions[code];
    require(list.length > 0, "Certificate not found");
    require(list[0].issuer == msg.sender, "Only the original issuer can correct this");
    Version storage last = list[list.length - 1];
    require(last.status != STATUS_REVOKED, "Certificate is revoked");
    return last;
}
```
* `private`: only this contract can call it. The `_` prefix is a naming habit for internal helpers.
* `view`: it only reads, never writes.
* Check 1: the code must exist.
* Check 2: the caller must be the wallet that created version 0. So one club can't correct another club's certificate.
* Check 3: if the latest version is revoked, it's final, so nothing more can be posted.
* The same checks apply to `revoke` (only the original issuer, and not twice).

## Public read functions (free)
```solidity
function versionCount(string calldata code) external view returns (uint256)
function getVersion(string calldata code, uint256 i) external view returns (Version memory)
function issuerCount() external view returns (uint256)
```
* `view` functions cost nothing when called from a website. They don't need a transaction or a wallet.
* `versionCount` returns 0 if the code doesn't exist, which the page shows as **Not found**.
* `getVersion` returns one row. `memory` means it's a temporary copy for returning.
* The website reads every version from 0 to count−1 to draw the history.
* Also available automatically (because they're `public`): `admin()`, `isIssuer(addr)`, `issuerName(addr)` and `issuerList(i)`.

## How the website decides the verdict (`docs/app.js` → `verify()`)
1. `n = versionCount(code)`. If `n == 0`, it shows **Not found**.
2. It reads all versions and looks at the **last** one.
3. If the last status is 2, it shows **Revoked**. Otherwise, if `n > 1`, it shows **Valid (corrected)**. Otherwise it shows **Valid**.
4. The issuer name comes from `issuerName(version0.issuer)`.

## How refusals reach the screen
When MetaMask or ethers prepares a transaction, it first simulates it (gas estimation). If a `require` fails, the node returns the
message, and `friendlyError()` in `app.js` turns it into "Refused by the contract: …". With **Demo mode** ticked, the page skips that
simulation by setting a fixed gas limit. The transaction is then mined and **fails on-chain**, which leaves public proof on Basescan.

## How the QR code works (plain English)

* **The QR code is just a link.** It contains the site address plus the certificate code, for example
  `https://raloith.github.io/Hashitout-Certificate-Registry/?code=C-1042`. It holds no signature, no secret and no certificate data.
* **Scanning it opens the Verify page.** The page reads `?code=C-1042` from the address, switches to the Verify tab and runs exactly
  the same check as typing the code by hand. It asks the contract on Base Sepolia for that code's versions and shows Valid,
  Valid (corrected), Revoked or Not found.
* **The QR itself isn't trusted. The blockchain is.** Someone could print a fake certificate with a real-looking QR, but the QR can only point
  to a code. If that code was never issued by an approved issuer, or was revoked, the page says so, because the answer comes from the chain,
  not from the paper. A QR pointing to a different website would show up as a different web address when scanned.
* **Typing the code still works.** The QR is a shortcut for the same check.
* **Where the QR comes from:** `docs/vendor/qrcode.js` (the open-source qrcode-generator library) turns the link into black and white squares,
  and `app.js` draws them on a canvas. **Download QR (PNG)** saves that canvas as an image.
* **Printing and PDF:**
  * **Print / Download certificate** uses the browser's print dialog, and the print styles show only the certificate. Choose "Save as PDF" to keep it.
  * **Download certificate (PDF)** draws the certificate on a canvas over the background artwork, then jsPDF (`docs/vendor/jspdf.umd.min.js`) puts it on an A4 landscape page.
* **The recipient name is printed only.** The optional name box is used only for the PDF in your browser. It's never sent to the blockchain, because
  public chains can't erase data and the rules say no personal data on-chain. If it's left empty, the holder ID (e.g. S-001) is printed.
* **Revoked certificates** get a large REVOKED watermark on both the printable view and the PDF.
