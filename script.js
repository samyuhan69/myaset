// ==========================================
// KONFIGURASI GOOGLE API (DATA KAMU)
// ==========================================
const G_CLIENT_ID = 'GOOGLE_CLOUD_KAMU';
const G_API_KEY = 'GOOGLE_CLOUD_KAMU';
const G_FILENAME = 'asetku_data.json';
// ==========================================


// --- GLOBAL VARS ---
let daftarAset = [];
let hargaEmasLive = 0;
let hargaUSDLive = 15500;
let isFetching = false;
let lineChart = null;
let pieChart = null;
let editIndex = -1;
let isPrivacyMode = localStorage.getItem('privacy_mode') === 'true';

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

// --- INIT ---
document.addEventListener("DOMContentLoaded", function () {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.log);
    loadDataAset();
    isiDropdownKategori();
    updateSubKategori();
    cekHargaHarian();
    setupInputMasking();
    updateGoalUI(); updateRunwayUI();
    setTimeout(() => { renderLineChart(); renderPieChart(); renderRebalancingTable(); }, 500);
    setInterval(cekHargaHarian, 60000);

    // Init Google Auth
    setTimeout(initGoogleDrive, 1500);
});

function getWIBDateString() { return new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-'); }

// ==========================================
// 1. ENGINE UTAMA: CEK HARGA
// ==========================================
async function cekHargaHarian() {
    const today = getWIBDateString();
    // 1. Cek Emas
    const c = JSON.parse(localStorage.getItem('emas_cache_v1'));
    if (c && c.date === today && c.price > 0) setHargaEmasSukses(c.price);
    else startGoldEngine(today);
    // 2. Cek Bibit
    fetchAllBibitPrices();
    // 3. Cek Saham
    fetchAllStockPrices();
}

async function fetchAllStockPrices() {
    for (let i = 0; i < daftarAset.length; i++) {
        let aset = daftarAset[i];
        if (aset.kategori === 'saham' && aset.ticker && aset.lot > 0) {
            await fetchStockPrice(i, aset.ticker);
        }
    }
}

async function fetchStockPrice(index, ticker) {
    let yahooTicker = ticker.toUpperCase();
    if (!yahooTicker.includes('.JK')) yahooTicker = yahooTicker + ".JK";
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    try {
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error("Network");
        const data = await res.json();
        const result = data.chart.result[0];
        const price = result.meta.regularMarketPrice;
        if (price > 0) {
            let aset = daftarAset[index];
            aset.nilai = aset.lot * 100 * price;
            aset.lastPrice = price;
            aset.lastUpdate = getWIBDateString();
            simpanDataKeStorage();
            updateTampilan();
        }
    } catch (e) { console.log(`Gagal ambil harga saham ${ticker}:`, e); }
}

async function fetchAllBibitPrices() {
    for (let i = 0; i < daftarAset.length; i++) {
        let aset = daftarAset[i];
        if (aset.url && aset.url.includes('bibit.id') && aset.berat > 0) {
            await fetchSingleBibit(i, aset.url);
        }
    }
}

async function fetchSingleBibit(index, url, isPreview = false) {
    const label = document.getElementById('liveBibitPrice');
    if (isPreview && label) label.innerText = "Mencoba...";
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&timestamp=${Date.now()}`;
    try {
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error("Busy");
        const json = await res.json();
        const html = json.contents;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const bodyText = doc.body.innerText;
        const regex = /NAV[\s\S]*?Rp\s*([\d,]+\.\d{2})/;
        const match = bodyText.match(regex);
        if (match && match[1]) {
            let cleanString = match[1].replace(/,/g, '');
            let foundPrice = parseFloat(cleanString);
            if (foundPrice > 0) {
                if (isPreview && label) { label.innerText = formatRupiah(foundPrice); label.style.color = "#00c853"; return; }
                let aset = daftarAset[index];
                aset.nilai = aset.berat * foundPrice;
                aset.lastPrice = foundPrice;
                aset.lastUpdate = getWIBDateString();
                simpanDataKeStorage();
                updateTampilan();
            }
        }
    } catch (e) { if (isPreview && label) { label.innerText = "Gagal"; label.style.color = "#ff1744"; } }
}

function setHargaEmasSukses(h) {
    hargaEmasLive = h;
    const l = document.getElementById('livePriceLabel');
    if (l) { l.innerText = formatRupiah(h); l.style.color = "#00c853"; }
    recalculasiAsetLive();
}

async function startGoldEngine(d) {
    if (isFetching) return; isFetching = true;
    const l = document.getElementById('livePriceLabel');
    if (l) l.innerText = "Mencari...";
    const t = 'https://www.logammulia.com/id/harga-emas-hari-ini';
    const p = [`https://api.allorigins.win/get?url=${encodeURIComponent(t)}&timestamp=${Date.now()}`];
    let f = 0;
    try {
        const res = await fetch(p[0]);
        let h = (await res.json()).contents;
        const parser = new DOMParser();
        const doc = parser.parseFromString(h, "text/html");
        const rows = doc.querySelectorAll('tr');
        for (let row of rows) {
            if (row.innerText.includes('1 gr')) {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2 && cells[0].innerText.includes('1 gr') && !cells[0].innerText.includes('10')) {
                    f = parseInt(cells[1].innerText.replace(/\D/g, '')); break;
                }
            }
        }
    } catch (e) { }
    isFetching = false;
    if (f > 0) {
        localStorage.setItem('emas_cache_v1', JSON.stringify({ date: d, price: f }));
        setHargaEmasSukses(f);
    }
}

