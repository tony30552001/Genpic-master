# video render service

ffmpeg sidecar for storyboard videos. The Pixora API owns jobs, storage
credentials and state; this service only runs ffmpeg on inputs and outputs that
the API signs as short-lived Azure Blob SAS URLs. Files never pass through the
API, and the App Service image does not need ffmpeg.

## Endpoints

All endpoints except `/health` require the `X-Pixora-Service-Key` header.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness plus the installed ffmpeg version |
| `POST` | `/last-frame` | Write the final frame of a video as PNG; the next segment's start frame |

`POST /last-frame` body:

```json
{ "videoUrl": "https://<account>.blob.core.windows.net/...?<read SAS>",
  "frameUrl": "https://<account>.blob.core.windows.net/...?<create/write SAS>" }
```

It returns `{ contentType, width, height, sizeBytes }`. Both URLs must be https
Azure Blob SAS URLs. Status codes: `400` invalid URL, `401` wrong key, `422`
ffmpeg could not read the video, `502` blob download or upload failed.

The API client is `api/_shared/videoRenderClient.js`.

## Environment variables

| Name | Default | Purpose |
| --- | --- | --- |
| `VIDEO_RENDER_SERVICE_KEY` | required | Shared secret for every authenticated route |
| `VIDEO_RENDER_WORKDIR` | `/var/tmp/video-render` | Per-request scratch directories |
| `VIDEO_RENDER_COMMAND_TIMEOUT` | `120` | Seconds per ffmpeg command and blob transfer |
| `PORT` | `8080` | Listen port |

The App Service needs `VIDEO_RENDER_SERVICE_URL` and the same
`VIDEO_RENDER_SERVICE_KEY`; `VIDEO_RENDER_TIMEOUT_MS` (default `180000`) bounds
each call.

## Deployment

`.github/workflows/video-render-service.yml` builds the image in ACR and updates
the Container App named by the `AZURE_VIDEO_RENDER_CONTAINER_APP` secret. The
app runs in the same environment as the ppt-master sidecar, pulls from ACR with
the environment identity, and its ingress only allows the App Service outbound
IPs.

## Local development

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
$env:VIDEO_RENDER_SERVICE_KEY = "dev-secret"
.venv\Scripts\python smoke.py
.venv\Scripts\python -m uvicorn app.main:app --port 8080
```

`smoke.py` also runs during `docker build`. It encodes a red-then-blue clip,
asserts the extracted last frame is blue at the source size, and drives the HTTP
routes with blob transfer replaced by local copies.
