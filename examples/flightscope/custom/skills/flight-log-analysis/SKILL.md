---
name: flight-log-analysis
description: Work with drone flight logs (PX4 ULog, ArduPilot .bin/.tlog), camera video and model detections, including time sync.
---
# Flight log analysis

## Formats and libraries
- PX4 ULog: `pyulog` (`ULog(path).data_list`; timestamps are microseconds since boot).
- ArduPilot `.bin` / MAVLink `.tlog`: `pymavlink.mavutil.mavlink_connection(path)`.
- Video: PTS from `ffprobe`/PyAV; never assume constant frame rate.
- Detections: JSONL, one line per frame: `{"t": <autopilot time us>, "model": "...", "dets": [{"cls", "conf", "box"}], "latency_ms"}`.
- Visualization: write Rerun recordings (`rerun-sdk`) rather than building a viewer.

## Time sync (the hard part)
1. Best: detections logged with autopilot time by the onboard SDK.
2. Else: align GPS time (ULog `vehicle_gps_position.time_utc_usec`) with video creation time.
3. Else: manual offset, plus a check against a visible event (takeoff, sharp yaw).
Always report which method was used and the estimated error.

## Test data
PX4 SITL + Gazebo flights recorded under `product/examples/`; public sets such as VisDrone/UAVDT for real imagery (check licenses before committing any data).
