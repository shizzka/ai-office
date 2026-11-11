#!/usr/bin/env python3
"""Draw the OFFICE-6A pixel art. Run from any directory; requires Pillow."""
from pathlib import Path
import json, random
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'public'/'office-loft'; OUT.mkdir(parents=True,exist_ok=True)
W,H=960,600
P={'ink':'#242c32','edge':'#394348','steel':'#61777b','steelhi':'#95aaac','paper':'#e9e2c9','white':'#f7f0dc','brick':'#a85e49','brick2':'#ba7257','brickdark':'#884b3e','mortar':'#d29a78','wood':'#a66e48','woodhi':'#cf9765','wooddark':'#714b39','floor':'#b9906c','floor2':'#aa805f','floorhi':'#cba581','green':'#486c51','leaf':'#72966a','leafhi':'#a0b980','orange':'#df8650','yellow':'#ecc771','red':'#d65d57','blue':'#87b5bd','sky':'#b8d4d0','skyhi':'#d7e7d8','screen':'#253b42','teal':'#6db3a7','pink':'#d18d86','shadow':'#79634f','slate':'#52616a','roof':'#7a8380','cream':'#d6bd98','coffee':'#5e4033','grey':'#b6b8a9','darkgreen':'#364f40','purple':'#746c83','gold':'#b99859','rust':'#c27551','lightblue':'#cadfdb','darkfloor':'#8e6c53'}
C=lambda n:P[n]
def R(d,box,c): d.rectangle(box,fill=C(c))
def line(d,pts,c,w=1): d.line(pts,fill=C(c),width=w)
def box(d,x,y,w,h,c,edge='ink'): R(d,(x,y,x+w-1,y+h-1),edge); R(d,(x+2,y+2,x+w-3,y+h-3),c)
def text(d,x,y,s,c='ink',size=10):
    # Draw on a 1-bit mask to keep edges strictly pixel-sharp.
    f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',size)
    m=Image.new('1',(250,24)); ImageDraw.Draw(m).text((0,0),s,font=f,fill=1,stroke_width=0)
    d._image.paste(C(c),(x,y),m)
def label(d,x,y,s):
    w=len(s)*7+12; box(d,x,y,w,17,'cream','wooddark'); text(d,x+6,y+2,s,'ink',10)
def plant(d,x,y):
    R(d,(x+4,y+19,x+19,y+28),'wooddark');R(d,(x+6,y+20,x+17,y+26),'rust')
    for dx,dy in [(10,0),(3,5),(16,4),(8,9),(19,11)]:
        R(d,(x+dx,y+dy,x+dx+4,y+19),'darkgreen');R(d,(x+dx+1,y+dy+1,x+dx+3,y+dy+8),'leaf')
