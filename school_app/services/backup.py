from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path


def create_backup_archive(*, data_file: str | None, upload_dir: str | None, backup_dir: str) -> str:
    backup_root = Path(backup_dir)
    backup_root.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    staging_dir = backup_root / f"backup-{timestamp}"
    staging_dir.mkdir(parents=True, exist_ok=True)

    copied_any = False

    for source in filter(None, [data_file]):
        source_path = Path(source)
        if source_path.exists() and source_path.is_file():
            shutil.copy2(source_path, staging_dir / source_path.name)
            copied_any = True

    upload_path = Path(upload_dir) if upload_dir else None
    if upload_path and upload_path.exists() and upload_path.is_dir():
        shutil.copytree(upload_path, staging_dir / "uploads", dirs_exist_ok=True)
        copied_any = True

    if not copied_any:
        raise FileNotFoundError("No backup sources were found.")

    archive_path = shutil.make_archive(str(staging_dir), "zip", root_dir=staging_dir)
    shutil.rmtree(staging_dir, ignore_errors=True)
    return archive_path