function recalculasiAsetLive() {
    let change = false;
    daftarAset.forEach(a => {
        if (a.subJenis === 'Emas Batangan' && a.berat > 0 && hargaEmasLive > 0) {
            a.nilai = a.berat * hargaEmasLive; change = true;
        }
    });
    if (change) { simpanDataKeStorage(); updateTampilan(); }
}

// ==========================================
// 2. UI & LOGIC INPUT
// ==========================================
function siapkanTambahAset() {
    editIndex = -1; resetForm();
    document.getElementById('modalTitle').innerText = "➕ Aset Baru";
    document.getElementById('btnSimpan').innerText = "Simpan Aset";
    document.getElementById('checkAutoBibit').checked = false;
    toggleInputBibit(); bukaModal('modalTambah');
}

function siapkanEditAset(index) {
    editIndex = index; const aset = daftarAset[index];
    document.getElementById('inputNama').value = aset.nama;
    document.getElementById('inputKategori').value = aset.kategori;
    updateSubKategori();
    document.getElementById('inputSubJenis').value = aset.subJenis;
    cekModeInput();
    if (aset.subJenis === 'Emas Batangan') { document.getElementById('inputBeratEmas').value = aset.berat; }
    else if (aset.ticker && aset.lot) {
        document.getElementById('inputTicker').value = aset.ticker;
        document.getElementById('inputLot').value = aset.lot;
    }
    else if (aset.url && aset.url.includes('bibit.id')) {
        document.getElementById('checkAutoBibit').checked = true;
        toggleInputBibit();
        document.getElementById('inputUrlBibit').value = aset.url;
        document.getElementById('inputUnitBibit').value = aset.berat;
        fetchSingleBibit(index, aset.url, true);
    }
    else { document.getElementById('inputNilai').value = new Intl.NumberFormat('id-ID').format(aset.nilai); }
    document.getElementById('modalTitle').innerText = "✏️ Edit Aset";
    document.getElementById('btnSimpan').innerText = "Update";
    bukaModal('modalTambah');
}

function resetForm() {
    document.getElementById('inputNama').value = '';
    document.getElementById('inputNilai').value = '';
    document.getElementById('inputBeratEmas').value = '';
    document.getElementById('inputUrlBibit').value = '';
    document.getElementById('inputUnitBibit').value = '';
    document.getElementById('inputTicker').value = '';
    document.getElementById('inputLot').value = '';
    document.getElementById('checkAutoBibit').checked = false;
    toggleInputBibit();
}

function simpanAsetBaru() {
    let nama = document.getElementById('inputNama').value;
    let kat = document.getElementById('inputKategori').value;
    let subJenis = document.getElementById('inputSubJenis').value;
    let currency = document.getElementById('inputCurrency').value;

    let nilaiInput = 0; let beratInput = 0; let customUrl = ""; let tickerInput = "";

    if (subJenis === 'Emas Batangan') {
        beratInput = parseFloat(document.getElementById('inputBeratEmas').value);
        if (hargaEmasLive === 0 && nilaiInput === 0) { showToast("Tunggu harga emas...", "info"); return; }
        nilaiInput = beratInput * hargaEmasLive;
    }
    else if (kat === 'saham') {
        tickerInput = document.getElementById('inputTicker').value.toUpperCase().trim();
        beratInput = parseFloat(document.getElementById('inputLot').value);
        if (!tickerInput || beratInput <= 0) { showToast("Isi Kode & Lot!", "error"); return; }
        if (editIndex >= 0 && daftarAset[editIndex].lastPrice) {
            nilaiInput = beratInput * 100 * daftarAset[editIndex].lastPrice;
        } else { nilaiInput = 0; }
        if (!nama) nama = tickerInput;
    }
    else if (document.getElementById('checkAutoBibit').checked) {
        customUrl = document.getElementById('inputUrlBibit').value;
        beratInput = parseFloat(document.getElementById('inputUnitBibit').value);
        if (!customUrl.includes('bibit.id')) { showToast("Link harus dari bibit.id!", "error"); return; }
        nilaiInput = 0;
    }
    else {
        let raw = document.getElementById('inputNilai').value;
        if (currency === 'USD') { nilaiInput = parseFloat(raw) * hargaUSDLive; } else { nilaiInput = cleanRupiah(raw); }
    }

    if (!nama) { showToast("Isi nama aset!", "error"); return; }
    let newData = {
        id: Date.now(), nama, kategori: kat, subJenis, nilai: nilaiInput, berat: beratInput,
        url: customUrl, ticker: tickerInput, lot: (kat === 'saham') ? beratInput : 0
    };
    if (editIndex >= 0) {
        let a = daftarAset[editIndex];
        a.nama = nama; a.kategori = kat; a.subJenis = subJenis;
        a.nilai = nilaiInput > 0 ? nilaiInput : a.nilai;
        a.berat = beratInput; a.url = customUrl;
        a.ticker = tickerInput; a.lot = newData.lot;
        showToast("Diperbarui!", "success");
    } else {
        daftarAset.push(newData);
        showToast("Aset ditambahkan", "success");
    }
    simpanDataKeStorage(); resetForm(); tutupModal('modalTambah'); updateTampilan();
    if (customUrl) fetchAllBibitPrices();
    if (tickerInput) { showToast("Mengambil harga saham...", "info"); fetchStockPrice(daftarAset.length - 1, tickerInput); }
}

