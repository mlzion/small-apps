#!/usr/bin/env python3
"""Build DruMidi.sf2 from the repository's unchanged MP3s (Python 3 + FFmpeg).

SPDX-License-Identifier: MIT
SF2 format reference: https://www.synthfont.com/SFSPEC21.PDF
No third-party SoundFont encoder or sample-player code is included.
"""
import argparse
import array
import sys
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import subprocess

HEADROOM_DB = -3.0
HEADROOM_GAIN = 10 ** (HEADROOM_DB / 20)
HERE = Path(__file__).resolve().parent
# MIDI numbers, not DAW-specific octave labels.
NAMES = [
    'Acoustic Bass Drum', 'Bass Drum 1', 'Side Stick', 'Acoustic Snare',
    'Hand Clap', 'Electric Snare', 'Low Floor Tom', 'Closed Hi-Hat',
    'High Floor Tom', 'Pedal Hi-Hat', 'Low Tom', 'Open Hi-Hat',
    'Low-Mid Tom', 'Hi-Mid Tom', 'Crash Cymbal 1', 'High Tom', 'Ride Cymbal 1',
    'Chinese Cymbal', 'Ride Bell', 'Tambourine', 'Splash Cymbal', 'Cowbell',
    'Crash Cymbal 2', 'Vibraslap', 'Ride Cymbal 2', 'Hi Bongo', 'Low Bongo',
    'Mute Hi Conga', 'Open Hi Conga', 'Low Conga', 'High Timbale', 'Low Timbale',
    'High Agogo', 'Low Agogo', 'Cabasa', 'Maracas', 'Short Whistle',
    'Long Whistle', 'Short Guiro', 'Long Guiro', 'Claves', 'Hi Wood Block',
    'Low Wood Block', 'Mute Cuica', 'Open Cuica', 'Mute Triangle', 'Open Triangle',
]

def sha(data):
    return hashlib.sha256(data).hexdigest()

def chunk(tag, data):
    return tag.encode('ascii') + struct.pack('<I', len(data)) + data + b'\0' * (len(data) % 2)

def list_chunk(kind, chunks):
    return chunk('LIST', kind.encode('ascii') + b''.join(chunks))

def text_chunk(tag, value):
    raw = value.replace('©', '(c)').encode('ascii', errors='replace') + b'\0'
    # INFO strings have even sizes, including their terminating null(s).
    return chunk(tag, raw + b'\0' * (len(raw) % 2))

def name20(value):
    return value.encode('ascii')[:19].ljust(20, b'\0')

def gen(operator, amount):
    return struct.pack('<HH', operator, amount & 0xffff)

def decode(path):
    info = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries',
        'stream=sample_rate,channels', '-of', 'json', str(path),
    ]))['streams'][0]
    if int(info['channels']) != 1:
        raise ValueError(f'{path}: expected original mono sample; refusing to downmix')
    # MP3 reconstruction overshoots exceed full scale in several source files.
    # One fixed gain for the entire kit avoids clipping without per-note normalization.
    raw = subprocess.check_output(['ffmpeg','-v','error','-nostdin','-i',str(path),
                                   '-map','0:a:0','-c:a','pcm_f32le','-f','f32le','pipe:1'])
    values=array.array('f');values.frombytes(raw)
    if sys.byteorder!='little':values.byteswap()
    peak=max(map(abs,values))
    if peak*HEADROOM_GAIN>=1:raise ValueError(f'{path}: fixed headroom insufficient')
    # No -ar, -ac, per-note normalization, trimming, EQ, fades or lossy re-encoding.
    pcm = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-nostdin', '-i', str(path), '-map', '0:a:0',
        '-af', 'volume=-3dB:precision=double', '-c:a', 'pcm_s16le', '-f', 's16le', 'pipe:1',
    ])
    if len(pcm) % 2 or len(pcm) < 128:
        raise ValueError(f'{path}: invalid PCM decode')
    return pcm, int(info['sample_rate']), peak

