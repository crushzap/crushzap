 $ErrorActionPreference = "Stop"
 
 $url = "https://navibotlab--crushzap-comfyui-api.modal.run"
 
$seed = Get-Random -Minimum 1 -Maximum 2147483647
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$out = "out-explicita-comfy-$ts.png"

 $payload = @'
 {
   "prompt": "close-up explicito da vagina, nudez total, sem roupas, macro lente, quadro preenchido, pele realista, textura detalhada, foco nos genitais, sem rosto, sem corpo superior",
   "negative_prompt": "rosto, cabeca, olhos, retrato, corpo inteiro, maos, dedos, bracos, selfie, espelho, telefone, texto, watermark, masculino",
   "steps": 28,
  "cfg": 3.0,
  "seed": __SEED__
 }
'@

$payload = $payload.Replace("__SEED__", $seed)
 
$null = Invoke-WebRequest -Uri $url -Method Post -ContentType 'application/json' -Body $payload -TimeoutSec 300 -UseBasicParsing -OutFile $out
Write-Output $seed
Write-Output $out
 Write-Output "OK"
