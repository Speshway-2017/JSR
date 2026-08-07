; Fix NSIS "Installer integrity check has failed" on uninstall
; when the Windows installer is built on macOS (Wine toolchain).
!macro customHeader
  CRCCheck off
!macroend
