Kamva 1.1.0 turns the timeline into a proper video editor and fixes video playback and export.

## Download (Windows 10/11, 64-bit)

- **Kamva-Setup-1.1.0.exe**: installer with Start menu and desktop shortcuts; opens `.kamva` files
- **Kamva-1.1.0-portable.exe**: single file, no install needed
- macOS (Apple silicon, .zip) and Linux (.AppImage) builds are attached when those builds succeed

The builds aren't code-signed. If SmartScreen shows "Windows protected your PC", choose **More info → Run anyway**.

## Fixed

- **Videos now play and export properly.** In 1.0.0, video clips on a page stayed on one frame in the editor and the presenter, and exported MP4/WebM files showed a frozen first frame. Playback, the presenter and every exporter now show the right frame at every moment.
- Scrubbing a video no longer flashes black while it seeks.
- Page thumbnails and still exports show every element, with videos on their first frame.

## New: a real video timeline

- **Element tracks.** Every element on the current page gets its own track. Drag a bar to change when it appears; drag its edges to change when it starts and ends. Enter and exit animations show at the ends of the bar.
- **Video clips on the timeline.** Video bars show frame thumbnails and the waveform. Dragging an edge trims the clip itself; if the clip ends before its element, the last frame is held (shown hatched).
- **Split** the selected clips, or the whole page, at the playhead with **S** (**Shift+S** always splits the page). Videos continue seamlessly across the cut.
- **Clip toolbar** for the selected element: start, length, volume, sound fade in/out, speed presets (0.25×–4×), loop, detach audio, fit page to video.
- **Detach audio** moves a video's sound onto its own audio track.
- **Drag pages** on the timeline to reorder them, and **drop photos, videos or sounds** onto the timeline to add them as new pages or audio clips.
- **Snapping** to page edges, the playhead, other clips and clip ends; hold **Alt** to move freely. Unsnapped moves land on whole frames.
- **Transport:** previous/next frame (**,** and **.**, with **Shift** for one second), jump to start/end (**Home**/**End**), click the time to type one, zoom to fit.
- **Preview matches export:** page transitions play in the editor preview, elements that aren't on screen at the playhead are ghosted while the timeline is open, and video sound fades apply everywhere.
- Speed changes keep the pitch in exported videos.
- Pages that change over time show a film strip of frames across the page on the timeline.
