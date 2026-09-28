' Ejecuta el agente local sin abrir una ventana de consola (para el Programador de tareas).
' Deja el registro en sync\.estado\agente.log.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
raiz = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
If Not fso.FolderExists(raiz & "\sync\.estado") Then fso.CreateFolder(raiz & "\sync\.estado")
sh.CurrentDirectory = raiz
sh.Run "cmd /c node sync\agente-local.mjs >> sync\.estado\agente.log 2>&1", 0, True
