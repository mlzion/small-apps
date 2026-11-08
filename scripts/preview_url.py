"""Read Wrangler's deployment URL, preferring the immutable deployment URL."""
from pathlib import Path
import re
import sys


def deployment_url(log):
    match = re.search(r"Deployment complete! Take a peek over at (https://[a-z0-9-]+\.[a-z0-9-]+\.pages\.dev)(?:\s|$)", log)
    if not match:
        raise ValueError("Wrangler completed without reporting a pages.dev deployment URL")
    return match.group(1)


if __name__ == "__main__":
    print("url=" + deployment_url(Path(sys.argv[1]).read_text(encoding="utf-8")))
