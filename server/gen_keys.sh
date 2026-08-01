#!/bin/bash

echo "This script generates self-signed keys."
echo "Not good for a server on the internet,"
echo "but just fine on your own LAN."

openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem
