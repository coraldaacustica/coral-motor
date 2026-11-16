# parametros ISO 3382 das respostas ao impulso medidas (BRAS CR2, dodecaedro), por banda de oitava
import sys, json, glob, wave, struct, numpy as np
BANDS=[125,250,500,1000,2000,4000]
def lewav(fn):
    b=open(fn,'rb').read(); i=12; fmt=None
    while i<len(b):
        cid=b[i:i+4]; n=struct.unpack('<I',b[i+4:i+8])[0]; d=b[i+8:i+8+n]
        if cid==b'fmt ': fmt=struct.unpack('<HHIIHH',d[:16])
        if cid==b'data':
            tag,ch,fs,_,_,bits=fmt
            if tag==0xFFFE: tag=struct.unpack('<H',b[b.find(b'fmt ')+8+24:b.find(b'fmt ')+8+26])[0]
            if tag==3: x=np.frombuffer(d,'<f4' if bits==32 else '<f8')
            elif bits==16: x=np.frombuffer(d,'<i2')/32768
            elif bits==24: a=np.frombuffer(d,np.uint8).reshape(-1,3); x=((a[:,0].astype(np.int32)|(a[:,1].astype(np.int32)<<8)|(a[:,2].astype(np.int8).astype(np.int32)<<16)))/8388608
            else: x=np.frombuffer(d,'<i4')/2147483648
            return fs, x.reshape(-1,ch)[:,0].astype(float)
        i+=8+n+(n&1)
def banda(x,fs,fc,ordem=6):  # passa-banda de oitava, fase zero (modulo de Butterworth), no dominio da frequencia
    n=len(x); X=np.fft.rfft(x); f=np.fft.rfftfreq(n,1/fs); f[0]=1e-9
    fl,fu=fc/2**0.5,fc*2**0.5; H=1/np.sqrt((1+(fl/f)**(2*ordem))*(1+(f/fu)**(2*ordem)))
    return np.fft.irfft(X*H,n)
def regT(L,t,a,b):
    i0=np.argmax(L<=a); i1=np.argmax(L<=b)
    if L.min()>b or i1-i0<3: return np.nan
    p=np.polyfit(t[i0:i1+1],L[i0:i1+1],1); return -60/p[0]
def analisa(x,fs):
    pk=np.argmax(np.abs(x)); on=np.argmax(np.abs(x[:pk+1])>=np.abs(x[pk])*10**(-20/20))  # inicio: 20 dB abaixo do pico
    out={}
    for fc in BANDS:
        y=banda(x,fs,fc)[on:]; e=y*y
        # ruido de fundo: media dos ultimos 10 %; corte onde a envoltoria (janelas de 10 ms) chega a 5 dB acima do ruido... iterativo
        w=int(fs*0.01); m=e[:len(e)//w*w].reshape(-1,w).mean(1); noise=m[-len(m)//10:].mean(); Ldb=10*np.log10(m/m.max()); nd=10*np.log10(noise/m.max())
        k=np.argmax(Ldb<nd+10) if (Ldb<nd+10).any() else len(m)   # ponto 10 dB acima do ruido
        tc=k*w
        # compensacao da cauda cortada (ISO 3382-1): decaimento ajustado nos 10 dB antes do corte
        seg=slice(max(0,k-int(0.15*len(m[:k]))-3),k); tt=np.arange(len(m))*w/fs
        p=np.polyfit(tt[seg],Ldb[seg],1) if k>6 else (-60,0)
        A=m[k-1]*w if k>0 else 0; comp=A*(-10/np.log(10)/p[0])*fs/w/ (1) if p[0]<0 else 0   # integral da exponencial depois do corte, em amostras
        sch=np.cumsum((e[:tc]-0*noise)[::-1])[::-1]+comp; L=10*np.log10(sch/sch[0]); t=np.arange(tc)/fs
        # C50, C80, D50: corta no tempo (banda larga) e filtra cada parte
        def en(ms):
            n=on+int(fs*ms/1000); a=x.copy(); a[n:]=0; b_=x.copy(); b_[:n]=0
            ea=(banda(a,fs,fc)**2).sum(); eb=(banda(b_,fs,fc)[:on+tc]**2).sum()-noise*max(0,tc-(n-on)); return ea,eb
        e50,l50=en(50); e80,l80=en(80)
        out[fc]=dict(EDT=regT(L,t,0,-10),T20=regT(L,t,-5,-25),T30=regT(L,t,-5,-35),C50=10*np.log10(e50/l50),C80=10*np.log10(e80/l80),D50=100*e50/(e50+l50),faixa=float(-nd))
    return out
res={}
for fn in sorted(glob.glob(sys.argv[1]+'/CR2_RIR_LS*_Dodecahedron.wav')):
    k=fn.split('CR2_RIR_')[1].split('_Dodec')[0]; fs,x=lewav(fn); res[k]=analisa(x,fs)
json.dump(res,open('medido.json','w'),indent=0)
for par in ['EDT','T20','T30','C50','C80','D50','faixa']:
    print(par); 
    for k,v in res.items(): print(' ',k,' '.join(f'{v[f][par]:7.2f}' for f in BANDS))
    print('  media  ',' '.join(f'{np.nanmean([v[f][par] for v in res.values()]):7.2f}' for f in BANDS))
