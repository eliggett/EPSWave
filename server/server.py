"""A small HTTPS server for developing against, from the current directory.

Not for production. It exists because Web MIDI needs a secure context and
because Chrome is friendlier about self-signed certificates than Firefox is.

WHY THIS IS NOT THREE LINES OF http.server
------------------------------------------

It was, and it dropped requests. The page would load with no stylesheet
perhaps one time in three: the browser console said
`epswave.css  net::ERR_TOO_MANY_RETRIES`, and the server log showed no request
for that file at all — not a 404, nothing. A shift-reload usually fixed it,
which made it look like a caching problem, and it is not.

Three defaults in http.server combine to cause it, and all three have to go.

1.  HTTPServer is single threaded. It accepts one connection, serves it to
    completion, and only then accepts the next. Reading a 170 KB script off
    disk and pushing it through TLS is long enough for several other
    connections to pile up behind it.

2.  The default protocol_version is HTTP/1.0, which has no keep-alive, so the
    browser needs a separate TCP connection and a separate TLS handshake for
    every single file. This page pulls about twenty. Twenty connections
    through a server that handles one at a time.

3.  request_queue_size is 5. That is the listen backlog: the number of
    connections the kernel will hold while the server is busy. Chrome opens up
    to six per host and this page needs far more than six sequentially, so the
    queue overflows, and an overflowed connection is dropped by the kernel
    before the server ever sees it. The browser retries with backoff, gives up
    after a few attempts, and reports ERR_TOO_MANY_RETRIES against whichever
    file lost the race — usually a different one each time.

That last one is why nothing appears in the log. The request was never
accepted, so there was nothing to log, which is exactly what makes this
confusing to diagnose from the server side.

It is a race, so it is worse on a slower link, worse over wifi, worse the more
files the page has, and it comes and goes as timing shifts. Shift-reload
happens to serialise things enough to usually work, which is a coincidence
rather than a fix.
"""

import http.server
import os
import socketserver
import ssl
import sys

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

    # Keep-alive, so the browser fetches the whole page over a handful of
    # connections instead of opening a fresh one, and a fresh TLS handshake,
    # for every file. SimpleHTTPRequestHandler sends a Content-Length on every
    # response it produces — files, directory listings and errors alike — which
    # is what makes persistent connections safe to turn on here.
    protocol_version = 'HTTP/1.1'

    # An idle kept-alive connection holds its thread until the browser closes
    # it or this expires. Without it, a few reloads leave threads parked on
    # sockets nobody is going to speak on again.
    timeout = 30

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def handle_one_request(self):
        # A browser that closes a kept-alive connection, or abandons a request
        # mid-flight, is normal and not worth a traceback. Anything else is
        # still allowed through to the default handler below.
        try:
            super().handle_one_request()
        except (ConnectionResetError, BrokenPipeError, TimeoutError):
            self.close_connection = True

    def log_error(self, fmt, *args):
        # The base class routes 404s through here as well as real faults; keep
        # them, but without the alarming formatting.
        self.log_message(fmt, *args)


class Server(socketserver.ThreadingTCPServer):
    """Threaded, with a listen queue deep enough for a real browser."""

    daemon_threads = True
    allow_reuse_address = True
    # Well past the six connections a browser will open, so a burst of requests
    # waits rather than being dropped. This is the setting whose default of 5
    # caused the missing stylesheet.
    request_queue_size = 64

    def handle_error(self, request, client_address):
        # TLS handshakes fail routinely and harmlessly: the browser probing the
        # certificate, a tab closing mid-connection, anything on the network
        # that opens a socket and thinks better of it. The default prints a
        # full traceback for each, which buries the request log that is the
        # reason for watching this window at all.
        kind = sys.exc_info()[0]
        if issubclass(kind, (ssl.SSLError, ConnectionResetError, BrokenPipeError,
                             TimeoutError)):
            return
        super().handle_error(request, client_address)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4443
    address = ('0.0.0.0', port)

    if not (os.path.exists(cert_path) and os.path.exists(key_path)):
        sys.exit(f"No certificate found. Run {os.path.join(script_dir, 'gen_keys.sh')} first.")

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=cert_path, keyfile=key_path)

    httpd = Server(address, NoCacheHandler)
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

    print(f"Serving {os.getcwd()}")
    print(f"HTTPS on port {port} — https://localhost:{port}/ or the LAN address of this machine")
    print("Ctrl-C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == '__main__':
    main()
