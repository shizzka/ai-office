import { Container, Graphics, Text } from 'pixi.js';
import type { OfficeStatsSnapshot } from '@/lib/officeStatsTypes';

// Free brick above the whiteboard, in the scene's 960 × 600 coordinates.
export const SCOREBOARD_RECT = { x: 232, y: 37, width: 115, height: 33 } as const;
export const TROPHY_RECT = { x: 350, y: 37, width: 18, height: 33 } as const;
export const BUG_HUNTER_TOOLTIP = 'Охотница за багами · найдено в JH: вагон 🚃';
const ROTATION = [
  { key: 'bugsFound', label: 'БАГИ НАЙДЕНЫ', icon: '⌕' },
  { key: 'bugsClosed', label: 'БАГИ ЗАКРЫТЫ', icon: '✓' },
  { key: 'tasksCreated', label: 'ЗАДАЧИ СОЗДАНЫ', icon: '☷' },
  { key: 'tasksDone', label: 'ЗАДАЧИ СДЕЛАНЫ', icon: '✓' },
  { key: 'pizzas', label: 'ПИЦЦЫ', icon: '◭' },
  { key: 'potsBroken', label: 'ГОРШКИ РАЗБИТЫ', icon: '♧' },
] as const;

/** The source snapshot already excludes private projects and recomputes stream totals. */
export function scoreboardReading(stats: OfficeStatsSnapshot, time: number) {
  const slot = Math.floor(time / 7);
  const item = ROTATION[slot % ROTATION.length];
  const scope = Math.floor(slot / ROTATION.length) % (stats.projects.length + 1);
  const project = scope ? stats.projects[scope - 1] : null;
  const source = project || stats.totals;
  const value = item.key === 'pizzas' || item.key === 'potsBroken' ? stats.counters[item.key] : source[item.key];
  const prefix = item.key === 'pizzas' || item.key === 'potsBroken' ? '' : `${project ? project.name === 'Job Hunter' ? 'JH' : project.name : 'Σ'} · `;
  return {key: `${project?.id || 'total'}:${item.key}`, label: prefix + item.label, icon: item.icon, value: typeof value === 'number' ? value : null};
}

/** time is monotonic seconds, matching the office animation clock. */
export function createOfficeScoreboard(onOpen: () => void) {
  const container = new Container();
  container.label = 'office25-scoreboard';
  container.eventMode = 'static';
  const panel = new Container();
  panel.position.set(SCOREBOARD_RECT.x, SCOREBOARD_RECT.y);
  panel.cursor = 'pointer'; panel.eventMode = 'static'; panel.on('pointertap', onOpen);
  const frame = new Graphics().roundRect(0, 0, 115, 33, 2).fill(0x85674d)
    .roundRect(2, 2, 111, 29, 1).fill(0x14221e).stroke({color:0x272a23,width:1});
  const label = new Text({ text: 'СТАТИСТИКА ОФИСА', style: { fontFamily: 'monospace', fontSize: 6, fill: 0xaec1a0, letterSpacing: .4 } });
  label.position.set(6, 4);
  const digits = new Text({ text: '—', style: { fontFamily: 'monospace', fontSize: 17, fontWeight:'bold', fill:0xbcf3a6 } });
  digits.position.set(20, 12);
  const icon = new Text({ text: '⌕', style: {fontFamily:'Arial',fontSize:17,fill:0x91bb78} }); icon.position.set(5,12);
  const plus = new Text({ text: '+1', style: {fontFamily:'monospace',fontSize:9,fontWeight:'bold',fill:0xf4df8b} });plus.position.set(94,15);plus.visible=false;
  panel.addChild(frame,label,icon,digits,plus);

  const trophy = new Container(); trophy.label = 'office25-bug-hunter-trophy';
  trophy.position.set(TROPHY_RECT.x,TROPHY_RECT.y);trophy.eventMode='static';trophy.cursor='help';
  const cup = new Graphics().rect(0,29,18,3).fill(0x805936).rect(3,27,12,2).fill(0x4b3525)
    .rect(7,20,4,7).fill(0xe2bb55).rect(4,25,10,2).fill(0xefcb67)
    .poly([4,9,14,9,13,18,11,21,7,21,5,18]).fill(0xe2bb55)
    .moveTo(4,11).lineTo(1,11).lineTo(1,16).lineTo(6,18).stroke({color:0xd1a94c,width:2})
    .moveTo(14,11).lineTo(17,11).lineTo(17,16).lineTo(12,18).stroke({color:0xd1a94c,width:2});
  trophy.addChild(cup);
  const tip = new Container();tip.eventMode='none';tip.visible=false;tip.position.set(200,73);
  const tipText = new Text({text:BUG_HUNTER_TOOLTIP,style:{fontFamily:'Arial',fontSize:10,fill:0xffefcf}});tipText.position.set(6,5);
  tip.addChild(new Graphics().roundRect(0,0,tipText.width+12,24,3).fill({color:0x171916,alpha:.97}),tipText);
  trophy.on('pointerover',()=>{tip.visible=true;});trophy.on('pointerout',()=>{tip.visible=false;});
  trophy.on('pointertap',()=>{tip.visible=!tip.visible;});
  container.addChild(panel,trophy,tip);
  let previous: OfficeStatsSnapshot | null = null;
  const flashes = new Map<string,number>();
  const pending = new Set<string>();
  return {container,update(stats: OfficeStatsSnapshot | null | undefined,time:number){
    if(!stats)return;
    const reading = scoreboardReading(stats, time);
    if (previous !== stats) {
      // Compare the same project and metric, independent of the rotation slot.
      if (previous) for (let slot = 0; slot < ROTATION.length * (stats.projects.length + 1); slot++) {
        const current = scoreboardReading(stats, slot * 7), prior = scoreboardReading(previous, slot * 7);
        if (current.key === prior.key && current.value !== null && prior.value !== null && current.value > prior.value) pending.add(current.key);
      }
      previous = stats;
    }
    if (pending.delete(reading.key)) flashes.set(reading.key, time + 2);
    label.text = reading.label; icon.text = reading.icon;
    label.style.fontSize = reading.label.length > 23 ? 5 : 6;
    digits.text = reading.value === null ? 'нет данных' : reading.value.toLocaleString('ru-RU');
    digits.style.fontSize = digits.text.length > 7 ? 10 : 17;
    trophy.visible = stats.projects.some(project => project.id === 'jh');
    if (!trophy.visible) tip.visible = false;
    const remaining=(flashes.get(reading.key)??0)-time;plus.visible=remaining>0;plus.alpha=Math.min(1,Math.max(0,remaining));
    digits.style.fill=remaining>0?0xffee9c:0xbcf3a6;
  },destroy(){container.destroy({children:true});}};
}
