import http.server
import ssl
import os

script_dir = os.path.dirname(os.path.abspath(__file__))
cert_path = os.path.join(script_dir, 'cert.pem')
key_path = os.path.join(script_dir, 'key.pem')

server_address = ('0.0.0.0', 4443)
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

# Wrap the socket with SSL
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile=cert_path, keyfile=key_path)
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print(f"Serving HTTPS on {server_address[0]} port {server_address[1]}...")
httpd.serve_forever()
