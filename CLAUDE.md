# music-thing

A SvelteKit web interface for searching and downloading music from Tidal via the hifi-api proxy.

## Quick Reference

```bash
# Development
npm run dev           # Start dev server (http://localhost:5173)
npm run build         # Build for production
npm run preview       # Preview production build

# Docker
docker compose up -d  # Start with Docker
docker compose down   # Stop

# Type checking
npm run check         # Run svelte-check
```

## Project Overview

**music-thing** is a self-hosted web app that:
- Searches Tidal's catalog via hifi-api proxy instances
- Downloads tracks/albums as FLAC files with full metadata
- Organizes files as `Artist/Album/01 - Track.flac`
- Embeds cover art + saves `cover.jpg` in album folders
- Shows a folder browser of downloaded music

### Tech Stack
- **Frontend**: SvelteKit 2, Svelte 5, Tailwind CSS v4
- **Backend**: SvelteKit server routes (Node.js adapter for Docker)
- **Metadata**: `music-metadata` for reading, `node-taglib-sharp` or ffmpeg for writing FLAC tags
- **Containerization**: Docker + docker-compose with volume mount for `/music`

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `API_BASE_URL` | `https://triton.squid.wtf` | hifi-api instance URL |
| `MUSIC_DIR` | `/music` | Download directory (volume mount) |

---

## hifi-api Reference

hifi-api is a Python FastAPI proxy to Tidal's official API. Multiple public instances available.

### Public Instances
- `https://triton.squid.wtf` (default)
- `https://eu-central.monochrome.tf`
- `https://us-west.monochrome.tf`
- `https://api.monochrome.tf`

### Endpoints

#### Search
```
GET /search/?s={query}     # Search tracks
GET /search/?al={query}    # Search albums
GET /search/?a={query}     # Search artists
```

**Response (tracks):**
```json
{
  "items": [
    {
      "id": 123456789,
      "title": "Track Name",
      "duration": 180,
      "trackNumber": 1,
      "volumeNumber": 1,
      "explicit": false,
      "artist": {
        "id": 12345,
        "name": "Artist Name"
      },
      "artists": [{ "id": 12345, "name": "Artist Name" }],
      "album": {
        "id": 987654,
        "title": "Album Name",
        "cover": "uuid-for-cover-art"
      }
    }
  ],
  "totalNumberOfItems": 100
}
```

**Response (albums):**
```json
{
  "items": [
    {
      "id": 987654,
      "title": "Album Name",
      "numberOfTracks": 12,
      "duration": 3600,
      "releaseDate": "2024-01-15",
      "cover": "uuid-for-cover-art",
      "artist": { "id": 12345, "name": "Artist Name" },
      "artists": [{ "id": 12345, "name": "Artist Name" }]
    }
  ]
}
```

#### Track Info
```
GET /info/?id={trackId}
```

Returns full track metadata including album info.

#### Stream URL
```
GET /track/?id={trackId}&quality={quality}
```

**Quality levels:**
- `LOSSLESS` - 16-bit FLAC (use this - simpler, no DASH parsing)
- `HI_RES_LOSSLESS` - 24-bit FLAC (requires DASH manifest parsing)
- `HIGH` - 320kbps AAC
- `LOW` - 96kbps AAC

**Response:**
```json
{
  "trackId": 123456789,
  "assetPresentation": "FULL",
  "audioQuality": "LOSSLESS",
  "manifest": "base64-encoded-json",
  "manifestMimeType": "application/vnd.tidal.bts"
}
```

**Extracting stream URL:**
```typescript
const response = await fetch(`${API_BASE_URL}/track/?id=${trackId}&quality=LOSSLESS`);
const data = await response.json();
const manifest = JSON.parse(atob(data.manifest));
const streamUrl = manifest.urls[0]; // Direct FLAC download URL
```

#### Album Details
```
GET /album/?id={albumId}
```

**Response:**
```json
{
  "id": 987654,
  "title": "Album Name",
  "numberOfTracks": 12,
  "duration": 3600,
  "releaseDate": "2024-01-15",
  "cover": "uuid-for-cover-art",
  "artist": { "id": 12345, "name": "Artist Name" },
  "tracks": {
    "items": [
      { "id": 123456789, "title": "Track 1", "trackNumber": 1, ... },
      { "id": 123456790, "title": "Track 2", "trackNumber": 2, ... }
    ]
  }
}
```

#### Cover Art
```
GET /cover/?id={trackId}
```

**Response:**
```json
{
  "80": "https://resources.tidal.com/images/uuid/80x80.jpg",
  "640": "https://resources.tidal.com/images/uuid/640x640.jpg",
  "1280": "https://resources.tidal.com/images/uuid/1280x1280.jpg"
}
```

Alternatively, construct URL directly from album/track `cover` field:
```
https://resources.tidal.com/images/{cover.replace(/-/g, '/')}/1280x1280.jpg
```

---

## Project Structure

```
music-thing/
├── CLAUDE.md              # This file
├── docker-compose.yml     # Docker orchestration
├── Dockerfile             # Container build
├── package.json
├── svelte.config.js
├── vite.config.ts
├── src/
│   ├── app.html
│   ├── app.d.ts
│   ├── routes/
│   │   ├── +layout.svelte      # Main layout with sidebar
│   │   ├── +page.svelte        # Search + results UI
│   │   └── api/
│   │       ├── search/+server.ts       # Proxy search to hifi-api
│   │       ├── download/+server.ts     # Start download, return job ID
│   │       ├── progress/[id]/+server.ts # SSE stream for download progress
│   │       └── library/+server.ts      # List downloaded music
│   └── lib/
│       ├── index.ts
│       ├── components/
│       │   ├── SearchBar.svelte
│       │   ├── ResultsGrid.svelte
│       │   ├── TrackCard.svelte
│       │   ├── AlbumCard.svelte
│       │   ├── FolderBrowser.svelte
│       │   ├── DownloadProgress.svelte
│       │   └── Toast.svelte
│       ├── stores/
│       │   ├── downloads.ts    # Active downloads state
│       │   └── library.ts      # Downloaded music state
│       └── server/
│           ├── hifi-client.ts  # hifi-api wrapper
│           ├── downloader.ts   # Download + progress tracking
│           ├── metadata.ts     # FLAC tag embedding
│           └── library.ts      # Scan music directory
└── music/                      # Volume mount point (gitignored)
```

