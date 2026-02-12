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
let hargaUSDLive = 16000; // Default aman
let isFetching = false;
let lineChart = null;
let pieChart = null;
let editIndex = -1;
let isPrivacyMode = localStorage.getItem('privacy_mode') === 'true';

// Google Auth Vars
let tokenClient;
let gapiInited = false;
let gisInited = false;
let pendingAction = null;

// PWA Vars
let deferredPrompt;

// Data Master
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
    // A. Load Data Lokal & Render UI (Prioritas User Experience)
    loadDataAset();
    isiDropdownKategori();
    updateSubKategori();
    setupInputMasking();
    updateGoalUI();
    updateRunwayUI();

    // B. Render Grafik
    setTimeout(() => { renderLineChart(); renderPieChart(); renderRebalancingTable(); }, 500);

    // C. JALANKAN FETCH HARGA (PRIORITAS UTAMA)
    console.log("🚀 Memulai engine harga...");
    cekHargaHarian();
    setInterval(cekHargaHarian, 60000); // Cek ulang tiap 60 detik

    // D. Init Google Auth (Hanya untuk persiapan Backup)
    setTimeout(initGoogleDrive, 2000);

    // E. Register Service Worker (Untuk PWA)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then(() => console.log('SW Registered'));
    }
});

function getWIBDateString() {
    return new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
}

// ==========================================
// 2. ENGINE HARGA (THE CORE)
// ==========================================

async function cekHargaHarian() {
    const today = getWIBDateString();

    // 1. Cek Emas (Engine Baru)
    await startGoldEngine(today);

    // 2. Cek Saham
    await fetchAllStockPrices();

    // 3. Cek Bibit
    await fetchAllBibitPrices();
}

// --- ENGINE EMAS (FIXED SCRAPING) ---
async function startGoldEngine(d) {
    if (isFetching) return;
    isFetching = true;
    const l = document.getElementById('livePriceLabel');
    if (l) l.innerText = "⏳..";

    // KITA GUNAKAN PROXY 'ALLORIGINS' YANG LEBIH STABIL DARI CORSPROXY
    const target = 'https://harga-emas.org/';
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(target)}&timestamp=${Date.now()}`;

    try {
        const response = await fetch(proxyUrl);
        const data = await response.json(); // AllOrigins mengembalikan JSON { contents: "<html>..." }
        const html = data.contents;

        if (!html) throw new Error("HTML Kosong");

        // Parsing Manual yang lebih robust
        // Kita cari teks "1 gr" atau angka yang terlihat seperti harga emas (> 1 juta)
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Strategi: Ambil semua elemen tabel, cari yang ada tulisan "1" gram
        const tds = doc.querySelectorAll('td');
        let foundPrice = 0;

        for (let i = 0; i < tds.length; i++) {
            const txt = tds[i].innerText.trim();
            // Jika ketemu sel isinya "1" (gram)
            if (txt === '1' || txt === '1.00') {
                // Cek sel berikutnya (biasanya harga)
                if (tds[i + 1]) {
                    let priceTxt = tds[i + 1].innerText.replace(/\D/g, ''); // Hapus Rp dan titik
                    let p = parseInt(priceTxt);
                    // Validasi: Harga emas pasti di atas 500rb
                    if (p > 500000) {
                        foundPrice = p;
                        break; // Ketemu! Stop looping.
                    }
                }
            }
        }

        if (foundPrice > 0) {
            console.log("✅ Harga Emas Dapat:", foundPrice);
            hargaEmasLive = foundPrice;
            localStorage.setItem('emas_cache_v2', JSON.stringify({ date: d, price: foundPrice }));

            if (l) { l.innerText = formatRupiah(foundPrice); l.style.color = "#00c853"; }
            recalculasiAsetLive(); // Update nilai aset user
        } else {
            throw new Error("Pola HTML berubah");
        }

    } catch (e) {
        console.warn("⚠️ Gagal ambil emas live:", e);
        // FALLBACK: Pakai harga cache terakhir, jangan 0
        const c = JSON.parse(localStorage.getItem('emas_cache_v2'));
        if (c && c.price > 0) {
            hargaEmasLive = c.price;
            if (l) { l.innerText = formatRupiah(c.price) + " (Cached)"; l.style.color = "#ffca28"; }
            recalculasiAsetLive();
        } else {
            if (l) { l.innerText = "Offline"; l.style.color = "#ff1744"; }
        }
    } finally {
        isFetching = false;
    }
}

// --- ENGINE SAHAM (YAHOO FINANCE VIA PROXY) ---
async function fetchAllStockPrices() {
    let adaUpdate = false;
    for (let i = 0; i < daftarAset.length; i++) {
        let aset = daftarAset[i];
        if (aset.kategori === 'saham' && aset.ticker && aset.lot > 0) {
            // Beri jeda sedikit agar tidak dianggap spam
            await new Promise(r => setTimeout(r, 500));
            const success = await fetchStockPrice(i, aset.ticker);
            if (success) adaUpdate = true;
        }
    }
    if (adaUpdate) {
        simpanDataKeStorage();
        updateTampilan();
        triggerAutoBackup();
    }
}

async function fetchStockPrice(index, ticker) {
    let yahooTicker = ticker.toUpperCase();
    if (!yahooTicker.includes('.JK')) yahooTicker = yahooTicker + ".JK";

    // Gunakan CORS Proxy yang berbeda jika satu gagal
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=1d`;
    // Proxy AllOrigins lebih 'sopan' ke browser
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

    try {
        const res = await fetch(proxyUrl);
        const jsonWrapper = await res.json(); // Buka bungkus AllOrigins

        if (!jsonWrapper.contents) throw new Error("No Content");

        // Parse isi JSON dari Yahoo
        const data = JSON.parse(jsonWrapper.contents);
        const result = data.chart.result[0];
        const price = result.meta.regularMarketPrice;

        if (price > 0) {
            console.log(`✅ Saham ${ticker}: ${price}`);
            let aset = daftarAset[index];
            aset.nilai = aset.lot * 100 * price;
            aset.lastPrice = price;
            aset.lastUpdate = getWIBDateString();
            return true;
        }
    } catch (e) {
        console.log(`❌ Gagal saham ${ticker}:`, e.message);
        // JANGAN NOL-KAN HARGA jika gagal fetch. Biarkan harga lama.
    }
    return false;
}

