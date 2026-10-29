Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
base = fs.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = base
sh.Run Chr(34) & base & "\..\node_modules\electron\dist\electron.exe" & Chr(34) & " " & Chr(34) & base & Chr(34), 0, False
