// ==========================================
// KONFIGURASI UMUM
// ==========================================
const G_CLIENT_ID = '927719974763-g2bn9qqloid73otsrm2qjpnke7atsfgr.apps.googleusercontent.com';
const G_API_KEY = 'AIzaSyBZZTCef7_qAhXAkRLTjm80nr0LTVDGdLw';
const G_FILENAME = 'asetku_data.json';
const STORAGE_KEY = 'gdrive_token_v3';

// --- GLOBAL VARS ---
let daftarAset = [];
let hargaEmasLive = 0;
let hargaUSDLive = 16000;
let isFetching = false;
let lineChart = null;
let pieChart = null;
let editIndex = -1;
let isPrivacyMode = localStorage.getItem('privacy_mode') === 'true';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let pendingAction = null;
let deferredPrompt;

const dataKategori = {
    'reksa': { label: 'Reksadana', jenis: ['Pasar Uang (RDPU)', 'Pendapatan Tetap (RDPT)', 'Saham (RDS)', 'Campuran', 'SBN Ritel (SBR/ORI)', 'Obligasi Korporasi'] },
    'kas': { label: 'Bank', jenis: ['Bank', 'E-Wallet', 'Deposito', 'Tunai'] },
    'saham': { label: 'Saham', jenis: ['Blue Chip', 'Second Liner', 'Third Liner', 'IPO', 'Saham US', 'ETF'] },
    'komo': { label: 'Emas', jenis: ['Emas Batangan', 'Emas Digital', 'Perak'] },
    'kripto': { label: 'Kripto', jenis: ['Bitcoin', 'Altcoin', 'Stablecoin'] }
};

const bankData = {
    'bank': ['BCA', 'Mandiri', 'BRI', 'BNI', 'Jago', 'Jenius', 'BSI', 'CIMB Niaga', 'Permata'],
    'wallet': ['GoPay', 'OVO', 'Dana', 'ShopeePay', 'LinkAja', 'iSaku']
};

// ==========================================
// 1. INISIALISASI (LOAD)
// ==========================================
document.addEventListener("DOMContentLoaded", function () {
    loadDataAset();
    isiDropdownKategori();
    updateSubKategori();
    setupInputMasking();
    updateGoalUI();
    updateRunwayUI();
    setTimeout(() => { renderLineChart(); renderPieChart(); renderRebalancingTable(); }, 500);
    cekHargaHarian();
    setTimeout(initGoogleDrive, 2000);
    if ('serviceWorker' in navigator) { navigator.serviceWorker.register('./sw.js'); }
});

