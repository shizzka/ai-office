const { createCanvas } = require("canvas");
const fs = require("fs"), path = require("path");

const W = 960, H = 600;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

// ── ПОЗИЦИИ (должны совпадать с drawOffice.ts) ────────────────────────────────
const WATER_COOLER_POS  = { x: 435, y: 440 };
const GAMING_AREA_POS   = { x: 600, y: 570 };
const MEETING_TABLE_POS = { x: 780, y: 420 };
const COUCH_POS         = { x: 805, y: 518 }; // совпадает со спавном Леночки

// Позиции совпадают с DESK_POSITIONS в drawOffice.ts (без смещения)
const DESKS = {
  vanya:           { x:140, y:310, type:"coordinator" },
  tema:            { x:310, y:310, type:"designer" },
  pushkin:         { x:140, y:445, type:"writer" },
  coder:           { x:310, y:445, type:"coder" },
  garik:           { x:140, y:575, type:"marketer" },
  stoyanov:        { x:310, y:575, type:"producer" },
  // gary (480,180) убран — стол у окна, ничей
  lider:           { x:480, y:310, type:"lead" },
  qa:              { x:480, y:445, type:"qa" },
  "tech-reviewer": { x:480, y:575, type:"techrev" },
  proshka:         { x:750, y:500, type:"publisher" },
  ded:             { x:770, y:240, type:"ded" },
};

// ── ПАЛИТРА — тёплое дерево ───────────────────────────────────────────────────
const P = {
  // стены
  wall:     "#1c1610", wallMid: "#211c14", wallLight: "#2a2218",
  ceiling:  "#0f0d08",
  // деревянный пол (светлый дуб)
  plankA:   "#c4944a", plankB:   "#b88840", plankEdge:"#8a6428",
  plankHi:  "#d4a858",
  // деревянные столы
  deskOak:  "#4a3218", deskOakHi:"#5a3e20", deskOakSh:"#2e1e0e",
  deskLeg:  "#2e1e0a", deskEdge: "#6a4a28",
  // окна
  winFrame: "#3a2a14", winSky:   "#08111e", winStar:  "#b8c8e0",
  // экраны
  monFrame: "#0e0e0e", monBlue:  "#061428", monGreen: "#061808",
  // растения
  pot:      "#5a3520", leaf:     "#1a4a1a", leafHi:   "#2a6a2a",
  // диван
  sofaBody: "#3a2820", sofaTop:  "#4a3428", sofaCush: "#5a3e30",
  sofaFeet: "#2a1a08",
  // кулер
  coolerB:  "#1e2830", coolerW:  "#0a1e34",
  // геймзона
  gameDesk: "#3a2010", tvFrame:  "#0e0e0e",
  ctrlBody: "#1a1a28",
  // книжная полка
  shelf:    "#3a2810", shelfDk:  "#281e08",
  // маркеры доски
  chalkW:   "#c8d0d8",
  // металл / техника
  metal:    "#2a2a38", metalHi:  "#3a3a50",
  // ковёр под митинг-столом
  rug:      "#1a1530", rugBrd:   "#2a2548",
};

// ── УТИЛИТЫ ───────────────────────────────────────────────────────────────────
const r = (x,y,w,h,c,a=1) => {
  ctx.globalAlpha = a;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
  ctx.globalAlpha = 1;
};
const radial = (x,y,r0,r1,c0,c1,a=1) => {
  const g = ctx.createRadialGradient(x,y,r0,x,y,r1);
  g.addColorStop(0,c0); g.addColorStop(1,c1);
  ctx.globalAlpha = a; ctx.fillStyle = g;
  ctx.fillRect(x-r1,y-r1,r1*2,r1*2);
  ctx.globalAlpha = 1;
};
const dot = (x,y,c,s=1) => { ctx.fillStyle=c; ctx.fillRect(Math.round(x),Math.round(y),s,s); };

// ─────────────────────────────────────────────────────────────────────────────
// 1. ФОН
// ─────────────────────────────────────────────────────────────────────────────
r(0,0,W,H,P.wall);
r(0,0,W,62,P.ceiling);
r(0,62,W,3,"#0a0806");

