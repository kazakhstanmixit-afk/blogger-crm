"""Build the small Windows updater from tested source, without credentials or sessions."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
out = root / 'instagram-worker/downloads/direct-entry-update.zip'
out.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(out, 'w', ZIP_DEFLATED) as z:
    for source, name in [
        ('instagram-worker/robot.mjs', 'robot.mjs'),
        ('instagram-worker/windows/update-worker.ps1', 'update.ps1'),
        ('instagram-worker/windows/update-worker.cmd', 'UPDATE.cmd'),
    ]:
        z.write(root / source, name)
    z.writestr('READ-ME.txt', 'Close the old robot window. Extract this ZIP. Run UPDATE.cmd and select your existing instagram-worker folder. Only robot.mjs is replaced; .env.local and the Instagram session are preserved. The robot restarts automatically. No automatic follows are performed.\n')
print(out)
