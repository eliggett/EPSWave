# Vendored libraries

Local copies of the third party code the pages load. `index.html` and
`librarian.html` reference these by relative path; nothing here is edited by
hand.

They used to be loaded from CDNs on every page view. The app drives a sampler
over MIDI and is usually served by `server/server.py` on a LAN, so the machine
running it is frequently not on the internet — and offline the CDN version came
up unstyled, with no icons and with broken dialogs. Local copies also mean a
page load never depends on a third party staying up.

| File | Library | Version | License |
| --- | --- | --- | --- |
| `fontawesome-all.min.js` | [Font Awesome Free](https://fontawesome.com) (SVG+JS build) | 6.3.0 | Icons [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), code MIT |
| `bootstrap.min.css`, `bootstrap.min.js` | [Bootstrap](https://getbootstrap.com) | 4.2.1 | MIT |
| `jquery.slim.min.js` | [jQuery](https://jquery.com) (slim build) | 3.3.1 | MIT |
| `popper.min.js` | [Popper.js](https://popper.js.org) | 1.14.6 | MIT |

## Updating

    ./vendor/update-vendor.sh            download and check every file
    ./vendor/update-vendor.sh --rehash   print current hashes, install nothing

Both modes take names to work on a subset, so `./vendor/update-vendor.sh
bootstrap` does just the two Bootstrap files.

The script checks each download against the hash recorded in its table and
discards anything that does not match rather than installing it. Be clear on
what that is worth: the hash and the file come from the same publisher, so it
pins bytes and catches corrupted downloads, captive portals and a CDN quietly
re-publishing a version — it is not a defence against a compromised CDN, which
is a job only browser SRI does, and for a different reason. The comment at the
top of the script explains the distinction.

To move to a newer release, edit that library's line in the table at the top of
the script — filename, hash, URL — and run it again. It will fail the hash
check, which is the point; `--rehash` then shows you what is being served and
where to look the value up, and you paste it in yourself.
