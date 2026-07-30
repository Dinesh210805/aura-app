#!/usr/bin/env python3
"""Re-derive the site's factual content from the app source and the live release.

    python site/sync-from-source.py            # rewrite + report
    python site/sync-from-source.py --check    # report only, exit 1 on drift

WHY THIS EXISTS
The source repo is private, so a browser cannot read it. Anything the site says
about the *code* therefore has to be baked in at publish time rather than
fetched at runtime. Baked in is fine; hand-typed is not — that is how a site
ends up claiming 36 tools when there are 47.

TWO CLASSES OF CONTENT, HANDLED DIFFERENTLY

  REGENERATED  — mechanical and safe to synthesise: the tool count, the tool
                 name list, and the authored fallbacks for the release facts.
                 Wrong output here is obvious on sight.

  DRIFT-CHECKED — the permission explanations and the per-brand OEM steps.
                 These are the highest-consequence copy on the site (the OEM
                 steps are the fix for the top support issue), and a parser
                 that silently dropped a line would be worse than prose that is
                 correct today. So they are compared against source, never
                 rewritten: if they diverge, this reports it and a human looks.
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import urllib.request

# The Windows console defaults to cp1252, which cannot encode the separators
# used below (or the middot this script writes into the ABI list). Reconfigure
# rather than downgrade the output — the file content is UTF-8 regardless.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "aura-android", "app", "src", "main", "java", "com", "aura", "aura_ui")
MCP = os.path.join(ROOT, "aura-android", "mcp-server", "src", "main", "kotlin", "com", "aura", "mcp")
RELEASES_API = "https://api.github.com/repos/Dinesh210805/aura-releases/releases/latest"

CHECK_ONLY = "--check" in sys.argv
problems: list[str] = []
notes: list[str] = []

# ---------------------------------------------------------------------------
# Acknowledged rewordings
# ---------------------------------------------------------------------------
# The site is not the app's UI: it addresses someone who has not installed
# anything yet, so a few strings are deliberately reworded. Each one is
# recorded here with the reason, keyed by a distinctive fragment of the SOURCE
# string.
#
# The point is that this list is *keyed on source*. If the app changes one of
# these strings, its key stops matching and the drift is reported again — so an
# acknowledgement can never silently outlive the text it was granted for.
ACKNOWLEDGED = {
    "Required so AURA can type in EVERY app":
        "site rewrites the lead as 'Lets AURA type in every app' and drops the "
        "in-app emphasis caps; substance and the never-reads-what-you-type "
        "guarantee are preserved verbatim",
    "screens the UI tree can't describe":
        "site says 'the accessibility data can't describe' — 'UI tree' is "
        "engineering vocabulary a first-time visitor has no reason to know",
    "Open i Manager": "step is split across markup and joined with 'and' rather than an arrow",
    "Open Settings → Apps → AURA → Permissions → turn ON":
        "step is split across markup; the literal vendor wording is unchanged",
    "Open Settings → Battery → App launch → AURA → switch to":
        "step is split across markup; the literal vendor wording is unchanged",
}


def acknowledged(source_text: str) -> str | None:
    for key, reason in ACKNOWLEDGED.items():
        if key in source_text:
            return reason
    return None


def read(path: str) -> str:
    with io.open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read()


def write(path: str, text: str) -> None:
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


# ---------------------------------------------------------------------------
# 1. Tools — regenerated
# ---------------------------------------------------------------------------

def collect_tools() -> list[str]:
    """Every tool name the MCP server registers.

    Two registration shapes exist: a literal first argument, and `name = <var>`
    inside a loop over a list of (name, direction) pairs. The loop is why a
    naive count of `scopedTool(` under-reports by three — it is one call site
    that registers four scroll directions.
    """
    tools_dir = os.path.join(MCP, "tools")
    if not os.path.isdir(tools_dir):
        problems.append(f"tool source not found: {tools_dir}")
        return []

    # Order is by source file, then by declaration order within it — NOT
    # alphabetical. The files are the capability grouping (GestureTools,
    # PerceptionTools, …), so this keeps related tools adjacent in the rendered
    # list while still being derived entirely from the source rather than from
    # a hand-kept ordering here.
    names: list[str] = []
    seen: set[str] = set()

    def add(name: str) -> None:
        if name not in seen:
            seen.add(name)
            names.append(name)

    for fname in sorted(os.listdir(tools_dir)):
        if not fname.endswith(".kt"):
            continue
        src = read(os.path.join(tools_dir, fname))
        # Walk the file once so declaration order is preserved, picking up both
        # registration shapes: a literal name, and the directional-scroll loop
        # `listOf("scroll_up" to ScrollDirection.UP, …)` which is one call site
        # registering four tools.
        for m in re.finditer(
            r'scopedTool\s*\(\s*(?:name\s*=\s*)?"([a-z_]+)"'
            r'|"([a-z_]+)"\s+to\s+ScrollDirection\.',
            src, re.S,
        ):
            add(m.group(1) or m.group(2))
    return names


def sync_tools(pages: dict[str, str], tools: list[str]) -> None:
    if not tools:
        return
    count = str(len(tools))
    notes.append(f"tools: {count} registered")

    for page, html in pages.items():
        original = html

        # The count, wherever it is spoken.
        html = re.sub(r'(<span data-src="toolcount">)\d+(</span>)', r"\g<1>" + count + r"\g<2>", html)

        # Attributes cannot contain elements, so the meta description carries a
        # bare number and is matched by its phrasing instead.
        html = re.sub(r'(\b)\d+(\s+MCP tools\b)', r"\g<1>" + count + r"\g<2>", html)

        # The chip cloud. data-hot marks the tools worth the eye landing on;
        # it is preserved across regeneration so the emphasis is not lost.
        def rebuild(m: re.Match) -> str:
            body = m.group(2)
            hot = set(re.findall(r'<code data-hot>([a-z_]+)</code>', body))
            chips = "".join(
                f'<code data-hot>{t}</code>' if t in hot else f'<code>{t}</code>'
                for t in tools
            )
            return m.group(1) + chips + m.group(3)

        html = re.sub(
            r'(<div class="tools" data-src="toollist">)(.*?)(</div>)',
            rebuild, html, flags=re.S,
        )

        if html != original:
            pages[page] = html


# ---------------------------------------------------------------------------
# 2. Permission + OEM copy — drift-checked, never rewritten
# ---------------------------------------------------------------------------

def check_permissions(pages: dict[str, str]) -> None:
    path = os.path.join(APP, "presentation", "permissions", "PermissionRegistry.kt")
    if not os.path.isfile(path):
        problems.append(f"PermissionRegistry.kt not found at {path}")
        return
    src = read(path)

    whys = re.findall(r'why\s*=\s*"((?:[^"\\]|\\.)*)"', src, re.S)
    if not whys:
        problems.append("PermissionRegistry.kt: parsed 0 `why` strings — parser needs updating")
        return

    haystack = pages.get("download.html", "")
    missing = []
    for why in whys:
        # Compare on words only: the site legitimately re-punctuates (curly
        # quotes, an em dash for a semicolon) without changing meaning.
        needle = normalise(why)
        if needle and needle[:60] not in normalise(haystack):
            missing.append(why[:72])

    ok = len(whys) - len(missing)
    acked = [m for m in missing if acknowledged(m)]
    real = [m for m in missing if not acknowledged(m)]
    notes.append(
        f"permissions: {ok}/{len(whys)} verbatim"
        + (f", {len(acked)} reworded by agreement" if acked else "")
    )
    for m in real:
        problems.append(f"permission copy drifted or absent: {m[:72]!r}")


def check_oem(pages: dict[str, str]) -> None:
    path = os.path.join(APP, "compat", "OemCompat.kt")
    if not os.path.isfile(path):
        problems.append(f"OemCompat.kt not found at {path}")
        return
    src = read(path)

    block = re.search(r'fun overlayFixSteps\(.*?\n    \}', src, re.S)
    if not block:
        problems.append("OemCompat.kt: overlayFixSteps() not found — parser needs updating")
        return

    steps = re.findall(r'"((?:[^"\\]|\\.)*)"', block.group(0))
    steps = [s for s in steps if len(s) > 12]          # skip enum fragments
    haystack = normalise(pages.get("download.html", ""))

    missing = [s for s in steps if normalise(s)[:55] not in haystack]
    acked = [m for m in missing if acknowledged(m)]
    real = [m for m in missing if not acknowledged(m)]
    notes.append(
        f"OEM steps: {len(steps) - len(missing)}/{len(steps)} verbatim"
        + (f", {len(acked)} reworded by agreement" if acked else "")
    )
    for m in real:
        problems.append(f"OEM step drifted or absent: {m[:72]!r}")


def normalise(text: str) -> str:
    """Compare on words, ignoring punctuation, case, markup and whitespace."""
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("\\\"", '"').replace("\\n", " ")
    text = re.sub(r"[^0-9a-zA-Z]+", " ", text)
    return re.sub(r"\s+", " ", text).strip().lower()


# ---------------------------------------------------------------------------
# 3. Release facts — regenerated into the authored fallbacks
# ---------------------------------------------------------------------------

def sync_release(pages: dict[str, str]) -> None:
    """Refresh the values the runtime fetch would otherwise have to supply.

    The page fetches these live, but a rate-limited visitor (60 req/hour per IP,
    and much of this audience shares carrier NAT) sees whatever is in the HTML.
    So the HTML has to be right too.
    """
    try:
        req = urllib.request.Request(RELEASES_API, headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "aura-site-sync",
        })
        with urllib.request.urlopen(req, timeout=20) as resp:
            rel = json.load(resp)
    except Exception as exc:                                    # offline, rate-limited
        notes.append(f"release: skipped ({exc.__class__.__name__}) — authored values kept")
        return

    apk = next((a for a in rel.get("assets", []) if a["name"].lower().endswith(".apk")), None)
    if not apk:
        problems.append("latest release has no .apk asset")
        return

    version = str(rel.get("tag_name", "")).lstrip("v")
    size = f"{round(apk['size'] / 1048576, 1)} MB"
    date = (rel.get("published_at") or "")[:10]
    body = rel.get("body") or ""

    # Same fail-closed rule the browser uses: only an unmistakable match wins.
    hexes = re.findall(r"\b[A-Fa-f0-9]{64}\b", body)
    sha = hexes[0].upper() if len(hexes) == 1 else None
    if sha is None:
        problems.append(f"release notes contain {len(hexes)} 64-hex strings — SHA left as authored")

    abis = [a for a in ("arm64-v8a", "armeabi-v7a", "x86_64", "x86")
            if re.search(r"\b" + re.escape(a) + r"\b", body)]

    if date:
        y, m, d = date.split("-")
        months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
        date = f"{int(d)} {months[int(m) - 1]} {y}"

    values = {
        "version": version,
        "size": size,
        "date": date,
        "filename": apk["name"],
        "sha": sha,
        "abis": " · ".join(abis) if abis else None,
    }
    notes.append("release: v{version} {size} {date}".format(**values))

    for page, html in pages.items():
        original = html
        for key, val in values.items():
            if not val:
                continue
            html = re.sub(
                r'(<(\w+)([^>]*\bdata-rel="' + key + r'"[^>]*)>)[^<]*(</\2>)',
                lambda m, v=val: m.group(1) + v + m.group(4),
                html,
            )
        # The download link and its filename in prose.
        html = html.replace(
            "https://github.com/Dinesh210805/aura-releases/releases/download/"
            + rel["tag_name"] + "/" + apk["name"],
            apk["browser_download_url"],
        )
        html = re.sub(
            r"aura-\d+\.\d+\.\d+\.apk",
            apk["name"],
            html,
        )
        html = re.sub(
            r"/releases/download/v[\d.]+/aura-[\d.]+\.apk",
            "/releases/download/%s/%s" % (rel["tag_name"], apk["name"]),
            html,
        )
        if html != original:
            pages[page] = html


# ---------------------------------------------------------------------------

def main() -> int:
    names = ["index.html", "download.html", "mcp.html", "privacy.html", "404.html"]
    pages = {n: read(os.path.join(HERE, n)) for n in names if os.path.isfile(os.path.join(HERE, n))}
    before = dict(pages)

    sync_tools(pages, collect_tools())
    sync_release(pages)
    check_permissions(pages)
    check_oem(pages)

    changed = [n for n in pages if pages[n] != before[n]]

    print("── sync-from-source ─────────────────────────────")
    for n in notes:
        print("  ·", n)

    if changed:
        print("  · would rewrite:" if CHECK_ONLY else "  · rewrote:", ", ".join(sorted(changed)))
        if not CHECK_ONLY:
            for n in changed:
                write(os.path.join(HERE, n), pages[n])
    else:
        print("  · no content changes")

    if problems:
        print("\n  DRIFT / PROBLEMS")
        for p in problems:
            print("   !", p)
        print("\n  These are reported, never auto-fixed — the copy they cover is")
        print("  the highest-consequence text on the site. Reconcile by hand.")
        return 1

    print("\n  all source-derived content matches")
    return 1 if (CHECK_ONLY and changed) else 0


if __name__ == "__main__":
    sys.exit(main())
