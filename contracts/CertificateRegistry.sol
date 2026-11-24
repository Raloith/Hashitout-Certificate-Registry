// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CertificateRegistry - HASH-IT-OUT 2026, Track 1 (Digital Identity)
/// @notice Institutions issue certificates, anyone can verify them.
///         Every change is a NEW version. Nothing is ever edited or deleted.
/// Roles:
///   - Admin  (whoever deploys the contract, e.g. the Student Affairs office)
///            adds or removes issuer wallets.
///   - Issuer (e.g. a club or department wallet) issues, corrects and revokes
///            certificates.
///   - Public (anyone, no wallet needed) reads and verifies.
contract CertificateRegistry {
    // ---------- Data ----------

    // Status of one version of a certificate.
    uint8 public constant STATUS_ISSUED = 0;    // first version
    uint8 public constant STATUS_CORRECTED = 1; // a later version that fixes the title
    uint8 public constant STATUS_REVOKED = 2;   // a later version that cancels it

    // One version (one row in the history) of a certificate.
    struct Version {
        string holderId;    // fake ID or hash of the student ID - never a name
        string title;       // e.g. "Workshop: Intro to Solidity - Participant"
        string note;        // reason for a correction / revocation ("" for the first one)
        address issuer;     // wallet that posted this version
        uint8 status;       // 0 issued, 1 corrected, 2 revoked
        uint64 timestamp;   // when it was posted (block time)
        uint64 blockNumber; // block it was posted in (lets the page find the transaction)
    }

    address public admin;                          // the deployer
    mapping(address => bool) public isIssuer;      // who is allowed to issue
    mapping(address => string) public issuerName;  // display name, e.g. "Coding Club"
    address[] public issuerList;                   // every wallet ever added (for the admin screen)

    // certificate code (e.g. "C-1042") => list of versions, oldest first
    mapping(string => Version[]) private versions;

    // ---------- Events (public log, shown on Basescan) ----------
    event IssuerAdded(address indexed issuer, string name);
    event IssuerRemoved(address indexed issuer);
    event CertificateIssued(string indexed code, string holderId, string title, address indexed issuer);
    event CertificateCorrected(string indexed code, string newTitle, string reason, address indexed issuer);
    event CertificateRevoked(string indexed code, string reason, address indexed issuer);

    // ---------- Rules (modifiers) ----------
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only the admin can manage issuers");
        _;
    }

    modifier onlyIssuer() {
        require(isIssuer[msg.sender], "Only an authorized issuer can post");
        _;
    }

    // Runs once, at deploy time. The deployer becomes the admin.
    constructor() {
        admin = msg.sender;
    }

    // ---------- Admin actions ----------

    /// Allow a wallet to issue certificates.
    function addIssuer(address issuer, string calldata name) external onlyAdmin {
        require(issuer != address(0), "Invalid wallet address");
        require(bytes(name).length > 0, "Issuer name is required");
        require(!isIssuer[issuer], "Wallet is already an issuer");
        if (bytes(issuerName[issuer]).length == 0) {
            issuerList.push(issuer); // remember it the first time only
        }
        isIssuer[issuer] = true;
        issuerName[issuer] = name;
        emit IssuerAdded(issuer, name);
    }

    /// Stop a wallet from issuing. Its old certificates stay valid and visible.
    function removeIssuer(address issuer) external onlyAdmin {
        require(isIssuer[issuer], "Wallet is not an issuer");
        isIssuer[issuer] = false;
        emit IssuerRemoved(issuer);
    }

    // ---------- Issuer actions ----------

    /// Create a brand-new certificate (version 0).
    function issue(string calldata code, string calldata holderId, string calldata title) external onlyIssuer {
        require(bytes(code).length > 0, "Certificate code is required");
        require(versions[code].length == 0, "Certificate code already exists");
        versions[code].push(Version(holderId, title, "", msg.sender, STATUS_ISSUED, uint64(block.timestamp), uint64(block.number)));
        emit CertificateIssued(code, holderId, title, msg.sender);
    }

    /// Fix a mistake: adds a NEW version with the new title. The old one stays.
    function correct(string calldata code, string calldata newTitle, string calldata reason) external onlyIssuer {
        Version storage last = _checkCanChange(code);
        versions[code].push(Version(last.holderId, newTitle, reason, msg.sender, STATUS_CORRECTED, uint64(block.timestamp), uint64(block.number)));
        emit CertificateCorrected(code, newTitle, reason, msg.sender);
    }

    /// Cancel a certificate: adds a final 'revoked' version. History stays.
    function revoke(string calldata code, string calldata reason) external onlyIssuer {
        Version storage last = _checkCanChange(code);
        versions[code].push(Version(last.holderId, last.title, reason, msg.sender, STATUS_REVOKED, uint64(block.timestamp), uint64(block.number)));
        emit CertificateRevoked(code, reason, msg.sender);
    }

    // Shared checks for correct() and revoke(). Returns the latest version.
    function _checkCanChange(string calldata code) private view returns (Version storage) {
        Version[] storage list = versions[code];
        require(list.length > 0, "Certificate not found");
        require(list[0].issuer == msg.sender, "Only the original issuer can correct this");
        Version storage last = list[list.length - 1];
        require(last.status != STATUS_REVOKED, "Certificate is revoked");
        return last;
    }

    // ---------- Public reads (free, no wallet needed) ----------

    /// How many versions a certificate has (0 = not found).
    function versionCount(string calldata code) external view returns (uint256) {
        return versions[code].length;
    }

    /// Read version i of a certificate (0 = the original).
    function getVersion(string calldata code, uint256 i) external view returns (Version memory) {
        require(i < versions[code].length, "Certificate not found");
        return versions[code][i];
    }

    /// Number of wallets ever added as issuers.
    function issuerCount() external view returns (uint256) {
        return issuerList.length;
    }
}
