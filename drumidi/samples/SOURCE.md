# Bundled acoustic kit

FluidR3 GM standard percussion, General MIDI notes 35–81. Original soundfont by Frank Wen and contributors; MIT licensed. WebAudioFont **data** is also MIT licensed (the separate WebAudioFont player is GPL and is not included). Full notices are in LICENSE.txt.

Source: https://github.com/surikov/webaudiofontdata/tree/23ca907d4370a04fd89ca483a92915e4d6159ab9/sound

Each MP3 is the unmodified base64-decoded `file` field of `128{note}_0_FluidR3_GM_sf2_file.js`. No JavaScript from upstream is executed or bundled. Manifest includes original tuning and SHA-256 hashes. All samples belong to the same FluidR3 standard kit.

License verification:
- https://github.com/surikov/webaudiofontdata/blob/23ca907d4370a04fd89ca483a92915e4d6159ab9/LICENSE
- https://metadata.ftp-master.debian.org/changelogs/main/f/fluid-soundfont/fluid-soundfont_3.1-5.3_copyright
- https://github.com/surikov/webaudiofont/blob/master/LICENSE.md (player investigated; not used)

Retrieved 2026-11-11. To reproduce, decode the file field and apply playbackRate = 2 ** ((note * 100 - originalPitch + coarseTune * 100 + fineTune) / 1200).
