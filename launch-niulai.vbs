Option Explicit

Dim fso, shell, projectRoot, releaseFolder, file, target
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

projectRoot = fso.GetParentFolderName(WScript.ScriptFullName)
releaseFolder = fso.BuildPath(projectRoot, "release")
target = ""

For Each file In fso.GetFolder(releaseFolder).Files
  If LCase(fso.GetExtensionName(file.Name)) = "exe" Then
    If InStr(1, file.Name, "1.2.0-portable-x64", vbTextCompare) > 0 Then
      target = file.Path
      Exit For
    End If
  End If
Next

If target <> "" Then
  shell.Run Chr(34) & target & Chr(34), 0, False
End If