def build(samples, output):
    if output.is_relative_to(samples):
        raise ValueError('Output must be outside the original samples directory')
    manifest = json.loads((samples / 'manifest.json').read_text())
    license_text = (samples / 'LICENSE.txt').read_text()
    if set(manifest) != {str(n) for n in range(35, 82)}:
        raise ValueError('Expected exactly the 47 source manifest entries 35-81')
    sample_data, headers, zones, rows = bytearray(), [], [], []
    # One instrument-level global zone. Zero-delay/instant attack protect transients;
    # no sustain attenuation, and long release allows natural tails after short gates.
    global_generators = b''.join(gen(op, amount) for op, amount in [
        (8, 13500), (9, 0), (15, 0), (16, 0), (17, 0),
        (33, -32768), (34, -32768), (35, -32768), (36, -12000),
        (37, 0), (38, 8000), (48, 0),
    ])
    # Override velocity->filter with zero amount, for both SF2 and FluidSynth's
    # historic polarity variant; retain the standard velocity->volume modulator.
    modulators = b''.join(struct.pack('<HHhHH', 0x0102, 8, 0, secondary, 0)
                          for secondary in (0x0d02, 0x0c02, 0x0502))
    bags = [struct.pack('<HH', 0, 0)]
    generator_count = len(global_generators) // 4
    for midi in range(35, 82):
        entry = manifest[str(midi)]
        if entry['file'] != f'{midi}.mp3':
            raise ValueError(f'Unexpected source filename for note {midi}')
        source = samples / entry['file']
        if sha(source.read_bytes()) != entry['sha256']:
            raise ValueError(f'Source hash mismatch: {source}')
        pcm, rate, peak = decode(source)
        frames = len(pcm) // 2
        start, end = len(sample_data) // 2, len(sample_data) // 2 + frames
        sample_data.extend(pcm)
        sample_data.extend(b'\0' * 46 * 2)  # SF2 interpolation guard, never played
        # Preserve the app's playbackRate using integer cents, without touching PCM.
        cents = round(1200 * math.log2(entry['rate']))
        if abs(1200 * math.log2(entry['rate']) - cents) > 1e-6:
            raise ValueError(f'Non-integer tuning in source note {midi}')
        coarse = math.trunc(cents / 100)
        fine = cents - coarse * 100
        title = f'{midi} {NAMES[midi - 35]}'
        headers.append(struct.pack('<20sIIIIIBbHH', name20(title), start, end,
                                   start + 8, end - 8, rate, midi, 0, 0, 1))
        bags.append(struct.pack('<HH', generator_count, len(modulators) // 10))
        settings = [
            (43, midi | (midi << 8)), (44, 1 | (127 << 8)),
            (51, coarse), (52, fine), (54, 0), (56, 0),
            (57, 1 if midi in (42, 44, 46) else 0), (58, midi),
            (53, midi - 35),  # sampleID must be last in a local zone
        ]
        zone = b''.join(gen(op, amount) for op, amount in settings)
        zones.append(zone)
        generator_count += len(settings)
        rows.append(dict(note=midi, name=NAMES[midi-35], source=entry['file'],
                         source_sha256=entry['sha256'], pcm_sha256=sha(pcm),
                         frames=frames, sample_rate=rate, source_float_peak=peak, tuning_cents=cents,
                         duration_seconds=round(frames / rate / entry['rate'], 6),
                         exclusive_class=1 if midi in (42,44,46) else 0))
    bags.append(struct.pack('<HH', generator_count, len(modulators) // 10))
    end = len(sample_data) // 2
    headers.append(struct.pack('<20sIIIIIBbHH', name20('EOS'), end, end, end, end,
                               0, 0, 0, 0, 0))
    # Two aliases of ONE kit, sharing the same instrument and sample pool.
    phdr = b''.join(struct.pack('<20sHHHIII', name20(name), 0, bank, bag, 0, 0, 0)
                    for name, bank, bag in [('DruMidi GM Drums',128,0),
                                            ('DruMidi Compat',0,1)])
    phdr += struct.pack('<20sHHHIII', name20('EOP'), 0, 0, 2, 0, 0, 0)
    pdta = list_chunk('pdta', [
        chunk('phdr', phdr),
        chunk('pbag', b''.join(struct.pack('<HH',i,0) for i in range(3))),
        chunk('pmod', b'\0'*10), chunk('pgen', gen(41,0)*2 + gen(0,0)),
        chunk('inst', struct.pack('<20sH',name20('DruMidi acoustic'),0) +
              struct.pack('<20sH',name20('EOI'),48)),
        chunk('ibag', b''.join(bags)),
        chunk('imod', modulators + b'\0'*10),
        chunk('igen', global_generators + b''.join(zones) + gen(0,0)),
        chunk('shdr', b''.join(headers)),
    ])
    info = list_chunk('INFO', [
        chunk('ifil', struct.pack('<HH',2,1)), text_chunk('isng','EMU8000'),
        text_chunk('INAM','DruMidi'), text_chunk('ICRD','2026-11-12'),
        text_chunk('IENG','DruMidi / App Lab contributors'),
        text_chunk('ICOP','FluidR3: Copyright (c) 2000-2002, 2008 Frank Wen; (c) 2008 Toby Smithe. Data: (c) 2017 Srgy Surkv. MIT sample/data licenses; full notices in ICMT and LICENSE.txt.'),
        text_chunk('ICMT','FluidR3 GM standard kit via WebAudioFont MIT data; '
                   '47 MP3 decodes, fixed -3dB headroom (no peak clipping), notes 35-81; GM bank128/program0 '
                   'and bank0/program0 alias; see adjacent README.md and LICENSE.txt.\n\n'+license_text),
        text_chunk('ISFT','DruMidi build.py 1.0 / Python + FFmpeg'),
    ])
    body = b'sfbk' + info + list_chunk('sdta',[chunk('smpl',bytes(sample_data))]) + pdta
    sf2 = b'RIFF' + struct.pack('<I',len(body)) + body
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_bytes(sf2)
    output.with_name('SHA256SUMS').write_text(f'{sha(sf2)}  {output.name}\n')
    report = dict(format='SoundFont 2.01', file=output.name, bytes=len(sf2),
                  sha256=sha(sf2), presets=[dict(bank=128,program=0,name='DruMidi GM Drums'),
                                           dict(bank=0,program=0,name='DruMidi Compat')],
                  ffmpeg=subprocess.check_output(['ffmpeg','-version'],text=True).splitlines()[0],
                  sample_count=47, pcm_gain_db=HEADROOM_DB, pcm_format='signed 16-bit little-endian mono, original rate',
                  source_manifest_sha256=sha((samples/'manifest.json').read_bytes()), samples=rows)
    output.with_name('build-report.json').write_text(json.dumps(report,indent=2)+'\n')
    output.with_name('LICENSE.txt').write_text(license_text)
    print(f'Built {output}: {len(sf2):,} bytes; 47 notes, 2 preset aliases; SHA-256 {sha(sf2)}')

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--samples',type=Path,default=HERE.parents[1]/'drumidi'/'samples')
    parser.add_argument('--output',type=Path,default=HERE/'DruMidi.sf2')
    args=parser.parse_args()
    for tool in ('ffmpeg','ffprobe'):
        if not shutil.which(tool):parser.error(f'{tool} must be installed and on PATH')
    build(args.samples.resolve(),args.output.resolve())
