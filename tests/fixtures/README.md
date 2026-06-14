# Test Fixtures

Place a short H.264 MP4 file at `sample.mp4` for E2E transcode coverage.

Recommended command:

```bash
ffmpeg -f lavfi -i testsrc=duration=2:size=640x360:rate=24 -pix_fmt yuv420p tests/fixtures/sample.mp4
```

Point Playwright or smoke tests at this file instead of uploading placeholder buffers when validating full transcode success.
