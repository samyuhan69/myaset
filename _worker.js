export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Jika request mengarah ke API buatan kita
        if (url.pathname === '/api/proxy') {
            const targetUrl = url.searchParams.get('url');
            if (!targetUrl) return new Response('URL target kosong', { status: 400 });

            try {
                // Menyamar sebagai Browser sungguhan agar tidak diblokir Cloudflare Anti-Bot server target
                const response = await fetch(targetUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
                    }
                });

                // Teruskan data mentah dari server target ke web kamu
                const body = await response.arrayBuffer();
                return new Response(body, {
                    status: response.status,
                    headers: {
                        "Content-Type": response.headers.get("Content-Type") || "text/plain"
                    }
                });
            } catch (e) {
                return new Response('Error: ' + e.message, { status: 500 });
            }
        }

        // Jika bukan request API, biarkan Cloudflare Pages menampilkan index.html, CSS, dan JS kamu
        return env.ASSETS.fetch(request);
    }
};
