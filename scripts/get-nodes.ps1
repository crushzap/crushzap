 $ErrorActionPreference = "Stop"
 $u = "https://navibotlab--crushzap-comfyui-flux-nodes.modal.run"
 Invoke-WebRequest -Uri $u -Method Get -TimeoutSec 180 -UseBasicParsing -OutFile "nodes.json" | Out-Null
 $txt = Get-Content -Path "nodes.json"
 $obj = $txt | ConvertFrom-Json
 $keys = @($obj.PSObject.Properties.Name)
 foreach ($k in @("FluxLoader","FluxSampler","FluxInpaintSampler","KSampler","CheckpointLoaderSimple","VAEDecode","CLIPTextEncode")) {
   Write-Output ($k + "=" + ($keys -contains $k))
 }
 Write-Output ("total_keys=" + $keys.Count)
 Write-Output "OK"