function cekModeInput() {
    let k = document.getElementById('inputKategori').value;
    let j = document.getElementById('inputSubJenis').value;
    let bn = document.getElementById('blokInputNormal'), be = document.getElementById('blokInputEmas');
    let bs = document.getElementById('blokInputSaham'), bb = document.getElementById('blokInputBibitUrl');
    let bt = document.getElementById('toggleBibitContainer'), ar = document.getElementById('suggestionArea');

    bn.classList.remove('hidden'); be.classList.add('hidden'); bs.classList.add('hidden'); bb.classList.add('hidden');
    if (bt) bt.style.display = 'none'; ar.innerHTML = ""; document.getElementById('checkAutoBibit').checked = false;

    if (j === 'Emas Batangan') { bn.classList.add('hidden'); be.classList.remove('hidden'); }
    else if (k === 'saham') { bn.classList.add('hidden'); bs.classList.remove('hidden'); }
    else {
        if (k === 'reksa' && bt) bt.style.display = 'block';
        let c = []; if (j.includes('Bank')) c = bankData.bank; else if (j.includes('E-Wallet')) c = bankData.wallet;
        if (c.length > 0) {
            let h = `<div class="suggestion-box">`;
            c.forEach(x => { h += `<div class="chip" onclick="isiNamaOtomatis('${x}','${j}')">${x}</div>`; });
            h += `</div>`; ar.innerHTML = h;
        }
    }
}

// ==========================================
// 3. FUNGSI STANDAR LAINNYA
// ==========================================
function bukaModal(id) { document.getElementById(id).style.display = 'flex'; if (id === 'modalTransaksi') updateDropdownAset(); }
function tutupModal(id) { document.getElementById(id).style.display = 'none'; }
function hapusAset(index) { if (confirm(`Hapus "${daftarAset[index].nama}"?`)) { daftarAset.splice(index, 1); simpanDataKeStorage(); updateTampilan(); showToast("Aset dihapus", "info"); } }
function showToast(message, type = 'success') { const container = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.innerHTML = `<span>${message}</span>`; container.appendChild(toast); setTimeout(() => { toast.style.animation = 'fadeOut 0.3s ease-out forwards'; toast.addEventListener('animationend', () => toast.remove()); }, 3000); }

function updateTampilan() {
    if (hargaEmasLive > 0) recalculasiAsetLive();
    daftarAset.sort((a, b) => a.nama.localeCompare(b.nama));
    let grandTotal = daftarAset.reduce((s, i) => s + (i.nilai > 0 ? i.nilai : 0), 0);
    document.getElementById('grandTotalDisplay').innerText = formatRupiah(grandTotal);
    simpanHistoryHarian(grandTotal); updateGoalUI(); updateRunwayUI(); renderRebalancingTable(); renderPieChart();

    let sum = { 'reksa': 0, 'kas': 0, 'saham': 0, 'komo': 0, 'kripto': 0 };
    let subSum = {};
    daftarAset.forEach(a => {
        if (a.nilai <= 0 && !a.ticker) return;
        let k = dataKategori[a.kategori] ? a.kategori : 'reksa';
        sum[k] += a.nilai;
        a.currentTrend = getAssetTrend(a.id, a.nilai);
        if (!subSum[a.subJenis]) subSum[a.subJenis] = { t: 0, w: 0 };
        subSum[a.subJenis].t += a.nilai;
        subSum[a.subJenis].w += (a.currentTrend * a.nilai);
    });

    for (let k in sum) {
        let el = document.getElementById(`sum-${k}`), ep = document.getElementById(`pct-${k}`);
        if (el) { el.innerText = formatRupiah(sum[k]); ep.innerText = grandTotal > 0 ? ((sum[k] / grandTotal) * 100).toFixed(1) + '%' : '0%'; }
    }

    let subH = "";
    Object.keys(subSum).sort().forEach(k => {
        let d = subSum[k]; if (d.t <= 0) return;
        let avg = d.t > 0 ? d.w / d.t : 0; let vis = renderTrend(avg, d.t);
        subH += `<tr><td><b>${k}</b></td><td>${formatRupiah(d.t)}</td><td>${grandTotal > 0 ? ((d.t / grandTotal) * 100).toFixed(1) : 0}%</td><td>${vis.badge}</td></tr>`;
    });
    document.getElementById('subCategoryTableBody').innerHTML = subH || "<tr><td colspan='4' style='text-align:center; color:#666;'>Tidak ada aset aktif</td></tr>";

    let mastH = "", cA = 0;
    for (let i = 0; i < daftarAset.length; i++) {
        let a = daftarAset[i];
        if (a.nilai <= 0 && (!a.ticker)) continue;
        cA++;
        let style = a.nilai <= 0 ? "opacity: 0.7" : "";
        let vis = renderTrend(a.currentTrend, a.nilai);
        let det = a.subJenis;
        if (a.subJenis === 'Emas Batangan') det = `<span style="color:#ffca28">⚖️ ${a.berat.toFixed(2)}g</span>`;
        else if (a.url && a.url.includes('bibit.id')) det = `<span style="color:#00c853">🌱 ${a.berat.toFixed(2)} Unit</span>`;
        else if (a.ticker) det = `<span style="color:#29b6f6">📈 ${a.ticker} (${a.lot} Lot)</span>`;
        let kl = dataKategori[a.kategori] ? dataKategori[a.kategori].label : "Lain";
        mastH += `<tr style="${style}"><td><b>${a.nama}</b><br><small>${det}</small></td><td><small>${kl}</small></td><td><b>${formatRupiah(a.nilai)}</b></td><td>${grandTotal > 0 ? ((a.nilai / grandTotal) * 100).toFixed(1) : 0}%</td><td>${vis.badge}</td><td>${vis.nominal}</td><td class="action-cell"><button class="btn-mini-action btn-edit" onclick="siapkanEditAset(${i})">✏️</button><button class="btn-mini-action btn-delete" onclick="hapusAset(${i})">🗑️</button></td></tr>`;
    }
    document.getElementById('masterTableBody').innerHTML = cA === 0 ? "<tr><td colspan='7' style='text-align:center; padding:20px; color:#666;'>Dompet Kosong</td></tr>" : mastH;
}

