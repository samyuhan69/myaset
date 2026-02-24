export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Jika request mengarah ke API proxy buatan kita
        if (url.pathname === '/api/proxy') {
            const targetUrlStr = url.searchParams.get('url');
            if (!targetUrlStr) return new Response('URL target kosong', { status: 400 });

            try {
                // Parsing target URL
                const targetUrl = new URL(targetUrlStr);

                // --- 🛡️ FITUR KEAMANAN: WHITELIST DOMAIN ---
                // Hanya izinkan domain-domain di bawah ini yang bisa dilewati proxy
                const allowedDomains = [
                    'www.logammulia.com',
                    'finance.yahoo.com',
                    'query1.finance.yahoo.com',
                    'www.google.com'
                ];

                // Khusus bibit, kita izinkan semua subdomain yang berakhiran bibit.id
                const isBibit = targetUrl.hostname.endsWith('bibit.id');
                const isAllowed = allowedDomains.includes(targetUrl.hostname) || isBibit;

                // Jika domain tidak ada di daftar, TOLAK aksesnya!
                if (!isAllowed) {
                    return new Response('Akses Ditolak: Domain tidak diizinkan oleh AsetKu', { status: 403 });
                }
                // ------------------------------------------

                // Header penyamaran tingkat tinggi
                const fetchHeaders = new Headers({
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
                    "Upgrade-Insecure-Requests": "1"
                });

                // Khusus untuk Yahoo Finance, coba hindari cookie/cache
                if (targetUrl.hostname.includes('yahoo.com')) {
                    fetchHeaders.set('Cache-Control', 'no-cache');
                }

                const response = await fetch(targetUrl.toString(), {
                    method: 'GET',
                    headers: fetchHeaders,
                    redirect: 'follow'
                });

                // Teruskan data
                const body = await response.arrayBuffer();
                return new Response(body, {
                    status: response.status,
                    headers: {
                        "Content-Type": response.headers.get("Content-Type") || "text/plain",
                        // Tambahkan header CORS agar aman diakses dari frontend-mu
                        "Access-Control-Allow-Origin": "*"
                    }
                });
            } catch (e) {
                return new Response('Error: ' + e.message, { status: 500 });
            }
        }

        // Jika bukan request API, biarkan Cloudflare Pages menampilkan aset web
        return env.ASSETS.fetch(request);
    }
};
