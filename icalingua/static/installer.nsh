!ifndef BUILD_UNINSTALLER
  !include nsDialogs.nsh

  Var desktopShortcutCheckbox
  Var createDesktopShortcut

  !macro customPageAfterChangeDir
    Page custom desktopShortcutPage desktopShortcutPageLeave
  !macroend

  Function desktopShortcutPage
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 12u "安装选项："
    Pop $0
    ${NSD_CreateCheckbox} 0 20u 100% 12u "创建桌面快捷方式"
    Pop $desktopShortcutCheckbox
    ${NSD_SetState} $desktopShortcutCheckbox ${BST_CHECKED}

    nsDialogs::Show
  FunctionEnd

  Function desktopShortcutPageLeave
    ${NSD_GetState} $desktopShortcutCheckbox $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $createDesktopShortcut "true"
    ${Else}
      StrCpy $createDesktopShortcut "false"
    ${EndIf}
  FunctionEnd

  !macro customInstall
    ${If} $createDesktopShortcut == "false"
      Delete "$newDesktopLink"
      ClearErrors
    ${EndIf}
  !macroend
!endif
