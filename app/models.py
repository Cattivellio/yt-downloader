from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl


class InfoRequest(BaseModel):
    url: HttpUrl


class PlaylistDownloadRequest(BaseModel):
    url: HttpUrl
    kind: str = Field("video", pattern="^(video|audio)$")
    quality: Optional[int] = Field(None, ge=1, le=4320)
    request_id: str = Field(..., min_length=4, max_length=64)


class FormatInfo(BaseModel):
    id: str
    label: str
    ext: str
    size_estimate: Optional[str] = None
    note: Optional[str] = None
    has_audio: bool = False
    vcodec: Optional[str] = None
    acodec: Optional[str] = None
    height: Optional[int] = None
    abr: Optional[float] = None


class VideoInfo(BaseModel):
    type: Literal["video"] = "video"
    id: str
    title: str
    platform: Literal["youtube", "instagram", "tiktok", "spotify", "unknown"] = "youtube"
    channel: str
    duration: int
    duration_string: str
    thumbnail: str
    view_count: Optional[int] = None
    upload_date: Optional[str] = None
    webpage_url: str
    video_formats: list[FormatInfo] = Field(default_factory=list)
    audio_formats: list[FormatInfo] = Field(default_factory=list)


class PlaylistEntry(BaseModel):
    id: str
    title: str
    channel: str
    duration: int
    duration_string: str
    thumbnail: str
    webpage_url: str


class PlaylistInfo(BaseModel):
    type: Literal["playlist"] = "playlist"
    id: str
    title: str
    platform: Literal["youtube", "instagram", "tiktok", "spotify", "unknown"] = "youtube"
    channel: str
    count: int
    entries: list[PlaylistEntry]
    webpage_url: str
    video_formats: list[FormatInfo] = Field(default_factory=list)
    audio_formats: list[FormatInfo] = Field(default_factory=list)


class BatchEntry(BaseModel):
    url: HttpUrl
    kind: Literal["video", "audio"] = "video"
    quality: Optional[int] = None
    title: Optional[str] = None


class BatchRequest(BaseModel):
    entries: list[BatchEntry]
    request_id: str = Field(min_length=4, max_length=64)
    zip_name: str = Field(default="download")


InfoResponse = VideoInfo | PlaylistInfo
