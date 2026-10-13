# Records two plain reference clips with the Windows speech voices (David, Zira).
# render.py pitch-shifts them into one starting timbre per character; Chatterbox
# then clones only the timbre and supplies natural, emotional delivery itself.
#
#   powershell -ExecutionPolicy Bypass -File tools/voices/make_refs.ps1
Add-Type -AssemblyName System.Speech
$dir = Join-Path $PSScriptRoot 'refs'
New-Item -ItemType Directory -Force $dir | Out-Null
$text = 'Good evening. The rain has not stopped since this afternoon, and the creek behind the houses keeps rising. ' +
  'Please pack your important documents, your medicine and some food, and be ready to walk to the barangay hall when we call.'
foreach ($name in @('David', 'Zira')) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SelectVoice("Microsoft $name Desktop")
  $s.Rate = -1
  $s.SetOutputToWaveFile((Join-Path $dir "$($name.ToLower()).wav"))
  $s.Speak($text)
  $s.Dispose()
  Write-Output "refs/$($name.ToLower()).wav"
}
