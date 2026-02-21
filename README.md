# Music Thing

A self-hosted web app for searching and downloading music from Tidal. Built with SvelteKit, runs in Docker.

> *"Supporting artists spiritually"*

## Features

- **Search** - Find tracks and albums from Tidal's catalog
- **Download** - Get music as FLAC (lossless), AAC 320kbps, or AAC 96kbps
- **Metadata** - Full tags embedded (artist, album, track number, cover art)
- **Organization** - Files saved as `Artist/Album/01 - Track.flac`
- **Multi-disk support** - Albums with multiple discs get proper folder structure
- **Library browser** - See what you've already downloaded
- **"In Library" badges** - Know at a glance if you already have a track
- **Progress tracking** - Real-time download progress with queue management

## Quick Start

### Docker Compose (Recommended)

```yaml
services:
  music-thing:
    image: ghcr.io/aaronp16/music-thing:latest
    container_name: music-thing
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - /path/to/your/music:/music
    environment:
      - NODE_ENV=production
```

Then:

```bash
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) and start searching.

### Docker Run

```bash
docker run -d \
  --name music-thing \
  -p 3000:3000 \
  -v /path/to/your/music:/music \
  -e NODE_ENV=production \
  ghcr.io/aaronp16/music-thing:latest
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MUSIC_DIR` | `/music` | Where downloads are saved (mount a volume here) |
| `API_PROVIDERS` | *(see below)* | Comma-separated list of hifi-api instances |
| `NODE_ENV` | - | Set to `production` in Docker |

### API Providers

Music Thing uses [hifi-api](https://github.com/sachinsenal0x64/hifi-api) proxy instances to access Tidal. The default providers are:

- `https://triton.squid.wtf`
- `https://api.monochrome.tf`
- `https://wolf.qqdl.site`

If one provider is rate-limited or down, the app automatically falls back to the next one.

To use custom providers:

```yaml
environment:
  - API_PROVIDERS=https://your-instance.com,https://backup-instance.com
```

## File Organization

Downloads are organized automatically:

```
/music
├── Artist Name
│   ├── Album Title
│   │   ├── cover.jpg
│   │   ├── 01 - Track One.flac
│   │   ├── 02 - Track Two.flac
│   │   └── ...
│   └── Multi-Disc Album
│       ├── cover.jpg
│       ├── Disk 1
│       │   ├── 01 - Track.flac
│       │   └── ...
│       └── Disk 2
│           ├── 01 - Track.flac
│           └── ...
```

## Quality Options

| Quality | Format | Bitrate |
|---------|--------|---------|
| FLAC | `.flac` | ~1411 kbps (lossless, 16-bit/44.1kHz) |
| AAC 320 | `.m4a` | 320 kbps |
| AAC 96 | `.m4a` | 96 kbps |

Select quality from the dropdown on the download button.

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Type check
npm run check

# Build for production
npm run build
```

In development, files download to `./music` in the project directory.

## Tech Stack

- **Frontend**: SvelteKit 2, Svelte 5, Tailwind CSS v4
- **Backend**: SvelteKit server routes with Node adapter
- **Metadata**: ffmpeg for FLAC/M4A tag embedding
- **Container**: Docker with multi-stage build

## How It Works

1. Searches go through hifi-api proxy instances that interface with Tidal's API
2. Stream URLs are extracted from Tidal's manifest format
3. Audio is downloaded and metadata is embedded using ffmpeg
4. Files are written atomically (via temp directory) to avoid issues with media scanners

## License

MIT
