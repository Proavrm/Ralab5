"""Bloqueio por defeito dos scripts que simulam saisie manual via escrita directa na BD.

Só executar quando o utilizador pedir explicitamente para mimificar a saisie manual:
  python tools/<script>.py --allow-manual-mimic
  set RALAB_MANUAL_ENTRY_MIMIC=1 && python tools/<script>.py
"""
from __future__ import annotations

import os
import sys

GUARD_FLAG = "--allow-manual-mimic"
GUARD_ENV = "RALAB_MANUAL_ENTRY_MIMIC"


def require_manual_entry_authorization(script_name: str) -> None:
    if os.environ.get(GUARD_ENV) == "1":
        return
    if GUARD_FLAG in sys.argv:
        sys.argv = [arg for arg in sys.argv if arg != GUARD_FLAG]
        return
    print(
        f"SCRIPT DESACTIVÉ — {script_name}\n"
        "Este script escreve directamente na base de dados (simulação de saisie manual).\n"
        "Só deve correr quando o utilizador pedir explicitamente para mimificar a saisie manual.\n"
        f"Para autorizar: {GUARD_FLAG}  ou  {GUARD_ENV}=1",
        file=sys.stderr,
    )
    raise SystemExit(2)
