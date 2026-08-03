import http.server
import ssl
import os

script_dir = os.path.dirname(os.path.abspath(__file__))
cert_path = os.path.join(script_dir, 'cert.pem')
key_path = os.path.join(script_dir, 'key.pem')

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Serve the app without caching.

    SimpleHTTPRequestHandler sends Last-Modified and nothing else. With no
    Cache-Control and no Expires, browsers fall back to heuristic freshness and
    will happily reuse a script for a while without revalidating it, so an
    edited .js file keeps running as the old one against a freshly loaded
    index.html. That produces confusing half-updated errors rather than an
    obvious failure.
    """

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


server_address = ('0.0.0.0', 4443)
httpd = http.server.HTTPServer(server_address, NoCacheHandler)

# Wrap the socket with SSL
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile=cert_path, keyfile=key_path)
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print(f"Serving HTTPS on {server_address[0]} port {server_address[1]}...")
httpd.serve_forever()
