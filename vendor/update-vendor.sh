#!/bin/bash
#
# Downloads the third party libraries the pages depend on into this directory.
#
# EPSWave used to pull these five files from public CDNs on every page load.
# That is fine on a machine with a working internet connection and useless on
# one without: the app talks to a sampler over MIDI and is served by
# server/server.py on the local network, so the computer running it is quite
# often not online at all. Offline, the CDN version came up unstyled, with no
# icons and with broken dialogs. Local copies fix that, and they also mean the
# app cannot break because someone else's CDN had a bad day.
#
#     ./vendor/update-vendor.sh            download and check every file
#     ./vendor/update-vendor.sh --rehash   print current hashes, install nothing
#
# Run it from anywhere; it works on its own directory.
#
#
# WHAT THE HASH CHECK IS AND IS NOT
#
# Each file is checked against the hash recorded in the table below, and a file
# that does not match is discarded rather than installed. That is a check that
# the bytes are the ones pinned here. It is NOT a defence against a hostile or
# compromised CDN, and it should not be mistaken for one.
#
# In a browser the same hashes do mean that, because of an asymmetry that does
# not survive being moved into a shell script: an integrity= attribute is an
# assertion your own origin makes about a third party's origin, and whoever
# controls cdnjs does not control the HTML you serve. Here, the hash and the
# file come from the same publisher, and the hash below was copied from that
# publisher's own copy-and-paste box. Anyone in a position to serve a bad file
# is in a position to serve the hash that matches it.
#
# What the check genuinely catches, all of which are likelier than the above:
#
#   - a captive portal or proxy answering with a login page, which curl -f
#     does not catch because it is a perfectly successful 200 response
#   - a truncated or corrupted download, or a bad mirror
#   - a CDN quietly re-publishing different bytes under the same version
#   - a mistyped URL that happens to resolve to something
#
# If you ever want it to mean more than that, the npm registry is a better
# anchor than a CDN: all four libraries publish these exact bytes there, and
# npm signs the integrity string with a key you can check independently.
#
#
# UPDATING TO A NEWER RELEASE
#
# Edit the library's line in the table below — filename, then hash, then URL —
# and run the script again.
#
# --rehash exists for the awkward part of that. The new version needs a new
# hash, and the obvious way to get one is to let the script tell you what it
# just downloaded, which verifies nothing whatsoever. So --rehash will not
# write the table for you and will not install anything: it downloads, prints
# what it got, and leaves you to paste the value in yourself once you are
# satisfied it matches what the publisher documents. The small friction is the
# point. Blanking a hash out to make a failing update go through turns this
# script into plain curl, so if you are going to do that, at least do it
# knowingly.
#
# Where to look up a hash rather than taking the one --rehash just printed.
# The first two are the same organisations that serve the files, so they are a
# second look rather than a second opinion; npm is the closest thing here to an
# independent source, since it signs what it publishes, but it hashes the whole
# package tarball rather than the one file:
#
#   cdnjs     https://api.cdnjs.com/libraries/<library>/<version>?fields=sri
#             sha512, formatted ready to paste into the table below
#   jsDelivr  https://data.jsdelivr.com/v1/packages/npm/<pkg>@<version>?structure=flat
#             sha256, so compare it against the file rather than the table:
#             openssl dgst -sha256 -binary FILE | openssl base64 -A
#   npm       npm view <pkg>@<version> dist.integrity

set -uo pipefail

cd "$(dirname "$0")" || exit 1

# filename | integrity | url
#
# Font Awesome is the SVG+JS build, which carries the icon artwork inside the
# script and so needs nothing else. It is far and away the largest file here,
# about 1.3 MB to draw the 45 icons the app actually uses; subsetting it is a
# worthwhile cleanup one day, but it needs a build step this project does not
# have yet, so for now it is shipped whole.
#
# Popper is only strictly needed for Bootstrap's dropdowns, tooltips and
# popovers, none of which the app uses — it uses modals and tabs. It is 20 KB,
# it is what Bootstrap's own documentation pairs with this release, and leaving
# it in place means a dropdown added later just works. Kept deliberately.
DEPS=(
    "fontawesome-all.min.js|sha512-2bMhOkE/ACz21dJT8zBOMgMecNxx0d37NND803ExktKiKdSzdwn+L7i9fdccw/3V06gM/DBWKbYmQvKMdAA9Nw==|https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.3.0/js/all.min.js"
    "bootstrap.min.css|sha384-GJzZqFGwb1QTTN6wy59ffF1BuGJpLSa9DkKMp0DgiMDm4iYMj70gZWKYbI706tWS|https://cdn.jsdelivr.net/npm/bootstrap@4.2.1/dist/css/bootstrap.min.css"
    "bootstrap.min.js|sha384-B0UglyR+jN6CkvvICOB2joaf5I4l3gm9GU6Hc1og6Ls7i6U/mkkaduKaBhlAXv9k|https://cdn.jsdelivr.net/npm/bootstrap@4.2.1/dist/js/bootstrap.min.js"
    "jquery.slim.min.js|sha384-q8i/X+965DzO0rT7abK41JStQIAqVgRVzpbzo5smXKp4YfRvH+8abtTE1Pi6jizo|https://code.jquery.com/jquery-3.3.1.slim.min.js"
    "popper.min.js|sha384-wHAiFfRlMFy6i5SRaxvfOCifBUQy1xHdJ/yoi7FRNXMRBu5WHdZYu1hA6ZOblgut|https://cdn.jsdelivr.net/npm/popper.js@1.14.6/dist/umd/popper.min.js"
)