---

## Implementation Plan

### Phase 1: Core Infrastructure
- [x] Docker setup (Dockerfile, docker-compose.yml with node adapter)
- [x] Environment configuration (API_BASE_URL, MUSIC_DIR)
- [x] hifi-api client (`src/lib/server/hifi-client.ts`)

### Phase 2: Search & Display
- [x] Search API route (`/api/search`)
- [x] SearchBar component (query input, track/album toggle)
- [x] ResultsGrid, TrackCard, AlbumCard components
- [x] Main page layout with search results

### Phase 3: Download System
- [x] Downloader service with progress tracking
- [x] Download API route (`/api/download`)
- [x] Progress SSE endpoint (`/api/progress/[id]`)
- [x] DownloadProgress component
- [x] Downloads store for UI state

### Phase 4: Metadata & File Organization
- [x] Metadata embedding service (artist, album, track #, cover art)
- [x] File naming: `Artist/Album/01 - Track.flac`
- [x] Cover art: embed in FLAC + save as `cover.jpg`
- [x] Duplicate detection (skip if file exists)

### Phase 5: Library Browser
- [ ] Library scanner (`src/lib/server/library.ts`)
- [ ] Library API route (`/api/library`)
- [ ] FolderBrowser component (tree view)
- [ ] Auto-refresh on download complete + manual refresh button

### Phase 6: Polish
- [ ] Toast notifications (download complete, already exists, errors)
- [ ] Loading states and error handling
- [ ] Responsive layout
- [ ] Album batch download (sequential, one track at a time)

---

## UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  music-thing                                    [Settings]      │
├────────────────────────────────────┬────────────────────────────┤
│                                    │                            │
│  [Search input...        ] [🔍]    │  Library          [↻]     │
│  ( ) Tracks  ( ) Albums            │                            │
│                                    │  📁 Artist A               │
│  ┌──────────────────────────────┐  │    📁 Album 1              │
│  │ Track/Album Card             │  │      🎵 01 - Track.flac   │
│  │ Artist - Title               │  │      🎵 02 - Track.flac   │
│  │ Album • Duration             │  │    📁 Album 2              │
│  │              [Download]      │  │  📁 Artist B               │
│  └──────────────────────────────┘  │    📁 Album 1              │
│                                    │                            │
│  ┌──────────────────────────────┐  │                            │
│  │ Track/Album Card             │  │                            │
│  │ ...                          │  │                            │
│  └──────────────────────────────┘  │                            │
│                                    │                            │
├────────────────────────────────────┴────────────────────────────┤
│  Downloads                                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Track Name - Artist    [████████████░░░░░░] 75% (15MB/20MB)│ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Implementation Details

### Stream URL Extraction (LOSSLESS)
```typescript
async function getStreamUrl(trackId: number): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/track/?id=${trackId}&quality=LOSSLESS`);
  const data = await res.json();
  const manifest = JSON.parse(Buffer.from(data.manifest, 'base64').toString());
  return manifest.urls[0];
}
```

### File Path Generation
```typescript
function getFilePath(track: Track, album: Album, artist: Artist): string {
  const sanitize = (s: string) => s.replace(/[<>:"/\\|?*]/g, '_');
  const trackNum = String(track.trackNumber).padStart(2, '0');
  return path.join(
    MUSIC_DIR,
    sanitize(artist.name),
    sanitize(album.title),
    `${trackNum} - ${sanitize(track.title)}.flac`
  );
}
```

### Download with Progress
```typescript
async function downloadTrack(url: string, destPath: string, onProgress: (pct: number) => void) {
  const res = await fetch(url);
  const total = parseInt(res.headers.get('content-length') || '0');
  let downloaded = 0;
  
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const writer = createWriteStream(destPath);
  
  for await (const chunk of res.body) {
    downloaded += chunk.length;
    writer.write(chunk);
    onProgress(total ? (downloaded / total) * 100 : 0);
  }
  
  writer.end();
}
```

### Cover Art URLs
```typescript
function getCoverUrl(coverUuid: string, size: 80 | 640 | 1280 = 1280): string {
  return `https://resources.tidal.com/images/${coverUuid.replace(/-/g, '/')}/${size}x${size}.jpg`;
}
```

---

## Reference Repositories

These were cloned during research and contain useful patterns:

- `/tmp/monochrome/` - Electron music app using hifi-api
  - `js/api.js` - LosslessAPI class patterns
  - `js/downloads.js` - Download queue management
  - `js/metadata.js` - FLAC metadata embedding
  
- `/tmp/hifi-api/` - The hifi-api proxy server
  - `main.py` - Full FastAPI implementation (793 lines)

---

## Notes

- **Quality**: Always use `LOSSLESS` (16-bit FLAC) - no DASH parsing needed
- **Album downloads**: Process tracks sequentially (one at a time)
- **Duplicates**: Check if file exists before downloading, show "Already exists" toast
- **Cover art**: Download 1280x1280 version, embed in FLAC and save as `cover.jpg`
- **Progress**: Use SSE (Server-Sent Events) for real-time download progress
