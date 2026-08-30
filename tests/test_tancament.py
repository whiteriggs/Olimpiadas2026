import json
import unittest
from pathlib import Path


ARREL = Path(__file__).resolve().parents[1]


class TancamentTests(unittest.TestCase):
    def test_la_portada_conserva_la_cronica_i_presenta_el_nou_escut(self):
        html = (ARREL / "index.html").read_text(encoding="utf-8")

        self.assertIn('id="epileg"', html)
        self.assertIn("campions indiscutibles de la cullera", html)
        self.assertIn("cullera guanyada a pols", html)
        self.assertIn("296 punts", html)
        self.assertIn("Minigolf", html)
        self.assertIn("Derisio non timenda est", html)
        self.assertIn("assets/escut-diablos-2026.jpg", html)
        self.assertGreaterEqual(html.count("assets/icona-diablos-192.png"), 3)

    def test_el_calendari_queda_arxivat_fora_de_la_portada(self):
        html = (ARREL / "index.html").read_text(encoding="utf-8")

        self.assertIn('data-panel="calendario"', html)
        self.assertIn(">Llegat</button>", html)
        self.assertIn('<div class="calendari-arxiu" hidden>', html)
        self.assertIn('id="listaCalendario"', html)

    def test_la_pwa_utilitza_el_nou_escut(self):
        manifest = json.loads(
            (ARREL / "manifest.webmanifest").read_text(encoding="utf-8")
        )
        icones = {icona["src"] for icona in manifest["icons"]}

        self.assertEqual(
            icones,
            {
                "assets/icona-diablos-192.png",
                "assets/icona-diablos-512.png",
                "assets/icona-diablos-maskable-512.png",
            },
        )

    def test_l_actualitzacio_automatica_queda_desactivada(self):
        workflow = (
            ARREL / ".github/workflows/actualitza-calendari.yml"
        ).read_text(encoding="utf-8")

        self.assertNotIn("schedule:", workflow)
        self.assertIn("workflow_dispatch:", workflow)


if __name__ == "__main__":
    unittest.main()