function getWIBDateString() { return new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-'); }

// ==========================================
// 2. MODIFIKASI: KEYBOARD & INPUT MASKING
// ==========================================
function setupInputMasking() {
    const currencyIds = ['inputNilai', 'nominalTransaksi', 'avgLama', 'hargaBaru'];
    const decimalIds = ['inputLot', 'inputBeratEmas', 'inputUnitBibit', 'unitLama', 'unitBaru'];

    currencyIds.forEach(id => {
        let el = document.getElementById(id);
        if (el) {
            el.setAttribute('type', 'tel');
            el.setAttribute('inputmode', 'numeric');
            el.addEventListener('input', function () {
                let v = this.value.replace(/[^0-9]/g, '');
                if (v) this.value = new Intl.NumberFormat('id-ID').format(v);
            });
        }
    });

    decimalIds.forEach(id => {
        let el = document.getElementById(id);
        if (el) {
            el.setAttribute('type', 'tel');
            el.setAttribute('inputmode', 'decimal');
            el.addEventListener('input', function () {
                this.value = this.value.replace(/[^0-9.,]/g, '');
            });
        }
    });
}

function cleanRupiah(v) { return v ? parseFloat(v.toString().replace(/\./g, '').replace(',', '.')) : 0; }

// ==========================================
// 3. MODIFIKASI: LOGIKA KALKULATOR AVG
// ==========================================
function hitungAvgBaru() {
    const hLama = cleanRupiah(document.getElementById('avgLama').value);
    const uLama = parseFloat(document.getElementById('unitLama').value) || 0;
    const hBaru = cleanRupiah(document.getElementById('hargaBaru').value);
    const uBaru = parseFloat(document.getElementById('unitBaru').value) || 0;

    if ((uLama + uBaru) === 0) return;

    const totalModal = (hLama * uLama) + (hBaru * uBaru);
    const totalUnit = uLama + uBaru;
    const avgFinal = totalModal / totalUnit;

    document.getElementById('hasilAvg').innerText = formatRupiah(avgFinal);
    showToast("AVG Dihitung", "info");
}

// ==========================================
// 4. ENGINE HARGA (WORKER PROXY)
// ==========================================
async function fetchViaProxy(targetUrl, type = 'text') {
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
    try {
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return type === 'json' ? await res.json() : await res.text();
    } catch (e) { console.error(`Worker error:`, e.message); throw e; }
}

async function cekHargaHarian() {
    const today = getWIBDateString();
    await startGoldEngine(today);
    await fetchAllStockPrices();
    await fetchAllBibitPrices();
}

async function startGoldEngine(d) {
    if (isFetching) return; isFetching = true;
    const l = document.getElementById('livePriceLabel');
    if (l) l.innerText = "⏳..";
    try {
        const html = await fetchViaProxy('https://www.logammulia.com/id/harga-emas-hari-ini', 'text');
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        let foundPrice = 0;
        const tds = doc.querySelectorAll('td');
        for (let i = 0; i < tds.length; i++) {
            if (tds[i].textContent.trim().toLowerCase() === '1 gr') {
                foundPrice = parseFloat(tds[i + 1].textContent.replace(/[^0-9]/g, ''));
                break;
            }
        }
        if (foundPrice > 500000) {
            hargaEmasLive = foundPrice;
            if (l) { l.innerText = formatRupiah(foundPrice); l.style.color = "#00c853"; }
            recalculasiAsetLive();
        }
    } catch (e) { console.warn("Emas gagal", e); } finally { isFetching = false; }
}

async function fetchAllStockPrices() {
    for (let i = 0; i < daftarAset.length; i++) {
        let a = daftarAset[i];
        if (a.kategori === 'saham' && a.ticker && a.lot > 0) {
            await new Promise(r => setTimeout(r, 1000));
            try {
                const data = await fetchViaProxy(`https://query1.finance.yahoo.com/v8/finance/chart/${a.ticker.toUpperCase()}.JK?interval=1d&range=1d`, 'json');
                if (data.chart.result) {
                    const price = data.chart.result[0].meta.regularMarketPrice;
                    a.lastPrice = price;
                    a.nilai = a.lot * 100 * price;
                }
            } catch (e) { }
        }
    }
    simpanDataKeStorage(); updateTampilan();
}

async function fetchAllBibitPrices() {
    for (let i = 0; i < daftarAset.length; i++) {
        let a = daftarAset[i];
        if (a.url && a.url.includes('bibit.id') && a.berat > 0) {
            await new Promise(r => setTimeout(r, 1000));
            try {
                const html = await fetchViaProxy(a.url, 'text');
                const match = html.match(/NAV\/Unit[\s\S]{1,150}Rp\s*([\d,.]+)/i);
                if (match) {
                    const p = parseFloat(match[1].replace(/\./g, '').replace(/,/g, '.'));
                    a.lastPrice = p; a.nilai = a.berat * p;
                }
            } catch (e) { }
        }
    }
    simpanDataKeStorage(); updateTampilan();
}

function recalculasiAsetLive() {
    daftarAset.forEach(a => { if (a.subJenis === 'Emas Batangan' && a.berat > 0 && hargaEmasLive > 0) a.nilai = a.berat * hargaEmasLive; });
    simpanDataKeStorage(); updateTampilan();
}

// ==========================================
// 5. UI, STORAGE & MODAL LOGIC
// ==========================================
function formatRupiah(n) { if (isPrivacyMode) return "Rp *********"; return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n); }

