import { normalizeHeroName } from './heroRegistry';

export type MonitorKind = 'kanban'|'code'|'diff'|'canvas'|'draft'|'terminal'|'checklist'|'panel'|'estimate'|'jh-mini'|
  'llama'|'solitaire'|'weather'|'duck'|'machine'|'snake'|'sudoku'|'cat'|'moodboard'|'crossword'|'matrix'|'tetris'|'bug-search'|'socket-estimate'|'screensaver'|'off'|
  'review-act'|'review-norm'|'review-red'|'review-green';
export interface MonitorPresence {
  present:boolean;
  working:boolean;
  /** Synthetic review status; interpreted only for Evgeniy's three screens. */
  review?:'red'|'green';
  /** Owner-scoped power control, including while a hero remains at the desk. */
  powerOff?:boolean;
}
export const MONITOR_WIDTH=160, MONITOR_HEIGHT=96;
export const MONITOR_FPS=8;
export const MONITOR_SECRET='Доступ запрещён. Шутка. Привет, исследователь 👋';
export const WORK_CONTENT: Readonly<Record<string,readonly MonitorKind[]>>={
  'ярик':['kanban'],'леха':['code'],'ася':['diff'],'тая':['canvas'],'иваныч':['draft'],
  'whoami':['terminal','terminal','terminal'],'марина':['checklist'],'евгений':['panel','estimate','jh-mini'],
};
export const IDLE_CONTENT: Readonly<Record<string,readonly MonitorKind[]>>={
  'ярик':['llama','solitaire','weather'],'леха':['duck','machine','snake'],'ася':['sudoku','cat','weather'],
  'тая':['moodboard','cat','weather'],'иваныч':['crossword','solitaire','weather'],
  'whoami':['matrix','tetris','weather'],'марина':['bug-search','cat','solitaire'],
  'евгений':['socket-estimate','tetris','weather'],
};
/** Fixed owner-specific periods, each 30–90s. Scene time pauses with the tab. */
export function idleMonitorPeriod(name:string) { return 30+[...normalizeHeroName(name)].reduce((n,c)=>n+c.charCodeAt(0),0)%61; }
export function monitorKind(name:string,index:number,state:MonitorPresence|undefined,time:number,night:boolean):MonitorKind {
  const key=normalizeHeroName(name);
  if(state?.powerOff)return 'off';
  if(!state?.present) return night?'off':'screensaver';
  if(key==='евгений'&&state.review) {
    if(index===0)return 'review-act';
    if(index===1)return 'review-norm';
    if(index===2)return state.review==='red'?'review-red':'review-green';
  }
  if(state.working) return WORK_CONTENT[key]?.[index]??'code';
  const eggs=IDLE_CONTENT[key]??['weather'];
  return eggs[(Math.floor(time/idleMonitorPeriod(key))+index)%eggs.length];
}
export function monitorFrameKey(kind:MonitorKind,time:number,reduced:boolean,night:boolean) {
  // Eight swaps/s maximum. 32 baked frames per animation; static screens share one.
  const frame=reduced||kind==='off'||kind==='machine'||kind==='bug-search'||kind==='socket-estimate'||kind==='duck'||kind==='moodboard'?0:Math.floor(time*MONITOR_FPS)%32;
  return `${kind}:${frame}:${kind==='weather'&&night?1:0}`;
}
export type MonitorCommand = {op:'rect';x:number;y:number;w:number;h:number;color:number}|
  {op:'line';points:number[];color:number;width:number}|
  {op:'circle';x:number;y:number;r:number;color:number}|
  {op:'text';x:number;y:number;text:string;color:number;scale:number};
export const MONITOR_COPY={
  kanban:'PLAN  DO  DONE',code:'DEMO CODE',diff:'REVIEW',canvas:'PIXEL STUDIO',draft:'DRAWING',terminal:'LOCAL SANDBOX',checklist:'QUALITY CHECK',
  panel:'PANEL DEMO',estimate:'DEMO ESTIMATE','jh-mini':'JH DEMO',llama:'ASCII LLAMA',solitaire:'SOLITAIRE',weather:'WINDOW WEATHER',duck:'DEBUG DUCK',
  machine:'IT WORKS ON MY MACHINE',snake:'SNAKE AUTO',sudoku:'SUDOKU',cat:'CAT TV',moodboard:'MOODBOARD',crossword:'CROSSWORD',matrix:'MATRIX',
  tetris:'BLOCKS AUTO','bug-search':'ПОИСК','socket-estimate':'СКОЛЬКО СТОИТ РОЗЕТКА',screensaver:'DCM LAB',off:'',
  'review-act':'АКТ ПРОВЕРКИ','review-norm':'НОРМАТИВЫ','review-red':'СХЕМА: ЗАМЕЧАНИЕ','review-green':'СХЕМА: ПРИНЯТО',
} satisfies Record<MonitorKind,string>;

