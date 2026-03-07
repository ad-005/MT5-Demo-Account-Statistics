import json
import uuid
from pathlib import Path
from typing import Optional

from backend.config import ACCOUNTS_FILE, DATA_DIR
from backend.models import Account, AccountCreate


def _ensure_file():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not ACCOUNTS_FILE.exists():
        ACCOUNTS_FILE.write_text("[]")


def load_accounts() -> list[Account]:
    _ensure_file()
    raw = json.loads(ACCOUNTS_FILE.read_text())
    return [Account(**a) for a in raw]


def save_accounts(accounts: list[Account]):
    _ensure_file()
    ACCOUNTS_FILE.write_text(
        json.dumps([a.model_dump() for a in accounts], indent=2)
    )


def get_account(account_id: str) -> Optional[Account]:
    for acc in load_accounts():
        if acc.id == account_id:
            return acc
    return None


def add_account(data: AccountCreate) -> Account:
    accounts = load_accounts()
    account = Account(id=str(uuid.uuid4()), **data.model_dump())
    accounts.append(account)
    save_accounts(accounts)
    return account


def update_account(account_id: str, data: AccountCreate) -> Optional[Account]:
    accounts = load_accounts()
    for i, acc in enumerate(accounts):
        if acc.id == account_id:
            updated = Account(id=account_id, **data.model_dump())
            updated.container_port = acc.container_port
            accounts[i] = updated
            save_accounts(accounts)
            return updated
    return None


def delete_account(account_id: str) -> bool:
    accounts = load_accounts()
    filtered = [a for a in accounts if a.id != account_id]
    if len(filtered) == len(accounts):
        return False
    save_accounts(filtered)
    return True


def assign_port(account_id: str, port: int):
    accounts = load_accounts()
    for i, acc in enumerate(accounts):
        if acc.id == account_id:
            accounts[i].container_port = port
            save_accounts(accounts)
            return