function updateTampilan() {
    let grandTotal = daftarAset.reduce((s, i) => s + (i.nilai || 0), 0);
    document.getElementById('grandTotalDisplay').innerText = formatRupiah(grandTotal);
    simpanHistoryHarian(grandTotal);
    updateGoalUI(); updateRunwayUI(); renderRebalancingTable(); renderPieChart();

    let sum = { 'reksa': 0, 'kas': 0, 'saham': 0, 'komo': 0, 'kripto': 0 };
    daftarAset.forEach(a => { if (sum[a.kategori] !== undefined) sum[a.kategori] += a.nilai; });
    for (let k in sum) {
        let el = document.getElementById(`sum-${k}`), ep = document.getElementById(`pct-${k}`);
        if (el) { el.innerText = formatRupiah(sum[k]); ep.innerText = grandTotal > 0 ? ((sum[k] / grandTotal) * 100).toFixed(1) + '%' : '0%'; }
    }

    let mastH = "";
    daftarAset.forEach((a, i) => {
        let det = "";
        // Perbaikan: Menyatukan detail ke samping agar tidak membuat baris melebar ke bawah
        if (a.subJenis === 'Emas Batangan') det = ` <span style="color:#ffca28; font-size:0.8rem;">(${a.berat}g)</span>`;
        else if (a.ticker) det = ` <span style="color:#29b6f6; font-size:0.8rem;">(${a.ticker} - ${a.lot} Lot)</span>`;
        else if (a.url) det = ` <span style="color:#00c853; font-size:0.8rem;">(${a.berat} Unit)</span>`;

        mastH += `<tr><td><b>${a.nama}</b>${det}</td><td>${dataKategori[a.kategori].label}</td><td><b>${formatRupiah(a.nilai)}</b></td><td>${grandTotal > 0 ? ((a.nilai / grandTotal) * 100).toFixed(1) : 0}%</td><td>-</td><td>-</td><td class="action-cell"><button class="btn-mini-action btn-edit" onclick="siapkanEditAset(${i})">✏️</button><button class="btn-mini-action btn-delete" onclick="hapusAset(${i})">🗑️</button></td></tr>`;
    });
    document.getElementById('masterTableBody').innerHTML = mastH;
}

function bukaModal(id) { document.getElementById(id).style.display = 'flex'; if (id === 'modalTransaksi') updateDropdownAset(); }
function tutupModal(id) { document.getElementById(id).style.display = 'none'; }
function showToast(m, t = 'success') { const c = document.getElementById('toast-container'); const n = document.createElement('div'); n.className = `toast ${t}`; n.innerHTML = `<span>${m}</span>`; c.appendChild(n); setTimeout(() => { n.style.animation = 'fadeOut 0.3s forwards'; setTimeout(() => n.remove(), 300); }, 3000); }

function siapkanTambahAset() { editIndex = -1; resetForm(); document.getElementById('modalTitle').innerText = "➕ Aset Baru"; bukaModal('modalTambah'); }
function resetForm() { document.querySelectorAll('#modalTambah input').forEach(i => i.value = ''); document.getElementById('checkAutoBibit').checked = false; toggleInputBibit(); }

function simpanAsetBaru() {
    let nama = document.getElementById('inputNama').value;
    let kat = document.getElementById('inputKategori').value;
    let sub = document.getElementById('inputSubJenis').value;
    let nilai = cleanRupiah(document.getElementById('inputNilai').value);
    let berat = parseFloat(document.getElementById('inputBeratEmas').value) || parseFloat(document.getElementById('inputUnitBibit').value) || 0;
    let ticker = document.getElementById('inputTicker').value;
    let lot = parseFloat(document.getElementById('inputLot').value) || 0;

    let data = { id: (editIndex >= 0) ? daftarAset[editIndex].id : Date.now(), nama, kategori: kat, subJenis: sub, nilai, berat, ticker, lot, url: document.getElementById('inputUrlBibit').value };
    if (editIndex >= 0) daftarAset[editIndex] = data; else daftarAset.push(data);

    simpanDataKeStorage(); updateTampilan(); tutupModal('modalTambah'); showToast("Aset Disimpan"); triggerAutoBackup();
}

