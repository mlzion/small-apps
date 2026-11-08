"""Stage static PR files without extracting or executing untrusted PR code."""
import argparse
from html import escape
from io import BytesIO
from pathlib import Path, PurePosixPath
import re
import tarfile
from urllib.request import urlopen

STATIC_EXTENSIONS = {
    ".html", ".css", ".js", ".mjs", ".json", ".webmanifest", ".txt",
    ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico",
    ".woff", ".woff2", ".ttf", ".otf", ".eot", ".wasm",
    ".mp3", ".wav", ".ogg", ".flac", ".m4a", ".mp4", ".webm", ".mid", ".midi",
}
EXCLUDED_DIRECTORIES = {"scripts", "tests", "docs", "node_modules", "functions", "vendor", "__pycache__"}
EXCLUDED_FILES = {"_worker.js", "_routes.json", "package.json", "package-lock.json", "tsconfig.json"}
MAX_ARCHIVE_BYTES = 100 * 1024 * 1024
MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_TOTAL_BYTES = 100 * 1024 * 1024


def stage(archive_bytes, output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    total, count = 0, 0
    with tarfile.open(fileobj=BytesIO(archive_bytes), mode="r:gz") as archive:
        for member in archive:
            parts = PurePosixPath(member.name).parts
            # GitHub archives have one top-level owner-repo-sha directory.
            if not member.isfile() or len(parts) < 2:
                continue
            if ".." in parts or any(part.startswith(".") for part in parts) or "\\" in member.name or member.name.startswith("/"):
                continue
            relative = PurePosixPath(*parts[1:])
            if any(part in EXCLUDED_DIRECTORIES for part in relative.parts[:-1]):
                continue
            if any(part in EXCLUDED_FILES for part in relative.parts) or relative.suffix.lower() not in STATIC_EXTENSIONS:
                continue
            if member.size > MAX_FILE_BYTES:
                raise ValueError(f"Static file exceeds the 25 MiB Pages limit: {relative}")
            total += member.size
            if total > MAX_TOTAL_BYTES or count >= 19000:
                raise ValueError("Preview exceeds the configured static site size limit")
            target = output.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.extractfile(member).read())
            count += 1
    if not count:
        raise ValueError("The PR contains no supported static files")
    # Current main contains the calculator but has no root homepage yet.
    # This fallback exists only in the preview output, never in source or Pages.
    if not (output / "index.html").exists():
        links = sorted(path.relative_to(output).as_posix() for path in output.rglob("index.html"))
        if not links:
            raise ValueError("No index.html was found in the PR")
        items = "".join(f'<li><a href="{escape(path, quote=True)}">{escape(path)}</a></li>' for path in links)
        (output / "index.html").write_text(
            '<!doctype html><html lang="en"><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<title>App previews</title><style>html{color-scheme:dark;font:18px system-ui}'
            'body{max-width:52rem;margin:4rem auto;padding:1.5rem}a{color:#93b4ff}</style>'
            '<h1>App previews</h1><p>This branch has no homepage. Open an application below.</p>'
            f'<ul>{items}</ul></html>', encoding="utf-8")
    # Prevent Pages from treating a plain static multi-app site as an SPA.
    if not (output / "404.html").exists():
        (output / "404.html").write_text(
            '<!doctype html><html lang="en"><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<title>Not found</title><h1>Page not found</h1></html>', encoding="utf-8")
    (output / "_headers").write_text("/*\n  X-Robots-Tag: noindex, nofollow\n", encoding="utf-8")
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repository):
        parser.error("Invalid GitHub repository name")
    if not re.fullmatch(r"[0-9a-f]{40}", args.sha):
        parser.error("Expected an exact 40-character commit SHA")
    url = f"https://codeload.github.com/{args.repository}/tar.gz/{args.sha}"
    with urlopen(url, timeout=120) as response:
        content = response.read(MAX_ARCHIVE_BYTES + 1)
    if len(content) > MAX_ARCHIVE_BYTES:
        raise ValueError("PR archive exceeds 100 MiB")
    count = stage(content, args.output)
    print(f"Prepared {count} static files from {args.repository}@{args.sha}")


if __name__ == "__main__":
    main()