/** Pure synthetic display list. No Agent, API, task, path or feed enters this boundary. */
export function monitorCommands(kind:MonitorKind,frame:number,night=false):MonitorCommand[] {
  const out:MonitorCommand[]=[], bg=0x152322,ink=0xb6d3bf,muted=0x648881,green=0x8cba81,red=0xc97c78,gold=0xd2b779;
  const rect=(x:number,y:number,w:number,h:number,color=ink)=>out.push({op:'rect',x,y,w,h,color});
  const text=(x:number,y:number,s:string,color=ink,scale=1)=>out.push({op:'text',x,y,text:s,color,scale});
  const line=(points:number[],color=ink,width=1)=>out.push({op:'line',points,color,width});
  const circle=(x:number,y:number,r:number,color=ink)=>out.push({op:'circle',x,y,r,color});
  const check=(x:number,y:number)=>line([x,y+3,x+3,y+6,x+9,y],green,2);
  const f=frame/4;
  rect(0,0,160,96,bg);
  if(kind==='off') {rect(0,0,160,96,0x111b20);line([4,5,64,5,24,92,4,92],0x202e32,2);return out;}
  if(kind==='screensaver') {
    for(let i=0;i<13;i++)rect(5+(i*37+frame/8)%149,4+(i*19)%86,1,1,muted);
    text(12+Math.round(Math.sin(f/7)*8),37+Math.round(Math.sin(f/9)*13),'DCM LAB',green,2);return out;
  }
  rect(0,0,160,12,0x30413b);text(5,3,MONITOR_COPY[kind],gold);rect(5,89,150,1,0x354e45);
  if(kind==='review-act') {
    // A page, ruled fields, a signed approval line and an outlined office stamp.
    rect(21,16,118,69,0xd6d4ba);
    text(28,21,'АКТ ПРОВЕРКИ',0x49645c);
    for(let i=0;i<4;i++)rect(28,33+i*7,91-i%2*19,1,0x8c9c87);
    text(28,64,'ПОДПИСЬ',0x49645c);
    line([63,69,69,64,72,70,78,63,82,68,93,66],0x49645c);
    line([102,60,132,60,132,79,102,79,102,60],0x527e79,2);
    text(106,64,'ШТАМП',0x527e79);text(106,72,'ЭОМ',0x527e79);
    if(frame%16<8)rect(28,77,20,1,gold);
  } else if(kind==='review-norm') {
    rect(6,17,148,66,0xd6d4ba);
    text(11,21,'ПУЭ 7.1 / ГОСТ Р 50571',0x49645c);
    for(let i=0;i<4;i++)rect(12,33+i*5,130-i%2*24,1,0x8c9c87);
    line([12,56,147,56,147,78,12,78,12,56,12,67,147,67],0x526963);
    line([58,56,58,78],0x526963);line([102,56,102,78],0x526963);
    for(let row=0;row<2;row++)for(let col=0;col<3;col++)rect(18+col*44,61+row*11,25,1,0x8c9c87);
    if(frame%16<8)rect(8,32,2,18,gold);
  } else if(kind==='review-red'||kind==='review-green') {
    const status=kind==='review-red'?red:green;
    rect(6,17,148,66,0xd6d4ba);
    text(11,21,'ОДНОЛИНЕЙНАЯ СХЕМА',0x49645c);
    line([18,35,141,35],0x49645c,2);
    for(let i=0;i<4;i++) {
      const x=28+i*33;
      line([x,35,x,44,x-4,51,x,51,x,65],i===2?status:0x49645c,2);
      rect(x-6,65,12,7,i===2?status:0x8c9c87);
    }
    // Persistent highlight identifies the same reviewed branch in both statuses.
    line([83,40,105,40,105,76,83,76,83,40],status,2);
    text(11,78,kind==='review-red'?'ЕСТЬ ЗАМЕЧАНИЕ':'ПРОВЕРЕНО',status);
    if(frame%16<8)circle(139,78,2,status);
  } else if(kind==='kanban') {
    for(let c=0;c<3;c++){text(8+c*51,17,['PLAN','DO','DONE'][c],muted);rect(6+c*51,26,46,57,0x20342f);}
    for(let i=0;i<5;i++){const c=i%3,y=31+Math.floor(i/3)*25;rect(10+c*51,y,37,17,i===2?green:0x577d72);rect(14+c*51,y+5,22,1,ink);}
    const x=10+Math.round(frame/31*102);rect(x,65,36,14,gold);text(x+4,69,'IDEA',bg);
  } else if(kind==='code'||kind==='diff'||kind==='terminal') {
    const rows=kind==='terminal'?['> scan localhost','local sandbox only','checking demo ports','all ports closed','check complete']:kind==='code'?['function hello() {','  const light = true;','  return "hello";','}','hello();']:['- old: blue','+ new: green','  render demo','- count = 1','+ count = 2','  check colors'];
    for(let i=0;i<rows.length;i++) {
      const y=19+i*10,active=kind==='terminal'?(i+Math.floor(frame/5))%rows.length:i;
      const s=rows[active];text(7,y,kind==='diff'?s:s.slice(0,Math.min(s.length,Math.floor(frame*1.5)-i*3+7)),kind==='diff'?(i%3===0?red:i%3===1?green:muted):green);
    }
    if(kind==='code'&&frame>25){check(122,69);text(7,78,'BUILD OK',green);}
    else if(kind==='diff'&&frame>22){circle(129,70,5,gold);line([132,74,137,79],gold,2);text(70,80,'LOOK HERE',gold);}
    else if(frame%8<4)rect(7+Math.min(25,frame)*3,78,3,5,green);
    if(kind==='terminal'&&frame>23)check(117,58);
  } else if(kind==='canvas'||kind==='moodboard') {
    rect(7,18,109,65,0xd5d0b4);
    [red,gold,green,0x7d9aaf,0xbc98ae].forEach((c,i)=>rect(127,19+i*13,22,9,c));
    if(kind==='canvas') { const n=Math.min(6,1+Math.floor(frame/5));line([29,65,49,35,80,30,100,61,72,73,29,65].slice(0,n*2),0x527e79,3);circle(49,35,3,red); }
    else {rect(13,24,42,25,0x7d9aaf);rect(62,24,45,35,0xbc98ae);circle(33,66,12,gold);text(62,70,'IDEAS',0x55716c);}
  } else if(kind==='draft'||kind==='panel') {
    rect(6,17,148,66,0xd6d4ba);line([10,21,149,21,149,79,10,79,10,21],0x526963);
    line([25,32,130,32],0x49645c,2);
    for(let i=0;i<4;i++) {const x=35+i*28;line([x,32,x,43,x-4,50,x,50,x,65],0x49645c);rect(x-6,64,12,7,green);}
    line([108,69,149,69,149,79,108,79,108,69],0x526963);text(111,72,'DEMO',0x526963);
    if(kind==='draft'){const x=32+frame*3;circle(x,44,10,0xb3945e);line([x+7,51,x+14,58],0xb3945e,3);}
    else circle(35+Math.floor(frame/8)*28,32,3,gold);
  } else if(kind==='estimate'||kind==='socket-estimate') {
    if(kind==='socket-estimate'){text(7,20,'РОЗЕТКА       1');text(7,32,'РАБОТА        2');text(7,44,'ПОДУМАТЬ    999',gold);text(7,62,'ИТОГО: БЕСЦЕННО',green);}
    else {text(8,19,'PARTS     QTY  SUM',muted);for(let i=0;i<4;i++){text(8,32+i*10,['SWITCH','WIRE','BOX','TEA'][i]);text(90,32+i*10,`${i+1}   ${(i+1)*10}`,gold);}line([8,73,150,73],muted);text(8,78,'TOTAL     100',green);rect(7,30+Math.floor(frame/8)*10,2,7,gold);}
  } else if(kind==='jh-mini') {
    rect(7,17,146,66,0xd6e3e3);
    for(let i=0;i<3;i++) {
      const y=23+i*19;rect(12,y,15,15,[0x9ab693,0x7e94b0,0xbc9291][i]);
      rect(16,y+3,6,5,0xdfc8a7);rect(15,y+9,8,5,0x4b706b);
      for(let j=0;j<3;j++)rect(34+j*34,y+1,29,5,[green,red,0x809db5][(j+i+Math.floor(frame/10))%3]);
      rect(34,y+9,87,2,0x8b9ca1);rect(34,y+13,64,2,0x8b9ca1);
    }
  } else if(kind==='checklist') {
    ['COLORS','LAYOUT','KEYBOARD','SMILE','TEA'].forEach((s,i)=>{rect(9,20+i*12,7,7,0x3a5449);text(25,21+i*12,s);if(i<=Math.floor(frame/6))check(9,18+i*12);});
  } else if(kind==='llama') {
    text(38,25,' /\\  /\\',gold);text(38,33,'( O  O )',gold);text(38,41,' |    |',gold);text(38,49,' |    |____',gold);text(38,57,' |         )',gold);text(38,65,'  ||    ||',gold);if(frame%16<8)text(110,27,'HI!',green);
  } else if(kind==='duck'||kind==='cat') {
    rect(10,18,140,65,kind==='cat'?0x334c52:0x324a3f);
    const x=kind==='duck'?65:65+Math.round(Math.sin(f)*17);
    if(kind==='duck'){rect(x,41,37,25,gold);rect(x+22,28,21,23,gold);rect(x+40,40,12,6,0xc48862);rect(x+33,33,3,3,bg);text(12,76,'TELL ME THE BUG',ink);}
    else {rect(x,40,29,24,gold);line([x,41,x+3,30,x+11,40,x+20,40,x+27,30,x+29,41],gold,3);rect(x+6,47,3,3,bg);rect(x+20,47,3,3,bg);line([x-15,58,x-22,43,x-18,38],gold,4);text(14,76,frame<16?'KORZHIK':'MASYANYA',ink);}
  } else if(kind==='weather') {
    circle(41,42,13,night?0xc7d5d0:gold);
    if(night)circle(47,37,12,bg);else for(let i=0;i<6;i++){const a=i*Math.PI/3;line([41+Math.cos(a)*18,42+Math.sin(a)*18,41+Math.cos(a)*24,42+Math.sin(a)*24],gold,2);}
    text(80,35,night?'NIGHT':'DAY',green,2);text(14,77,night?'STARS OUTSIDE':'SNOW OUTSIDE',muted);
    for(let i=0;i<6;i++)rect(13+i*23,60+(frame+i*3)%12,2,2,ink);
  } else if(kind==='machine') {text(17,26,'IT WORKS',gold,2);text(17,43,'ON MY',ink,2);text(17,60,'MACHINE',green,2);}
  else if(kind==='bug-search') {rect(8,21,144,14,0x31483f);text(12,25,'КАК НАЙТИ БАГ',ink);text(12,44,'ЕСЛИ БАГ - ЭТО ТЫ?',gold);text(12,66,'РЕЗУЛЬТАТ: ЧАЙ',green);}
  else if(kind==='matrix') {for(let c=0;c<22;c++)for(let r=0;r<9;r++){const y=16+(r*8+frame*2+c*7)%68;text(5+c*7,y,((c+r+frame)%2).toString(),r===0?ink:((c+r)%3===0?green:0x487258));}}
  else if(kind==='crossword'||kind==='sudoku') {
    const n=kind==='sudoku'?6:8,size=8;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++) {rect(16+x*size,19+y*size,size-1,size-1,kind==='crossword'&&(x+y)%5===0?0x36453b:0xbac7b0);if((x*3+y+Math.floor(frame/8))%3===0)text(18+x*size,20+y*size,kind==='sudoku'?String((x+y)%6+1):['Ч','А','Й'][(x+y)%3],bg);}
    text(91,35,kind==='sudoku'?'6 X 6':'ЧАЙ',gold);text(91,52,'AUTO',muted);
  } else if(kind==='solitaire') {
    for(let i=0;i<5;i++){rect(13+i*29,24+(i%2)*14,22,32,0xd7d8bd);text(17+i*29,29+(i%2)*14,String(i+1),i%2?red:bg);}rect(12+frame*3,67,21,16,0x8aaca0);
  } else if(kind==='snake'||kind==='tetris') {
    rect(12,18,94,65,0x1c302b);
    if(kind==='snake') {for(let i=0;i<10;i++)rect(18+(frame*3-i*5+160)%80,37+Math.round(Math.sin((frame-i)/7)*15),5,5,i===0?gold:green);rect(87,25,4,4,red);}
    else {for(let i=0;i<18;i++)rect(16+(i*19)%84,77-Math.floor(i/6)*7,6,6,[green,gold,red][i%3]);for(let i=0;i<4;i++)rect(40+(i%2)*7,21+frame%35+Math.floor(i/2)*7,6,6,gold);}
    text(116,25,'AUTO',gold);text(116,44,String(frame*10),ink);
  }
  return out;
}
