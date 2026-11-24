// CertChain front end - plain JavaScript + ethers v6.
// Reads go through a public Base Sepolia node (no wallet). Writes go through MetaMask.
(() => {
  const CFG = window.CERT_CONFIG;
  const ART = window.CERT_ARTIFACT;
  const { ethers } = window;
  const params = new URLSearchParams(location.search);

  // Optional overrides for local testing: ?rpc=http://127.0.0.1:8545&chainId=1337
  const RPC = params.get('rpc') || CFG.RPC_URL;
  const CHAIN_ID = Number(params.get('chainId') || CFG.CHAIN_ID);
  const EXPLORER = CFG.EXPLORER;
  const STATUS = ['Issued', 'Corrected', 'Revoked'];
  const KNOWN_REASONS = [
    'Only an authorized issuer can post', 'Only the admin can manage issuers',
    'Certificate code already exists', 'Certificate not found',
    'Only the original issuer can correct this', 'Certificate is revoked',
    'Certificate code is required', 'Wallet is already an issuer',
    'Wallet is not an issuer', 'Invalid wallet address', 'Issuer name is required'];

  // Contract address priority: ?contract=  >  config.js  >  last one deployed from this browser
  let contractAddress = params.get('contract') || CFG.CONTRACT_ADDRESS || localStorage.getItem('certchain.contract.' + CHAIN_ID) || '';
  const readProvider = new ethers.JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const readContract = () => new ethers.Contract(contractAddress, ART.abi, readProvider);
  let signer = null, account = null;

  // ---------- small helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
  const normCode = c => String(c || '').trim().toUpperCase();
  const addrLink = a => `<a href="${EXPLORER}/address/${a}" target="_blank" rel="noopener" class="mono">${short(a)}</a>`;
  const txLink = h => `<a href="${EXPLORER}/tx/${h}" target="_blank" rel="noopener" class="mono">${short(h)}</a>`;
  const fmtTime = t => new Date(Number(t) * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  function toast(msg, ms = 4500) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), ms); }

  // Turn any error into one friendly sentence.
  function friendlyError(e) {
    if (e?.code === 'ACTION_REJECTED' || e?.info?.error?.code === 4001 || e?.code === 4001) return 'You cancelled the request in MetaMask.';
    let blob = '';
    try { blob = [e?.reason, e?.shortMessage, e?.message, JSON.stringify(e?.info ?? {}), JSON.stringify(e?.error ?? {}), JSON.stringify(e?.data ?? '')].join(' '); } catch { blob = String(e?.message || e); }
    const hit = KNOWN_REASONS.find(r => blob.includes(r));
    if (hit) return 'Refused by the contract: ' + hit;
    // Try decoding Error(string) revert data (selector 0x08c379a0) if present anywhere
    const m = blob.match(/0x08c379a0[0-9a-fA-F]+/);
    if (m) { try { return 'Refused by the contract: ' + ethers.AbiCoder.defaultAbiCoder().decode(['string'], '0x' + m[0].slice(10))[0]; } catch {} }
    if (/insufficient funds/i.test(blob)) return 'Your wallet needs a little Base Sepolia test ETH to pay the network fee.';
    if (e?.reason) return 'Refused by the contract: ' + e.reason;
    if (/could not decode result data|BAD_DATA/i.test(blob)) return 'No CertChain contract found at this address on ' + CFG.CHAIN_NAME + '. Check the contract address.';
    if (/network|fetch|timeout/i.test(blob)) return 'Could not reach the blockchain. Check your internet and try again.';
    return 'Something went wrong: ' + (e?.shortMessage || e?.message || e);
  }

  // ---------- tabs ----------
  $$('.tab').forEach(b => b.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.toggle('active', x === b));
    $$('.panel').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + b.dataset.tab));
    if (b.dataset.tab === 'admin') refreshAdmin();
  }));

  function refreshContractUI() {
    const has = ethers.isAddress(contractAddress);
    $('#noContract').classList.toggle('hidden', has);
    $('#contractLabel').innerHTML = has ? addrLink(contractAddress) : 'not set';
    $('#netBadge').textContent = (CHAIN_ID === 84532 ? CFG.CHAIN_NAME : 'Chain ' + CHAIN_ID) + (has ? ' · live' : ' · no contract');
    // The setup card is only shown when no registry is configured (or with ?admin-deploy=1).
    $('#deployCard').classList.toggle('hidden', has && params.get('admin-deploy') !== '1');
  }

  // ---------- VERIFY ----------
  // Find the transaction hash for a version: look at that one block's logs for this code.
  async function findTxHash(code, blockNumber) {
    try {
      const c = readContract();
      const topic = ethers.id(code); // indexed string -> keccak256
      const logs = await readProvider.getLogs({ address: contractAddress, fromBlock: Number(blockNumber), toBlock: Number(blockNumber), topics: [null, topic] });
      return logs.length ? logs[logs.length - 1].transactionHash : null;
    } catch { return null; }
  }

  async function verify(codeRaw) {
    const out = $('#verifyResult');
    const code = normCode(codeRaw);
    $('#certArea').innerHTML = ''; // no certificate until the chain confirms one
    if (!code) return;
    if (!ethers.isAddress(contractAddress)) { out.innerHTML = `<div class="banner warn">This site is not connected to a certificate registry right now.</div>`; return; }
    out.innerHTML = `<div class="card muted">Checking <b>${esc(code)}</b> on the blockchain…</div>`;
    try {
      const c = readContract();
      const n = Number(await c.versionCount(code));
      if (n === 0) {
        out.innerHTML = `<div class="result notfound"><div class="big">✖ Not found</div>
          <p>No certificate with code <b>${esc(code)}</b> exists on this registry. Check the code for typos. If it is correct, this certificate was never issued here.</p></div>`;
        return;
      }
      const versions = await Promise.all([...Array(n).keys()].map(i => c.getVersion(code, i)));
      const first = versions[0], last = versions[n - 1];
      const st = Number(last.status);
      const [issuerNameStr, stillIssuer] = await Promise.all([c.issuerName(first.issuer), c.isIssuer(first.issuer)]);
      const hashes = await Promise.all(versions.map(v => findTxHash(code, v.blockNumber)));
      const cls = st === 2 ? 'revoked' : (n > 1 ? 'corrected' : 'valid');
      const headline = st === 2 ? '⛔ Revoked' : (n > 1 ? '✔ Valid (corrected)' : '✔ Valid');
      const sub = st === 2 ? `This certificate was cancelled by its issuer. Reason: “${esc(last.note)}”.`
        : (n > 1 ? 'Genuine certificate. It was corrected by its issuer — see the history below.' : 'Genuine certificate, issued by an approved issuer and never changed.');
      out.innerHTML = `
        <div class="result ${cls}">
          <div class="big">${headline}</div>
          <p>${sub}</p>
          <dl class="facts">
            <dt>Certificate</dt><dd><b>${esc(code)}</b></dd>
            <dt>Holder ID</dt><dd>${esc(last.holderId)}</dd>
            <dt>Title</dt><dd>${esc(last.title)}</dd>
            <dt>Issued by</dt><dd><b>${esc(issuerNameStr || 'Unnamed issuer')}</b> · ${addrLink(first.issuer)} ${stillIssuer ? '' : '<span class="pill off">no longer an issuer</span>'}</dd>
            <dt>First issued</dt><dd>${fmtTime(first.timestamp)}</dd>
            <dt>Versions</dt><dd>${n}</dd>
          </dl>
        </div>
        <div class="card">
          <h3>Full history (nothing is ever deleted)</h3>
          <ol class="timeline">
            ${versions.map((v, i) => `<li class="s${Number(v.status)}">
              <span class="pill s${Number(v.status)}">v${i} · ${STATUS[Number(v.status)]}</span> <span class="muted small">${fmtTime(v.timestamp)}</span><br>
              <b>${esc(v.title)}</b>${v.note ? `<br><span class="muted">Reason: ${esc(v.note)}</span>` : ''}<br>
              <span class="small muted">By ${addrLink(v.issuer)} · ${hashes[i] ? 'Tx ' + txLink(hashes[i]) : `<a href="${EXPLORER}/block/${Number(v.blockNumber)}" target="_blank" rel="noopener">block ${Number(v.blockNumber)}</a>`}</span>
            </li>`).join('')}
          </ol>
          <p class="small muted">Read live from contract ${addrLink(contractAddress)} on ${esc(CFG.CHAIN_NAME)}.</p>
        </div>`;
      renderCertificate({ code, holderId: last.holderId, title: last.title, issuerName: issuerNameStr || 'Unnamed issuer',
        issuedAt: first.timestamp, revoked: st === 2, revokeReason: last.note });
    } catch (e) {
      out.innerHTML = `<div class="banner bad">${esc(friendlyError(e))}</div>`;
    }
  }
  $('#verifyForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const code = normCode($('#verifyCode').value);
    const u = new URL(location.href); u.searchParams.set('code', code); history.replaceState(null, '', u);
    verify(code);
  });

  // ---------- QR CERTIFICATE ----------
  // The QR is just a link to this page with ?code=...; the page then reads the blockchain.
  function verifyLink(code) {
    const u = new URL(location.origin + location.pathname);
    u.searchParams.set('code', code);
    if (contractAddress && contractAddress.toLowerCase() !== String(CFG.CONTRACT_ADDRESS || '').toLowerCase()) u.searchParams.set('contract', contractAddress);
    return u.toString();
  }
  // Draws the QR onto a canvas (crisp, white margin) and returns it.
  function qrCanvas(text, px = 8) {
    const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    const n = qr.getModuleCount(), margin = 4, size = (n + margin * 2) * px;
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + margin) * px, (r + margin) * px, px, px);
    return cv;
  }
  let currentCert = null;
  function certHTML(cert, qrSrc) {
    const date = new Date(Number(cert.issuedAt) * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    return `<div class="cert ${cert.revoked ? 'revoked' : ''}">
      ${cert.revoked ? '<div class="c-watermark"><span>REVOKED</span></div>' : ''}
      <div class="c-org">${esc(cert.issuerName)}</div>
      <div class="c-head">Certificate</div>
      <p class="c-sub">This certifies that the holder</p>
      <div class="c-holder">${esc(cert.holderId)}</div>
      <p class="c-sub">has been awarded</p>
      <div class="c-title">${esc(cert.title)}</div>
      <div class="c-grid">
        <dl>
          <dt>Certificate code</dt><dd>${esc(cert.code)}</dd>
          <dt>Issued by</dt><dd>${esc(cert.issuerName)}</dd>
          <dt>Issue date</dt><dd>${esc(date)}</dd>
          <dt>Registry</dt><dd>${short(contractAddress)}</dd>
          ${cert.revoked ? `<dt>Status</dt><dd style="color:#c62f3a">Revoked${cert.revokeReason ? ' – ' + esc(cert.revokeReason) : ''}</dd>` : ''}
        </dl>
        <div class="c-qr"><img src="${qrSrc}" alt="QR code to verify certificate ${esc(cert.code)}">Scan to verify</div>
      </div>
      <div class="c-badge">${cert.revoked ? '⛔ Revoked on Base Sepolia' : '✔ Verified on Base Sepolia'}</div>
    </div>`;
  }
  function renderCertificate(cert) {
    currentCert = cert;
    const link = verifyLink(cert.code);
    const qrSrc = qrCanvas(link, 8).toDataURL('image/png');
    $('#certArea').innerHTML = `<div class="card" id="certCard">
      <h3>Certificate</h3>
      ${certHTML(cert, qrSrc)}
      <div class="certActions">
        <button class="primary" id="printCert">🖨️ Print / Download certificate</button>
        <button id="downloadQr">⬇️ Download QR (PNG)</button>
      </div>
      <div class="pdfBox">
        <h3>Download certificate (PDF)</h3>
        <div class="row">
          <label>Recipient name <small>(printed only, not stored on chain)</small>
            <input id="pdfName" placeholder="${esc(cert.holderId)}" autocomplete="off" maxlength="60"></label>
          <button class="primary" id="downloadPdf">📄 Download certificate (PDF)</button>
        </div>
      </div>
      <p class="small muted">QR link: <a href="${esc(link)}" class="mono">${esc(link)}</a></p>
    </div>`;
    $('#printArea').innerHTML = certHTML(cert, qrSrc);
    $('#printCert').addEventListener('click', () => window.print());
    $('#downloadPdf').addEventListener('click', async ev => {
      const btn = ev.currentTarget; btn.disabled = true; const old = btn.textContent; btn.textContent = 'Preparing PDF…';
      try { await downloadPdf(cert, link, $('#pdfName').value.trim() || cert.holderId); }
      catch (e) { toast('Could not create the PDF: ' + (e.message || e)); }
      finally { btn.disabled = false; btn.textContent = old; }
    });
    $('#downloadQr').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = qrCanvas(link, 16).toDataURL('image/png');
      a.download = `certificate-${cert.code}-qr.png`;
      document.body.appendChild(a); a.click(); a.remove();
    });
  }

  // ---------- PDF CERTIFICATE ----------
  // Draws the certificate on a canvas (A4 landscape, 150 dpi) over the background artwork,
  // then places that image on a one-page PDF with jsPDF.
  const loadImage = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('background image failed to load')); i.src = src; });
  function wrapLines(g, text, maxW) {
    const words = text.split(' '); const lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line); return lines;
  }
  function fitFont(g, text, weight, size, family, maxW) {
    do { g.font = `${weight} ${size}px ${family}`; size -= 2; } while (g.measureText(text).width > maxW && size > 20);
  }
  async function drawCertificateCanvas(cert, link, recipient) {
    const W = 1754, H = 1240; // A4 landscape @150dpi
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    // background: cover-fit the artwork, then darken it so white text stays readable
    const bg = await loadImage('assets/certificate-bg.png');
    const s = Math.max(W / bg.width, H / bg.height), bw = bg.width * s, bh = bg.height * s;
    g.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);
    g.fillStyle = 'rgba(4, 10, 40, 0.55)'; g.fillRect(0, 0, W, H);
    const grad = g.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.6);
    grad.addColorStop(0, 'rgba(4,10,40,0.35)'); grad.addColorStop(1, 'rgba(4,10,40,0)');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // frame
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 4; g.strokeRect(40, 40, W - 80, H - 80);
    g.strokeStyle = 'rgba(160,190,255,0.6)'; g.lineWidth = 2; g.strokeRect(56, 56, W - 112, H - 112);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 12;
    const serif = 'Georgia, "Times New Roman", serif', sans = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
    // small header
    g.fillStyle = '#bcd0ff'; g.font = `600 30px ${sans}`;
    g.fillText(('Certificate · ' + cert.issuerName).toUpperCase(), W / 2, 150);
    // title (on-chain), large
    g.fillStyle = '#ffffff'; fitFont(g, cert.title, 700, 78, serif, W - 260);
    g.fillText(cert.title, W / 2, 265);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(W / 2 - 160, 300, 320, 3);
    // "presented to" + recipient
    g.fillStyle = '#d6e2ff'; g.font = `italic 36px ${serif}`;
    g.fillText('This certificate is presented to', W / 2, 410);
    g.fillStyle = '#ffffff'; fitFont(g, recipient, 700, 104, serif, W - 360);
    g.fillText(recipient, W / 2, 545);
    // description
    const date = new Date(Number(cert.issuedAt) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const desc = `has successfully been awarded this certificate by ${cert.issuerName} on ${date}. Certificate code ${cert.code} · Holder ID ${cert.holderId}.`;
    g.fillStyle = '#e4ecff'; g.font = `32px ${sans}`;
    wrapLines(g, desc, 1150).forEach((l, i) => g.fillText(l, W / 2, 635 + i * 46));
    g.fillStyle = cert.revoked ? '#ff9aa2' : '#9ef0c8'; g.font = `600 26px ${sans}`;
    g.fillText(cert.revoked ? '⛔ Revoked on Base Sepolia' : '✔ Verified on Base Sepolia · registry ' + short(contractAddress), W / 2, 790);
    // three signature spots
    const sigY = 1010, sigW = 340, cols = [W * 0.2, W * 0.5, W * 0.8 - 90];
    ['Club President', 'Faculty In-charge', 'Student Affairs'].forEach((label, i) => {
      g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cols[i] - sigW / 2, sigY); g.lineTo(cols[i] + sigW / 2, sigY); g.stroke();
      g.shadowBlur = 8; g.fillStyle = '#ffffff'; g.font = `600 28px ${sans}`; g.fillText(label, cols[i], sigY + 42);
    });
    // QR, bottom-right
    g.shadowBlur = 0;
    const qr = qrCanvas(link, 6), qs = 170, qx = W - 80 - qs, qy = H - 100 - qs;
    g.fillStyle = '#fff'; g.fillRect(qx - 6, qy - 6, qs + 12, qs + 12);
    g.imageSmoothingEnabled = false; g.drawImage(qr, qx, qy, qs, qs); g.imageSmoothingEnabled = true;
    g.fillStyle = '#ffffff'; g.font = `500 20px ${sans}`; g.fillText('Scan to verify', qx + qs / 2, qy + qs + 32);
    // revoked watermark
    if (cert.revoked) {
      g.save(); g.translate(W / 2, H / 2); g.rotate(-0.38);
      g.fillStyle = 'rgba(255,60,80,0.38)'; g.strokeStyle = 'rgba(255,60,80,0.6)'; g.lineWidth = 12;
      g.font = `900 260px ${sans}`; g.textBaseline = 'middle';
      g.fillText('REVOKED', 0, 0); g.strokeRect(-720, -170, 1440, 340); g.restore();
    }
    return cv;
  }
  async function downloadPdf(cert, link, recipient) {
    const cv = await drawCertificateCanvas(cert, link, recipient);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    pdf.setProperties({ title: `Certificate ${cert.code}`, subject: `${cert.title} — verify at ${link}`, creator: 'CertChain' });
    pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
    pdf.link(297 - 80 / 1754 * 297 - 170 / 1754 * 297, 210 - (100 + 170) / 1240 * 210, 170 / 1754 * 297, 170 / 1240 * 210, { url: link });
    pdf.save(`certificate-${cert.code}.pdf`);
  }

  // ---------- WALLET ----------
  const hexChain = '0x' + CHAIN_ID.toString(16);
  async function ensureChain() {
    const eth = window.ethereum;
    const current = await eth.request({ method: 'eth_chainId' });
    if (parseInt(current, 16) === CHAIN_ID) return;
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChain }] });
    } catch (e) {
      if (e.code === 4902 || /Unrecognized chain|not been added/i.test(e.message || '')) {
        await eth.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hexChain, chainName: CFG.CHAIN_NAME,
          nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: [RPC], blockExplorerUrls: [EXPLORER] }] });
      } else throw e;
    }
  }

  async function connect() {
    if (!window.ethereum) {
      toast('MetaMask not found. On a laptop install the MetaMask extension; on a phone open this page inside the MetaMask app browser.', 8000);
      return false;
    }
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      await ensureChain();
      const bp = new ethers.BrowserProvider(window.ethereum);
      signer = await bp.getSigner();
      account = await signer.getAddress();
      await updateWalletInfo();
      return true;
    } catch (e) { toast(friendlyError(e), 7000); return false; }
  }

  async function updateWalletInfo() {
    if (!account) return;
    let role = '';
    if (ethers.isAddress(contractAddress)) {
      try {
        const c = readContract();
        const [adm, isIss, name] = await Promise.all([c.admin(), c.isIssuer(account), c.issuerName(account)]);
        const parts = [];
        if (adm.toLowerCase() === account.toLowerCase()) parts.push('<span class="pill on">Admin</span>');
        parts.push(isIss ? `<span class="pill on">Issuer: ${esc(name || 'unnamed')}</span>` : '<span class="pill off">Not an issuer</span>');
        role = parts.join(' ');
      } catch (e) { role = `<span class="pill off">${esc(friendlyError(e))}</span>`; }
    }
    $$('.walletInfo').forEach(el => el.innerHTML = `Connected: <span class="mono">${short(account)}</span> ${role}`);
    $$('.connectBtn').forEach(b => b.textContent = 'Reconnect');
  }
  $$('.connectBtn').forEach(b => b.addEventListener('click', connect));
  if (window.ethereum) {
    window.ethereum.on?.('accountsChanged', () => { signer = null; account = null; connect(); });
    window.ethereum.on?.('chainChanged', () => location.reload());
  }

  // ---------- SENDING TRANSACTIONS ----------
  function logTx(label, hash, ok) {
    const list = JSON.parse(localStorage.getItem('certchain.txs') || '[]');
    list.unshift({ label, hash, ok, at: Date.now(), contract: contractAddress });
    localStorage.setItem('certchain.txs', JSON.stringify(list.slice(0, 30)));
    renderTxLog();
  }
  function renderTxLog() {
    const list = JSON.parse(localStorage.getItem('certchain.txs') || '[]');
    $('#txCard').classList.toggle('hidden', !list.length);
    if (!list.length) return;
    $('#txLog').innerHTML = list.map(t => `<div class="txrow"><span>${t.ok ? '✅' : '⛔'} <b>${esc(t.label)}</b> · ${txLink(t.hash)}</span>
      <button data-copy="${t.hash}">Copy hash</button></div>`).join('');
  }
  $('#txLog').addEventListener('click', e => {
    const h = e.target.dataset?.copy; if (!h) return;
    navigator.clipboard?.writeText(h).then(() => toast('Hash copied')).catch(() => prompt('Copy this hash:', h));
  });

  // Runs one contract write: makes sure wallet + network are ready, sends, waits, reports.
  async function send(label, method, args, btn) {
    if (!ethers.isAddress(contractAddress)) { toast('This site is not connected to a certificate registry right now.'); return false; }
    if (!signer && !(await connect())) return false;
    await ensureChain().catch(() => {});
    const c = new ethers.Contract(contractAddress, ART.abi, signer);
    const force = $('#forceSend')?.checked;
    btn.disabled = true; const old = btn.textContent; btn.textContent = 'Waiting for MetaMask…';
    try {
      // A fixed gas limit skips MetaMask's pre-check, so a refused tx still gets mined (and fails) on-chain.
      const tx = await c[method](...args, force ? { gasLimit: 400000 } : {});
      btn.textContent = 'Confirming on chain…';
      toast('Sent! Waiting for the block…');
      const rc = await tx.wait();
      logTx(label, tx.hash, true);
      toast('✅ Done: ' + label);
      return true;
    } catch (e) {
      const h = e?.receipt?.hash || e?.transaction?.hash || e?.transactionHash;
      let msg = friendlyError(e);
      if (h) {
        // A mined-but-failed tx: ask the node why by replaying it as a call.
        try { await c[method].staticCall(...args, { from: account }); } catch (e2) { const m2 = friendlyError(e2); if (m2.startsWith('Refused')) msg = m2; }
        logTx(label + ' (refused)', h, false);
      }
      toast('⛔ ' + msg, 9000);
      return false;
    } finally { btn.disabled = false; btn.textContent = old; }
  }

  const fd = form => Object.fromEntries(new FormData(form).entries());
  $('#issueForm').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = fd(ev.target); const code = normCode(f.code);
    if (await send(`Issue ${code}`, 'issue', [code, f.holderId.trim(), f.title.trim()], ev.submitter)) { ev.target.reset(); showVerify(code); }
  });
  $('#correctForm').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = fd(ev.target); const code = normCode(f.code);
    if (await send(`Correct ${code}`, 'correct', [code, f.title.trim(), f.reason.trim()], ev.submitter)) { ev.target.reset(); showVerify(code); }
  });
  $('#revokeForm').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = fd(ev.target); const code = normCode(f.code);
    if (await send(`Revoke ${code}`, 'revoke', [code, f.reason.trim()], ev.submitter)) { ev.target.reset(); showVerify(code); }
  });
  function showVerify(code) { $('#verifyCode').value = code; $('.tab[data-tab=verify]').click(); verify(code); }

  // ---------- ADMIN ----------
  $('#addIssuerForm').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = fd(ev.target); const a = f.addr.trim();
    if (!ethers.isAddress(a)) { toast('That is not a valid wallet address (it should start with 0x and have 42 characters).'); return; }
    if (await send(`Add issuer ${f.name.trim()}`, 'addIssuer', [ethers.getAddress(a.toLowerCase()), f.name.trim()], ev.submitter)) { ev.target.reset(); refreshAdmin(); updateWalletInfo(); }
  });
  $('#removeIssuerForm').addEventListener('submit', async ev => {
    ev.preventDefault(); const a = fd(ev.target).addr.trim();
    if (!ethers.isAddress(a)) { toast('That is not a valid wallet address.'); return; }
    if (await send(`Remove issuer ${short(a)}`, 'removeIssuer', [ethers.getAddress(a.toLowerCase())], ev.submitter)) { ev.target.reset(); refreshAdmin(); updateWalletInfo(); }
  });
  $('#issuerList').addEventListener('click', e => {
    const a = e.target.dataset?.remove; if (!a) return;
    $('#removeIssuerForm [name=addr]').value = a; $('#removeIssuerForm [name=addr]').focus();
  });

  async function refreshAdmin() {
    const has = ethers.isAddress(contractAddress);
    $('#deployBtn').textContent = has ? 'Create a new (separate) registry' : 'Create registry';
    if (!has) { $('#adminInfo').textContent = 'No registry connected.'; $('#issuerList').textContent = '—'; $('#deployCard').scrollIntoView?.({ block: 'nearest' }); return; }
    try {
      const c = readContract();
      const [adm, n] = await Promise.all([c.admin(), c.issuerCount()]);
      $('#adminInfo').innerHTML = `Admin wallet of this contract: ${addrLink(adm)}`;
      const addrs = await Promise.all([...Array(Number(n)).keys()].map(i => c.issuerList(i)));
      const rows = await Promise.all(addrs.map(async a => ({ a, name: await c.issuerName(a), on: await c.isIssuer(a) })));
      $('#issuerList').innerHTML = rows.length ? rows.map(r => `<div class="issuerRow"><span><b>${esc(r.name)}</b> · ${addrLink(r.a)}</span>
        <span>${r.on ? `<span class="pill on">active</span> <button class="small" data-remove="${r.a}">Remove…</button>` : '<span class="pill off">removed</span>'}</span></div>`).join('')
        : 'No issuers yet.';
    } catch (e) { $('#issuerList').innerHTML = `<span class="banner bad">${esc(friendlyError(e))}</span>`; }
  }

  // Deploy straight from the browser with MetaMask (no Remix needed).
  $('#deployBtn').addEventListener('click', async ev => {
    const btn = ev.currentTarget;
    if (ethers.isAddress(contractAddress) && !confirm('A registry is already connected. Create a brand-new empty one?')) return;
    if (!signer && !(await connect())) return;
    btn.disabled = true; const old = btn.textContent; btn.textContent = 'Confirm in MetaMask…';
    try {
      await ensureChain();
      const factory = new ethers.ContractFactory(ART.abi, ART.bytecode, signer);
      const c = await factory.deploy();
      btn.textContent = 'Creating…';
      await c.waitForDeployment();
      contractAddress = await c.getAddress();
      localStorage.setItem('certchain.contract.' + CHAIN_ID, contractAddress);
      logTx('Create registry', c.deploymentTransaction().hash, true);
      const share = location.origin + location.pathname + '?contract=' + contractAddress;
      $('#deployOut').innerHTML = `<div class="banner ok">✅ Registry created at <b class="mono">${contractAddress}</b><br>
        Link: <a href="${share}">${esc(share)}</a></div>`;
      history.replaceState(null, '', '?contract=' + contractAddress);
      refreshContractUI(); refreshAdmin(); updateWalletInfo();
    } catch (e) { $('#deployOut').innerHTML = `<div class="banner bad">${esc(friendlyError(e))}</div>`; }
    finally { btn.disabled = false; btn.textContent = ethers.isAddress(contractAddress) ? 'Create a new (separate) registry' : old; }
  });

  // ---------- start ----------
  refreshContractUI(); renderTxLog(); refreshAdmin();
  // Deep link (what the QR code opens): ?code=C-1042 -> Verify tab + automatic check.
  const linkCode = normCode(params.get('code') || params.get('c') || new URLSearchParams(location.hash.slice(1)).get('code'));
  if (linkCode) {
    $('.tab[data-tab=verify]').click();
    $('#verifyCode').value = linkCode;
    verify(linkCode);
  } else if (params.get('tab')) $(`.tab[data-tab=${params.get('tab')}]`)?.click();
})();
