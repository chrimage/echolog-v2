# EchoLog v2 Deployment Guide

## Development Setup (Current)

The current setup uses `localhost` with a self-signed certificate for development.

```bash
# Start the services
docker-compose down && docker-compose up --build -d

# Access the application
https://localhost  # HTTPS with self-signed cert
http://localhost   # HTTP (redirects to HTTPS)
```

**Note**: You'll need to accept the self-signed certificate warning in your browser.

### URL Configuration
The application automatically configures URLs based on the `DOMAIN` environment variable:
- **Development** (`DOMAIN=localhost`): Uses `https://localhost` for all URLs
- **Production** (`DOMAIN=your-domain.com`): Uses `https://your-domain.com` for all URLs

This ensures download links and API responses show the correct external URL.

## Production Setup

For production deployment with Let's Encrypt SSL certificates:

### 1. Update Environment Variables

Edit `.env` file:
```bash
# Change from localhost to your actual domain
DOMAIN=your-domain.com

# Set user/group IDs to match your host user (run: id -u && id -g)
USER_ID=1001
GROUP_ID=1001
```

### 2. DNS Configuration

Ensure your domain points to the server running the containers:
- A record: `your-domain.com` → `your-server-ip`
- AAAA record: `your-domain.com` → `your-server-ipv6` (if applicable)

### 3. Deploy

```bash
# Deploy with your domain
docker-compose down && docker-compose up --build -d
```

Caddy will automatically:
- Request Let's Encrypt certificates
- Handle HTTP to HTTPS redirects
- Auto-renew certificates

### 4. Firewall Configuration

Ensure ports are open:
- Port 80 (HTTP) - for Let's Encrypt challenges
- Port 443 (HTTPS) - for secure access

## Service Architecture

```
Internet → Caddy (Port 80/443) → EchoLog App (Port 3000)
```

- **Caddy**: Reverse proxy, SSL termination, automatic HTTPS
- **EchoLog**: Discord bot + Web server
- **Volumes**: 
  - `./recordings` - Persistent recording storage
  - `caddy_data` - SSL certificates and Caddy data
  - `caddy_config` - Caddy configuration cache

## Monitoring

### Check Service Status
```bash
docker-compose ps
docker-compose logs caddy
docker-compose logs echolog-v2
```

### Health Checks
- Application: `https://your-domain.com/health`
- Caddy: `https://your-domain.com/caddy/health`

## Troubleshooting

### SSL Certificate Issues
```bash
# Check Caddy logs for certificate issues
docker-compose logs caddy

# Force certificate refresh (if needed)
docker-compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### Application Issues
```bash
# Check app logs
docker-compose logs echolog-v2

# Restart services
docker-compose restart
```