// --- ENGINE BIBIT (REGEX NAV) ---
async function fetchAllBibitPrices() {
    let adaUpdate = false;
    for (let i = 0; i < daftarAset.length; i++) {
        let aset = daftarAset[i];
        if (aset.url && aset.url.includes('bibit.id') && aset.berat > 0) {
            const success = await fetchSingleBibit(i, aset.url);
            if (success) adaUpdate = true;
        }
    }
    if (adaUpdate) {
        simpanDataKeStorage();
        updateTampilan();
        triggerAutoBackup();
    }
}

async function fetchSingleBibit(index, url, isPreview = false) {
    const label = document.getElementById('liveBibitPrice');
    if (isPreview && label) label.innerText = "⏳...";

    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&timestamp=${Date.now()}`;

    try {
        const res = await fetch(proxyUrl);
        const json = await res.json();
        const html = json.contents;

        // Regex yang lebih umum untuk mencari angka setelah kata "NAV" atau "Rp"
        // Mencari pola: "NAV" ... sembarang karakter ... "Rp" ... angka
        const match = html.match(/NAV[\s\S]{1,50}Rp\s*([\d,]+\.?\d*)/i);

        if (match && match[1]) {
            let cleanString = match[1].replace(/[^0-9,.]/g, '').replace(/,/g, '.'); // Pastikan format angka benar
            // Handle format indonesia (titik ribu, koma desimal) vs format luar
            // Asumsi Bibit pakai format: 1.250,55 -> Kita buang titik, ganti koma jadi titik
            // Atau format: 1,250.55

            // Simpel: Buang semua non-angka, lalu bagi sesuai logika reksa dana (biasanya ribuan)
            // Cara paling aman parsing IDR:
            let rawNum = match[1].replace(/\./g, '').replace(/,/g, '.'); // 1.500,25 -> 1500.25
            let foundPrice = parseFloat(rawNum);

            if (foundPrice > 0) {
                if (isPreview && label) {
                    label.innerText = formatRupiah(foundPrice);
                    label.style.color = "#00c853";
                    return;
                }

                let aset = daftarAset[index];
                aset.nilai = aset.berat * foundPrice;
                aset.lastPrice = foundPrice;
                aset.lastUpdate = getWIBDateString();
                return true;
            }
        }
    } catch (e) {
        console.log("Gagal Bibit:", e);
        if (isPreview && label) { label.innerText = "Gagal"; label.style.color = "#ff1744"; }
    }
    return false;
}

function recalculasiAsetLive() {
    let change = false;
    daftarAset.forEach(a => {
        if (a.subJenis === 'Emas Batangan' && a.berat > 0 && hargaEmasLive > 0) {
            a.nilai = a.berat * hargaEmasLive;
            change = true;
        }
    });
    if (change) {
        simpanDataKeStorage();
        updateTampilan();
        triggerAutoBackup();
    }
}

// ==========================================
// 3. UI & LOGIC INPUT
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

    // Reset inputs
    document.getElementById('inputBeratEmas').value = '';
    document.getElementById('inputTicker').value = '';
    document.getElementById('inputLot').value = '';
    document.getElementById('inputNilai').value = '';

    if (aset.subJenis === 'Emas Batangan') {
        document.getElementById('inputBeratEmas').value = aset.berat;
    }
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
    else {
        document.getElementById('inputNilai').value = new Intl.NumberFormat('id-ID').format(aset.nilai);
    }

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
        if (hargaEmasLive > 0) {
            nilaiInput = beratInput * hargaEmasLive;
        } else {
            // Jika harga belum ke-load, pakai 0 dulu, nanti engine update
            nilaiInput = 0;
        }
    }
    else if (kat === 'saham') {
        tickerInput = document.getElementById('inputTicker').value.toUpperCase().trim();
        beratInput = parseFloat(document.getElementById('inputLot').value);
        if (!tickerInput || beratInput <= 0) { showToast("Isi Kode & Lot!", "error"); return; }

        // Coba pakai harga terakhir yang tersimpan di memori aset jika edit
        if (editIndex >= 0 && daftarAset[editIndex].lastPrice) {
            nilaiInput = beratInput * 100 * daftarAset[editIndex].lastPrice;
        } else {
            nilaiInput = 0;
        }
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

    // Construct Object
    let newData = {
        id: (editIndex >= 0) ? daftarAset[editIndex].id : Date.now(),
        nama, kategori: kat, subJenis, nilai: nilaiInput, berat: beratInput,
        url: customUrl, ticker: tickerInput,
        lot: (kat === 'saham') ? beratInput : 0,
        lastPrice: (editIndex >= 0) ? daftarAset[editIndex].lastPrice : 0,
        lastUpdate: (editIndex >= 0) ? daftarAset[editIndex].lastUpdate : getWIBDateString()
    };

    if (editIndex >= 0) {
        daftarAset[editIndex] = newData;
        showToast("Diperbarui!", "success");
    } else {
        daftarAset.push(newData);
        showToast("Aset ditambahkan", "success");
    }

    simpanDataKeStorage();
    resetForm();
    tutupModal('modalTambah');
    updateTampilan();

    triggerAutoBackup();

    // Trigger fetch khusus untuk aset baru ini
    if (customUrl) fetchSingleBibit(editIndex >= 0 ? editIndex : daftarAset.length - 1, customUrl);
    if (tickerInput) fetchStockPrice(editIndex >= 0 ? editIndex : daftarAset.length - 1, tickerInput);
    if (subJenis === 'Emas Batangan') startGoldEngine(getWIBDateString());
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
// 4. HELPER UI & LOGIC
// ==========================================
function bukaModal(id) { document.getElementById(id).style.display = 'flex'; if (id === 'modalTransaksi') updateDropdownAset(); }
function tutupModal(id) { document.getElementById(id).style.display = 'none'; }

function hapusAset(index) {
    if (confirm(`Hapus "${daftarAset[index].nama}"?`)) {
        daftarAset.splice(index, 1);
        simpanDataKeStorage();
        updateTampilan();
        showToast("Aset dihapus", "info");
        triggerAutoBackup();
    }
}

function showToast(message, type = 'success') { const container = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.innerHTML = `<span>${message}</span>`; container.appendChild(toast); setTimeout(() => { toast.style.animation = 'fadeOut 0.3s ease-out forwards'; toast.addEventListener('animationend', () => toast.remove()); }, 3000); }

function updateTampilan() {
    daftarAset.sort((a, b) => a.nama.localeCompare(b.nama));
    let grandTotal = daftarAset.reduce((s, i) => s + (i.nilai > 0 ? i.nilai : 0), 0);
    document.getElementById('grandTotalDisplay').innerText = formatRupiah(grandTotal);

    // Simpan history
    simpanHistoryHarian(grandTotal);

    updateGoalUI(); updateRunwayUI(); renderRebalancingTable(); renderPieChart();

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

        // Show last updated price info if available
        let priceInfo = "";
        if (a.lastPrice && a.lastPrice > 0) {
            priceInfo = `<br><small style="color:#666; font-size:0.65rem;">Harga: ${new Intl.NumberFormat('id-ID').format(a.lastPrice)}</small>`;
        }

        mastH += `<tr style="${style}"><td><b>${a.nama}</b><br><small>${det}</small>${priceInfo}</td><td><small>${kl}</small></td><td><b>${formatRupiah(a.nilai)}</b></td><td>${grandTotal > 0 ? ((a.nilai / grandTotal) * 100).toFixed(1) : 0}%</td><td>${vis.badge}</td><td>${vis.nominal}</td><td class="action-cell"><button class="btn-mini-action btn-edit" onclick="siapkanEditAset(${i})">✏️</button><button class="btn-mini-action btn-delete" onclick="hapusAset(${i})">🗑️</button></td></tr>`;
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

function prosesTransaksi() {
    let i = document.getElementById('pilihAsetTransaksi').value, t = document.getElementById('jenisTransaksi').value, n = cleanRupiah(document.getElementById('nominalTransaksi').value);
    if (!daftarAset[i] || isNaN(n) || n <= 0) { showToast("Nominal salah!", "error"); return; }
    if (t === 'masuk') daftarAset[i].nilai += n;
    else {
        if (daftarAset[i].nilai < n) { showToast("Saldo tidak cukup!", "error"); return; }
        daftarAset[i].nilai -= n;
        if (daftarAset[i].subJenis === 'Emas Batangan' && daftarAset[i].berat > 0 && hargaEmasLive > 0) daftarAset[i].berat -= (n / hargaEmasLive);
        if (daftarAset[i].url && daftarAset[i].url.includes('bibit') && daftarAset[i].berat > 0 && daftarAset[i].lastPrice > 0) daftarAset[i].berat -= (n / daftarAset[i].lastPrice);
        if (daftarAset[i].ticker && daftarAset[i].lastPrice > 0) daftarAset[i].lot -= (n / (daftarAset[i].lastPrice * 100));
    }
    simpanDataKeStorage();
    tutupModal('modalTransaksi');
    updateTampilan();
    showToast("Saldo diperbarui", "success");
    triggerAutoBackup();
}

// STORAGE
function simpanDataKeStorage() {
    localStorage.setItem('portfolio_assets_v1', JSON.stringify(daftarAset));
    localStorage.setItem('local_last_updated', new Date().toISOString());
}

function loadDataAset() {
    const d = localStorage.getItem('portfolio_assets_v1');
    if (d) {
        try {
            daftarAset = JSON.parse(d);
            // Migrasi data lama jika format kategori salah
            let u = false;
            daftarAset.forEach(a => { if (!dataKategori[a.kategori]) { a.kategori = 'reksa'; u = true } });
            if (u) simpanDataKeStorage();
            updateTampilan();
        } catch (e) { console.error("Data korup", e); }
    }
}

function simpanHistoryHarian(t) { const d = getWIBDateString(); let h = JSON.parse(localStorage.getItem('portfolio_history')) || [], i = h.findIndex(x => x.date === d), s = {}; daftarAset.forEach(a => { if (a.nilai > 0) s[a.id] = a.nilai; }); if (i >= 0) { h[i].total = t; h[i].details = s; } else h.push({ date: d, total: t, details: s }); h.sort((a, b) => new Date(a.date) - new Date(b.date)); localStorage.setItem('portfolio_history', JSON.stringify(h)); hitungPerformaGlobal(t, h); if (!document.getElementById('monthPicker').value) renderLineChart(); }
function hitungPerformaGlobal(c, h) { if (h.length < 2) return; const t = getWIBDateString(), i = h.findIndex(x => x.date === t), p = i - 1; if (p >= 0) { let d = c - h[p].total, pc = (d / h[p].total) * 100, cl = d >= 0 ? '#00c853' : '#ff1744', ic = d >= 0 ? '▲' : '▼'; document.getElementById('perf-1d').innerHTML = `Vs Kemarin: <span style="color:${cl};font-weight:bold;">${ic} ${pc.toFixed(2)}%</span>`; } }
function getAssetTrend(id, v) { let h = JSON.parse(localStorage.getItem('portfolio_history')) || [], t = getWIBDateString(), i = h.findIndex(x => x.date === t); if (i <= 0) return 0; const p = h[i - 1]; if (p.details && p.details[id] !== undefined) { let pv = p.details[id]; if (pv === 0) return v > 0 ? 100 : 0; return ((v - pv) / pv) * 100; } return 0; }
function isiDropdownKategori() { let el = document.getElementById('inputKategori'); el.innerHTML = ""; for (let k in dataKategori) { let o = document.createElement('option'); o.value = k; o.innerText = dataKategori[k].label; el.appendChild(o); } }
function updateSubKategori() { let k = document.getElementById('inputKategori').value, el = document.getElementById('inputSubJenis'); el.innerHTML = ""; dataKategori[k].jenis.forEach(j => { let o = document.createElement('option'); o.value = j; o.innerText = j; el.appendChild(o); }); cekModeInput(); }
function isiNamaOtomatis(n, j) { let i = document.getElementById('inputNama'); i.value = j.includes('Bank') ? `Bank ${n}` : n; i.style.borderColor = "#3d5afe"; setTimeout(() => i.style.borderColor = "#444", 300); }
function toggleInputBibit() { let c = document.getElementById('checkAutoBibit').checked, bn = document.getElementById('blokInputNormal'), bb = document.getElementById('blokInputBibitUrl'); if (c) { bn.classList.add('hidden'); bb.classList.remove('hidden'); } else { bn.classList.remove('hidden'); bb.classList.add('hidden'); } }
function updateDropdownAset() { let el = document.getElementById('pilihAsetTransaksi'); el.innerHTML = ""; daftarAset.forEach((a, i) => { if (a.nilai > 0 || (a.ticker && a.lot > 0)) { let o = document.createElement('option'); o.value = i; o.innerText = `${a.nama} (${formatRupiah(a.nilai)})`; el.appendChild(o); } }); }


// ==========================================
// 5. GOOGLE DRIVE ENGINE (BACKUP ONLY)
// ==========================================
function initGoogleDrive() {
    if (typeof gapi !== 'undefined' && typeof google !== 'undefined') {
        gapi.load('client', async () => {
            await gapi.client.init({ apiKey: G_API_KEY, discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"] });
            gapiInited = true;

            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const tokenData = JSON.parse(stored);
                if (tokenData.expires_at > Date.now()) {
                    updateUISignedIn();
                    // Jika data lokal kosong, baru tawarkan restore
                    if (daftarAset.length === 0) performSmartRestore();
                } else {
                    localStorage.removeItem(STORAGE_KEY);
                    checkAuthStatus();
                }
            } else {
                checkAuthStatus();
            }
        });

        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: G_CLIENT_ID,
            scope: "https://www.googleapis.com/auth/drive.file",
            callback: handleTokenResponse
        });
        gisInited = true;
    } else {
        setTimeout(initGoogleDrive, 1000);
    }
}

function handleTokenResponse(resp) {
    if (resp.error) { showToast("Gagal Login", "error"); return; }
    const tokenData = { access_token: resp.access_token, expires_at: Date.now() + ((resp.expires_in || 3599) * 1000) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokenData));
    gapi.client.setToken({ access_token: resp.access_token });
    updateUISignedIn();

    // BACKUP LOGIC:
    if (pendingAction === 'upload') uploadToDriveActual(true);
    else if (pendingAction === 'restore') restoreFromDriveActual(false);
    else {
        // Default: Backup data lokal ke cloud jika ada data
        if (daftarAset.length > 0) uploadToDriveActual(true);
        else restoreFromDriveActual(false);
    }
    pendingAction = null;
}

function checkAuthStatus() {
    const btn = document.getElementById('gDriveBtn');
    if (gapiInited && gisInited && btn) {
        btn.disabled = false;
        btn.innerHTML = '<span style="font-size:1.1rem;">G</span> Hubungkan Akun';
    }
}

function handleGAuth() {
    if (!gisInited) { showToast("Koneksi belum siap.", "error"); return; }
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

function updateUISignedIn() {
    document.getElementById('gDriveBtn').style.display = 'none';
    document.getElementById('btnLogout').style.display = 'block';
    const status = document.getElementById('syncStatus');
    status.innerText = "ONLINE";
    status.classList.add('status-active');
}

function logoutGoogle() {
    gapi.client.setToken(null);
    localStorage.removeItem(STORAGE_KEY);
    document.getElementById('gDriveBtn').style.display = 'flex';
    document.getElementById('gDriveBtn').innerHTML = '<span style="font-size:1.1rem;">G</span> Hubungkan Akun';
    document.getElementById('btnLogout').style.display = 'none';
    const status = document.getElementById('syncStatus');
    status.innerText = "OFFLINE";
    status.classList.remove('status-active');
    showToast("Logout Berhasil", "info");
}

function triggerAutoBackup() {
    if (localStorage.getItem(STORAGE_KEY)) {
        uploadToDrive(true);
    }
}

async function performSmartRestore() {
    executeWithAuth('restore', true);
}

function executeWithAuth(actionName, isSilent = false) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    const tokenData = JSON.parse(stored);
    if (tokenData.expires_at < (Date.now() + 60000)) {
        if (!isSilent) showToast("Menyegarkan sesi...", "info");
        pendingAction = actionName;
        tokenClient.requestAccessToken({ prompt: '' });
    } else {
        gapi.client.setToken({ access_token: tokenData.access_token });
        if (actionName === 'upload') uploadToDriveActual(isSilent);
        if (actionName === 'restore') restoreFromDriveActual(isSilent);
    }
}

function uploadToDrive(silent = false) { executeWithAuth('upload', silent); }
function restoreFromDrive(silent = false) { executeWithAuth('restore', silent); }

async function uploadToDriveActual(silent) {
    if (!silent) showToast("Membackup data...", "info");
    const syncTime = new Date().toISOString();
    const content = JSON.stringify({
        assets: localStorage.getItem('portfolio_assets_v1'),
        history: localStorage.getItem('portfolio_history'),
        last_synced: syncTime
    });
    const fileMetadata = { 'name': G_FILENAME, 'mimeType': 'application/json' };
    const fileBlob = new Blob([content], { type: 'application/json' });
    try {
        const existingId = await findFileId(G_FILENAME);
        if (existingId) { await updateFileGoogle(existingId, fileBlob); }
        else { await createFileGoogle(fileMetadata, fileBlob); }
        if (!silent) showToast("Backup Berhasil!", "success");
        else {
            const stat = document.getElementById('syncStatus');
            if (stat) {
                stat.innerText = "TERSIMPAN";
                setTimeout(() => { stat.innerText = "ONLINE"; }, 3000);
            }
        }
    } catch (err) {
        if (err.status === 401) { pendingAction = 'upload'; tokenClient.requestAccessToken({ prompt: '' }); }
    }
}

async function restoreFromDriveActual(silent) {
    if (!silent) showToast("Mencari backup...", "info");
    try {
        const fileId = await findFileId(G_FILENAME);
        if (!fileId) { if (!silent) showToast("Tidak ada backup.", "error"); return; }
        const res = await gapi.client.drive.files.get({ fileId: fileId, alt: 'media' });
        const data = res.result;
        localStorage.setItem('portfolio_assets_v1', data.assets);
        localStorage.setItem('portfolio_history', data.history);
        if (!silent) showToast("Restore Berhasil!", "success");
        setTimeout(() => location.reload(), 500);
    } catch (err) {
        if (err.status === 401) { pendingAction = 'restore'; tokenClient.requestAccessToken({ prompt: '' }); }
    }
}

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

// ==========================================
// 6. PWA INSTALL LOGIC
// ==========================================
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'flex';
});

async function installPWA() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('pwa-install-banner').style.display = 'none';
}

function closeInstallBanner() {
    document.getElementById('pwa-install-banner').style.display = 'none';
}

/* ======================================================
   PATCH v2: FIX DAILY TREND (PRESERVE EXISTING HISTORY)
   ====================================================== */
(function () {
    const TREND_LOCK_KEY = 'trend_saved_today_lock';

    function getTodayWIB() {
        return new Date().toLocaleDateString('id-ID', {
            timeZone: 'Asia/Jakarta',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).split('/').reverse().join('-');
    }

    const _origUpdate = window.updateTampilan;
    if (typeof _origUpdate === 'function') {
        window.updateTampilan = function () {
            _origUpdate.apply(this, arguments);
            try {
                const today = getTodayWIB();
                const lock = localStorage.getItem(TREND_LOCK_KEY);
                if (lock === today) return;

                const total = (window.daftarAset || []).reduce(
                    (s, a) => s + (a.nilai > 0 ? a.nilai : 0), 0
                );

                if (typeof window.simpanHistoryHarian === 'function') {
                    window.simpanHistoryHarian(total);
                    localStorage.setItem(TREND_LOCK_KEY, today);
                }
            } catch (e) { }
        };
    }

    const _origBackup = window.triggerAutoBackup;
    window.triggerAutoBackup = function () {
        try {
            const raw = localStorage.getItem('gdrive_token_v3');
            if (!raw) return;
            const t = JSON.parse(raw);
            if (t.expires_at && t.expires_at > Date.now()) {
                _origBackup && _origBackup.apply(this, arguments);
            }
        } catch (e) { }
    };
})();
