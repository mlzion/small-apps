"""Run with: python -m unittest discover -s tests -p 'test_*.py' -v"""
from io import BytesIO
from pathlib import Path
import sys
import tarfile
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from prepare_preview import stage
from preview_url import deployment_url


def archive(files, symlinks=()):
    data = BytesIO()
    with tarfile.open(fileobj=data, mode="w:gz") as tar:
        for name, content in files.items():
            item = tarfile.TarInfo(name)
            item.size = len(content)
            tar.addfile(item, BytesIO(content))
        for name, target in symlinks:
            item = tarfile.TarInfo(name)
            item.type = tarfile.SYMTYPE
            item.linkname = target
            tar.addfile(item)
    return data.getvalue()


class PreviewTests(unittest.TestCase):
    def test_preserves_assets_paths_and_calculator_bytes(self):
        source = Path(__file__).resolve().parents[1]
        files = {"repo/index.html": b'<a href="calculator/">Calculator</a>'}
        for name in ("index.html", "styles.css", "script.js"):
            files[f"repo/calculator/{name}"] = (source / "calculator" / name).read_bytes()
        files["repo/assets/tone.mid"] = bytes(range(128))
        with TemporaryDirectory() as tmp:
            output = Path(tmp) / "site"
            stage(archive(files), output)
            for name, content in files.items():
                self.assertEqual(output.joinpath(*Path(name).parts[1:]).read_bytes(), content)
            self.assertIn("noindex", (output / "_headers").read_text())
            self.assertTrue((output / "404.html").is_file())

    def test_calculator_only_branch_gets_preview_homepage(self):
        with TemporaryDirectory() as tmp:
            output = Path(tmp) / "site"
            stage(archive({"repo/calculator/index.html": b"calculator"}), output)
            self.assertIn('href="calculator/index.html"', (output / "index.html").read_text())
            self.assertEqual((output / "calculator/index.html").read_bytes(), b"calculator")

    def test_omits_tooling_secrets_workers_and_unsafe_archive_paths(self):
        files = {"repo/index.html": b"homepage"}
        forbidden = [
            "repo/.env.txt", "repo/.git/config.txt", "repo/tests/a.js",
            "repo/scripts/evil.js", "repo/docs/example.html", "repo/node_modules/a.js",
            "repo/functions/api.js", "repo/_worker.js", "repo/_worker.js/index.js",
            "repo/_routes.json", "repo/package.json", "repo/_redirects",
            "repo/../escape.html", "/repo/absolute.html", "repo/back\\slash.html",
        ]
        files.update({name: b"must not ship" for name in forbidden})
        with TemporaryDirectory() as tmp:
            output = Path(tmp) / "site"
            stage(archive(files, [("repo/link.html", "../outside")]), output)
            self.assertEqual({p.name for p in output.iterdir()}, {"index.html", "404.html", "_headers"})
            self.assertFalse((Path(tmp) / "escape.html").exists())

    def test_does_not_overwrite_an_existing_output_directory(self):
        with TemporaryDirectory() as tmp:
            with self.assertRaises(FileExistsError):
                stage(archive({"repo/index.html": b"homepage"}), Path(tmp))

    def test_rejects_a_branch_without_a_homepage_or_app(self):
        with TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, "No index.html"):
                stage(archive({"repo/style.css": b"body {}"}), Path(tmp) / "site")

    def test_uses_immutable_url_before_branch_alias(self):
        log = "Deployment complete! Take a peek over at https://abc123.small-apps-previews.pages.dev\nDeployment alias URL: https://pr-2.small-apps-previews.pages.dev\n"
        self.assertEqual(deployment_url(log), "https://abc123.small-apps-previews.pages.dev")
        with self.assertRaises(ValueError):
            deployment_url("Deployment failed")
        with self.assertRaises(ValueError):
            deployment_url("See https://unrelated.example.pages.dev for help. Deployment failed.")


if __name__ == "__main__":
    unittest.main()