def monitor(d,x,y,kind='code',w=31):
    box(d,x,y,w,23,'screen'); R(d,(x+3,y+3,x+w-4,y+4),'steel')
    if kind=='chart':
        for i,h in enumerate((5,10,7,13)): R(d,(x+5+i*5,y+18-h,x+7+i*5,y+18),'teal' if i%2 else 'yellow')
    elif kind=='scheme':
        line(d,[(x+5,y+9),(x+w-7,y+9),(x+w-7,y+16)],'blue');box(d,x+8,y+7,6,5,'paper');box(d,x+w-10,y+14,6,5,'paper')
    else:
        for i in range(3): R(d,(x+5,y+7+i*4,x+15+(i%2)*6,y+8+i*4),'teal' if i!=1 else 'paper')
    R(d,(x+w//2-2,y+23,x+w//2+1,y+26),'ink');R(d,(x+w//2-6,y+26,x+w//2+5,y+27),'steel')
def desk(d,x,y,w=112):
    # The open middle is where the character is composited above the desk.
    R(d,(x+4,y+12,x+9,y+47),'wooddark');R(d,(x+w-10,y+12,x+w-5,y+47),'wooddark')
    R(d,(x,y,x+w,y+15),'ink');R(d,(x+2,y+2,x+w-2,y+11),'woodhi');R(d,(x+2,y+12,x+w-2,y+14),'wooddark')
    line(d,[(x+8,y+5),(x+w-8,y+5)],'wood');line(d,[(x+16,y+9),(x+42,y+9)],'wood')
def chair(d,x,y):
    R(d,(x-14,y-9,x+14,y+20),'wooddark');R(d,(x-12,y-7,x+12,y+14),'slate');R(d,(x-10,y-5,x+10,y-3),'steel');R(d,(x-2,y+17,x+2,y+27),'ink')
def board(d,x,y):
    box(d,x,y,109,62,'paper','wooddark');R(d,(x+4,y+4,x+104,y+56),'white')
    line(d,[(x+19,y+16),(x+85,y+16),(x+85,y+43)],'slate',2)
    for xx in (30,50,70):
        line(d,[(x+xx,y+16),(x+xx,y+35)],'slate');box(d,x+xx-4,y+25,8,9,'blue')
    box(d,x+79,y+39,12,9,'orange');R(d,(x+8,y+52,x+42,y+53),'teal')
def shelf(d,x,y):
    box(d,x,y,73,82,'wooddark');R(d,(x+5,y+6,x+67,y+74),'cream')
    for sy in (y+27,y+52,y+75): R(d,(x+3,sy,x+69,sy+3),'wooddark')
    for i,(c,s) in enumerate([('orange','ГОСТ'),('green','ПУЭ'),('slate','СП')]):
        xx=x+9+i*19; box(d,xx,y+7,16,20,c);R(d,(xx+3,y+11,xx+12,y+12),'paper');R(d,(xx+3,y+15,xx+10,y+16),'paper')
    for i in range(3):
        xx=x+9+i*20;box(d,xx,y+33,15,15,'slate');box(d,xx+3,y+36,9,9,'woodhi');box(d,xx+5,y+38,5,5,'slate')
    R(d,(x+9,y+61,x+30,y+71),'blue');R(d,(x+36,y+60,x+63,y+71),'paper')
def window(d):
    box(d,357,25,246,116,'wooddark');R(d,(362,30,597,135),'sky')
    R(d,(362,30,597,65),'skyhi');R(d,(362,92,597,135),'blue')
    # Petersburg rooftops, chimneys and distant spire.
    d.polygon([(362,112),(396,88),(428,102),(454,81),(485,102),(517,90),(550,103),(577,83),(597,93),(597,135),(362,135)],fill=C('roof'))
    for x,y in [(380,101),(447,93),(532,98),(568,92)]: R(d,(x,y-11,x+5,y+2),'slate')
    R(d,(507,51,509,96),'slate');d.polygon([(502,92),(508,57),(514,92)],fill=C('slate'))
    R(d,(475,30,481,135),'wooddark');R(d,(362,78,597,83),'wooddark');R(d,(354,137,606,143),'woodhi');R(d,(357,142,603,145),'wooddark')
def background():
    im=Image.new('RGB',(W,H),C('floor'));d=ImageDraw.Draw(im)
    R(d,(0,0,W-1,181),'brick')
    for y in range(0,182,18):
        R(d,(0,y,959,y+1),'mortar')
        for x in range(-36+(36 if (y//18)%2 else 0),960,72):
            R(d,(x,y+2,x+1,y+17),'mortar')
            if (x//72+y//18)%3==0: R(d,(x+5,y+4,x+35,y+5),'brick2')
            if (x//72+y//18)%4==0: R(d,(x+42,y+13,x+60,y+14),'brickdark')
    R(d,(0,177,959,185),'wooddark');R(d,(0,185,959,188),'woodhi')
    for y in range(189,600,28):
        R(d,(0,y,959,y+1),'floor2')
        for x in range(-95+(95 if (y//28)%2 else 0),960,190):
            R(d,(x,y+2,x+1,min(y+27,599)),'floor2');R(d,(x+12,y+5,x+39,y+5),'floorhi')
    # Wall fittings and zone identifiers.
    window(d);label(d,22,11,'DCM Lab');label(d,626,11,'job-hunter');label(d,789,11,'Сервер');label(d,340,176,'Инфобез');label(d,665,176,'Кухня')
    board(d,18,69);shelf(d,144,77)
    # Cabinet and pinned vacancies.
    box(d,631,43,123,93,'wood','wooddark')
    for xx,yy in [(641,54),(674,51),(707,57),(647,92),(687,89),(722,94)]:
        R(d,(xx,yy,xx+24,yy+27),'paper');R(d,(xx+11,yy+2,xx+13,yy+4),'red');R(d,(xx+4,yy+10,xx+18,yy+11),'slate');R(d,(xx+4,yy+15,xx+14,yy+16),'grey')
    # Server rack and tidy cable tray (the blinking lights are overlays).
    box(d,806,44,75,105,'steel');R(d,(812,51,874,140),'screen')
    for yy in (55,73,91,109,127): box(d,816,yy,54,14,'slate');R(d,(820,yy+4,849,yy+5),'ink');R(d,(820,yy+9,845,yy+10),'ink')
    R(d,(880,111,919,115),'steel');R(d,(914,114,919,173),'steel');R(d,(881,118,914,119),'ink')
    # Safe and kind warning.
    box(d,894,78,51,68,'slate');box(d,900,85,38,50,'steel');box(d,914,100,10,10,'ink');R(d,(917,103,920,106),'yellow')
    box(d,884,151,70,18,'paper');text(d,888,153,'НЕ ВЛЕЗАЙ', 'ink',8)
    # Kitchen counter and cooler.
    box(d,632,227,111,45,'wood');R(d,(636,229,739,234),'paper')
    box(d,643,201,27,28,'slate');R(d,(648,205,663,214),'ink');R(d,(651,217,660,224),'paper')
    box(d,697,211,24,17,'steel');R(d,(702,215,715,219),'screen')
    box(d,751,215,29,58,'steelhi');box(d,756,192,19,27,'blue');R(d,(760,196,770,211),'lightblue');R(d,(758,226,774,237),'screen');R(d,(762,228,766,231),'red');R(d,(770,228,774,231),'blue')
    # Door and Sania's testing station.
    box(d,888,234,58,104,'wooddark');R(d,(894,240,940,332),'wood');R(d,(900,246,934,310),'woodhi');R(d,(931,290,934,294),'yellow')
    text(d,898,224,'ВХОД','ink',9)
    # Seating arranged in two islands, with cross and horizontal circulation corridors.
    for x,y in [(73,272),(229,272),(385,272),(73,439),(229,439),(385,439),(565,439),(735,439),(877,439)]: chair(d,x,y)
    # Desks and equipment. Desks sit behind characters in the current renderer.
    for x,y,w in [(20,285,110),(176,285,110),(332,285,110),(20,452,110),(176,452,110),(332,452,110),(514,452,110),(684,452,110),(826,452,110)]: desk(d,x,y,w)
    monitor(d,25,255,'scheme',42); monitor(d,180,258,'code',29);monitor(d,211,258,'code',29)
    # Asya's checks and cactus.
    for i in range(3): R(d,(338+i*2,266-i*3,367+i*2,280-i*3),'paper');R(d,(342+i*2,268-i*3,359+i*2,268-i*3),'slate')
    plant(d,408,253)
    # Ivanych: two meters, Taya: tablet and colour sheets.
    box(d,26,426,20,23,'yellow');box(d,29,430,14,8,'screen');box(d,49,426,19,23,'orange');box(d,52,430,13,8,'screen')
    box(d,181,426,31,22,'screen');R(d,(185,430,206,440),'pink');R(d,(216,429,234,445),'paper');R(d,(219,432,231,435),'teal');R(d,(219,438,227,441),'orange')
    monitor(d,337,426,'code',25);monitor(d,364,420,'code',30);monitor(d,396,426,'code',25)
    # Infosec monitors; JH monitor and dog bed/bowl.
    monitor(d,519,423,'chart',38); box(d,577,430,25,18,'paper');R(d,(581,434,597,435),'teal')
    monitor(d,689,423,'chart',38); box(d,751,430,25,18,'paper');R(d,(755,434,771,435),'teal')
    box(d,833,430,23,19,'blue');R(d,(837,435,851,445),'paper');R(d,(841,438,846,442),'ink');box(d,890,418,22,30,'screen');R(d,(894,423,907,440),'paper');line(d,[(901,448),(895,455)],'ink',2);line(d,[(901,448),(907,455)],'ink',2)
    box(d,497,220,69,25,'wooddark');R(d,(501,224,562,240),'cream');R(d,(507,227,556,234),'woodhi');box(d,570,230,19,11,'steelhi');R(d,(574,232,584,234),'blue')
    # Cable coils, plants and floor details, kept outside route centre lines.
    for xx in (13,41):
        box(d,xx,209,22,25,'ink');box(d,xx+4,213,14,17,'woodhi');box(d,xx+8,217,6,9,'ink')
    plant(d,922,474);plant(d,4,533)
    # Ceiling pendants and little workshop details; all flat, integer pixels.
    for x in (228, 685):
        R(d,(x,0,x+2,26),'ink');R(d,(x-11,26,x+13,29),'ink')
        R(d,(x-9,24,x+11,27),'steel');R(d,(x-6,30,x+8,32),'yellow')
    # A warm mat marks the shared work area without crossing the main aisle.
    R(d,(483,195,613,198),'wooddark');R(d,(483,199,486,257),'wooddark');R(d,(610,199,613,257),'wooddark')
    R(d,(483,258,613,261),'wooddark');R(d,(487,199,609,257),'cream')
    for y in range(204,255,8): R(d,(493,y,603,y+1),'woodhi')
    # Pins, rolls of drawings and a tool rail make the DCM corner recognisable.
    R(d,(18,154,218,157),'steel');
    for x in (28,46,64,82,100):
        R(d,(x,158,x+2,169),'ink');R(d,(x-2,168,x+4,171),'orange' if x%3 else 'yellow')
    box(d,231,150,15,23,'paper');box(d,249,152,15,21,'paper');R(d,(235,154,241,155),'blue');R(d,(253,156,259,157),'blue')
    return im

def save_layer(name,size,drawfn):
    im=Image.new('RGBA',size,(0,0,0,0)); drawfn(ImageDraw.Draw(im)); im.save(OUT/name,optimize=True)
def layers():
    def panel(d,red):
        box(d,0,0,75,90,'steel');box(d,5,6,65,77,'paper');R(d,(10,22,64,25),'steel')
        for i in range(6):
            x=12+i*8;box(d,x,27,7,22,'grey');R(d,(x+2,32+(5 if red and i==4 else 0),x+4,37+(5 if red and i==4 else 0)),'ink')
        R(d,(10,58,64,61),'steel')
        for i in range(5): box(d,12+i*10,63,9,12,'white');R(d,(14+i*10,67,17+i*10,69),'slate')
        R(d,(56,10,63,17),'red' if red else 'green');R(d,(58,12,61,15),'orange' if red else 'leafhi')
    for red in (False,True): save_layer('panel-'+('red' if red else 'green')+'.png',(75,90),lambda d,r=red:panel(d,r))
    def red_off(d):
        panel(d, True); R(d,(56,10,63,17),'brickdark')
    save_layer('panel-red-off.png',(75,90),red_off)
    for frame in range(2):
        def leds(d,f=frame):
            for i,yy in enumerate((0,18,36,54,72)):
                R(d,(0,yy,4,yy+3),'teal' if (i+f)%2 else 'leafhi');R(d,(7,yy,10,yy+3),'yellow' if (i+f)%2 else 'green')
        save_layer(f'rack-lights-{frame}.png',(11,76),leds)
    # Transparent overlays over the fixed window. Rain / birds are alternate states.
    for frame in range(2):
        def rain(d,f=frame):
            for i in range(24):
                x=4+(i*37)%226; y=4+((i*29+f*8)%90)
                if 110<x<121 or 48<y<55: continue
                line(d,[(x,y),(x-2,y+5)],'lightblue')
        save_layer(f'window-rain-{frame}.png',(236,106),rain)
    for frame in range(2):
        def bird(d,f=frame):
            for x,y in [(42+f*9,23),(157-f*7,38)]:
                line(d,[(x,y),(x+3,y+2),(x+6,y)],'slate')
        save_layer(f'window-gulls-{frame}.png',(236,106),bird)
    def llama(d):
        R(d,(2,12,18,22),'paper');R(d,(4,8,8,16),'paper');R(d,(2,4,8,11),'paper');R(d,(3,1,4,5),'paper');R(d,(8,2,9,8),'paper');R(d,(1,9,3,11),'wooddark');R(d,(6,7,7,8),'ink');R(d,(5,22,7,26),'wooddark');R(d,(15,22,17,26),'wooddark');R(d,(9,13,16,17),'orange');R(d,(10,15,15,16),'teal')
    save_layer('llama.png',(20,27),llama)

if __name__=='__main__':
    background().save(ROOT/'public'/'office-bg-loft.png',optimize=True);layers()
