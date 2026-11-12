#!/usr/bin/env python3
"""Independently inspect SF2 tables/PCM and optionally render through libfluidsynth.
SPDX-License-Identifier: MIT
Python 3 standard library only; FFmpeg for --samples; FluidSynth for --render.
"""
import argparse
import array
import ctypes as C
import ctypes.util
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import sys

HERE=Path(__file__).resolve().parent

def require(condition,message):
    if not condition: raise ValueError(message)

def chunks(data,start,end):
    out=[];offset=start
    while offset<end:
        require(offset+8<=end,'Truncated RIFF chunk header')
        kind=data[offset:offset+4];size=struct.unpack_from('<I',data,offset+4)[0]
        a=offset+8;b=a+size
        require(b<=end,'RIFF chunk exceeds parent boundary')
        out.append((kind,a,b));offset=b+(size&1)
    require(offset==end,'Invalid RIFF alignment')
    return out

def inspect(path,samples):
    data=path.read_bytes()
    require(data[:4]==b'RIFF' and data[8:12]==b'sfbk','Not an SF2 RIFF/sfbk')
    require(struct.unpack_from('<I',data,4)[0]==len(data)-8,'Invalid RIFF size')
    sections={}
    for kind,a,b in chunks(data,12,len(data)):
        require(kind==b'LIST','Unexpected top-level chunk')
        name=data[a:a+4].decode();require(name not in sections,'Duplicate LIST')
        sections[name]={k.decode():data[x:y] for k,x,y in chunks(data,a+4,b)}
    require(set(sections)=={'INFO','sdta','pdta'},'Missing SF2 lists')
    require(struct.unpack('<HH',sections['INFO']['ifil'])==(2,1),'Not SF2 2.01')
    for tag,value in sections['INFO'].items():
        if tag!='ifil':require(len(value)<=(65536 if tag=='ICMT' else 256) and value.endswith(b'\0'),f'Invalid INFO {tag} size or termination')
    pd=sections['pdta'];pcm=sections['sdta']['smpl']
    require(list(pd)==['phdr','pbag','pmod','pgen','inst','ibag','imod','igen','shdr'],'Invalid hydra table order')
    def table(tag,fmt):
        size=struct.calcsize(fmt);require(len(pd[tag])%size==0,f'Invalid {tag} record size')
        return list(struct.iter_unpack(fmt,pd[tag]))
    ph=table('phdr','<20sHHHIII');pb=table('pbag','<HH');pg=table('pgen','<HH')
    inst=table('inst','<20sH');ib=table('ibag','<HH');ig=table('igen','<HH')
    sh=table('shdr','<20sIIIIIBbHH');im=table('imod','<HHhHH');pm=table('pmod','<HHhHH')
    require(len(ph)==3 and len(pb)==3 and len(pg)==3,'Expected two preset aliases')
    require({(p[2],p[1]) for p in ph[:-1]}=={(128,0),(0,0)},'Incorrect bank/program')
    require(ph[-1][0].rstrip(b'\0')==b'EOP','Missing EOP')
    require(len(inst)==2 and inst[-1][0].rstrip(b'\0')==b'EOI','Missing EOI')
    require(len(sh)==48 and sh[-1][0].rstrip(b'\0')==b'EOS','Expected 47 samples and EOS')
    require(len(ib)==49 and inst[-1][1]==48,'Expected global + 47 sample zones')
    require(pb[-1]==(len(pg)-1,len(pm)-1),'Preset terminal indices')
    require(ib[-1]==(len(ig)-1,len(im)-1),'Instrument terminal indices')
    for i in range(2):
        require(ph[i][3]==i and pg[pb[i][0]]==(41,0),'Preset does not reference kit instrument')
    for first,last in zip(ib,ib[1:]):
        require(first[0]<=last[0]<=len(ig)-1 and first[1]<=last[1]<=len(im)-1,'Bad instrument indices')
    global_zone=dict(ig[ib[0][0]:ib[1][0]])
    require(global_zone[37]==0 and global_zone[38]==8000,'Incorrect one-shot envelope')
    require(global_zone[33]==32768 and global_zone[34]==32768,'Delayed attack')
    require(all(m[2]==0 for m in im),'Unexpected nonzero custom modulation')
    require(any(m[:2]==(0x0102,8) and m[3]==0x0c02 for m in im),'Missing velocity/filter override')
    source=json.loads((samples/'manifest.json').read_text()) if samples else None
    mappings=[]
    for index in range(47):
        zone=ig[ib[index+1][0]:ib[index+2][0]];g=dict(zone);note=index+35
        require(len(g)==len(zone),'Duplicate generator')
        require(zone[0]==(43,note|(note<<8)) and zone[-1]==(53,index),f'Wrong mapping for note {note}')
        require(g[44]==0x7f01 and 47 not in g,'Velocity not preserved')
        require(g[54]==0 and g[56]==0 and g[58]==note,'Looping or root-key transposition')
        require(g[57]==(1 if note in (42,44,46) else 0),'Incorrect choke class')
        header=sh[index];name,start,end,loopa,loopb,rate,root,correction,link,kind=header
        require(0<=start<loopa<loopb<end and end+46<=len(pcm)//2,'Invalid sample offsets/guard')
        require(pcm[end*2:(end+46)*2]==b'\0'*92,'Missing 46-frame guard')
        require(root==note and correction==0 and link==0 and kind==1,'Incorrect sample metadata')
        require(rate==44100,'Unexpected original sample rate')
        def signed(value):return value-65536 if value>32767 else value
        cents=100*signed(g[51])+signed(g[52])
        if source:
            entry=source[str(note)];mp3=samples/entry['file']
            require(hashlib.sha256(mp3.read_bytes()).hexdigest()==entry['sha256'],'Source MP3 hash mismatch')
            decoded=subprocess.check_output(['ffmpeg','-v','error','-nostdin','-i',str(mp3),'-map','0:a:0','-af','volume=-3dB:precision=double','-c:a','pcm_s16le','-f','s16le','pipe:1'])
            require(pcm[start*2:end*2]==decoded,f'PCM mismatch on {note}')
            require(abs(cents-1200*math.log2(entry['rate']))<1e-6,f'Tuning mismatch on {note}')
        mappings.append(dict(note=note,name=name.rstrip(b'\0').decode(),frames=end-start,tuning_cents=cents))
    for note,label in {36:'Bass Drum',38:'Acoustic Snare',42:'Closed Hi-Hat',46:'Open Hi-Hat',49:'Crash Cymbal',51:'Ride Cymbal'}.items():
        require(label in mappings[note-35]['name'],f'Incorrect GM identity: {note}')
    print('PASS: RIFF/SF2 tables, bank 128/0 aliases, all 47 notes, velocity ranges, tuning, one-shots, hats and PCM integrity')
    return dict(sf2_sha256=hashlib.sha256(data).hexdigest(),structure='pass',pcm_source_comparison=bool(source),uniform_pcm_headroom_db=-3,samples=mappings)

class Synth:
    def __init__(self,path):
        library=ctypes.util.find_library('fluidsynth')
        if not library:raise RuntimeError('libfluidsynth is not installed')
        self.lib=C.CDLL(library)
        signatures={
            'new_fluid_settings':(C.c_void_p,[]),
            'fluid_settings_setnum':(C.c_int,[C.c_void_p,C.c_char_p,C.c_double]),
            'fluid_settings_setint':(C.c_int,[C.c_void_p,C.c_char_p,C.c_int]),
            'new_fluid_synth':(C.c_void_p,[C.c_void_p]),
            'fluid_synth_sfload':(C.c_int,[C.c_void_p,C.c_char_p,C.c_int]),
            'fluid_synth_program_select':(C.c_int,[C.c_void_p,C.c_int,C.c_int,C.c_int,C.c_int]),
            'fluid_synth_noteon':(C.c_int,[C.c_void_p,C.c_int,C.c_int,C.c_int]),
            'fluid_synth_noteoff':(C.c_int,[C.c_void_p,C.c_int,C.c_int]),
            'fluid_synth_all_sounds_off':(C.c_int,[C.c_void_p,C.c_int]),
            'fluid_synth_write_float':(C.c_int,[C.c_void_p,C.c_int,C.c_void_p,C.c_int,C.c_int,C.c_void_p,C.c_int,C.c_int]),
            'fluid_version_str':(C.c_char_p,[]),
            'delete_fluid_synth':(None,[C.c_void_p]),'delete_fluid_settings':(None,[C.c_void_p]),
        }
        for name,(result,args) in signatures.items():
            f=getattr(self.lib,name);f.restype=result;f.argtypes=args
        self.settings=self.lib.new_fluid_settings()
        self.lib.fluid_settings_setnum(self.settings,b'synth.sample-rate',44100.0)
        self.lib.fluid_settings_setnum(self.settings,b'synth.gain',0.2)
        self.lib.fluid_settings_setint(self.settings,b'synth.reverb.active',0)
        self.lib.fluid_settings_setint(self.settings,b'synth.chorus.active',0)
        self.synth=self.lib.new_fluid_synth(self.settings)
        require(bool(self.synth),'FluidSynth init failed')
        self.sfid=self.lib.fluid_synth_sfload(self.synth,str(path.resolve()).encode(),0)
        require(self.sfid>=0,'FluidSynth rejected SF2')
        self.select(128)
    def select(self,bank):
        require(self.lib.fluid_synth_program_select(self.synth,9,self.sfid,bank,0)==0,'Preset selection failed')
    def on(self,n,v=100):
        require(self.lib.fluid_synth_noteon(self.synth,9,n,v)==0,f'Note-on rejected {n}')
    def off(self,n):self.lib.fluid_synth_noteoff(self.synth,9,n)
    def render(self,seconds):
        count=round(seconds*44100);left=(C.c_float*count)();right=(C.c_float*count)()
        require(self.lib.fluid_synth_write_float(self.synth,count,left,0,1,right,0,1)==0,'Render failed')
        return [(a+b)*.5 for a,b in zip(left,right)]
    def reset(self):
        self.lib.fluid_synth_all_sounds_off(self.synth,9);self.render(.03)
    def close(self):
        self.lib.delete_fluid_synth(self.synth);self.lib.delete_fluid_settings(self.settings)

def energy(audio):return sum(v*v for v in audio)/max(1,len(audio))

def compare_pitch(s,samples):
    manifest=json.loads((samples/'manifest.json').read_text())
    notes=sorted({36,38,42,46,49,51} | {int(n) for n,v in manifest.items() if v['rate']!=1})
    result={}
    for note in notes:
        raw=subprocess.check_output(['ffmpeg','-v','error','-nostdin','-i',str(samples/f'{note}.mp3'),'-c:a','pcm_s16le','-f','s16le','pipe:1'])
        x=array.array('h');x.frombytes(raw)
        if sys.byteorder!='little':x.byteswap()
        rate=manifest[str(note)]['rate'];s.reset();s.on(note,127);audio=s.render(.25)
        expected=[]
        for frame in range(len(audio)):
            position=frame*rate;index=int(position);fraction=position-index
            expected.append((x[index]*(1-fraction)+x[index+1]*fraction)/32768 if index+1<len(x) else 0)
        # Ignore engine block latency/gain and permit interpolation/filter phase delay.
        indices=range(256,len(audio)-256,4);reference=[expected[i] for i in indices]
        reference_energy=sum(v*v for v in reference);best=-1
        for lag in range(-128,129):
            actual=[audio[i+lag] for i in indices];power=sum(v*v for v in actual)
            correlation=sum(a*b for a,b in zip(actual,reference))/math.sqrt(power*reference_energy) if power*reference_energy else 0
            best=max(best,correlation)
        require(best>.9,f'Pitch/waveform reference mismatch on {note}: {best}')
        result[str(note)]=round(best,6)
    print('PASS: rendered waveform/pitch correlation > 0.9 for six required mappings and all source-tuned notes')
    return result

def render_tests(path,samples=None):
    s=Synth(path);levels={}
    try:
        for note in range(35,82):
            amplitudes=[]
            for velocity in (32,80,127):
                s.reset();s.on(note,velocity);a=s.render(.3)
                require(all(math.isfinite(v) for v in a),'Non-finite audio')
                amplitudes.append(energy(a));require(amplitudes[-1]>1e-12,f'Silent note {note}')
            require(amplitudes[0]<amplitudes[1]<amplitudes[2],f'Velocity response failed {note}')
            levels[str(note)]=amplitudes
        s.reset();s.on(49);s.render(.00625);s.off(49);tail=s.render(1)
        require(energy(tail[-4410:])>1e-9,'Short MIDI gate cut crash tail')
        s.reset();s.on(49);s.render(9.5);require(energy(s.render(.3))<1e-12,'Crash loops beyond sample end')
        # Compare isolated open-hat tail to identical playback cut by each closer.
        for closer in (42,44):
            s.reset();s.on(46);s.render(.2);s.on(closer);s.render(.9);choked=energy(s.render(.2))
            s.reset();s.on(46);s.render(1.1);natural=energy(s.render(.2))
            require(natural>1e-10 and choked<natural*.02,f'Hi-hat choke failed {closer}')
        correlation=compare_pitch(s,samples) if samples else {}
        s.select(0);s.reset();s.on(36);require(energy(s.render(.3))>1e-8,'Compatibility bank is silent')
        result=dict(engine='FluidSynth '+s.lib.fluid_version_str().decode(),
                    all_47_notes='audible at velocities 32/80/127',velocity='monotonic energy on all notes',
                    short_note_tail='pass',no_loop='pass',closed_and_pedal_hat_choke='pass',bank0_alias='pass',
                    note_energy=levels, reference_waveform_correlation=correlation)
        print('PASS: FluidSynth load; all 47 notes x 3 velocities; crash short gate/natural end; closed/pedal hat chokes; bank 0 alias')
        return result
    finally:s.close()

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('file',type=Path,nargs='?',default=HERE/'DruMidi.sf2')
    ap.add_argument('--samples',type=Path,help='Compare each embedded sample against a fresh decode of source MP3s')
    ap.add_argument('--render',action='store_true',help='Require and test libfluidsynth')
    ap.add_argument('--report',type=Path,help='Write validation results as JSON')
    args=ap.parse_args()
    try:
        result=inspect(args.file,args.samples)
        if args.render:result['synthesizer']=render_tests(args.file,args.samples)
        if args.report:args.report.write_text(json.dumps(result,indent=2)+'\n')
    except (ValueError,RuntimeError,OSError,subprocess.CalledProcessError) as e:
        sys.exit(f'VALIDATION FAILED: {e}')
