$ErrorActionPreference = "Stop"

$url = "https://navibotlab--crushzap-comfyui-flux-api.modal.run"

Add-Type -AssemblyName System.Net.Http

$root = Split-Path $PSScriptRoot -Parent
$refPath = Join-Path $root "assets\poses\ref.png"
$refImageBase64 = "base64_here"
if (Test-Path $refPath) {
  $refImageBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($refPath))
}

$payloadObj = @{
  prompt          = "NSFW mulher, spreading ass, perfect hands, realistic anatomy"
  negative_prompt = "male, text, watermark, selfie, mirror"
  steps           = 20
  cfg             = 3.5
  ckpt_name       = "persephoneFluxNSFWSFW_20FP8.safetensors"
  workflow        = "flux"
  model           = "flux"
  poseType        = "spread"
  refImageBase64  = $refImageBase64
}
$payload = ($payloadObj | ConvertTo-Json -Depth 10)

$out = Join-Path (Split-Path $PSScriptRoot -Parent) 'out-explicita-flux.png'
Write-Output ("POST " + $url)
Write-Output ("payload_chars=" + $payload.Length)

$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromSeconds(1800)

try {
  $content = New-Object System.Net.Http.StringContent($payload, [System.Text.Encoding]::UTF8, "application/json")
  $resp = $client.PostAsync($url, $content).GetAwaiter().GetResult()
  $ct = ($resp.Content.Headers.ContentType.MediaType | Out-String).Trim()
  $bytes = $resp.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()

  Write-Output ("status=" + [int]$resp.StatusCode)
  Write-Output ("content_type=" + $ct)

  if ($ct -like "image/*") {
    [System.IO.File]::WriteAllBytes($out, $bytes) | Out-Null
    Write-Output ($out)
    exit 0
  }

  $text = ""
  try { $text = [System.Text.Encoding]::UTF8.GetString($bytes) } catch { $text = "" }
  if ($text.Length -gt 4000) { $text = $text.Substring(0, 4000) }
  Write-Output ("http_body=" + $text)
} finally {
  $client.Dispose()
}