rehash=0
filters=()

while [ $# -gt 0 ]; do
    case "$1" in
        --rehash)
            rehash=1
            ;;
        -h|--help)
            # The comment block at the top of this file is the real
            # documentation; this is just the shape of the command.
            echo "usage: update-vendor.sh [--rehash] [name ...]"
            echo
            echo "  (no arguments)  download every file and check it against the"
            echo "                  hash recorded in the table in this script"
            echo "  --rehash        download and print the hash actually served,"
            echo "                  installing nothing and changing nothing"
            echo "  name ...        limit either mode to files whose name contains"
            echo "                  one of these, eg. bootstrap, jquery"
            exit 0
            ;;
        -*)
            echo "unknown option: $1" >&2
            echo "usage: update-vendor.sh [--rehash] [name ...]" >&2
            exit 2
            ;;
        *)
            filters+=("$1")
            ;;
    esac
    shift
done

# A name given on the command line matches any file it is a substring of, so
# "bootstrap" picks up both the CSS and the JS and "jquery" picks up the one.
selected=()
for dep in "${DEPS[@]}"; do
    if [ ${#filters[@]} -eq 0 ]; then
        selected+=("$dep")
        continue
    fi
    for filter in "${filters[@]}"; do
        if [[ "${dep%%|*}" == *"$filter"* ]]; then
            selected+=("$dep")
            break
        fi
    done
done

if [ ${#selected[@]} -eq 0 ]; then
    echo "Nothing matched: ${filters[*]}" >&2
    echo "Known files:" >&2
    for dep in "${DEPS[@]}"; do echo "    ${dep%%|*}" >&2; done
    exit 2
fi

# Downloads land here first and are only moved into place once the hash checks
# out, so a failed run leaves the previous working copies untouched. In
# --rehash mode nothing ever leaves this directory.
work="$(mktemp -d)" || exit 1
trap 'rm -rf "$work"' EXIT

failed=0

for dep in "${selected[@]}"; do
    name="${dep%%|*}"
    rest="${dep#*|}"
    integrity="${rest%%|*}"
    url="${rest#*|}"

    # An SRI hash is written algorithm-dash-base64, and the algorithm varies
    # from one publisher to the next: cdnjs issues sha512, jsDelivr sha384.
    algorithm="${integrity%%-*}"
    expected="${integrity#*-}"

    [ "$rehash" -eq 0 ] && printf '%-26s ' "$name"

    if ! curl -fsSL --retry 3 --connect-timeout 20 -o "$work/$name" "$url"; then
        [ "$rehash" -eq 1 ] && printf '%-26s ' "$name"
        echo "FAILED (download)"
        failed=$((failed + 1))
        continue
    fi

    actual="$(openssl dgst "-$algorithm" -binary "$work/$name" | openssl base64 -A)"

    if [ "$rehash" -eq 1 ]; then
        echo "$name"
        echo "    from    $url"
        if [ "$actual" = "$expected" ]; then
            echo "    served  $algorithm-$actual"
            echo "    Unchanged: this is already what the table records."
        else
            echo "    table   $algorithm-$expected"
            echo "    served  $algorithm-$actual"
            echo "    These differ. If you have just pointed this line at a new"
            echo "    version, check the served hash against the one the"
            echo "    publisher documents before you paste it into the table."
            echo "    If you have not changed anything, the bytes at that URL"
            echo "    have moved under you and are worth a closer look."
        fi
        echo
        continue
    fi

    if [ "$actual" != "$expected" ]; then
        echo "FAILED (hash mismatch)"
        echo "    expected $algorithm-$expected"
        echo "    got      $algorithm-$actual"
        echo "    Kept the existing copy. Either the table in this script is"
        echo "    out of date, or what came back is not the file — a captive"
        echo "    portal and a truncated download both look like this. Run"
        echo "    --rehash to see what is actually being served."
        failed=$((failed + 1))
        continue
    fi

    mv "$work/$name" "./$name" || { failed=$((failed + 1)); continue; }
    size="$(du -h "./$name" | cut -f1)"
    echo "ok  ${size}  (matches $algorithm in table)"
done

if [ "$rehash" -eq 1 ]; then
    if [ "$failed" -gt 0 ]; then
        echo "$failed of ${#selected[@]} could not be downloaded."
        exit 1
    fi
    echo "Nothing was installed and nothing was changed."
    exit 0
fi

echo
if [ "$failed" -gt 0 ]; then
    echo "$failed of ${#selected[@]} failed. Nothing was replaced for those."
    exit 1
fi

echo "All ${#selected[@]} present and matching."
