export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Jika request mengarah ke API buatan kita
        if (url.pathname === '/api/proxy') {
            const targetUrl = url.searchParams.get('url');
            if (!targetUrl) return new Response('URL target kosong', { status: 400 });

            try {
                // Header penyamaran tingkat tinggi (Mirip Chrome terbaru)
                const fetchHeaders = new Headers({
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
                    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                    "Sec-Ch-Ua-Mobile": "?0",
                    "Sec-Ch-Ua-Platform": '"Windows"',
                    "Sec-Fetch-Dest": "document",
                    "Sec-Fetch-Mode": "navigate",
                    "Sec-Fetch-Site": "none",
                    "Sec-Fetch-User": "?1",
                    "Upgrade-Insecure-Requests": "1"
                });

                // Khusus untuk Yahoo Finance, coba hindari cookie/cache
                if (targetUrl.includes('yahoo.com')) {
                    fetchHeaders.set('Cache-Control', 'no-cache');
                }

                const response = await fetch(targetUrl, {
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

        // Jika bukan request API, biarkan Cloudflare Pages menampilkan aset
        return env.ASSETS.fetch(request);
    }
};