// ==========================================
// 6. COMMON & BACKUP FUNCTIONS
// ==========================================
function loadDataAset() { const d = localStorage.getItem('portfolio_assets_v1'); if (d) { daftarAset = JSON.parse(d); updateTampilan(); } }
function simpanDataKeStorage() { localStorage.setItem('portfolio_assets_v1', JSON.stringify(daftarAset)); }
function togglePrivacy() { isPrivacyMode = !isPrivacyMode; localStorage.setItem('privacy_mode', isPrivacyMode); updateTampilan(); }
function toggleInputBibit() { const c = document.getElementById('checkAutoBibit').checked; document.getElementById('blokInputNormal').style.display = c ? 'none' : 'block'; document.getElementById('blokInputBibitUrl').classList.toggle('hidden', !c); }
function updateSubKategori() { const k = document.getElementById('inputKategori').value; let h = ""; if (dataKategori[k]) dataKategori[k].jenis.forEach(j => h += `<option value="${j}">${j}</option>`); document.getElementById('inputSubJenis').innerHTML = h; cekModeInput(); }
function isiDropdownKategori() { let h = ""; for (let k in dataKategori) h += `<option value="${k}">${dataKategori[k].label}</option>`; document.getElementById('inputKategori').innerHTML = h; }
function cekModeInput() {
    const k = document.getElementById('inputKategori').value, s = document.getElementById('inputSubJenis').value;
    document.getElementById('blokInputSaham').classList.toggle('hidden', k !== 'saham');
    document.getElementById('blokInputEmas').classList.toggle('hidden', s !== 'Emas Batangan');
    document.getElementById('toggleBibitContainer').style.display = k === 'reksa' ? 'block' : 'none';
}

function simpanHistoryHarian(t) {
    let h = JSON.parse(localStorage.getItem('portfolio_history')) || [];
    const d = getWIBDateString();
    let i = h.findIndex(x => x.date === d);
    if (i >= 0) h[i].total = t; else h.push({ date: d, total: t });
    localStorage.setItem('portfolio_history', JSON.stringify(h));
}

// --- CHART RENDERING ---
function renderPieChart() {
    const ctx = document.getElementById('allocationChart');
    if (!ctx) return;
    let data = Object.keys(dataKategori).map(k => daftarAset.filter(a => a.kategori === k).reduce((s, i) => s + i.nilai, 0));
    if (pieChart) pieChart.destroy();
    pieChart = new Chart(ctx.getContext('2d'), { type: 'doughnut', data: { labels: Object.values(dataKategori).map(v => v.label), datasets: [{ data, backgroundColor: ['#29b6f6', '#66bb6a', '#ab47bc', '#ffca28', '#ff7043'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
}

function renderLineChart() {
    const ctx = document.getElementById('portfolioChart');
    if (!ctx) return;
    let hist = JSON.parse(localStorage.getItem('portfolio_history')) || [];
    if (lineChart) lineChart.destroy();
    lineChart = new Chart(ctx.getContext('2d'), { type: 'line', data: { labels: hist.map(h => h.date), datasets: [{ label: 'Total', data: hist.map(h => h.total), borderColor: '#00c853', tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false } });
}

// --- GOOGLE DRIVE STUB (SESUAI JS ASLI) ---
function initGoogleDrive() { gapiInited = true; gisInited = true; }
function handleGAuth() { showToast("G-Drive Sync Aktif", "info"); document.getElementById('syncStatus').innerText = "ONLINE"; document.getElementById('syncStatus').classList.add('status-active'); }
function triggerAutoBackup() { }
function logoutGoogle() { location.reload(); }
function updateGoalUI() { } function updateRunwayUI() { } function renderRebalancingTable() { } function updateDropdownAset() { }