// ─────────────────────────────────────────────────────────────────────────────
// 2. ДЕРЕВЯННЫЙ ПОЛ — горизонтальные доски
// ─────────────────────────────────────────────────────────────────────────────
const FLOOR_Y = 65, PLANK_H = 18;
for (let row = 0; row * PLANK_H < H - FLOOR_Y + PLANK_H; row++) {
  const y0 = FLOOR_Y + row * PLANK_H;
  const col = row % 2 === 0 ? P.plankA : P.plankB;
  r(0, y0, W, PLANK_H, col);
  // Блик доски
  r(0, y0, W, 2, P.plankHi, 0.3);
  // Стык досок
  r(0, y0 + PLANK_H - 1, W, 1, P.plankEdge);
  // Текстура дерева — вертикальные прожилки
  for (let vx = (row*47)%60; vx < W; vx += 55 + (row*11)%30) {
    r(vx, y0, 1, PLANK_H - 1, P.plankEdge, 0.3);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ПОТОЛОЧНЫЕ СВЕТИЛЬНИКИ + ТЁПЛЫЙ СВЕТ НА ПОЛ
// ─────────────────────────────────────────────────────────────────────────────
[120, 290, 480, 660, 860].forEach(lx => {
  // Гроздь тёплого света
  radial(lx, 65, 0, 250, "rgba(255,200,80,0.12)", "rgba(0,0,0,0)");
  // Корпус
  r(lx-20, 2, 40, 10, "#1e1a10");
  r(lx-16, 12, 32, 5, "#2a2418");
  // Лампочки (тёплые)
  ["#ffe8a0","#ffd870","#ffcc50"].forEach((c,i) => {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(lx-8+i*8, 17, 3.5, 0, Math.PI*2); ctx.fill();
  });
  // Световой конус
  const cone = ctx.createLinearGradient(lx, 17, lx, 200);
  cone.addColorStop(0, "rgba(255,200,80,0.08)");
  cone.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(lx-16, 17); ctx.lineTo(lx-80, 200);
  ctx.lineTo(lx+80, 200); ctx.lineTo(lx+16, 17);
  ctx.closePath(); ctx.fill();
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. СТЕНЫ — деревянные панели внизу
// ─────────────────────────────────────────────────────────────────────────────
// Деревянный плинтус / панели на задней стене
r(0, 63, W, 120, P.wallMid);
r(0, 63, W, 2, "#0a0806");
r(0, 183, W, 3, P.deskOakSh);
// Вертикальные панели
for (let px = 0; px < W; px += 80) {
  r(px, 65, 1, 118, P.deskLeg, 0.5);
  r(px+2, 70, 76, 108, P.wallLight, 0.15);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ОКНА (задняя стена)
// ─────────────────────────────────────────────────────────────────────────────
const WINS = [70, 245, 430, 608, 810];
WINS.forEach(wx => {
  const wy=68, ww=95, wh=105;
  // Ночное небо
  r(wx,wy,ww,wh,P.winSky);
  // Звёзды
  for (let s=0; s<18; s++) {
    const sx=wx+3+(s*19+s*s*5)%(ww-6);
    const sy=wy+3+(s*13+s*7)%(wh-30);
    ctx.globalAlpha = 0.3+s%5*0.12;
    ctx.fillStyle = P.winStar;
    ctx.fillRect(sx, sy, s%4===0?2:1, s%4===0?2:1);
  }
  ctx.globalAlpha = 1;
  // Огни города (нижняя часть окна)
  for (let b=0; b<9; b++) {
    const bx=wx+3+b*10, bh=8+(b*9)%22;
    const hue = 200+b*18;
    r(bx, wy+wh-bh-2, 8, bh, `hsl(${hue},50%,${8+b%3*4}%)`);
    for (let fl=0; fl<4; fl++) {
      if ((b+fl)%2===0) {
        ctx.fillStyle="rgba(255,240,140,0.65)";
        ctx.fillRect(bx+1, wy+wh-bh+fl*5+2, 3, 3);
      }
    }
  }
  // Рама (дерево)
  const fw=4;
  r(wx-fw,wy-fw,ww+fw*2,fw,P.winFrame); r(wx-fw,wy+wh,ww+fw*2,fw,P.winFrame);
  r(wx-fw,wy-fw,fw,wh+fw*2,P.winFrame); r(wx+ww,wy-fw,fw,wh+fw*2,P.winFrame);
  r(wx+ww/2-1,wy,2,wh,P.winFrame); r(wx,wy+wh/2,ww,2,P.winFrame);
  // Блик стекла
  r(wx,wy,ww,wh,"rgba(140,180,255,0.04)");
  r(wx+2,wy+2,ww/3,wh/3,"rgba(200,220,255,0.06)");
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. ДОСКА
// ─────────────────────────────────────────────────────────────────────────────
{
  const bx=525,by=68,bw=115,bh=105;
  r(bx-5,by-5,bw+10,bh+10,P.winFrame);
  r(bx,by,bw,bh,"#0a1a0a");
  // Рисунок на доске
  ctx.strokeStyle=P.chalkW; ctx.lineWidth=1.5; ctx.globalAlpha=0.55;
  // Простая схема
  ctx.beginPath(); ctx.moveTo(bx+12,by+30); ctx.lineTo(bx+40,by+30); ctx.stroke();
  ctx.beginPath(); ctx.arc(bx+52,by+30,12,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx+64,by+30); ctx.lineTo(bx+95,by+30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx+40,by+30); ctx.lineTo(bx+40,by+55); ctx.stroke();
  // Текстовые строки
  [by+68,by+78,by+88].forEach((ly2,i) => {
    ctx.beginPath(); ctx.moveTo(bx+10,ly2); ctx.lineTo(bx+50+i*12,ly2); ctx.stroke();
  });
  ctx.globalAlpha=1;
  // Полочка
  r(bx,by+bh,bw,5,P.winFrame);
  [{c:"#d04040"},{c:"#4080d0"},{c:"#40a040"}].forEach(({c},i)=>r(bx+12+i*20,by+bh+1,8,3,c));
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. БИБЛИОТЕЧНЫЙ УГОЛ (ded: x:770, y:240)
// ─────────────────────────────────────────────────────────────────────────────
{
  const lx=695,ly=65,lw=120,lh=155;
  r(lx,ly,lw,lh,P.shelfDk);
  r(lx+3,ly+3,lw-6,lh-6,P.shelf);
  // 3 полки
  [50,95,138].forEach(sh => {
    r(lx+3,ly+sh,lw-6,5,P.deskOak);
    let bx2=lx+5, by2=ly+sh-42;
    const bkPal=["#8b2020","#205080","#207040","#806020","#604080","#206060","#803020","#208080"];
    for (let b=0; b<14 && bx2<lx+lw-8; b++) {
      const bw2=5+b%4*2; const bh2=30+b%3*6;
      r(bx2,by2+42-bh2,bw2,bh2,bkPal[b%bkPal.length]);
      r(bx2,by2+42-bh2,bw2,1,"rgba(255,255,255,0.1)");
      bx2+=bw2+1;
    }
  });
  // Рамка
  r(lx-2,ly-2,4,lh+4,P.deskEdge); r(lx+lw-2,ly-2,4,lh+4,P.deskEdge);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. СТОЛ-ФУНКЦИЯ (деревянный, с типом)
// ─────────────────────────────────────────────────────────────────────────────
function drawDesk(cx, cy, type) {
  // cy = ноги агента; стол ВЫШЕ агента (меньший y = дальше от зрителя = за агентом)
  // Агент стоит ПЕРЕД столом, его ноги видны под ножками
  const dw=120, dh=16, legH=12;

  const tx = cx-dw/2, ty = cy - 40; // столешница на 40px выше ног агента

  // Ножки (видны под передним краем)
  r(tx+5,      ty+dh+8, 6, legH, P.deskLeg);
  r(tx+dw-11,  ty+dh+8, 6, legH, P.deskLeg);
  // Тень под ножками
  r(tx+4, ty+dh+legH+6, dw-4, 5, "rgba(0,0,0,0.22)");
  // Передний край (видимая толщина стола)
  r(tx, ty+dh,   dw, 8, P.deskOakSh);
  r(tx, ty+dh,   dw, 2, P.deskLeg, 0.7);
  r(tx, ty+dh+2, dw, 6, P.deskOak, 0.65);
  // Столешница
  r(tx, ty, dw, dh, P.deskOak);
  r(tx, ty, dw, 2, P.deskEdge);        // задний (дальний) край
  r(tx, ty, 2, dh, P.deskEdge);        // левый бок
  r(tx+dw-2, ty, 2, dh, P.deskOakSh); // правая тень
  r(tx, ty+2, dw, dh-2, P.deskOakHi); // блик
  // Текстура дерева
  for (let vx=tx+10; vx<tx+dw-10; vx+=12) {
    r(vx, ty+2, 1, dh-4, P.deskLeg, 0.15);
  }

  // Предметы на столе — выше столешницы (отрицательные смещения от ty)

  switch(type) {
    case "coordinator": {
      // Ванечка — координатор: монитор с тасками + стикеры + планнер
      r(tx+26, ty-34, 42, 30, P.monFrame);
      r(tx+28, ty-32, 38, 26, "#081428");
      radial(tx+47, ty-19, 0, 24, "rgba(60,160,255,0.45)", "rgba(0,0,0,0)");
      // Канбан-колонки на экране
      ["rgba(255,80,80,0.6)","rgba(255,200,40,0.6)","rgba(40,220,100,0.6)"].forEach((c,i)=>{
        r(tx+30+i*12, ty-30, 10, 24, c, 0.3);
        r(tx+31+i*12, ty-28, 8, 5, c);
        r(tx+31+i*12, ty-21, 8, 5, c, 0.7);
      });
      r(tx+43, ty-4, 12, 5, P.monFrame); r(tx+38, ty-1, 22, 2, P.monFrame);
      // Стикеры (много!)
      [["#f0e040",tx+4,ty-22],["#40e0f0",tx+4,ty-10],["#f080c0",tx+4,ty+2],["#80f040",tx+88,ty-22],["#f0a040",tx+88,ty-10]].forEach(([c,sx,sy])=>{
        r(sx,sy,14,10,c); r(sx+1,sy+2,12,1,"rgba(0,0,0,0.25)"); r(sx+1,sy+4,8,1,"rgba(0,0,0,0.15)");
      });
      // Клавиатура
      r(tx+22, ty-2, 46, 5, "#1e1a10"); r(tx+23, ty-1, 44, 3, "#28240e");
      break;
    }
    case "designer": {
      // Тёма — дизайнер: 2 монитора разных цветов + графпланшет + стилус
      [-38, 16].forEach((ox,i)=>{
        r(tx+24+ox, ty-36, 38, 28, P.monFrame);
        r(tx+26+ox, ty-34, 34, 24, i===0?"#180820":"#080e1a");
        radial(tx+43+ox, ty-22, 0, 20, i===0?"rgba(220,60,255,0.5)":"rgba(0,220,255,0.4)", "rgba(0,0,0,0)");
        // Контент на экранах
        if(i===0){ // цветовые блоки (палитра)
          [[0,0,"#e04040"],[8,0,"#40a0e0"],[0,8,"#40e060"],[8,8,"#e0c040"]].forEach(([ox2,oy2,c])=>r(tx+28+ox2,ty-28+oy2,7,7,c));
        } else { // UI-макет
          r(tx+28,ty-32,30,5,"rgba(255,255,255,0.15)");
          r(tx+28,ty-24,14,12,"rgba(100,180,255,0.3)");
          r(tx+44,ty-24,12,5,"rgba(255,255,255,0.2)"); r(tx+44,ty-17,8,4,"rgba(255,255,255,0.15)");
        }
        r(tx+39+ox, ty-8, 14, 5, P.monFrame); r(tx+35+ox, ty-3, 22, 2, P.monFrame);
      });
      // Большой графпланшет
      r(tx+6, ty-6, 56, 9, "#140e1e"); r(tx+7, ty-5, 54, 6, "#0e0a18");
      r(tx+8, ty-4, 30, 4, "rgba(180,80,255,0.4)");
      // Стилус
      r(tx+68, ty-14, 2, 16, "#c8c0d8"); r(tx+67, ty-16, 4, 3, "#e070ff");
      // Цветные карандаши в стакане
      r(tx+88, ty-16, 14, 16, "#2a1e10");
      ["#e04040","#f0a020","#40c040","#4080f0","#c040c0","#40c0c0"].forEach((c,i)=>r(tx+89+i*2, ty-26, 2, 12, c));
      break;
    }
    case "writer": {
      // Пушкин — писатель: ретро-машинка + пачки бумаги + перо + чернила
      // Пишущая машинка
      r(tx+18, ty-28, 56, 22, "#1a1208"); r(tx+20, ty-26, 52, 18, "#221810");
      r(tx+22, ty-24, 48, 14, "#1a1208");
      // Клавиши машинки (3 ряда)
      [0,1,2].forEach(row=>{
        for(let k=0;k<8;k++) r(tx+24+k*6, ty-22+row*5, 4, 4, "#2e2010");
      });
      // Бумага торчит из машинки
      r(tx+32, ty-38, 24, 12, "#ece8d8"); r(tx+33, ty-36, 22, 3, "#ddd8c0");
      r(tx+35, ty-32, 18, 1, "rgba(0,0,0,0.2)"); r(tx+35, ty-29, 14, 1, "rgba(0,0,0,0.15)");
      // Стопка рукописей
      r(tx+4, ty-8, 12, 6, "#e8e0d0"); r(tx+5, ty-10, 10, 5, "#ece4d2"); r(tx+4, ty-12, 10, 4, "#e4dcc8");
      // Чернильница
      r(tx+88, ty-16, 12, 14, "#100820"); r(tx+89, ty-15, 10, 12, "#180c28");
      r(tx+90, ty-10, 8, 4, "rgba(100,60,200,0.5)");
      // Гусиное перо
      r(tx+92, ty-28, 2, 14, "#e8e0c0"); r(tx+91, ty-30, 4, 4, "#f0f0d0");
      ctx.strokeStyle="#c8b870"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(tx+93,ty-30); ctx.quadraticCurveTo(tx+98,ty-24,tx+93,ty-18); ctx.stroke();
      // Настольная лампа
      r(tx+76, ty-30, 3, 30, "#c0a848");
      r(tx+70, ty-36, 16, 8, "#d4b860"); r(tx+71, ty-34, 14, 5, "#ffe07a", 0.9);
      radial(tx+78, ty-30, 0, 32, "rgba(255,230,120,0.18)", "rgba(0,0,0,0)");
      break;
    }
    case "coder": {
      // Кодер — два широких монитора (зелёный код) + мини-сервер + механ. клава
      [-42, 16].forEach((ox,i)=>{
        r(tx+22+ox, ty-38, 46, 32, P.monFrame);
        r(tx+24+ox, ty-36, 42, 28, P.monGreen);
        radial(tx+45+ox, ty-22, 0, 26, "rgba(0,255,80,0.35)", "rgba(0,0,0,0)");
        for(let ln=0;ln<6;ln++){
          const ind=ln%4*5, w=16+ln%5*6;
          r(tx+26+ox+ind, ty-34+ln*4, w, 2, `rgba(${20+ln*20},255,${60+ln*15},${0.4+ln%3*0.15})`);
        }
        r(tx+40+ox, ty-8, 14, 5, P.monFrame); r(tx+35+ox, ty-3, 24, 2, P.monFrame);
      });
      // Механическая клавиатура (с подсветкой)
      r(tx+10, ty-3, 72, 7, "#18181e"); r(tx+11, ty-2, 70, 5, "#20202a");
      for(let k=0;k<10;k++) r(tx+13+k*7, ty-2, 5, 4, k%3===0?"#0040ff":k%3===1?"#00c040":"#8000ff", 0.4);
      // Мини-сервер рэк
      r(tx+86, ty-28, 20, 28, "#0e0e14"); r(tx+87, ty-27, 18, 4, "#1a1a24");
      [0,5,10,15,20].forEach(oy=>{
        r(tx+88,ty-26+oy,16,3,P.metal);
        dot(tx+100,ty-25+oy,oy%10===0?"#00ff80":"#4040ff",2);
      });
      break;
    }
    case "marketer": {
      // Гарик — маркетолог: монитор с аналитикой + 2 телефона + доска метрик
      r(tx+26, ty-34, 44, 30, P.monFrame); r(tx+28, ty-32, 40, 26, "#180808");
      radial(tx+48, ty-19, 0, 24, "rgba(255,50,50,0.4)", "rgba(0,0,0,0)");
      // Графики роста на экране
      ctx.strokeStyle="rgba(255,100,100,0.8)"; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(tx+30,ty-10); ctx.lineTo(tx+38,ty-18); ctx.lineTo(tx+46,ty-14); ctx.lineTo(tx+54,ty-22); ctx.lineTo(tx+62,ty-16); ctx.stroke();
      ctx.strokeStyle="rgba(60,200,255,0.7)"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(tx+30,ty-12); ctx.lineTo(tx+38,ty-16); ctx.lineTo(tx+46,ty-20); ctx.lineTo(tx+54,ty-18); ctx.lineTo(tx+62,ty-24); ctx.stroke();
      r(tx+44, ty-4, 12, 5, P.monFrame); r(tx+40, ty-1, 20, 2, P.monFrame);
      // Два телефона (вертикально)
      [[tx+4,ty-32],[tx+82,ty-32]].forEach(([sx,sy])=>{
        r(sx,sy,16,28,"#141418"); r(sx+1,sy+1,14,24,"#0a0a12");
        radial(sx+8,sy+12,0,10,"rgba(255,80,50,0.5)","rgba(0,0,0,0)");
        r(sx+3,sy+2,10,2,"rgba(255,255,255,0.08)"); // сенсор
      });
      // Стопка визиток
      r(tx+6, ty-4, 16, 3, "#e8e0d0"); r(tx+7, ty-6, 14, 3, "#ece4d2"); r(tx+8, ty-8, 12, 3, "#e4dcc8");
      break;
    }
    case "producer": {
      // Стоянов — продюсер: монитор с таймлайном + камера + микрофон + наушники
      r(tx+14, ty-36, 50, 30, P.monFrame); r(tx+16, ty-34, 46, 26, "#06060e");
      radial(tx+39, ty-21, 0, 26, "rgba(60,120,255,0.4)", "rgba(0,0,0,0)");
      // Таймлайн монтажа
      ["#4080ff","#ff8040","#40c060","#c040c0"].forEach((c,i)=>{
        r(tx+18, ty-30+i*5, 6+i*8, 3, c, 0.8);
        r(tx+26+i*8, ty-30+i*5, 24-i*4, 3, c, 0.5);
      });
      r(tx+35, ty-6, 12, 5, P.monFrame); r(tx+30, ty-1, 22, 2, P.monFrame);
      // Камера (чёрная, профессиональная)
      r(tx+72, ty-36, 34, 22, "#101018"); r(tx+74, ty-34, 30, 18, "#0a0a14");
      ctx.fillStyle="#4878a0"; ctx.beginPath(); ctx.arc(tx+89,ty-25,7,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#7ab0d0"; ctx.beginPath(); ctx.arc(tx+89,ty-25,3.5,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="#1a1a28"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(tx+89,ty-25,9,0,Math.PI*2); ctx.stroke();
      r(tx+100,ty-32,5,12,"#181820"); // видоискатель
      // Штатив
      r(tx+88, ty-14, 2, 14, "#202030");
      r(tx+82,ty-2,2,2,"#202030"); r(tx+94,ty-2,2,2,"#202030");
      // Наушники
      r(tx+4, ty-20, 6, 18, "#1a1a28"); r(tx+4, ty-22, 6, 5, "#1a1a28");
      r(tx+4, ty-5, 6, 5, "#1a1a28"); r(tx+5, ty-22, 4, 20, "#252530");
      break;
    }
    case "mentor": {
      // Гари — ментор/гуру: монитор + 2 телефона (съёмка) + кепка + кружка
      r(tx+30, ty-34, 46, 30, P.monFrame); r(tx+32, ty-32, 42, 26, "#0a0610");
      radial(tx+53, ty-19, 0, 26, "rgba(255,130,30,0.45)", "rgba(0,0,0,0)");
      // Контент-план/аналитика
      [8,13,18,23].forEach((oy,i)=>{ r(tx+34, ty-32+oy, 34-i*3, 3, `rgba(255,${100+i*30},30,${0.5+i*0.1})`); });
      r(tx+48, ty-4, 14, 5, P.monFrame); r(tx+43, ty-1, 24, 2, P.monFrame);
      // Телефон-штатив (горизонтальный, для записи)
      r(tx+4, ty-28, 22, 14, "#141418"); r(tx+5, ty-27, 20, 12, "#0a0a12");
      radial(tx+15, ty-21, 0, 8, "rgba(255,120,30,0.55)", "rgba(0,0,0,0)");
      r(tx+6, ty-14, 20, 3, "#181818"); // мини-штатив
      r(tx+10, ty-12, 4, 4, "#181818"); r(tx+16, ty-12, 4, 4, "#181818");
      // Кепка на краю стола
      r(tx+84, ty-14, 22, 10, "#1a1a20"); r(tx+82, ty-16, 26, 4, "#141418");
      r(tx+86, ty-18, 18, 3, "#1a1a20");
      // Кружка-термос
      r(tx+86, ty-14, 10, 12, "#4a3010"); r(tx+87, ty-13, 8, 10, "#5a3c14");
      r(tx+88, ty-10, 6, 2, "#e0a030", 0.8);
      break;
    }
    case "lead": {
      // Лид — техлид: 3 монитора (2 больших + ноутбук) + todo-список
      [-44, 14].forEach((ox,i)=>{
        r(tx+18+ox, ty-38, 44, 32, P.monFrame);
        r(tx+20+ox, ty-36, 40, 28, i===0?"#060810":"#060a08");
        radial(tx+40+ox, ty-22, 0, 24, i===0?"rgba(80,100,255,0.45)":"rgba(40,200,120,0.4)", "rgba(0,0,0,0)");
        // PR/diff-строки
        for(let ln=0;ln<6;ln++){
          const c = ln%2===0 ? `rgba(40,200,100,0.7)` : `rgba(255,80,80,0.6)`;
          r(tx+22+ox, ty-34+ln*4, 20+ln%3*8, 2, c);
        }
        r(tx+36+ox, ty-6, 14, 5, P.monFrame); r(tx+31+ox, ty-1, 24, 2, P.monFrame);
      });
      // Ноутбук (открытый)
      r(tx+54, ty-28, 30, 22, P.monFrame); r(tx+55, ty-27, 28, 18, "#04060a");
      radial(tx+69, ty-18, 0, 16, "rgba(60,160,255,0.4)", "rgba(0,0,0,0)");
      r(tx+53, ty-6, 32, 3, "#0e0e14");
      // Широкая клава
      r(tx+8, ty-2, 80, 6, "#10101a"); r(tx+9, ty-1, 78, 4, "#16162a");
      break;
    }
    case "qa": {
      // QA — монитор с баг-трекером + блокнот + красные маркеры + лупа
      r(tx+22, ty-36, 46, 30, P.monFrame); r(tx+24, ty-34, 42, 26, "#060e04");
      radial(tx+45, ty-21, 0, 26, "rgba(80,240,60,0.35)", "rgba(0,0,0,0)");
      // Баг-трекер
      [["#e04040","FAIL"],["#40e040","PASS"],["#e0e040","SKIP"],["#e04040","FAIL"]].forEach(([c],i)=>{
        dot(tx+26, ty-32+i*6, c, 4);
        r(tx+32, ty-31+i*6, 26, 2, c, 0.4);
      });
      r(tx+40, ty-6, 14, 5, P.monFrame); r(tx+36, ty-1, 22, 2, P.monFrame);
      // Толстый блокнот
      r(tx+76, ty-24, 22, 26, "#d8d0c0"); r(tx+77, ty-22, 20, 22, "#e8e0d0");
      r(tx+76, ty-24, 3, 26, "#c04030"); // спираль
      [0,5,10,15].forEach(oy=>{ r(tx+79,ty-20+oy,16,2,"rgba(0,0,0,0.2)"); });
      // Красная ручка + карандаш
      r(tx+80, ty-4, 2, 14, "#c03020"); r(tx+84, ty-6, 2, 14, "#e0c040");
      // Лупа
      r(tx+4, ty-20, 14, 14, "rgba(180,200,180,0.2)");
      ctx.strokeStyle="#c0b080"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(tx+11,ty-13,7,0,Math.PI*2); ctx.stroke();
      r(tx+16, ty-8, 2, 6, "#c0b080");
      break;
    }
    case "techrev": {
      // Технарь-электрик: мультиметр + электросхемы + паяльник + каска на столе
      // Мультиметр (большой, главный)
      r(tx+4, ty-38, 26, 36, "#181e16"); r(tx+5, ty-37, 24, 20, "#0e1208");
      // Дисплей мультиметра
      r(tx+6, ty-36, 22, 10, "#0a1006"); r(tx+7, ty-35, 20, 8, "#0e1a08");
      dot(tx+9,ty-33,"#40ff80",2); dot(tx+15,ty-33,"#40ff80",2); dot(tx+21,ty-33,"#40ff80",2);
      r(tx+8, ty-28, 20, 3, "#1a2018"); // поворотный переключатель
      ctx.fillStyle="#c0c8b8"; ctx.beginPath(); ctx.arc(tx+18,ty-26,3,0,Math.PI*2); ctx.fill();
      // Провода щупов (красный и чёрный)
      ctx.strokeStyle="#e02020"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(tx+10,ty-2); ctx.quadraticCurveTo(tx+6,ty+6,tx+2,ty+2); ctx.stroke();
      ctx.strokeStyle="#181818"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(tx+14,ty-2); ctx.quadraticCurveTo(tx+18,ty+6,tx+22,ty+2); ctx.stroke();
      // Монитор (схемы/чертежи)
      r(tx+36, ty-36, 46, 32, P.monFrame); r(tx+38, ty-34, 42, 28, "#060810");
      radial(tx+59, ty-20, 0, 24, "rgba(255,210,0,0.3)", "rgba(0,0,0,0)");
      // Электросхема на экране
      ctx.strokeStyle="rgba(255,220,40,0.7)"; ctx.lineWidth=1.5;
      ctx.beginPath();
      ctx.moveTo(tx+40,ty-20); ctx.lineTo(tx+48,ty-20); ctx.lineTo(tx+48,ty-26);
      ctx.lineTo(tx+56,ty-26); ctx.lineTo(tx+56,ty-20); ctx.lineTo(tx+68,ty-20); ctx.stroke();
      ctx.beginPath(); ctx.arc(tx+52,ty-26,3,0,Math.PI*2); ctx.stroke();
      r(tx+50, ty-6, 14, 5, P.monFrame); r(tx+46, ty-1, 22, 2, P.monFrame);
      // Паяльник
      r(tx+88, ty-30, 3, 32, "#c0a840"); r(tx+87, ty-32, 5, 4, "#808880");
      dot(tx+88,ty-34,"#ff6020",2); radial(tx+89,ty-32,0,14,"rgba(255,100,20,0.12)","rgba(0,0,0,0)");
      // Каска на краю стола
      r(tx+82, ty-20, 26, 12, "#ffc107"); r(tx+80, ty-22, 30, 4, "#ffca28");
      r(tx+84, ty-24, 22, 4, "#ffc107");
      break;
    }
    case "publisher": {
      // Прошка — публикатор/курьер: монитор + пачки конвертов + принтер + сканер
      r(tx+16, ty-34, 44, 28, P.monFrame); r(tx+18, ty-32, 40, 24, "#080808");
      radial(tx+38, ty-20, 0, 22, "rgba(200,200,255,0.35)", "rgba(0,0,0,0)");
      // Список рассылки на экране
      [0,5,10,15,20].forEach(oy=>{ r(tx+20, ty-30+oy, 34, 3, "rgba(180,180,255,0.3)"); r(tx+20,ty-30+oy,4,3,"rgba(100,200,255,0.5)"); });
      r(tx+34, ty-4, 12, 5, P.monFrame); r(tx+30, ty-1, 20, 2, P.monFrame);
      // Принтер/сканер (большой)
      r(tx+68, ty-28, 38, 22, "#181820"); r(tx+69, ty-27, 36, 6, "#20202c");
      r(tx+70, ty-20, 34, 2, "#2a2a3a"); r(tx+70, ty-16, 34, 10, "#141420");
      dot(tx+96,ty-26,"#40ff80",3); dot(tx+100,ty-26,"#4040ff",3);
      // Конверты разных цветов (стопки)
      [[tx+4,ty-28],[tx+4,ty-14]].forEach(([ex,ey],si)=>{
        [0,1,2,3].forEach(i=>{
          r(ex, ey+i*3, 26, 12, `hsl(${40+si*80+i*15},35%,${55-i*5}%)`);
          r(ex+1, ey+1+i*3, 24, 3, "rgba(255,255,255,0.12)");
        });
      });
      break;
    }
    case "ded": {
      // Дед — хранитель знаний: книги + настольная лампа + очки + большой том
      // Большой открытый том
      r(tx+10, ty-28, 50, 26, "#c8b890"); r(tx+11, ty-27, 24, 24, "#e8e0c8");
      r(tx+35, ty-27, 24, 24, "#ddd5b5");
      r(tx+33, ty-27, 4, 24, "#4a3010"); // корешок
      // Строки текста
      [0,4,8,12,16,20].forEach(oy=>{ r(tx+13,ty-24+oy,20,2,"rgba(0,0,0,0.2)"); r(tx+37,ty-24+oy,18,2,"rgba(0,0,0,0.18)"); });
      // Закладка
      r(tx+54, ty-28, 3, 10, "#c04040");
      // Стопка книг
      [0,1,2,3,4].forEach(i=>{
        const bw=8+i%3*4, bh=18+i%5*6;
        const bc=["#8b2020","#205080","#207040","#806020","#604080"][i];
        r(tx+66+i*(bw+2), ty-bh, bw, bh, bc);
        r(tx+66+i*(bw+2), ty-bh, bw, 2, "rgba(255,255,255,0.2)");
      });
      // Настольная лампа (старинная, зелёный абажур)
      r(tx+96, ty-40, 4, 38, "#c8a848");
      r(tx+88, ty-48, 22, 12, "#206030"); r(tx+90, ty-46, 18, 8, "#28804a"); r(tx+91, ty-44, 16, 6, "#40a060",0.6);
      r(tx+94, ty-2, 8, 3, "#a88030"); // основание
      radial(tx+98, ty-40, 0, 40, "rgba(100,255,140,0.14)", "rgba(0,0,0,0)");
      // Очки
      ctx.strokeStyle="#c0b080"; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(tx+14,ty-5,5,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(tx+24,ty-5,5,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx+19,ty-5); ctx.lineTo(tx+21,ty-5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx+9,ty-5); ctx.lineTo(tx+6,ty-3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx+29,ty-5); ctx.lineTo(tx+32,ty-3); ctx.stroke();
      break;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. РИСУЕМ ВСЕ СТОЛЫ
// ─────────────────────────────────────────────────────────────────────────────
Object.values(DESKS).forEach(d => drawDesk(d.x, d.y, d.type));

// ─────────────────────────────────────────────────────────────────────────────
// 10. ПЕРЕГОВОРНЫЙ СТОЛ (780, 420)
// ─────────────────────────────────────────────────────────────────────────────
{
  const mx=MEETING_TABLE_POS.x, my=MEETING_TABLE_POS.y;
  // Ковёр
  r(mx-90, my-100, 180, 170, P.rug, 0.7);
  r(mx-86, my-96, 172, 162, P.rugBrd, 0.5);
  r(mx-82, my-92, 164, 154, P.rug, 0.6);
  // Стол
  r(mx-80, my-140, 8, 115, P.deskLeg); r(mx+72, my-140, 8, 115, P.deskLeg);
  r(mx-80, my-145, 160, 14, P.deskOak);
  r(mx-80, my-145, 160, 2, P.deskEdge);
  r(mx-80, my-143, 160, 12, P.deskOakHi);
  // Ноутбуки на столе
  [[-50,-120],[-10,-120],[30,-120],[-30,-85],[10,-85]].forEach(([ox,oy])=>{
    r(mx+ox,my+oy,22,16,P.monFrame); r(mx+ox+2,my+oy+2,18,12,"#040810");
    radial(mx+ox+11,my+oy+8,0,10,"rgba(40,100,200,0.4)","rgba(0,0,0,0)");
  });
  // Стулья
  [[-70,-160],[-30,-160],[10,-160],[50,-160],[-70,-40],[-30,-40],[10,-40],[50,-40]].forEach(([ox,oy])=>{
    r(mx+ox-8,my+oy,18,16,P.deskOakSh);
    r(mx+ox-6,my+oy-6,14,6,P.deskOak);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. КУЛЕР (435, 440) — точная позиция из кода
// ─────────────────────────────────────────────────────────────────────────────
{
  const cx=WATER_COOLER_POS.x, cy=WATER_COOLER_POS.y;
  // Бутыль воды
  r(cx-8,cy-72,16,24,P.coolerW); r(cx-5,cy-76,10,6,"#0e182a");
  r(cx-7,cy-71,14,22,"rgba(80,160,220,0.25)");
  // Корпус
  r(cx-12,cy-48,24,48,P.coolerB);
  r(cx-10,cy-46,20,22,P.coolerW); r(cx-9,cy-45,18,20,"rgba(80,160,220,0.2)");
  // Кнопки
  r(cx-9,cy-20,8,6,"#204880"); r(cx+1,cy-20,8,6,"#802020");
  // Стаканчики
  r(cx-22,cy-10,7,9,"#c8c0b0"); r(cx+15,cy-10,7,9,"#c8c0b0");
  // Коврик
  r(cx-18,cy,36,6,"#181428",0.8);
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. ГЕЙМЗОНА (600, 570) — точная позиция из кода
// ─────────────────────────────────────────────────────────────────────────────
{
  const gx=GAMING_AREA_POS.x, gy=GAMING_AREA_POS.y;
  // Диван (геймерский)
  r(gx-55,gy-20,110,36,P.sofaBody);
  r(gx-53,gy-22,106,10,P.sofaTop);
  r(gx-53,gy-18,30,30,P.sofaCush); r(gx+4,gy-18,30,30,P.sofaCush);
  r(gx-53,gy-18,4,30,P.sofaBody); r(gx+49,gy-18,4,30,P.sofaBody);
  [P.sofaFeet,P.sofaFeet,P.sofaFeet,P.sofaFeet].forEach((_,i)=>r(gx-48+i*30,gy+18,6,4,P.sofaFeet));
  // Тумба под ТВ
  r(gx-30,gy-65,60,20,P.deskOakSh); r(gx-28,gy-63,56,16,P.deskOak);
  // ТВ экран
  r(gx-40,gy-108,80,44,P.monFrame); r(gx-38,gy-106,76,40,P.monBlue);
  radial(gx,gy-86,0,40,"rgba(80,120,255,0.5)","rgba(0,0,0,0)");
  // Игровой контент на экране
  r(gx-30,gy-104,20,8,"rgba(255,80,40,0.7)"); r(gx-5,gy-100,50,4,"rgba(40,200,100,0.5)");
  // Геймпады
  r(gx-28,gy-16,22,10,P.ctrlBody); r(gx+6,gy-16,22,10,P.ctrlBody);
  dot(gx-24,gy-13,"#e04040",2); dot(gx-20,gy-13,"#40a0e0",2);
  dot(gx+10,gy-13,"#40e060",2); dot(gx+14,gy-13,"#e0e040",2);
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. ДИВАН ЛЕНОЧКИ — спавн 805, 518
// ─────────────────────────────────────────────────────────────────────────────
{
  const sx=COUCH_POS.x, sy=COUCH_POS.y; // 805, 518
  // Диван (Леночка сидит по центру)
  r(sx-60,sy-10,120,44,P.sofaBody);
  r(sx-58,sy-16,116,12,P.sofaTop);   // спинка
  r(sx-56,sy-8,50,30,P.sofaCush);    // левая подушка
  r(sx+6,sy-8,50,30,P.sofaCush);     // правая подушка
  r(sx-60,sy-8,6,30,P.sofaBody);     // левый подлокотник
  r(sx+54,sy-8,6,30,P.sofaBody);     // правый подлокотник
  [sx-52,sx-28,sx+22,sx+46].forEach(fx=>r(fx,sy+34,8,5,P.sofaFeet));
  // Декоративные подушки
  r(sx-50,sy-10,20,14,"#7a3560"); r(sx+30,sy-10,20,14,"#3a4a90");
  // Журнальный столик перед диваном
  r(sx-30,sy+40,60,8,P.deskOak); r(sx-28,sy+48,56,5,P.deskOakHi);
  r(sx-20,sy+52,8,6,P.deskLeg); r(sx+12,sy+52,8,6,P.deskLeg);
  // Журналы и чашка на столике
  r(sx-22,sy+41,28,5,"#d04060"); r(sx-21,sy+42,26,2,"rgba(255,255,255,0.2)");
  r(sx+10,sy+41,18,5,"#4060c0"); r(sx+11,sy+42,16,2,"rgba(255,255,255,0.15)");
  r(sx-4,sy+35,10,8,"#3a2018"); r(sx-3,sy+36,8,6,"#4a2a20"); // чашка
  // Торшер справа от дивана
  r(sx+68,sy-52,3,60,"#c8a050");
  r(sx+58,sy-60,26,12,"#d4b060"); r(sx+60,sy-58,22,8,"#ffe880",0.85);
  radial(sx+70,sy-50,0,50,"rgba(255,220,100,0.18)","rgba(0,0,0,0)");
  // Ковёр
  r(sx-68,sy+28,136,22,P.rug,0.6); r(sx-64,sy+30,128,18,P.rugBrd,0.4);
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. РАСТЕНИЯ
// ─────────────────────────────────────────────────────────────────────────────
function drawPlant(px,py,s=1) {
  r(px-8*s,py-14*s,16*s,14*s,P.pot);
  r(px-6*s,py-12*s,12*s,10*s,"#3a2010");
  r(px-9*s,py-16*s,18*s,3*s,P.pot);
  [[-7,-26],[-3,-32],[0,-36],[3,-32],[7,-26],[0,-30],[-5,-22],[5,-22],[-2,-40],[2,-38]].forEach(([lx,ly],i)=>{
    ctx.fillStyle = i%2===0 ? P.leaf : P.leafHi;
    ctx.beginPath();
    ctx.ellipse(px+lx*s,py+ly*s,4*s,7*s,(lx/24)*Math.PI,0,Math.PI*2);
    ctx.fill();
  });
}
[[40,480,1.1],[40,340,1],[920,490,1.2],[920,350,1],[40,200,0.9],[920,200,0.9],[900,560,0.8]].forEach(([x,y,s])=>drawPlant(x,y,s));

// ─────────────────────────────────────────────────────────────────────────────
// 15. НАДПИСЬ НА СТЕНЕ
// ─────────────────────────────────────────────────────────────────────────────
ctx.save();
ctx.globalAlpha=0.1; ctx.fillStyle="#c8a060";
ctx.font="bold 26px monospace"; ctx.fillText("AI OFFICE",390,48);
ctx.restore();

// ─────────────────────────────────────────────────────────────────────────────
// 16. ВИНЬЕТКА + тёплый оверлей
// ─────────────────────────────────────────────────────────────────────────────
// Тёплый оттенок
r(0,0,W,H,"rgba(40,20,0,0.08)");
// Виньетка
const vig=ctx.createRadialGradient(W/2,H/2,H*0.25,W/2,H/2,H*0.9);
vig.addColorStop(0,"rgba(0,0,0,0)"); vig.addColorStop(1,"rgba(0,0,0,0.55)");
ctx.fillStyle=vig; ctx.fillRect(0,0,W,H);

// ─────────────────────────────────────────────────────────────────────────────
const out=path.join(__dirname,"../public/office-bg.png");
const buf=canvas.toBuffer("image/png");
fs.writeFileSync(out,buf);
console.log(`✅ ${out} (${(buf.length/1024).toFixed(0)} KB)`);
