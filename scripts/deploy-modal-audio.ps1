$ErrorActionPreference = "Stop"
Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location -Path ".."
python -m modal.cli.entry_point deploy .\infra\modal-audio\app.py