function renderTrend(p, n) { if (isPrivacyMode) return { badge: `<span class="trend-badge trend-up">***%</span>`, nominal: `<span class="trend-up">+Rp ***</span>` }; if (isNaN(p) || isNaN(n) || n === 0) return { badge: `<span class="trend-badge" style="color:#888; background:#333">-</span>`, nominal: `<span style="color:#888">-</span>` }; let pv = n / (1 + p / 100); let rp = n - pv; let c = p >= 0 ? 'trend-up' : 'trend-down'; let ic = p >= 0 ? '▲' : '▼'; return { badge: `<span class="trend-badge ${c}">${ic} ${Math.abs(p).toFixed(2)}%</span>`, nominal: `<span class="${c}">${p >= 0 ? '+' : ''}${formatRupiah(rp)}</span>` }; }
function formatChartAxis(value) { if (isPrivacyMode) return '***'; if (value === 0) return '0'; if (Math.abs(value) >= 1e12) return Math.round(value / 1e12) + ' T'; if (Math.abs(value) >= 1e9) return Math.round(value / 1e9) + ' M'; if (Math.abs(value) >= 1e6) return Math.round(value / 1e6) + ' Jt'; return new Intl.NumberFormat('id-ID').format(value); }

function renderLineChart(customData = null, label = null) {
    const ctx = document.getElementById('portfolioChart').getContext('2d');
    let rawHistory = JSON.parse(localStorage.getItem('portfolio_history')) || [];
    if (rawHistory.length === 0) rawHistory = [{ date: getWIBDateString(), total: 0 }];
    let dataToRender = [], chartLabel = "";
    if (customData) { dataToRender = customData; chartLabel = label + ""; } else { dataToRender = getMonthlyHistory(rawHistory); chartLabel = "Tren Bulanan"; let picker = document.getElementById('monthPicker'); if (picker) picker.value = ""; }
    const infoLabel = document.getElementById('chartInfoLabel'); if (infoLabel) infoLabel.innerText = chartLabel;
    if (lineChart) lineChart.destroy();
    let values = dataToRender.map(h => h.total);
    let labels = dataToRender.map(h => { let d = new Date(h.date); if (!customData) { return d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }); } else { return d.getDate(); } });
    lineChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [{ label: 'Total Aset', data: values, borderColor: '#00c853', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#00c853', fill: true, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, onClick: (evt, elements) => { if (elements.length > 0) { const index = elements[0].index; if (!customData) { const clickedData = dataToRender[index]; if (clickedData && clickedData.date) { const dateStr = clickedData.date; const monthStr = dateStr.substring(0, 7); const picker = document.getElementById('monthPicker'); if (picker) { picker.value = monthStr; modeGrafikHarian(); } } } else { if (index === 0) { modeGrafikBulanan(); } } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (context) { return isPrivacyMode ? 'Rp *****' : formatRupiah(context.raw); } } } }, scales: { x: { grid: { display: false }, ticks: { color: '#888' } }, y: { grid: { color: '#333', borderDash: [5, 5] }, ticks: { color: '#888', callback: function (value) { return formatChartAxis(value); } } } } } });
}

function getMonthlyHistory(fullHistory) { if (!fullHistory || fullHistory.length === 0) return []; let groups = {}; fullHistory.forEach(h => { let key = h.date.substring(0, 7); groups[key] = h; }); return Object.values(groups).sort((a, b) => new Date(a.date) - new Date(b.date)); }
function modeGrafikBulanan() { renderLineChart(null); }
function modeGrafikHarian() { const picker = document.getElementById('monthPicker'); if (!picker.value) { modeGrafikBulanan(); return; } const selectedMonth = picker.value; let history = JSON.parse(localStorage.getItem('portfolio_history')) || []; const filteredData = history.filter(h => h.date.startsWith(selectedMonth)); if (filteredData.length === 0) { showToast("Belum ada data di bulan ini", "info"); } else { const [year, month] = selectedMonth.split('-'); const monthName = new Date(year, month - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }); renderLineChart(filteredData, `Detail Harian: ${monthName}`); } }
function renderPieChart() { const ctx = document.getElementById('allocationChart').getContext('2d'); let catSum = {}, hasData = false; daftarAset.forEach(a => { if (a.nilai > 0) { let k = dataKategori[a.kategori] ? a.kategori : 'reksa'; if (!catSum[k]) catSum[k] = 0; catSum[k] += a.nilai; hasData = true; } }); let labels = [], dataVals = [], bgColors = []; const colorMap = { 'reksa': '#29b6f6', 'kas': '#66bb6a', 'saham': '#ab47bc', 'komo': '#ffca28', 'kripto': '#ff7043' }; if (hasData) { labels = Object.keys(catSum).map(k => dataKategori[k] ? dataKategori[k].label : 'Lainnya'); dataVals = Object.values(catSum); bgColors = Object.keys(catSum).map(k => colorMap[k] || '#888'); } else { labels = ["Belum ada aset"]; dataVals = [1]; bgColors = ["#333"]; } if (pieChart) pieChart.destroy(); pieChart = new Chart(ctx, { type: 'doughnut', data: { labels: labels, datasets: [{ data: dataVals, backgroundColor: bgColors, borderWidth: 0, hoverOffset: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#ccc', boxWidth: 12, font: { size: 10 } } }, tooltip: { callbacks: { label: function (c) { if (!hasData) return "Ayo tambah aset!"; if (isPrivacyMode) return c.label + ": ***"; return c.label + ': ' + ((c.raw / c.chart._metasets[c.datasetIndex].total) * 100).toFixed(1) + "%"; } } } }, cutout: '70%' } }); }
async function toggleCurrencyMode() { const curr = document.getElementById('inputCurrency').value, rateLabel = document.getElementById('usdRateLabel'), input = document.getElementById('inputNilai'); if (curr === 'USD') { rateLabel.style.display = 'block'; rateLabel.innerText = 'Mengambil Rate USD...'; try { const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD'); const data = await res.json(); hargaUSDLive = data.rates.IDR; rateLabel.innerText = `Rate: 1 USD = ${formatRupiah(hargaUSDLive)}`; } catch (e) { rateLabel.innerText = `Gagal. Estimasi Rp 15.500`; hargaUSDLive = 15500; } input.value = ""; } else { rateLabel.style.display = 'none'; input.value = ""; } }
function togglePrivacy() { isPrivacyMode = !isPrivacyMode; localStorage.setItem('privacy_mode', isPrivacyMode); updateTampilan(); updateGoalUI(); updateRunwayUI(); renderRebalancingTable(); renderLineChart(); renderPieChart(); }
function formatRupiah(n) { if (isPrivacyMode) return "Rp *********"; return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n); }
function editGoal() { let c = localStorage.getItem('financial_goal') || 100000000, i = prompt("Target (Rp):", c); if (i !== null) { let v = parseFloat(i.replace(/[^0-9]/g, '')); if (!isNaN(v) && v > 0) { localStorage.setItem('financial_goal', v); updateGoalUI(); } } }
function updateGoalUI() { let t = parseFloat(localStorage.getItem('financial_goal')) || 100000000, tot = daftarAset.reduce((s, i) => s + (i.nilai > 0 ? i.nilai : 0), 0), p = (tot / t) * 100; if (p > 100) p = 100; document.getElementById('targetLabel').innerText = formatRupiah(t); document.getElementById('progressBar').style.width = p + "%"; document.getElementById('progressText').innerText = isPrivacyMode ? "**%" : `${p.toFixed(1)}%`; }
function editExpense() { let c = localStorage.getItem('monthly_expense') || 0, i = prompt("Pengeluaran (Rp):", c); if (i !== null) { let v = parseFloat(i.replace(/[^0-9]/g, '')); if (!isNaN(v)) { localStorage.setItem('monthly_expense', v); updateRunwayUI(); } } }
function updateRunwayUI() { let e = parseFloat(localStorage.getItem('monthly_expense')) || 0; document.getElementById('expenseLabel').innerText = formatRupiah(e); let t = daftarAset.reduce((s, i) => s + (i.nilai > 0 ? i.nilai : 0), 0), r = document.getElementById('runwayResult'), s = document.getElementById('runwayStatus'); if (e <= 0) { r.innerText = "-"; s.className = "status-badge status-gray"; return; } let m = t / e, y = Math.floor(m / 12), rm = (m % 12).toFixed(1); r.innerText = isPrivacyMode ? "**" : y > 0 ? `${y} Thn ${rm} Bln` : `${m.toFixed(1)} Bulan`; if (m < 3) { s.className = "status-badge status-red"; s.innerText = "BAHAYA"; } else if (m < 6) { s.className = "status-badge status-yellow"; s.innerText = "WASPADA"; } else { s.className = "status-badge status-green"; s.innerText = "AMAN"; } }
function getRebalanceTargets() { let s = localStorage.getItem('target_allocation'); return s ? JSON.parse(s) : { 'reksa': 20, 'kas': 20, 'saham': 20, 'komo': 20, 'kripto': 20 }; }
function saveTargetInput(k, v) { let t = getRebalanceTargets(); t[k] = parseFloat(v) || 0; localStorage.setItem('target_allocation', JSON.stringify(t)); renderRebalancingTable(); }
function resetTargets() { localStorage.removeItem('target_allocation'); renderRebalancingTable(); }
function renderRebalancingTable() { const b = document.getElementById('rebalanceBody'); if (!b) return; let tg = getRebalanceTargets(), tot = daftarAset.reduce((s, i) => s + (i.nilai > 0 ? i.nilai : 0), 0), cS = {}; for (let k in dataKategori) cS[k] = 0; daftarAset.forEach(a => { if (a.nilai > 0 && cS[a.kategori] !== undefined) cS[a.kategori] += a.nilai }); let h = "", tP = 0; for (let k in dataKategori) { let l = dataKategori[k].label, tp = tg[k] || 0; tP += tp; let idl = tot * (tp / 100), act = cS[k] || 0, df = idl - act, acP = tot > 0 ? (act / tot) * 100 : 0; let txt = "-"; if (Math.abs(df) > (tot * 0.01)) { txt = df > 0 ? `<span class="action-buy">BELI (+${formatRupiah(df)})</span>` : `<span class="action-sell">JUAL (${formatRupiah(df)})</span>`; } else txt = `<span class="action-ok">OK</span>`; if (isPrivacyMode && Math.abs(df) > 0) txt = "***"; h += `<tr><td>${l}</td><td><input type="number" class="rebalance-input" value="${tp}" onchange="saveTargetInput('${k}',this.value)">%</td><td>${acP.toFixed(1)}%</td><td>${txt}</td></tr>`; } b.innerHTML = h; document.getElementById('targetSumLabel').innerText = `Total: ${tP}%`; }
function setupInputMasking() { ['inputNilai', 'nominalTransaksi'].forEach(id => { let el = document.getElementById(id); if (el) { el.type = "text"; el.addEventListener('keyup', function () { let v = this.value.replace(/[^0-9]/g, ''); if (document.getElementById('inputCurrency')?.value === 'USD') { this.value = v; return; } if (v) this.value = new Intl.NumberFormat('id-ID').format(v); }); } }); }
function cleanRupiah(v) { if (!v) return 0; return parseFloat(v.toString().replace(/\./g, '')); }
function prosesTransaksi() { let i = document.getElementById('pilihAsetTransaksi').value, t = document.getElementById('jenisTransaksi').value, n = cleanRupiah(document.getElementById('nominalTransaksi').value); if (!daftarAset[i] || isNaN(n) || n <= 0) { showToast("Nominal salah!", "error"); return; } if (t === 'masuk') daftarAset[i].nilai += n; else { if (daftarAset[i].nilai < n) { showToast("Saldo tidak cukup!", "error"); return; } daftarAset[i].nilai -= n; if (daftarAset[i].subJenis === 'Emas Batangan' && daftarAset[i].berat > 0 && hargaEmasLive > 0) daftarAset[i].berat -= (n / hargaEmasLive); if (daftarAset[i].url && daftarAset[i].url.includes('bibit') && daftarAset[i].berat > 0 && daftarAset[i].lastPrice > 0) daftarAset[i].berat -= (n / daftarAset[i].lastPrice); if (daftarAset[i].ticker && daftarAset[i].lastPrice > 0) daftarAset[i].lot -= (n / (daftarAset[i].lastPrice * 100)); } simpanDataKeStorage(); tutupModal('modalTransaksi'); updateTampilan(); showToast("Saldo diperbarui", "success"); }
function simpanDataKeStorage() { localStorage.setItem('portfolio_assets_v1', JSON.stringify(daftarAset)); }
function loadDataAset() { const d = localStorage.getItem('portfolio_assets_v1'); if (d) { try { daftarAset = JSON.parse(d); let u = false; daftarAset.forEach(a => { if (!dataKategori[a.kategori]) { a.kategori = 'reksa'; u = true } }); if (u) simpanDataKeStorage(); updateTampilan(); } catch (e) { } } }
function simpanHistoryHarian(t) { const d = getWIBDateString(); let h = JSON.parse(localStorage.getItem('portfolio_history')) || [], i = h.findIndex(x => x.date === d), s = {}; daftarAset.forEach(a => { if (a.nilai > 0) s[a.id] = a.nilai; }); if (i >= 0) { h[i].total = t; h[i].details = s; } else h.push({ date: d, total: t, details: s }); h.sort((a, b) => new Date(a.date) - new Date(b.date)); localStorage.setItem('portfolio_history', JSON.stringify(h)); hitungPerformaGlobal(t, h); if (!document.getElementById('monthPicker').value) renderLineChart(); }
function hitungPerformaGlobal(c, h) { if (h.length < 2) return; const t = getWIBDateString(), i = h.findIndex(x => x.date === t), p = i - 1; if (p >= 0) { let d = c - h[p].total, pc = (d / h[p].total) * 100, cl = d >= 0 ? '#00c853' : '#ff1744', ic = d >= 0 ? '▲' : '▼'; document.getElementById('perf-1d').innerHTML = `Vs Kemarin: <span style="color:${cl};font-weight:bold;">${ic} ${pc.toFixed(2)}%</span>`; } }
function getAssetTrend(id, v) { let h = JSON.parse(localStorage.getItem('portfolio_history')) || [], t = getWIBDateString(), i = h.findIndex(x => x.date === t); if (i <= 0) return 0; const p = h[i - 1]; if (p.details && p.details[id] !== undefined) { let pv = p.details[id]; if (pv === 0) return v > 0 ? 100 : 0; return ((v - pv) / pv) * 100; } return 0; }
function isiDropdownKategori() { let el = document.getElementById('inputKategori'); el.innerHTML = ""; for (let k in dataKategori) { let o = document.createElement('option'); o.value = k; o.innerText = dataKategori[k].label; el.appendChild(o); } }
function updateSubKategori() { let k = document.getElementById('inputKategori').value, el = document.getElementById('inputSubJenis'); el.innerHTML = ""; dataKategori[k].jenis.forEach(j => { let o = document.createElement('option'); o.value = j; o.innerText = j; el.appendChild(o); }); cekModeInput(); }
function isiNamaOtomatis(n, j) { let i = document.getElementById('inputNama'); i.value = j.includes('Bank') ? `Bank ${n}` : n; i.style.borderColor = "#3d5afe"; setTimeout(() => i.style.borderColor = "#444", 300); }
function toggleInputBibit() { let c = document.getElementById('checkAutoBibit').checked, bn = document.getElementById('blokInputNormal'), bb = document.getElementById('blokInputBibitUrl'); if (c) { bn.classList.add('hidden'); bb.classList.remove('hidden'); } else { bn.classList.remove('hidden'); bb.classList.add('hidden'); } }
function updateDropdownAset() { let el = document.getElementById('pilihAsetTransaksi'); el.innerHTML = ""; daftarAset.forEach((a, i) => { if (a.nilai > 0 || (a.ticker && a.lot > 0)) { let o = document.createElement('option'); o.value = i; o.innerText = `${a.nama} (${formatRupiah(a.nilai)})`; el.appendChild(o); } }); }


// ==========================================
// 4. GOOGLE DRIVE ENGINE (SMART SESSION V3)
// ==========================================
let tokenClient;
let gapiInited = false;
let gisInited = false;
let pendingAction = null; // Menyimpan aksi yang tertunda (upload/restore)

// Kunci penyimpanan token
const STORAGE_KEY = 'gdrive_token_v3';

function initGoogleDrive() {
    if (typeof gapi !== 'undefined' && typeof google !== 'undefined') {
        gapi.load('client', async () => {
            await gapi.client.init({ apiKey: G_API_KEY, discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"] });
            gapiInited = true;

            // Cek apakah user sebelumnya sudah login?
            if (localStorage.getItem(STORAGE_KEY)) {
                // Jangan cek expired date dulu, langsung set "Online" agar user senang
                updateUISignedIn();
                console.log("Restored session (UI Only).");
            } else {
                checkAuthStatus(); // UI Offline
            }
        });

        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: G_CLIENT_ID,
            scope: "https://www.googleapis.com/auth/drive.file",
            callback: handleTokenResponse // Callback dipisah agar lebih rapi
        });
        gisInited = true;
    } else {
        setTimeout(initGoogleDrive, 1000);
    }
}

// Callback saat Google memberikan token baru
function handleTokenResponse(resp) {
    if (resp.error) { showToast("Gagal Refresh Token", "error"); pendingAction = null; return; }

    // Simpan Token Baru
    const expiresInSeconds = resp.expires_in || 3599;
    const expireTime = Date.now() + (expiresInSeconds * 1000);

    const tokenData = { access_token: resp.access_token, expires_at: expireTime };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokenData));

    // Set ke GAPI
    gapi.client.setToken({ access_token: resp.access_token });
    updateUISignedIn();

    // JIKA ADA AKSI TERTUNDA, JALANKAN SEKARANG!
    if (pendingAction === 'upload') {
        uploadToDriveActual();
    } else if (pendingAction === 'restore') {
        restoreFromDriveActual();
    }
    pendingAction = null; // Reset
}

function checkAuthStatus() {
    const btn = document.getElementById('gDriveBtn');
    if (gapiInited && gisInited && btn) {
        btn.disabled = false;
        btn.innerHTML = '<span style="font-size:1.1rem;">G</span> Hubungkan Akun';
    }
}

// Tombol Login Manual
function handleGAuth() {
    if (!gisInited) { showToast("Koneksi Google belum siap.", "error"); return; }
    // Minta consent agar user bisa pilih akun
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

function updateUISignedIn() {
    document.getElementById('gDriveBtn').style.display = 'none';
    document.getElementById('gDriveActions').style.display = 'flex';
    document.getElementById('btnLogout').style.display = 'inline-block';

    const status = document.getElementById('syncStatus');
    status.innerText = "Online";
    status.classList.add('status-online');
}

function logoutGoogle() {
    // Hapus semua jejak login
    gapi.client.setToken(null);
    localStorage.removeItem(STORAGE_KEY);

    // Reset UI
    document.getElementById('gDriveBtn').style.display = 'flex';
    document.getElementById('gDriveBtn').innerHTML = '<span style="font-size:1.1rem;">G</span> Hubungkan Akun';
    document.getElementById('gDriveActions').style.display = 'none';
    document.getElementById('btnLogout').style.display = 'none';

    const status = document.getElementById('syncStatus');
    status.innerText = "Offline";
    status.classList.remove('status-online');

    showToast("Berhasil Logout", "info");
}

// --- FUNGSI PINTAR: CEK TOKEN SEBELUM AKSI ---
function executeWithAuth(actionName) {
    const stored = localStorage.getItem(STORAGE_KEY);

    // 1. Jika belum pernah login sama sekali -> Suruh login
    if (!stored) {
        showToast("Silakan login dulu", "info");
        return;
    }

    const tokenData = JSON.parse(stored);
    const now = Date.now();

    // 2. Cek apakah token expired? (Beri buffer 1 menit)
    if (tokenData.expires_at < (now + 60000)) {
        // TOKEN BASI -> MINTA BARU DIAM-DIAM
        console.log("Token expired. Refreshing...");
        showToast("Menyegarkan sesi...", "info");

        pendingAction = actionName; // Ingat apa yang mau dilakukan user

        // PENTING: prompt '' agar tidak minta izin ulang jika session browser masih aktif
        tokenClient.requestAccessToken({ prompt: '' });
    } else {
        // TOKEN AMAN -> LANJUT
        gapi.client.setToken({ access_token: tokenData.access_token });
        if (actionName === 'upload') uploadToDriveActual();
        if (actionName === 'restore') restoreFromDriveActual();
    }
}

// Wrapper untuk Tombol
function uploadToDrive() { executeWithAuth('upload'); }
function restoreFromDrive() { executeWithAuth('restore'); }

// --- LOGIC INTI UPLOAD & RESTORE ---

async function uploadToDriveActual() {
    showToast("Mengupload data...", "info");
    const content = JSON.stringify({
        assets: localStorage.getItem('portfolio_assets_v1'),
        history: localStorage.getItem('portfolio_history'),
        last_synced: new Date().toISOString()
    });

    const fileMetadata = { 'name': G_FILENAME, 'mimeType': 'application/json' };
    const fileBlob = new Blob([content], { type: 'application/json' });

    try {
        const existingId = await findFileId(G_FILENAME);
        if (existingId) {
            await updateFileGoogle(existingId, fileBlob);
            showToast("Backup Diperbarui di Cloud!", "success");
        } else {
            await createFileGoogle(fileMetadata, fileBlob);
            showToast("Backup Baru Dibuat di Cloud!", "success");
        }
    } catch (err) {
        console.error(err);
        // Jika error 401 (Unauthorized), coba paksa login ulang
        if (err.status === 401) {
            showToast("Sesi tidak valid. Login ulang...", "error");
            pendingAction = 'upload';
            tokenClient.requestAccessToken({ prompt: 'select_account' });
        } else {
            showToast("Gagal Upload: " + (err.result?.error?.message || "Error"), "error");
        }
    }
}

async function restoreFromDriveActual() {
    showToast("Mencari backup...", "info");
    try {
        const fileId = await findFileId(G_FILENAME);
        if (!fileId) { showToast("Tidak ada backup ditemukan.", "error"); return; }

        const res = await gapi.client.drive.files.get({ fileId: fileId, alt: 'media' });
        const data = res.result;

        if (confirm(`Backup ditemukan! (Tanggal: ${data.last_synced || '?'}).\nTimpa data lokal?`)) {
            if (data.assets) localStorage.setItem('portfolio_assets_v1', data.assets);
            if (data.history) localStorage.setItem('portfolio_history', data.history);
            showToast("Restore Berhasil! Memuat ulang...", "success");
            setTimeout(() => location.reload(), 1500);
        }
    } catch (err) {
        console.error(err);
        if (err.status === 401) {
            showToast("Sesi tidak valid. Login ulang...", "error");
            pendingAction = 'restore';
            tokenClient.requestAccessToken({ prompt: 'select_account' });
        } else {
            showToast("Gagal Restore", "error");
        }
    }
}

// Helpers API
async function findFileId(name) {
    const res = await gapi.client.drive.files.list({ q: `name = '${name}' and trashed = false`, fields: 'files(id, name)', spaces: 'drive' });
    return (res.result.files && res.result.files.length > 0) ? res.result.files[0].id : null;
}
async function createFileGoogle(meta, blob) {
    const token = gapi.client.getToken().access_token;
    const form = new FormData(); form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' })); form.append('file', blob);
    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: new Headers({ 'Authorization': 'Bearer ' + token }), body: form });
}
async function updateFileGoogle(id, blob) {
    const token = gapi.client.getToken().access_token;
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: new Headers({ 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }), body: blob });
}