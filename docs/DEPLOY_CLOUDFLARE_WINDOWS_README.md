# Guia rápido: Deploy RaLab5 com Cloudflare Tunnel (Windows)

## Pré-requisitos
- Servidor Windows com RaLab5 funcionando localmente
- Domínio gerenciado no Cloudflare
- cloudflared instalado (https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)

## Passos

### 1. Configurar variáveis de ambiente (PowerShell como Administrador)

```
setx RALAB_AUTH_MODE "proxy"
setx RALAB_JWT_SECRET "<um-segredo-longo-e-unico>"
setx RALAB_ALLOWED_HOSTS "ralab.seu-dominio.tld"
setx RALAB_ALLOWED_ORIGINS "https://ralab.seu-dominio.tld"
```

### 2. Iniciar o backend normalmente

Execute:

```
launch_ralab5_server.cmd
```

### 3. Criar o tunnel Cloudflare

Substitua os valores entre <> pelos seus dados.

```
cloudflared tunnel create ralab5-tunnel
```

Anote o UUID do tunnel e o caminho do arquivo de credenciais exibidos.

### 4. Configurar o tunnel

Crie ou edite o arquivo:

```
C:\Users\<SEU-USUARIO>\.cloudflared\cloudflared_ralab5.yml
```

Conteúdo de exemplo:

```
tunnel: <TUNNEL-UUID>
credentials-file: C:\Users\<SEU-USUARIO>\.cloudflared\<TUNNEL-UUID>.json

ingress:
  - hostname: ralab.seu-dominio.tld
    service: http://127.0.0.1:8000
  - service: http_status:404
```

### 5. Vincular o hostname no Cloudflare

No painel Cloudflare, crie um CNAME para `ralab.seu-dominio.tld` apontando para `uuid.cfargotunnel.com` (UUID do tunnel).

### 6. Iniciar o tunnel

```
cloudflared tunnel --config C:\Users\<SEU-USUARIO>\.cloudflared\cloudflared_ralab5.yml run
```

### 7. Proteger com Cloudflare Access

No painel Cloudflare Zero Trust, crie uma política de acesso para `ralab.seu-dominio.tld` permitindo apenas os e-mails desejados.

---

## Script PowerShell para automatizar tunnel

Salve como `start_cloudflared_ralab5.ps1` em scripts/:

```powershell
$cloudflared = "cloudflared.exe" # ou caminho completo se não estiver no PATH
$config = "$env:USERPROFILE\.cloudflared\cloudflared_ralab5.yml"

if (-not (Test-Path $config)) {
    Write-Error "Arquivo de configuração do tunnel não encontrado: $config"
    exit 1
}

& $cloudflared tunnel --config $config run
```

Execute em PowerShell:

```
powershell -ExecutionPolicy Bypass -File scripts\start_cloudflared_ralab5.ps1
```

---

Pronto! O RaLab5 estará acessível externamente e protegido.
