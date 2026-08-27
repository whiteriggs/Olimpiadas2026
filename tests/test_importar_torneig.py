import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))

from importar_torneig import conserva_resultats_antics


class ConservaResultatsAnticsTests(unittest.TestCase):
    def test_conserva_buits_pero_accepta_correccions(self):
        actuals = {
            "Tennis": {
                "3r i 4t lloc": ("", ""),
                "Final": ("E2", "2-0"),
            },
            "Minigolf": {
                "Lloc 1": ("", ""),
                "Lloc 2": ("E3", ""),
            },
        }
        antics = {
            "esports": [
                {
                    "nom": "Tennis",
                    "partits": [
                        {
                            "nom": "3r i 4t lloc",
                            "guanyador": "E3",
                            "marcador": "2-1",
                        },
                        {
                            "nom": "Final",
                            "guanyador": "E1",
                            "marcador": "2-1",
                        },
                    ],
                    "posicions": [],
                },
                {
                    "nom": "Minigolf",
                    "partits": [],
                    "posicions": ["E1", "E2"],
                },
            ]
        }

        fusionats = conserva_resultats_antics(actuals, antics)

        self.assertEqual(fusionats["Tennis"]["3r i 4t lloc"], ("E3", "2-1"))
        self.assertEqual(fusionats["Tennis"]["Final"], ("E2", "2-0"))
        self.assertEqual(fusionats["Minigolf"]["Lloc 1"], ("E1", ""))
        self.assertEqual(fusionats["Minigolf"]["Lloc 2"], ("E3", ""))

    def test_no_duplica_un_equip_mogut_a_un_altre_lloc(self):
        actuals = {"Minigolf": {"Lloc 1": ("", ""), "Lloc 2": ("Diablos", "")}}
        antics = {
            "equips": [{"id": "E6", "nom": "Diablos"}],
            "esports": [{
                "nom": "Minigolf",
                "partits": [],
                "posicions": ["E6", None],
            }],
        }

        fusionats = conserva_resultats_antics(actuals, antics)

        self.assertEqual(fusionats["Minigolf"]["Lloc 1"], ("", ""))
        self.assertEqual(fusionats["Minigolf"]["Lloc 2"], ("Diablos", ""))


if __name__ == "__main__":
    unittest.main()
