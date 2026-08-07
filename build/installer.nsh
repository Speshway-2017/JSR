; Disable NSIS self-CRC when Windows installers are built on macOS (Wine).
; Without this, Setup often fails with "Installer integrity check has failed".
!macro customHeader
  CRCCheck off
!macroend
