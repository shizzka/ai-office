"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { Application, Container, Graphics, Rectangle, Text, TextStyle, Sprite as PixiSprite, Texture, UPDATE_PRIORITY } from "pixi.js";
import {
  createAgentSprite,
  createWalkingSprite,
  createStretchSprite,
  createCoolerSprite,
  animateHeroSprite,
  type AgentId,
} from "./drawAgent";
import { createOfficeEnvironment, DESK_POSITIONS, WATER_COOLER_POS, MEETING_TABLE_POS, MEETING_SEATS, GAMING_AREA_POS } from "./drawOffice";
import { resetHeroAmbient } from './heroAmbient';
import { createRareGesture, advanceRareGesture, type RareGesture } from "./heroTiming";
import { OFFICE_LAYOUT, DEFAULT_OFFICE_THEME, officeHome, officeFixture, KITCHEN_PLACES, dcmRegression, type OfficeTheme, type Point } from "./officeLayout";
import { normalizeHeroName } from "./heroRegistry";
import { loadHeroAtlas, createAtlasPose, animateAtlasPose, DEFAULT_HERO_RENDERER, type HeroRenderer, setCatAtlasPose, atlasHeadY } from "./heroAtlas";
import { placeAnnotation, overlaps, heroNamePosition, heroStatusColor, type Rect } from "./officeAnnotations";
import { loftRoute } from "./officeNavigation";
import { artRoute, ART_KITCHEN_PLACES, artFootprintsOverlap } from "./aiOfficeNavigation";
import { advanceCats, advanceCatLife, catPose, catHome, createCat, createCatLife, isCatNight, parseCatDemo, tapCat, CAT_DEMO_DESKS, isOfficeCat, type CatState, type CatActivity } from "./catBehavior";
import { createCatReactionsScene } from './catReactionsScene';
import { createArtEnvironment } from "./artEnvironment";
import { createDeskEnvironment, DESK_SCREENS, type DeskEnvironment, type DeskPresence } from "./deskEnvironment";
import { MONITOR_SECRET } from "./monitorContent";
import { createLoftEnvironment } from "./loftEnvironment";
import { EGG_TOAST, registerTap, type MomentsSignal } from './officeMoments';
import { createOfficeMomentsScene } from './officeMomentsScene';
import { officeHoliday, EMPTY_QUOTAS, holidaySceneMode, holidayLabel, heroHoliday, formatReset, holidayCountdown, type OfficeHoliday } from './officeHoliday';
import { sceneAgents } from './jhBoard';
import { advanceHeroMotion, HUMAN_GAIT, type HeroMotion } from './heroMotion';
import { ART_MONITORS, avoidNameMonitors, seatedNamePosition } from './officeAnnotations';
import type { Agent, AgentStatus } from "@/lib/utils/types";

import { createDeskLife, advanceDeskLife, nextOfficeWalk, type DeskLife } from './deskLife';
import { publicDcm, type OfficeDcmSignal } from '../../lib/officeDcm';
import { sanyaBugTooltip, sanyaVictoryToast, SANYA_VICTORY_SECONDS } from './sanyaLife';
import { createSanyaDeskScene, SANYA_DESK } from './sanyaDeskScene';
import { WHOAMI_TOOLTIP, whoamiPhrase } from './whoami';
import { deskSeat, deskSeatScale, createDeskSeating, advanceDeskSeating, deskPresence, seatedKeyboard, isDeskWorking, type DeskSeating } from './deskSeating';
import { workstationOccupied } from './workstation';
import { createOfficeAttendanceScene } from './officeAttendanceScene';
import { useOfficePresenceStore } from '@/stores/officePresenceStore';
import { createOwnerFeaturesScene } from './ownerFeaturesScene';
import { OWNER_FIXTURES } from './ownerFeatures';
import { createOffice22Scene } from './office22Scene';
import { getMCWebSocket } from '@/lib/ws';
import { createOfficeScoreboard } from './officeScoreboard';
import type { OfficeStatsSnapshot } from '@/lib/officeStatsTypes';
import { createSharedPlayback, sceneRandom, type SharedOfficeState, type SharedScene } from './sharedScene';
import { createDirectorQueue, directorEvent, directorQueryEvents, directorHoliday, directorHour, EMPTY_DIRECTOR, type DirectorSnapshot, type DirectorRuntime, type DirectorTask, type DirectorTime, type DirectorHoliday } from './officeDirector';

// ---------- types ----------

interface PixelOfficeProps {
  agents: Agent[];
  theme?: OfficeTheme;
  heroRenderer?: HeroRenderer;
  details?: boolean;
  holiday?: OfficeHoliday;
  holidayNow?: number;
  onDirectorChange?: (state: DirectorSnapshot) => void;
  onCatActivity?: (activity: CatActivity) => void;
  onAgentClick?: (agentId: string) => void;
  className?: string;
}

export interface PixelOfficeHandle {
  launchEvent: (id: string) => void;
  stopEvents: () => void;
  triggerInteraction: (fromId: string, toId: string) => void;
  triggerCoolerVisit: (agentId: string) => void;
  triggerMeeting: (agentIds: string[]) => void;
  triggerAllMeeting: () => void;
}

/** Movement state machine states */
type MovementState =
  | "SITTING"
  | "WALKING_TO"
  | "AT_COOLER"
  | "AT_GAMING"
  | "INTERACTING"
  | "WALKING_BACK"
  | "STRETCHING"
  | "LOOKING_AROUND"
  | "AT_MEETING";

interface SceneNode {
  container: Container;
  annotation: Container;
  label: Text;
  namePlate: Container;
  nameBackground: Graphics;
  statusDot: Graphics;
  statusBubble: Container;
}
interface FixtureNode extends SceneNode { fixture: NonNullable<ReturnType<typeof officeFixture>> }
interface AgentNode extends SceneNode {
  quiet?: boolean;
  away?: boolean;
  quotaAway?: boolean;
  visualSeated?: boolean;
  cat?: CatState;
  container: Container;
  annotation: Container;
  atlas: boolean;
  renderer: HeroRenderer;
  theme: OfficeTheme;
  route: Point[];
  routePlanned: boolean;
  walkOrder: number;
  motion: HeroMotion;
  routeRetry: number;
  appearanceName: string;
  liveText: string;
  eggClock: number;
  rareGesture: RareGesture;
  deskLife: DeskLife;
  seating: DeskSeating;
  responseUntil: number;
  bugUntil: number;
  victoryUntil: number;
  // Sprite variants (only one visible at a time)
  sprite: Container;           // sitting (original)
  walkFrames: [Container, Container]; // walk frame 0, 1
  stretchSprite: Container;
  coolerSprite: Container;
  label: Text;
  namePlate: Container;
  nameBackground: Graphics;
  statusDot: Graphics;
  statusBubble: Container;
  bubbleBaseY: number;
  particles: Container;
  glowOverlay: Graphics;
  // API status from props
  apiStatus: AgentStatus;
  // Movement state machine
  moveState: MovementState;
  // Animation
  animTime: number;
  particleTimer: number;
  // Movement
  homeX: number;
  homeY: number;
  targetX: number;
  targetY: number;
  walkFrame: 0 | 1;
  walkFrameTimer: number;
  // Idle behavior timer
  idleTimer: number;
  idleInterval: number; // art: 3–8 min between walks
  // State timer (for AT_COOLER, INTERACTING, STRETCHING, LOOKING_AROUND)
  stateTimer: number;
  stateDuration: number;
  // Interaction target (who we're chatting with)
  interactTarget: string | null;
  // Look-around direction
  lookDir: -1 | 0 | 1;
  lookTimer: number;
  // Agent ID for reference
  agentId: AgentId;
}

// ---------- constants ----------

const CANVAS_W = OFFICE_LAYOUT.canvas.width;
const CANVAS_H = OFFICE_LAYOUT.canvas.height;
let walkSequence = 0;
const BG_COLOR = 0x0f0f0f;
const WALK_SPEED = HUMAN_GAIT.speed; // px/sec
const WALK_FRAME_INTERVAL = 0.25; // seconds between frame swaps

const CHAT_BUBBLE_STYLE = new TextStyle({
  fontFamily: '"Courier New", monospace',
  fontSize: 14,
  fill: 0xffffff,
});

// ---------- helpers ----------

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Show only one sprite variant; hide the rest. */
function showSpriteVariant(
  node: AgentNode,
  which: "sit" | "walk" | "stretch" | "cooler",
) {
  node.sprite.visible = which === "sit";
  node.walkFrames[0].visible = which === "walk" && node.walkFrame === 0;
  node.walkFrames[1].visible = which === "walk" && node.walkFrame === 1;
  node.stretchSprite.visible = which === "stretch";
  node.coolerSprite.visible = which === "cooler";
}

// ---------- component ----------

export const PixelOffice = forwardRef<PixelOfficeHandle, PixelOfficeProps>(
  function PixelOffice({ agents, theme = DEFAULT_OFFICE_THEME, heroRenderer = DEFAULT_HERO_RENDERER, details = false, holiday: liveHoliday = officeHoliday(EMPTY_QUOTAS, 0), holidayNow = 0, onDirectorChange, onCatActivity, onAgentClick, className }, ref) {
    const [manualHoliday,setManualHoliday] = useState<DirectorHoliday>(null);
    const holiday = directorHoliday(liveHoliday,manualHoliday);
    const directorState = useRef<DirectorSnapshot>({...EMPTY_DIRECTOR});
    const directorChanged = useRef(onDirectorChange);directorChanged.current=onDirectorChange;
    const notifyDirector = (patch: Partial<DirectorSnapshot>) => {
      const next={...directorState.current,...patch};
      if(JSON.stringify(next)!==JSON.stringify(directorState.current)) {directorState.current=next;directorChanged.current?.(next);}
    };
    const directorRef = useRef<ReturnType<typeof createDirectorQueue>|null>(null);
    const timeRef = useRef<DirectorTime>('auto');
    const localPresentation = useRef(false);
    const launchLocal = useRef((id:string)=>{});
    const resumeShared = useRef(()=>{});
    const manualDcm = useRef<OfficeDcmSignal|null>(null);
    const holidayRef = useRef(holiday);
    holidayRef.current = holiday;
    const holidayKey = `${holiday.codex.exhausted}:${holiday.claude.exhausted}`;
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const nodesRef = useRef<Map<string, AgentNode>>(new Map());
    const fixturesRef = useRef<Map<string, FixtureNode>>(new Map());
    const findSceneNode = (id: string) => nodesRef.current.get(id) || fixturesRef.current.get(id);
    const atlasReadyRef = useRef(false);
    const destroyedRef = useRef(false);
    const momentsSignal = useRef<MomentsSignal | null>(null);
    const eggSerial = useRef(0);
    const taps = useRef<number[]>([]);
    const sanyaTaps = useRef<number[]>([]);
    const ownerTap = useRef(0);
    const dcmSignal = useRef<OfficeDcmSignal | null>(null);
    const jarTappedUntil = useRef(0);
    const sceneClock = useRef(0);
    const monitorsRef = useRef<DeskEnvironment|null>(null);
    const monitorTaps = useRef<number[]>([]);
    const monitorButtons = useRef(new Map<string,HTMLButtonElement>());
    const [monitorZoom,setMonitorZoom] = useState<{id:string;serial:number;secret:boolean}|null>(null);
    const closeMonitor = (id:string) => {
      setMonitorZoom(null);monitorsRef.current?.open(null);
      requestAnimationFrame(()=>monitorButtons.current.get(id)?.focus());
    };
    const monitorTap = (id:string,close=false) => {
      const whoami=id.startsWith('whoami-');
      const now=performance.now();
      monitorTaps.current=whoami?[...monitorTaps.current.filter(t=>now-t<2400),now]:[];
      const secret=whoami&&monitorTaps.current.length>=3;
      if(secret)monitorTaps.current=[];
      setInspection(null);
      if(close&&!secret)closeMonitor(id);
      else {setMonitorZoom({id,serial:now,secret});monitorsRef.current?.open(id);}
    };
    useEffect(()=>{
      if(!monitorZoom)return;
      const timer=setTimeout(()=>closeMonitor(monitorZoom.id),7000);
      const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')closeMonitor(monitorZoom.id);};
      window.addEventListener('keydown',escape);
      return ()=>{clearTimeout(timer);window.removeEventListener('keydown',escape);};
    },[monitorZoom]);
    const [sanyaToast, setSanyaToast] = useState<{text:string;serial:number}|null>(null);
    const showSanyaToast = (text:string) => setSanyaToast({text,serial:performance.now()});
    const [eggToast, setEggToast] = useState(0);
    useEffect(() => {
      let cancelled = false;
      const poll = async () => {
        try {
          const response = await fetch('/api/office/moments', { cache: 'no-store' });
          if (!response.ok) return;
          const signal: MomentsSignal = await response.json();
          if (cancelled) return;
          momentsSignal.current = signal;
        } catch { /* keep the last confirmed observation */ }
      };
      void poll();
      const interval = setInterval(poll, 20_000);
      return () => { cancelled = true; clearInterval(interval); };
    }, []);
    useEffect(() => {
      let cancelled=false;
      const poll=async()=>{
        try {
          const response=await fetch('/api/office/dcm',{cache:'no-store'});
          if(response.ok) { const signal=publicDcm(await response.json()); if(!cancelled) dcmSignal.current=signal; }
        } catch { /* A missing bridge is an unknown result, never a green one. */ }
      };
      void poll(); const timer=setInterval(poll,20_000);
      return ()=>{cancelled=true;clearInterval(timer);};
    },[]);
    useEffect(()=>{
      if(!sanyaToast) return;
      const timer=setTimeout(()=>setSanyaToast(null),6000);
      return ()=>clearTimeout(timer);
    },[sanyaToast]);
    useEffect(() => {
      if (!eggToast) return;
      const timeout = setTimeout(() => setEggToast(0), 6000);
      return () => clearTimeout(timeout);
    }, [eggToast]);
    const catActivityRef = useRef(onCatActivity);
    catActivityRef.current = onCatActivity;
    const agentsRef = useRef(agents);
    agentsRef.current = sceneAgents(agents);
    const syncAgentsRef = useRef<(agents: Agent[]) => void>(() => {});

    const detailsRef = useRef(details);
    detailsRef.current = details;
    const [inspection, setInspection] = useState<{ id: string; pinned: boolean } | null>(null);
    const [whoamiBubble, setWhoamiBubble] = useState<string | null>(null);
    const previousWhoamiPhrase = useRef<string | undefined>(undefined);
    useEffect(() => {
      if (!whoamiBubble) return;
      const timer = setTimeout(() => setWhoamiBubble(null), 4000);
      return () => clearTimeout(timer);
    }, [whoamiBubble]);
    const inspectionRef = useRef(inspection);
    inspectionRef.current = inspection;
    const tooltipRef = useRef<HTMLDivElement>(null);
    const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retainTooltip = () => {
      if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current);
      hoverLeaveTimer.current = null;
    };
    useEffect(() => () => retainTooltip(), []);
    const inspectRef = useRef((id: string, action: 'enter' | 'leave' | 'tap') => {});
    inspectRef.current = (id, action) => {
      retainTooltip();
      if (action === 'tap' && normalizeHeroName(agentsRef.current.find(a => a.id === id)?.name || '') === 'евгений') {
        const now=performance.now();if(now-ownerTap.current<350){ownerTap.current=0;setInspection(null);launchLocal.current('standup');return;}ownerTap.current=now;
      }
      if (action === 'tap' && normalizeHeroName(agentsRef.current.find(a => a.id === id)?.name || '') === 'whoami') {
        const phrase = whoamiPhrase(previousWhoamiPhrase.current);
        previousWhoamiPhrase.current = phrase;
        setWhoamiBubble(phrase);
        setInspection({ id, pinned: true });
        return;
      }
      if (action === 'tap' && normalizeHeroName(agentsRef.current.find(a => a.id === id)?.name || '') === 'саня') {
        if(registerTap(sanyaTaps.current,performance.now())) {
          const node=nodesRef.current.get(id);
          if(node) node.victoryUntil=node.eggClock+SANYA_VICTORY_SECONDS;
          showSanyaToast(sanyaVictoryToast(manualDcm.current??dcmSignal.current)); setInspection(null); return;
        }
      }
      if (action === 'tap' && normalizeHeroName(agentsRef.current.find(a => a.id === id)?.name || '') === 'марина') {
        if (registerTap(taps.current, performance.now())) {
          eggSerial.current += 1;
          setEggToast(eggSerial.current);
          setInspection(null);
          return;
        }
      }
      if (action === 'enter' && tooltipRef.current?.matches(':hover')) return;
      if (action === 'leave') {
        hoverLeaveTimer.current = setTimeout(() => {
          if (!tooltipRef.current?.matches(':hover')) setInspection(previous => previous?.pinned || previous?.id !== id ? previous : null);
        }, 200);
        return;
      }
      setInspection(previous => action === 'tap'
        ? previous?.id === id && previous.pinned ? null : { id, pinned: true }
        : previous?.pinned ? previous : { id, pinned: false });
    };
    const inspectedAgent = sceneAgents(agents).find(agent => agent.id === inspection?.id);
    const inspectedNode = inspection && findSceneNode(inspection.id);

    useLayoutEffect(() => {
      const node = inspection && findSceneNode(inspection.id);
      if (node && containerRef.current && tooltipRef.current) positionHeroTooltip(containerRef.current, tooltipRef.current, node);
    }, [inspection]);

    // Expose imperative handles
    useImperativeHandle(ref, () => ({
      launchEvent(id:string) { launchLocal.current(id); },
      stopEvents() { directorRef.current?.stop();localPresentation.current=false;resumeShared.current(); },
      triggerInteraction(fromId: string, toId: string) {
        const fromNode = nodesRef.current.get(fromId);
        const toNode = nodesRef.current.get(toId);
        if (!fromNode || !toNode || fromNode.cat || toNode.cat || isStationary(fromNode) || isStationary(toNode)) return;
        // Only trigger if the agent is sitting idle
        if (fromNode.moveState !== "SITTING") return;

        if (theme === "art") { sendToKitchen(fromNode, nodesRef.current); return; }
        fromNode.interactTarget = toId;
        // Visit beside the colleague, leaving their footprint clear.
        fromNode.targetX = toNode.homeX;
        fromNode.targetY = theme !== "cyber" ? (toNode.homeY < 250 ? 330 : toNode.homeY < 400 ? 405 : 575) : toNode.homeY;
        transitionTo(fromNode, "WALKING_TO");
      },
      triggerCoolerVisit(agentId: string) {
        const node = nodesRef.current.get(agentId);
        if (!node || node.cat || isStationary(node)) return;
        if (node.moveState !== "SITTING") return;

        if (theme !== "cyber") { sendToKitchen(node, nodesRef.current); return; }
        node.interactTarget = null;
        node.targetX = WATER_COOLER_POS.x;
        node.targetY = WATER_COOLER_POS.y;
        transitionTo(node, "WALKING_TO");
      },
      triggerMeeting(agentIds: string[]) {
        const seats = MEETING_SEATS;
        agentIds.forEach((id, i) => {
          const node = nodesRef.current.get(id);
          if (!node || node.cat || isStationary(node)) return;
          if (node.moveState !== "SITTING") return;
          if (theme !== "cyber") { sendToKitchen(node, nodesRef.current, true); return; }
          const seat = seats[i % seats.length];
          node.interactTarget = "__meeting__";
          node.targetX = MEETING_TABLE_POS.x + seat.x;
          node.targetY = MEETING_TABLE_POS.y + seat.y;
          transitionTo(node, "WALKING_TO");
        });
      },
      triggerAllMeeting() {
        const seats = MEETING_SEATS;
        const allAgents = Array.from(nodesRef.current.entries())
          .filter(([id, node]) => id !== "ded" && id !== "lenochka" && !node.cat && !isStationary(node)); // Дед и Леночка не ходят на общие митинги
        allAgents.forEach(([, node], i) => {
          if (theme !== "cyber") {
            if (node.moveState === "SITTING" && node.apiStatus === "idle") sendToKitchen(node, nodesRef.current, true);
            return;
          }
          const seat = seats[i % seats.length];
          node.interactTarget = "__meeting__";
          node.targetX = MEETING_TABLE_POS.x + seat.x;
          node.targetY = MEETING_TABLE_POS.y + seat.y;
          transitionTo(node, "WALKING_TO");
        });
      },
    }));

    // Build / tear-down the PixiJS application
    useEffect(() => {
      if (!containerRef.current) return;
      destroyedRef.current = false;
      sceneClock.current=0;

      const el = containerRef.current;

      const app = new Application();
      appRef.current = app;

      let removeVisibilityListener = () => {};
      let removeDensityObserver = () => {};
      let destroyPlayScene = () => {};
      let destroyOwnerScene = () => {};
      let removeShared = () => {};
      let cancelled = false;

      (async () => {
        try {
        const initPromise = app.init({
          width: CANVAS_W,
          height: CANVAS_H,
          backgroundColor: BG_COLOR,
          antialias: false,
          resolution: theme === "art" ? Math.min(3, (window.devicePixelRatio || 1) * Math.max(.25, el.clientWidth / CANVAS_W)) : Math.min(2, window.devicePixelRatio || 1),
          autoDensity: true,
          preference: "webgl",
          autoStart: false,
        });
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Pixi init timeout")), 8000));
        await Promise.race([initPromise, timeout]);

        if (cancelled) {
          app.destroy(true, { children: true });
          return;
        }

        // Scale canvas to fill container while preserving aspect
        app.canvas.style.width = "100%";
        app.canvas.style.height = "100%";
        app.canvas.style.objectFit = "contain";
        app.canvas.style.imageRendering = theme === "art" ? "auto" : "pixelated";
        const densityObserver = new ResizeObserver(() => {
          const density = theme === "art" ? Math.min(3, (window.devicePixelRatio || 1) * Math.max(.25, el.clientWidth / CANVAS_W)) : Math.min(2, window.devicePixelRatio || 1);
          if (app.renderer.resolution !== density) app.renderer.resize(CANVAS_W, CANVAS_H, density);
          app.canvas.style.width = "100%"; app.canvas.style.height = "100%";
        });
        densityObserver.observe(el);
        removeDensityObserver = () => densityObserver.disconnect();
        // Preserve native touch scrolling of the panorama around the canvas.
        app.renderer.events.autoPreventDefault = false;
        app.canvas.style.touchAction = "pan-x pan-y";

        el.appendChild(app.canvas);

        const loft = theme === "loft" ? await createLoftEnvironment() : null;
        const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
        timeRef.current='auto';
        const monitorRoot = new Container();
        const monitors = theme === 'art' ? createDeskEnvironment(monitorRoot,()=>motionPreference.matches,{
          renderer:app.renderer,
          hidden:()=>document.hidden,
          night:()=>isCatNight(directorHour(timeRef.current)),
          visible:s=>{
            const r=app.canvas.getBoundingClientRect(), b=s.bounds;
            return r.left+(b.x+b.width)/CANVAS_W*r.width>0&&r.left+b.x/CANVAS_W*r.width<innerWidth
              &&r.top+(b.y+b.height)/CANVAS_H*r.height>0&&r.top+b.y/CANVAS_H*r.height<innerHeight;
          },
        }) : undefined;
        monitorsRef.current=monitors??null;
        const art = theme === "art" ? await createArtEnvironment({monitors}) : null;
        monitorRoot.destroy();
        const sanyaDesk = theme === 'art' ? await createSanyaDeskScene() : null;
        if (cancelled) {
          loft?.container.destroy({ children: true });
          monitors?.destroy();
          art?.container.destroy({ children: true });
          sanyaDesk?.foreground.destroy({children:true}); sanyaDesk?.bubble.destroy({children:true});
          return;
        }
        if (loft || art) {
          app.stage.addChild((art || loft)!.container);
        } else {
          const environment = createOfficeEnvironment(CANVAS_W, CANVAS_H);
          app.stage.addChild(environment);
          const bgImg = new Image();
          bgImg.onload = () => {
            if (cancelled) return;
            const texture = Texture.from(bgImg);
            texture.source.scaleMode = "nearest";
            const bg = new PixiSprite(texture);
            bg.width = CANVAS_W; bg.height = CANVAS_H;
            environment.removeChildren().forEach(child => child.destroy({ children: true }));
            environment.addChild(bg);
          };
          bgImg.src = "/office-bg.png";
        }
        app.canvas.setAttribute("role", "img");
        app.canvas.setAttribute("aria-label", theme === "art" ? "Лофт (арт) DCM Lab и job-hunter" : theme === "loft" ? "Лофт-мастерская DCM Lab и job-hunter" : "Киберофис DCM Lab и job-hunter");

        atlasReadyRef.current = false;
        if (heroRenderer !== "graphics") {
          try { await loadHeroAtlas(heroRenderer); atlasReadyRef.current = true; }
          catch (error) { console.warn("Hero atlas unavailable; using Graphics:", error); }
        }
        if (cancelled) return;

        // Cats always keep their own art, including with a legacy renderer.
        if (heroRenderer !== 'art') await loadHeroAtlas('art');
        if (cancelled) return;
        // Agents layer (on top — renders above furniture)
        const agentsLayer = new Container();
        agentsLayer.label = "agents-layer";
        agentsLayer.sortableChildren = true;
        app.stage.addChild(agentsLayer);

        if (loft) app.stage.addChild(loft.foreground);
        if (sanyaDesk) app.stage.addChild(sanyaDesk.foreground);
        const annotationsLayer = new Container();
        annotationsLayer.label = "annotations-layer";
        app.stage.addChild(annotationsLayer);
        if(sanyaDesk) annotationsLayer.addChild(sanyaDesk.bubble);
        syncAgentsRef.current(agentsRef.current);
        const momentsLayer = new Container(); momentsLayer.label = 'office-moments'; momentsLayer.eventMode = 'none';
        app.stage.addChild(momentsLayer);
        const query = new URLSearchParams(window.location.search);
        let manualScene=false, manualMoments=false;
        let sharedStarting=false;
        let sharedRandom=sceneRandom(0);
        let sharedState:SharedOfficeState|null=null;
        let stateReceived=performance.now();
        let sharedTask:DirectorTask|null=null;
        let sharedDone=false;
        let activeSharedScene:SharedScene|null=null;
        let sharedCastKey='';
        const attendanceScene=theme==='art'?await createOfficeAttendanceScene(app,agentsLayer,(name,message)=>catActivityRef.current?.({name,message}),presence=>useOfficePresenceStore.getState().setPresence(presence),true):null;
        const attendance=attendanceScene?.engine;
        const ownerScene=theme==='art'?await createOwnerFeaturesScene(app,agentsLayer,message=>catActivityRef.current?.({name:'Евгений',message})):null;
        const owner=ownerScene?.engine;
        destroyOwnerScene=()=>{ownerScene?.destroy();attendanceScene?.destroy();};
        // All production scheduling belongs to the WS service.
        const play = theme === 'art' ? await createOffice22Scene(app, agentsLayer, {
          autonomous:false, random:()=>sharedRandom(), stream: query.get('stream') === '1', potDemo: false, laserDemo: false, heroDemo: false,
          paused:()=>!!owner?.busy||!!owner?.transportingChair||!!attendance?.sleep||attendance?.phase==='carrying'||manualScene, reduced: () => motionPreference.matches, emit: event => catActivityRef.current?.(event),
        }) : null;
        destroyPlayScene = () => play?.destroy();
        if (cancelled) { destroyPlayScene(); return; }
        const moments = theme === 'art' ? createOfficeMomentsScene(momentsLayer, false, {autonomous:false,random:()=>sharedRandom(),paused:()=>!!owner?.busy || !!attendance?.sleep || attendance?.phase==='carrying' || !!play?.pausesMoments() || manualScene&&!manualMoments, preview:()=>manualScene}) : null;
        const catEffectsLayer = new Container(); catEffectsLayer.label = 'cat-effects'; catEffectsLayer.eventMode = 'none';
        app.stage.addChild(catEffectsLayer);
        const catEffects = createCatReactionsScene(catEffectsLayer);
        const catLife = createCatLife();
        let catDemo: ReturnType<typeof parseCatDemo>;
        let keyboardDemo=false;
        let keyboardHost:AgentNode|null=null;
        const byName=(a:AgentNode,b:AgentNode)=>a.appearanceName<b.appearanceName?-1:a.appearanceName>b.appearanceName?1:0;
        const allNodes=()=>[...nodesRef.current.values()].filter(n=>!n.away).sort(byName);
        const attendanceNodes=()=>[...nodesRef.current.values()].sort(byName);
        const resetCats=()=>{
          catLife.chase=undefined;catLife.demoStarted=undefined;catLife.night=undefined;Object.assign(catLife,createCatLife(()=>sharedRandom()));
          for(const node of allNodes())if(node.cat){
            const fresh=createCat(node.appearanceName,{x:node.homeX,y:node.homeY});
            for(const key of Object.keys(node.cat))delete (node.cat as unknown as Record<string,unknown>)[key];
            Object.assign(node.cat,fresh);node.container.position.copyFrom(fresh.position);
          }
        };
        const stopPresentation=()=>{
          owner?.reset();play?.stop();moments?.stop();attendance?.reset(attendanceNodes(),true);catDemo=undefined;keyboardDemo=false;manualScene=false;manualMoments=false;manualDcm.current=null;
          setSanyaToast(null);setEggToast(0);setInspection(null);setWhoamiBubble(null);jarTappedUntil.current=0;
          for(const node of attendanceNodes()) {
            resetHeroAmbient(node);
            showSpriteVariant(node,'sit');
          }
          if(keyboardHost){keyboardHost.container.position.set(keyboardHost.homeX,keyboardHost.homeY);keyboardHost.route=[];transitionTo(keyboardHost,'SITTING');keyboardHost=null;}
          resetCats();
        };
        const timed=(seconds:number,stop:()=>void=()=>{}):DirectorTask=>{
          const until=sceneClock.current+seconds;return {done:()=>sceneClock.current>=until,stop};
        };
        const ensureCast=()=>{
          if(sharedStarting)return;
          if(holidayRef.current.codex.exhausted||holidayRef.current.claude.exhausted){
            const normal=directorHoliday(holidayRef.current,'off');holidayRef.current=normal;
            setManualHoliday('off');notifyDirector({holiday:'off'});syncAgentsRef.current(agentsRef.current);
          }
        };
        const prepare=()=>{
          ensureCast();
          if(theme!=='art')throw new Error('Для этой сценки выберите тему «Лофт (арт)»');
          if(!allNodes().some(n=>n.cat))throw new Error('В офисе сейчас нет котов');
          manualScene=true;resetCats();
        };
        const endScene=()=>{stopPresentation();};
        const runtime:DirectorRuntime={
          attendance(mode){
            if(!attendance)throw new Error('Выберите тему «Лофт (арт)»');
            manualScene=true;timeRef.current='night';art?.setTime('night');attendance.launch(mode,attendanceNodes(),activeSharedScene?.actorName);
            return timed(mode==='rush'?22:35);
          },
          owner(mode){
            if(!owner)throw new Error('Выберите тему «Лофт (арт)»');manualScene=true;play?.setCursor(false);owner.launch(mode,allNodes(),sharedStarting?!!activeSharedScene?.red:(manualDcm.current??dcmSignal.current)?.regression.status==='fail');
            return {done:()=>!owner.busy,stop:()=>{owner.stop();if(mode==='rounds'){const e=allNodes().find(n=>n.appearanceName==='Евгений');if(e)transitionTo(e,'SITTING');}manualScene=false;setInspection(null);play?.setCursor(directorState.current.cursor);}};
          },
          cat(mode){
            prepare();keyboardDemo=mode==='keyboard';catDemo=parseCatDemo(mode);
            if(keyboardDemo){
              keyboardHost=allNodes().find(n=>n.appearanceName==='Ярик')??null;
              if(!keyboardHost)throw new Error('Для показа клавиатуры нужен Ярик');
              keyboardHost.container.position.set(875,468);keyboardHost.route=[];transitionTo(keyboardHost,'SITTING');
              advanceCats(allNodes().flatMap(n=>n.cat?[n.cat]:[]),CAT_DEMO_DESKS.map(d=>({...d,absent:d.name===keyboardHost!.appearanceName})),0,sceneClock.current);
            }
            const started=sceneClock.current;
            return {done:()=>mode==='chase' ? sceneClock.current>started+1 && !catLife.chase && allNodes().every(n=>!n.cat||n.cat.phase==='home') : sceneClock.current>=started+(keyboardDemo?18:10),stop:endScene};
          },
          play(mode){prepare();play!.launch(mode,allNodes(),sceneClock.current);return {done:()=>!play!.busy,stop:endScene};},
          moment(mode){
            prepare();manualMoments=true;
            if(mode==='egg'){
              const owner=allNodes().find(n=>n.appearanceName==='Марина');
              if(!owner)throw new Error('Марина сейчас отсутствует');
              taps.current=[];for(let i=0;i<5;i++)inspectRef.current(agentsRef.current.find(a=>a.name==='Марина')!.id,'tap');
              return timed(6,endScene);
            }
            moments!.launch(mode,allNodes(),sceneClock.current);return {done:()=>!moments!.busy,stop:endScene};
          },
          tap(name){
            ensureCast();
            const agent=agentsRef.current.find(a=>a.name===name),node=agent&&nodesRef.current.get(agent.id);
            if(!agent || !node)throw new Error(`${name} сейчас отсутствует`);
            if(name==='Саня')sanyaTaps.current=[];
            for(let i=0;i<(name==='Саня'?5:1);i++)inspectRef.current(agent.id,'tap');
            return timed(6,()=>{setSanyaToast(null);setWhoamiBubble(null);setInspection(null);});
          },
          regression(status){
            ensureCast();
            if(!allNodes().some(n=>n.appearanceName==='Саня'))throw new Error('Саня сейчас отсутствует');
            manualDcm.current={bugCount:dcmSignal.current?.bugCount??null,bugTitle:null,regression:{status,timestamp:`director-${performance.now()}`,fresh:true}};
            const node=allNodes().find(n=>n.appearanceName==='Саня')!;
            if(status==='pass'){node.victoryUntil=node.eggClock+SANYA_VICTORY_SECONDS;showSanyaToast('Все тесты зелёные! ✅');}
            return timed(status==='fail'?10:6,()=>{manualDcm.current=null;setSanyaToast(null);});
          },
          holiday(mode){setManualHoliday(mode);notifyDirector({holiday:mode});return timed(0);},
          time(mode){attendance?.reset(attendanceNodes());timeRef.current=mode;art?.setTime(mode);if(mode==='evening'||mode==='night')attendance?.launch(mode,attendanceNodes());return timed(0);},
          cursor(){const cursor=!directorState.current.cursor;play?.setCursor(cursor);notifyDirector({cursor});return timed(0);},
          reset(){stopPresentation();timeRef.current='auto';art?.setTime('auto');setManualHoliday(null);play?.setCursor(true);notifyDirector({holiday:null,cursor:true});setMonitorZoom(null);monitors?.open(null);},
        };
        const director=createDirectorQueue(runtime,()=>!!owner?.busy || !!owner?.transportingChair || !!play?.busy || !!catLife.chase || !!moments?.busy || allNodes().some(n=>!!n.cat?.visit),state=>notifyDirector(state));
        directorRef.current=director;notifyDirector({ready:true});
        const demos=directorQueryEvents(query);localPresentation.current=demos.length>0;
        for(const id of demos)director.enqueue(id);
        play?.setCursor(directorState.current.cursor);

        const scoreboard=theme==='art'?createOfficeScoreboard(()=>window.dispatchEvent(new Event('office:open-stats'))):null;
        if(scoreboard)app.stage.addChild(scoreboard.container);
        let stats:OfficeStatsSnapshot|null=null;
        const statsUpdated=(event:Event)=>{stats=(event as CustomEvent<OfficeStatsSnapshot>).detail;};
        window.addEventListener('office:stats-updated',statsUpdated);
        window.dispatchEvent(new Event('office:request-stats'));

        const cast=(scene:SharedScene,run:()=>void)=>{
          const original=new Map([...nodesRef.current.values()].map(n=>[n,n.apiStatus]));
          for(const n of nodesRef.current.values()){const a=scene.actors?.find(a=>normalizeHeroName(a.name)===normalizeHeroName(n.appearanceName));if(a)n.apiStatus=a.status as AgentStatus;}
          try{run();}finally{for(const [n,status]of original)n.apiStatus=status;}
        };
        const advanceScenes=(dt:number,now:number,shared=false)=>{
          const before=shared?new Map(attendanceNodes().map(n=>[n,{x:n.cat?.position.x??n.container.x,y:n.cat?.position.y??n.container.y}])):null;
          if(!shared&&!localPresentation.current&&sharedState?.attendance)attendance?.applySnapshot(sharedState.attendance,attendanceNodes());
          const red=shared?!!playback.scene?.red:(manualDcm.current??dcmSignal.current)?.regression.status==='fail';
          if(owner&&(owner.busy||!manualScene&&!play?.busy&&!catLife.chase&&!moments?.busy&&(!attendance||attendance.phase==='awake')))owner.tick(allNodes(),dt,red);
          attendance?.tick(attendanceNodes(),dt,shared?playback.scene!.startedAt+now*1000:serverNow(),timeRef.current==='auto'?(sharedState?.attendance?.hour??directorHour('auto')):directorHour(timeRef.current),red,!!owner?.busy||!!owner?.transportingChair||manualScene&&!attendance?.demo||!!play?.busy||!!moments?.busy);
          play?.tick(allNodes(),dt,now,shared?false:holidayRef.current.all);
          moments?.tick(allNodes(),momentsSignal.current,dt,now,eggSerial.current);
          const catNodes=[...nodesRef.current.values()].filter(n=>n.cat).sort(byName);
          const desks=keyboardDemo?CAT_DEMO_DESKS.map(d=>({...d,absent:d.name===keyboardHost?.appearanceName})):catDemo||manualScene?CAT_DEMO_DESKS:allNodes().filter(n=>!n.cat).map(n=>({name:n.appearanceName,position:n.container,...deskPresence(n.appearanceName,n.apiStatus,n.seating,n.moveState==='WALKING_BACK'),absent:n.apiStatus==='offline'||n.quiet}));
          const hour=catDemo?(catDemo==='night'?0:12):directorHour(timeRef.current);
          const regular=catNodes.map(n=>n.cat!).filter(c=>!owner?.busy&&!play?.ownsCat(c)&&!attendance?.ownsCat(c));
          const events=owner?.busy||play?.pausesMoments()?[]:advanceCatLife(regular,desks,dt,now,catLife,{hour,holiday:shared?false:holidayRef.current.all,demo:catDemo,random:()=>sharedRandom(),autonomous:false});
          events.push(...advanceCats(catNodes.map(n=>n.cat!),desks,dt,now,new Set(catNodes.flatMap(n=>owner?.busy||play?.ownsCat(n.cat!)||attendance?.ownsCat(n.cat!)?[n.cat!]:[])),{autonomous:keyboardDemo}));
          for(const event of events)if(!sharedStarting)catActivityRef.current?.(event);
          if(before)for(const [n,p]of before)advanceHeroMotion(n.motion,(n.cat?.position.x??n.container.x)-p.x,(n.cat?.position.y??n.container.y)-p.y);
        };
        const playback=createSharedPlayback(scene=>{
          activeSharedScene=scene;
          sharedCastKey=attendanceNodes().map(n=>n.appearanceName).sort().join('|');
          sharedStarting=true;stopPresentation();timeRef.current='auto';art?.setTime('auto');
          sharedRandom=sceneRandom(scene.seed);sceneClock.current=0;sharedDone=false;
          // Ambient deadlines use a monotonic per-hero clock. Shared scene age
          // belongs to playback and must never rewind completed gestures.
          if(scene.attendance)attendance?.applySnapshot(scene.attendance,attendanceNodes());
          play?.setCursor(false);
          try{cast(scene,()=>{
            if(scene.attendance&&['evening','night','mattress','rush'].includes(scene.eventId)){
              if(scene.eventId==='rush'&&scene.actorName)attendance?.arrive(scene.actorName,attendanceNodes());
              timeRef.current=scene.eventId==='night'||scene.eventId==='mattress'?'night':scene.eventId==='evening'?'evening':'auto';art?.setTime(timeRef.current);
              sharedTask={done:()=>false,stop:()=>{}};
            }else sharedTask=directorEvent(scene.eventId)?.run(runtime)??null;
          });}catch(error){sharedDone=true;console.warn('Shared scene unavailable',scene.eventId,error);}
          sharedStarting=false;
        },(dt,age)=>{
          if(sharedDone)return;sceneClock.current=age;
          cast(playback.scene!,()=>advanceScenes(dt,age,true));
          if(sharedTask?.done()&&!['evening','night'].includes(playback.scene!.eventId)){sharedTask.stop();sharedTask=null;sharedDone=true;play?.setCursor(false);}
        },()=>{sharedTask?.stop();sharedTask=null;activeSharedScene=null;stopPresentation();timeRef.current='auto';art?.setTime('auto');play?.setCursor(directorState.current.cursor);});
        const serverNow=()=>sharedState?sharedState.serverNow+Math.max(0,performance.now()-stateReceived):Date.now();
        const ws=getMCWebSocket();
        const receive=(state:SharedOfficeState)=>{sharedState=state;stateReceived=performance.now();};
        const unsubscribe=ws.on('office:state',receive);
        const cached=ws.getOfficeState();if(cached)receive(cached as unknown as SharedOfficeState);
        ws.connect();
        resumeShared.current=()=>playback.reset();
        launchLocal.current=id=>{localPresentation.current=true;playback.reset();director.enqueue(id);};
        removeShared=()=>{unsubscribe();playback.reset();window.removeEventListener('office:stats-updated',statsUpdated);scoreboard?.destroy();};

        const warning = new Text({ text: '', style: new TextStyle({ fontFamily: 'Arial, sans-serif', fontSize: 10, fill: 0xcfc4ad, fontWeight: 'bold' }) });
        warning.label = 'codex-limit-warning'; warning.anchor.set(.5, 1); warning.eventMode = 'none';
        const warningBg = new Graphics(); warningBg.eventMode = 'none';
        const quotaLayer = new Container(); quotaLayer.label = 'office-quota-warning'; quotaLayer.eventMode = 'none';
        quotaLayer.addChild(warningBg, warning); app.stage.addChild(quotaLayer);

        const screenWorkers = new Map<string, DeskPresence>();
        if(monitors) app.stage.addChild(monitors.zoom);
        // Animation loop
        let lastTime = performance.now();
        let meetingTimer = randomRange(120, 240); // first meeting in 2-4 min
        let meetingActive = false;
        let meetingDuration = 0;
        let sceneTime = 0;

        function animate() {
          if (cancelled) return;
          const now = performance.now();
          const dt = Math.min((now - lastTime) / 1000, 0.25);
          lastTime = now;
          sceneTime += dt;
          sceneClock.current = sceneTime;
          const reducedMotion = motionPreference.matches;
          if(localPresentation.current){if(playback.scene)playback.reset();director.tick();}
          else {
            const castKey=attendanceNodes().map(n=>n.appearanceName).sort().join('|');
            if(playback.scene&&castKey!==sharedCastKey)playback.reset();
            // The initial WS snapshot can precede the roster request.
            if(attendanceNodes().some(n=>n.cat)&&attendanceNodes().some(n=>n.appearanceName==='Евгений'))playback.sync(sharedState?.scene??null,serverNow());
            if(playback.scene){sceneTime=playback.age;sceneClock.current=sceneTime;}
          }
          if(stats)scoreboard?.update(stats,performance.now()/1000);
          screenWorkers.clear();
          const previousPositions = new Map([...nodesRef.current.values()].map(n=>[n,{x:n.container.x,y:n.container.y}]));
          // Owner input takes priority over the old ambient cat chase.
          if (play && (play.hunt.pointer || play.hunt.laser) && catLife.chase) {
            catLife.chase = undefined;
            for (const n of nodesRef.current.values()) if(n.cat?.phase==='chasing' && !play.ownsCat(n.cat)) {
              n.cat.phase='returning'; n.cat.chaseReturning=undefined;
            }
          }
          if(!playback.scene)advanceScenes(dt,sceneTime);
          const motya = agentsRef.current.find(a => normalizeHeroName(a.name) === "мотя");
          const workerActive = motya?.currentStatus === "working" || motya?.currentStatus === "thinking" || motya?.currentStatus === "busy";
          const jh = sceneAgents(agentsRef.current).find(a => a.name === 'JH');
          art?.update(sceneTime, manualDcm.current ? manualDcm.current.regression.status==='fail'?'red':'green' : dcmRegression(agentsRef.current), workerActive, holidayRef.current.all,
            jh ? heroStatusColor(jh.currentStatus || 'idle', jh.statusText || '') : undefined);
          loft?.update(sceneTime, manualDcm.current ? manualDcm.current.regression.status==='fail'?'red':'green' : dcmRegression(agentsRef.current), workerActive && !holidayRef.current.all);

          // Auto-meeting logic
          meetingTimer = Infinity; // Shared standup replaces per-browser automatic meetings.
          if (meetingActive) {
            meetingDuration -= dt;
            if (meetingDuration <= 0) {
              // End meeting — send agents back
              for (const [, node] of nodesRef.current) {
                if (node.moveState === "AT_MEETING") {
                  transitionTo(node, "WALKING_BACK");
                }
              }
              meetingActive = false;
              meetingTimer = randomRange(180, 360); // next in 3-6 min
            }
          } else if (meetingTimer <= 0 && theme === "cyber") {
            // Start meeting — pick 2-3 idle agents (not Дед)
            const idleAgents = Array.from(nodesRef.current.entries())
              .filter(([id, n]) => id !== "ded" && id !== "lenochka" && !n.cat && !isStationary(n) && n.apiStatus === "idle" && n.moveState === "SITTING");
            if (idleAgents.length >= 2) {
              const count = Math.min(idleAgents.length, 2 + Math.floor(Math.random() * 2)); // 2-3
              const shuffled = idleAgents.sort(() => Math.random() - 0.5).slice(0, count);
              const seats = MEETING_SEATS;
              shuffled.forEach(([, node], i) => {
                if (theme !== "cyber") { sendToKitchen(node, nodesRef.current, true); return; }
                const seat = seats[i % seats.length];
                node.interactTarget = "__meeting__";
                node.targetX = MEETING_TABLE_POS.x + seat.x;
                node.targetY = MEETING_TABLE_POS.y + seat.y;
                transitionTo(node, "WALKING_TO");
              });
              meetingActive = true;
              meetingDuration = randomRange(20, 40); // meeting lasts 20-40 sec
            } else {
              meetingTimer = randomRange(60, 120); // retry in 1-2 min
            }
          }

          for (const [, node] of nodesRef.current) {
            if (node.cat) continue;
            node.container.alpha=node.annotation.alpha=owner?.poses.get(node)?.opacity ?? play?.opacity(node) ?? attendance?.opacity(node) ?? 1;
            node.container.visible=!node.away;node.annotation.visible=!node.away;
            if(node.away)continue;
            const attendancePose=attendance?.poses.get(node);
            const effectiveStatus=attendance?.status(node)??node.apiStatus;
            const previousX = previousPositions.get(node)!.x, previousY = previousPositions.get(node)!.y;
            const ownerOwned=!!owner?.owns(node);
            const ownerPose=owner?.poses.get(node)??attendancePose;
            const attendanceOwned=!!attendance?.owns(node);
            const sceneOwned = ownerOwned || attendanceOwned || !!play?.ownsPerson(node) || keyboardHost===node;
            const sceneFrame = (ownerPose?.frame==='walk'?undefined:ownerPose?.frame) ?? play?.frame(node,sceneTime) ?? undefined;
            node.animTime += dt;
            if(!owner?.busy)node.eggClock += dt;
            if (!node.atlas && node.theme === "art") {
              for (const pose of [node.sprite, ...node.walkFrames, node.stretchSprite, node.coolerSprite]) pose.y = -20;
            }
            if(ownerOwned||attendanceOwned){
              node.route=[];node.routePlanned=false;node.moveState='SITTING';node.idleTimer=0;
              showSpriteVariant(node,ownerPose?.frame==='walk' || ownerPose?.frame?.startsWith('chair_walk') || ownerPose?.frame==='owner_pizza'?'walk':'sit');
            } else if (sceneOwned) {
              node.route=[]; node.routePlanned=false; node.idleTimer=0; node.moveState='SITTING';
              showSpriteVariant(node, sceneFrame?.startsWith('run_') || sceneFrame==='scene_carry' ? 'walk' : 'sit');
            } else if (moments?.owns(node)) {
              node.moveState = 'SITTING'; node.route = []; node.routePlanned = false; node.idleTimer = 0;
              node.walkFrameTimer += dt;
              if (node.walkFrameTimer >= WALK_FRAME_INTERVAL) { node.walkFrameTimer = 0; node.walkFrame = node.walkFrame === 0 ? 1 : 0; }
              showSpriteVariant(node, moments.walking() ? 'walk' : 'sit');
            } else if (!node.quiet && !playback.scene) updateMovement(node, dt, nodesRef.current);
            const dx = node.container.x - previousX, dy = node.container.y - previousY;
            if(!playback.scene)advanceHeroMotion(node.motion, dx, dy);
            // Route retries, collision waits and queued walks can all stop a
            // walker before its state changes. Never retain a frozen step.
            if (Math.hypot(dx, dy) <= .01 && node.walkFrames.some(pose => pose.visible)) {
              showSpriteVariant(node, 'sit');
              node.walkFrameTimer = 0;
            }
            if (!node.atlas) {
              node.particles.visible = !reducedMotion;
              node.glowOverlay.visible = !reducedMotion;
              if (!reducedMotion) animateAgent(node, dt);
              else { node.sprite.y = -20; node.sprite.rotation = 0; }
              if (node.theme === "art") {
                for (const pose of [node.sprite, ...node.walkFrames, node.stretchSprite, node.coolerSprite]) {
                  if (pose.visible) pose.y = 0;
                }
              }
            }
            const sanya = theme==='art' && normalizeHeroName(node.appearanceName)==='саня';
            const seat = ownerPose?.seat ?? (theme==='art' && node.renderer==='art' ? deskSeat(node.appearanceName) : undefined);
            const atHome = node.moveState==='SITTING' && Math.hypot(node.container.x-node.homeX,node.container.y-node.homeY)<3;
            const keyboard = seatedKeyboard(node.appearanceName);
            const catClear = ![...nodesRef.current.values()].some(n=>n.cat && (n.cat.desk===node.appearanceName ||
              keyboard && Math.hypot(n.cat.position.x-keyboard.x,n.cat.position.y-keyboard.y)<40));
            const posture = seat && !ownerOwned && (!sceneOwned || !sceneFrame) ? advanceDeskSeating(node.seating,node.appearanceName,effectiveStatus,atHome,node.eggClock,playback.scene?0:dt,catClear) : undefined;
            const seated = ownerPose?.seated ?? ((!sceneOwned || play?.playing(node)) && sanya && node.moveState==='SITTING' || !!posture?.seated || !!play?.playing(node) && atHome && !!seat);
            node.visualSeated=seated;
            const deskAction = advanceDeskLife(node.deskLife, node.eggClock,
              !seated && !reducedMotion && !node.quiet && node.apiStatus === 'idle' && node.moveState === 'SITTING' && !moments?.owns(node) && !sceneOwned);
            if (deskAction) showSpriteVariant(node, seated ? 'sit' : deskAction === 'stretch' ? 'stretch' : deskAction === 'cup' ? 'cooler' : 'sit');
            else if (node.moveState === 'SITTING' && !moments?.owns(node) && !sceneOwned) showSpriteVariant(node,'sit');
            if (posture?.seated || play?.playing(node)) showSpriteVariant(node,'sit');
            const atDesk = Math.hypot(node.container.x-node.homeX,node.container.y-node.homeY)<3;
            screenWorkers.set(normalizeHeroName(node.appearanceName), {present:(!seat ? atDesk : workstationOccupied(node.appearanceName,[{
              name:node.appearanceName,position:node.container,seated,absent:node.apiStatus==='offline'||node.quiet,
            }])),
              working:!owner?.busy && atDesk && (!seat || node.seating.phase==='seated') && isDeskWorking(effectiveStatus)});
            const rareGesture = advanceRareGesture(node.rareGesture, node.eggClock,
              !sceneOwned && !node.quiet && !reducedMotion && (!node.sprite.label.startsWith("hero-ася-") || node.apiStatus === "working" || node.apiStatus === "thinking"));
            const shadow=node.container.getChildByLabel('foot-contact-shadow'); if(shadow) shadow.visible=!seated;
            for (const variant of [node.sprite, ...node.walkFrames, node.stretchSprite, node.coolerSprite]) {
              if (!variant.visible) continue;
              if (node.atlas) {
                animateAtlasPose(variant, ownerOwned?sceneTime:node.eggClock, node.moveState === "SITTING" &&
                  rareGesture && !deskAction && !seated && !sceneOwned, node.apiStatus === "offline" && !sceneOwned, { sceneFrame, sceneFacing:ownerPose?.facing, chewing:ownerPose?.chewing, sceneLift:ownerPose?.lift ?? play?.lift(node,sceneTime), responding: node.eggClock < node.responseUntil, bug: node.eggClock < node.bugUntil,
                    distance: node.motion.distance, facing: node.motion.facing, moving: Math.hypot(dx, dy) > .01,
                    working: ownerPose?.working ?? (!owner?.busy && !node.quiet && node.moveState === 'SITTING' && isDeskWorking(effectiveStatus)), lookAround: deskAction === 'look', reducedMotion,
                    seated, seatedBack:!!seat, reclining:posture?.reclining, sitProgress:ownerOwned?1:posture?.progress,
                    seatOffset:seat ? {x:(seat.x-node.container.x)/node.container.scale.x,y:(seat.y-node.container.y)/node.container.scale.y} : {x:0,y:55/node.container.scale.y},
                    seatScale:seat ? deskSeatScale(node.appearanceName) : 110/72/node.container.scale.y,
                    thinking: ownerPose?.thinking ?? posture?.thinking ?? (seated && (!!deskAction || !isDeskWorking(effectiveStatus))), victory: sanya && node.eggClock<node.victoryUntil });
                // Art coordinates are feet; legacy backgrounds use feet 18px above the anchor.
                if(ownerPose?.shake&&!reducedMotion)variant.x+=Math.sin(sceneTime*90)*ownerPose.shake/node.container.scale.x;
                variant.y += (node.theme === "art" ? 0 : -20) - (node.renderer === "art" ? 0 : -20);
              } else animateHeroSprite(variant, reducedMotion ? 0 : node.eggClock, {
                working: !reducedMotion && (node.apiStatus === 'working' || node.apiStatus === 'thinking'),
                regressionFailed: !reducedMotion && /Последняя регрессия: ⚠/.test(node.liveText),
                bugFound: !reducedMotion && node.eggClock < node.bugUntil,
                responseSent: !reducedMotion && node.eggClock < node.responseUntil,
                rareGesture: !reducedMotion && rareGesture,
              });
            }
            // Sort by Y for z-ordering
            // Wall gestures stand in the front apron, ahead of desk chairs whose
            // navigation anchors sit farther down than their painted wheel contact.
            node.container.zIndex = node.container.y + (ownerPose?.gaze ? 24 : 0);
          }
          for(const [name,presence]of screenWorkers){if(owner?.dark||name==='евгений'&&attendance?.sleep)presence.powerOff=true;if(name==='евгений'&&owner?.review){presence.present=true;presence.working=true;presence.review=owner.reviewGreen?'green':'red';}}
          art?.updateDesks(sceneTime, screenWorkers);
          const sanya=[...nodesRef.current.values()].find(n=>normalizeHeroName(n.appearanceName)==='саня');
          sanyaDesk?.update(sceneTime,manualDcm.current??dcmSignal.current,sanya ? {container:sanya.container,headY:(atlasHeadY(sanya.sprite)??-90)*sanya.container.scale.y,working:!!screenWorkers.get('саня')?.working}:undefined,reducedMotion,jarTappedUntil.current);
          const catNodes = [...nodesRef.current.values()].filter(n => n.cat);
          const night=isCatNight(directorHour(timeRef.current));
          for (const node of catNodes) {
            const cat = node.cat!;
            node.eggClock = sceneTime;
            const dx = cat.position.x - (owner?.busy||attendance?.ownsCat(cat)?previousPositions.get(node)!.x:node.container.x), dy = cat.position.y - (owner?.busy||attendance?.ownsCat(cat)?previousPositions.get(node)!.y:node.container.y);
            if(!playback.scene)advanceHeroMotion(node.motion, dx, dy);
            node.container.position.copyFrom(cat.position);
            const walking = owner?.busy?Math.hypot(dx,dy)>.01:cat.phase === 'walking' || cat.phase === 'returning' || cat.phase === 'chasing';
            showSpriteVariant(node, walking ? 'walk' : 'sit');
            const pose = walking ? node.walkFrames[node.walkFrame] : node.sprite;
            const frame = catPose(cat, sceneTime, night, holidayRef.current.all);
            setCatAtlasPose(pose, owner?.busy&&walking?'walk':frame);
            animateAtlasPose(pose, sceneTime, false, false, { sceneFrame:attendance?.ownsCat(cat)&&cat.phase==='home'?'cup':owner?.poses.get(node)?.frame==='walk'?undefined:owner?.poses.get(node)?.frame ?? play?.frame(node,sceneTime) ?? undefined, sceneLift:owner?.poses.get(node)?.lift ?? play?.lift(node,sceneTime), distance: node.motion.distance, facing: node.motion.facing, moving: Math.hypot(dx, dy) > .01, reducedMotion });
            pose.scale.y = 1;
            // Desktop cats render over the keyboard, monitor base and passing
            // floor sprites, rather than sorting behind them by desktop Y.
            node.container.zIndex = cat.desk || play?.story?.cat===cat && !play.story.catEscaping ? 1000 : attendance?.mattress&&attendance.ownsCat(cat) ? Math.max(430,cat.position.y) : cat.position.y;
            const catText = play?.ownsCat(cat) ? play.story?.cat===cat ? 'я ничего не трогал…' : 'охота' : cat.visit ? '♥' : cat.desk ? `проверяет клавиатуру · ${cat.desk}` : cat.phase === 'chasing' ? 'догонялки' : cat.activity
              ? ({ wash: 'умывается', stretch: 'потягивается', belly: 'пузико кверху', window: 'смотрит в окно' })[cat.activity] : frame === 'cup' ? 'спит клубком' : 'отдыхает в свободной лежанке';
            if (node.liveText !== catText) {
              node.liveText = catText;
              updateStatusBubble(node, 'idle', { name: node.appearanceName, statusText: catText } as Agent);
            }
          }
          positionAnnotations([...allNodes(), ...fixturesRef.current.values()], detailsRef.current);
          catEffectsLayer.visible = !reducedMotion;
          if (!reducedMotion && !owner?.busy) catEffects.tick([...nodesRef.current.values()], sceneTime, night, holidayRef.current.all);
          for (const fixture of fixturesRef.current.values()) {
            if (fixture.label.text === "JH") fixture.statusDot.alpha = reducedMotion ? 1 : .85 + (sceneTime % 9 < .6 ? Math.sin(sceneTime * 5) * .15 : 0);
          }
          moments?.place([...nodesRef.current.values(), ...fixturesRef.current.values()]);
          ownerScene?.render(allNodes(),sceneTime);
          attendanceScene?.render(attendanceNodes());
          const leha = [...nodesRef.current.values()].find(n => normalizeHeroName(n.appearanceName) === 'леха');
          quotaLayer.visible = holidayRef.current.codex.warning && !!leha;
          if (quotaLayer.visible && leha) {
            warning.text = `Codex ${Math.floor(holidayRef.current.codex.usedPercent)} %`;
            quotaLayer.position.set(leha.annotation.x, leha.annotation.y - 7);
            warningBg.clear().roundRect(-warning.width / 2 - 7, -warning.height - 4, warning.width + 14, warning.height + 7, 5)
              .fill({ color: 0x3c3225, alpha: .96 }).stroke({ color: 0xbda26e, width: 1 });
          }
          const selected = inspectionRef.current && findSceneNode(inspectionRef.current.id);
          const tooltip = tooltipRef.current;
          if (selected && tooltip) positionHeroTooltip(el, tooltip, selected);
        }
        // Pixi renders after the simulation in the SAME throttled ticker.
        app.ticker.maxFPS = 20;
        app.ticker.add(animate, undefined, UPDATE_PRIORITY.HIGH);
        const visibilityChanged = () => {
          lastTime = performance.now();
          if (document.hidden) app.stop(); else app.start();
        };
        document.addEventListener("visibilitychange", visibilityChanged);
        removeVisibilityListener = () => document.removeEventListener("visibilitychange", visibilityChanged);
        visibilityChanged();
        } catch (err) {
          if (cancelled) return;
          console.error("Pixi init failed:", err);
          const fallback = document.createElement("div");
          fallback.setAttribute("role", "img");
          fallback.setAttribute("aria-label", "Офис: статичный фон, анимация недоступна");
          fallback.style.cssText = `position:absolute;inset:0;background:url(${theme === "art" ? "/office-bg-ai.png" : theme === "loft" ? "/office-bg-loft.png" : "/office-bg.png"}) center/contain no-repeat #292c2d`;
          el.replaceChildren(fallback);
        }
      })();

      return () => {
        cancelled = true;
        destroyedRef.current = true;
        directorRef.current?.stop();directorRef.current=null;notifyDirector({ready:false});
        removeShared();
        removeVisibilityListener();
        removeDensityObserver();
        destroyOwnerScene();destroyPlayScene();
        monitorsRef.current?.destroy();monitorsRef.current=null;
        nodesRef.current.clear();
        fixturesRef.current.clear();
        try {
          app.destroy(true, { children: true });
        } catch (_) {
          // PixiJS 8.x cleanup
        }
        appRef.current = null;
      };
    }, [theme, heroRenderer]);

    // Sync agent data into PixiJS nodes
    const syncAgents = useCallback(
      (agentList: Agent[]) => {
        const app = appRef.current;
        if (!app || destroyedRef.current) return;

        const agentsLayer = app.stage.children.find(
          (c) => c.label === "agents-layer",
        ) as Container | undefined;
        if (!agentsLayer) return;

        agentList = sceneAgents(agentList).filter(a => a.name !== 'JH' || theme === 'art');
        const validIds = new Set(agentList.map((a) => a.id));

        // Remove archived agents as soon as the active roster changes.
        for (const [id, node] of nodesRef.current) {
          if (!validIds.has(id)) {
            agentsLayer.removeChild(node.container);
            node.container.destroy({ children: true });
            node.annotation.destroy({ children: true });
            nodesRef.current.delete(id);
          }
        }

        for (const [id, node] of fixturesRef.current) {
          if (!validIds.has(id)) {
            node.container.destroy({ children: true });
            node.annotation.destroy({ children: true });
            fixturesRef.current.delete(id);
          }
        }

        // Create or update agents
        for (const agent of agentList) {
          const fixture = officeFixture(theme, agent.name);
          const previousFixture = fixturesRef.current.get(agent.id);
          if (previousFixture && !fixture) {
            previousFixture.container.destroy({ children: true });
            previousFixture.annotation.destroy({ children: true });
            fixturesRef.current.delete(agent.id);
          }
          if (fixture) {
            // A background fixture has inspection and status, with no movement
            // state, sprite, route or floor home in the agent simulation.
            const previousAgent = nodesRef.current.get(agent.id);
            if (previousAgent) {
              previousAgent.container.destroy({ children: true });
              previousAgent.annotation.destroy({ children: true });
              nodesRef.current.delete(agent.id);
            }
            let node = fixturesRef.current.get(agent.id);
            if (!node) {
              node = createFixtureNode(agent, fixture, onAgentClick, (id, action) => inspectRef.current(id, action));
              fixturesRef.current.set(agent.id, node);
              app.stage.getChildByLabel('art-office-environment')?.addChild(node.container);
              app.stage.getChildByLabel('annotations-layer')?.addChild(node.annotation);
            }
            node.label.text = agent.name;
            updateStatusBubble(node, agent.currentStatus || 'idle', agent);
            continue;
          }
          const pos = officeHome(theme, agent);

          let node = nodesRef.current.get(agent.id);

          // Names own appearances. A rename also refreshes every pose, while ID
          // continues to own status, movement, click handlers and desk position.
          if (node && node.appearanceName !== agent.name) {
            agentsLayer.removeChild(node.container);
            node.container.destroy({ children: true });
            node.annotation.destroy({ children: true });
            nodesRef.current.delete(agent.id);
            node = undefined;
          }

          if (!node) {
            node = createAgentNode(
              agent,
              pos.x,
              pos.y,
              theme,
              isOfficeCat(agent.name) || ["евгений", "марина", "саня"].includes(normalizeHeroName(agent.name)) ? "art" : atlasReadyRef.current ? heroRenderer : "graphics",
              onAgentClick,
              (id, action) => inspectRef.current(id, action),
            );
            nodesRef.current.set(agent.id, node);
            agentsLayer.addChild(node.container);
            app.stage.getChildByLabel("annotations-layer")?.addChild(node.annotation);
            // Initialize bubble on first render
            const initStatus = (agent.currentStatus || "idle") as AgentStatus;
            node.apiStatus = initStatus;
            updateStatusBubble(node, initStatus, agent);
          }

          const liveText = agent.statusText || '';
          if (liveText !== node.liveText) {
            const sent = (text: string) => [...text.matchAll(/откликов (\d+)/g)].reduce((sum, m) => sum + Number(m[1]), 0);
            if (node.liveText && sent(liveText) > sent(node.liveText)) node.responseUntil = node.eggClock + 3;
            if (/баг|ошиб|bug|fail|красн/i.test(liveText)) node.bugUntil = node.eggClock + 3;
            node.liveText = liveText;
          }
          node.quotaAway = holidaySceneMode(agent.name, holidayRef.current) === 'away';
          node.quiet = holidaySceneMode(agent.name, holidayRef.current) !== 'normal';
          node.particles.visible = !node.quiet; node.glowOverlay.visible = !node.quiet;
          if (node.quiet) {
            node.route=[];node.routePlanned=false;node.moveState='SITTING';
            showSpriteVariant(node,'sit');
          }
          node.label.text = agent.name;
          if (node.homeX !== pos.x || node.homeY !== pos.y) {
            node.homeX = pos.x;
            node.homeY = pos.y;
            if (node.moveState === "SITTING") {
              node.container.position.set(pos.x, pos.y);
            }
          }

          // Update API status
          const status = (agent.currentStatus || "idle") as AgentStatus;
          if (node.apiStatus !== status) {
            const oldStatus = node.apiStatus;
            node.apiStatus = status;
            node.animTime = 0;

            // If agent is now working/thinking/busy, cancel any movement and go home
            if (status !== "idle" && status !== "offline") {
              if (node.moveState !== "SITTING") {
                if (theme === "art") transitionTo(node, "WALKING_BACK");
                else transitionTo(node, "SITTING");
              }
            }

            // If agent went idle from non-idle, reset idle timer
            if (status === "idle" && oldStatus !== "idle") {
              node.idleTimer = 0;
              node.idleInterval = node.theme === "art" ? nextOfficeWalk() : randomRange(45, 90);
            }

            updateStatusBubble(node, status, agent);
          } else {
            // Status unchanged but text may have changed — refresh bubble
            updateStatusBubble(node, status, agent);
          }


        }
      },
      [onAgentClick, theme, heroRenderer],
    );

    syncAgentsRef.current = syncAgents;

    // Re-sync whenever agents array changes
    useEffect(() => {
      syncAgents(agents);
    }, [agents, syncAgents, holidayKey]);

    return (
      <div
        ref={containerRef}
        onMouseLeave={() => {
          retainTooltip();
          setInspection(previous => previous?.pinned ? previous : null);
        }}
        className={`relative overflow-hidden bg-[#0a0a12] ${className ?? ""}`}
        style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
      >
        {holiday.all && !monitorZoom && <div role="status" aria-label="Офис на выходном" style={{ position: 'absolute', zIndex: 16, top: '2%', left: '50%', transform: 'translateX(-50%)', width: 'max-content', maxWidth: 'calc(100% - 16px)', boxSizing: 'border-box', padding: '6px 14px', borderRadius: 12, background: '#dbe8edf0', border: '1px solid #93afc2', color: '#354c5a', textAlign: 'center', fontSize: 'clamp(11px, 1.2vw, 16px)', boxShadow: '0 3px 18px #142e3926', pointerEvents: 'none' }}>
          <div>🏖 Офис на выходном{holiday.returnsAt ? ` до ${formatReset(holiday.returnsAt)}` : ''}</div>
          <div style={{ fontSize: '.85em', opacity: .8 }}>{holiday.returnsAt ? holidayCountdown(holiday.returnsAt, holidayNow) : 'ждём сброса лимитов'}</div>
        </div>}
        {theme === 'art' && <>
          {DESK_SCREENS.map(s=><button key={s.id} ref={el=>{if(el)monitorButtons.current.set(s.id,el);else monitorButtons.current.delete(s.id);}} tabIndex={monitorZoom?-1:0} type="button" aria-label={`Монитор ${s.name} ${s.index+1}`} onClick={()=>monitorTap(s.id)}
            style={{position:'absolute',zIndex:17,left:`${s.bounds.x/CANVAS_W*100}%`,top:`${s.bounds.y/CANVAS_H*100}%`,width:`${s.bounds.width/CANVAS_W*100}%`,height:`${s.bounds.height/CANVAS_H*100}%`,clipPath:`polygon(${s.points.reduce<string[]>((a,n,i)=>{if(i%2===0)a.push(`${(n-s.bounds.x)/s.bounds.width*100}% ${(s.points[i+1]-s.bounds.y)/s.bounds.height*100}%`);return a;},[]).join(',')})`,border:0,padding:0,background:'transparent',cursor:'zoom-in',touchAction:'manipulation'}} />)}
          {monitorZoom&&<div role="dialog" aria-modal="true" aria-label={`Монитор ${DESK_SCREENS.find(s=>s.id===monitorZoom.id)?.name}`} onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();e.currentTarget.querySelector('button')?.focus();}}} style={{position:'absolute',inset:0,zIndex:35}}>
            <button type="button" autoFocus aria-label="Закрыть монитор" onClick={()=>monitorTap(monitorZoom.id,true)} style={{position:'absolute',inset:0,width:'100%',height:'100%',border:0,background:'transparent',cursor:'zoom-out',color:'#e4e3c9'}}>
              <span style={{position:'absolute',top:'18%',left:'20%',right:'20%',fontFamily:'monospace',fontSize:'clamp(10px,1.2vw,16px)'}}>{DESK_SCREENS.find(s=>s.id===monitorZoom.id)?.name} · {Number(monitorZoom.id.split('-').at(-1))+1} <span aria-hidden="true">×</span></span>
              <span style={{position:'absolute',top:'81.5%',left:'15%',right:'15%',fontFamily:'monospace',fontSize:'clamp(9px,1vw,14px)'}}>{monitorZoom.secret?MONITOR_SECRET:'Тап — закрыть · 7 секунд'}</span>
            </button>
          </div>}
          <div style={{display:'contents',visibility:monitorZoom?'hidden':'visible'}}>
          <button type="button" aria-label="Проверить УЗО — рубильник" onClick={()=>launchLocal.current('breaker')} style={{position:'absolute',zIndex:15,left:`${OWNER_FIXTURES.breaker.x/960*100}%`,top:`${OWNER_FIXTURES.breaker.y/600*100}%`,width:`${OWNER_FIXTURES.breaker.width/960*100}%`,height:`${OWNER_FIXTURES.breaker.height/600*100}%`,minWidth:44,minHeight:44,padding:0,border:0,background:'transparent',cursor:'pointer',touchAction:'manipulation'}} />
          <button type="button" aria-label="Банка с пойманным багом" onClick={() => {
            jarTappedUntil.current=sceneClock.current+3;
            setInspection(null); showSanyaToast(sanyaBugTooltip(dcmSignal.current));
          }} style={{position:'absolute',zIndex:15,left:`${SANYA_DESK.jar.x/CANVAS_W*100}%`,top:`${(SANYA_DESK.jar.y-10)/CANVAS_H*100}%`,transform:'translate(-50%,-50%)',width:32,height:32,padding:0,border:0,background:'transparent',cursor:'pointer',touchAction:'manipulation'}} />
          <button type="button" aria-label="Штатив с телефоном Сани" onClick={() => {setInspection(null);showSanyaToast('Снимаю баг на видео для отчёта 🎥');}} style={{position:'absolute',zIndex:15,left:`${SANYA_DESK.phone.x/CANVAS_W*100}%`,top:`${SANYA_DESK.phone.y/CANVAS_H*100}%`,transform:'translate(-50%,-50%)',width:32,height:32,padding:0,border:0,background:'transparent',cursor:'pointer',touchAction:'manipulation'}} />
          {sanyaToast && <div role="status" aria-label="Пасхалка Сани" style={{position:'absolute',zIndex:41,bottom:12,left:'50%',transform:'translateX(-50%)',width:'max-content',maxWidth:'calc(100% - 24px)',boxSizing:'border-box',padding:'10px 16px',borderRadius:10,background:'#293823f5',border:'1px solid #a3bd72',color:'#f3f8e7',fontSize:'clamp(12px, 1.4vw, 17px)',whiteSpace:'pre-line'}}>{sanyaToast.text}</div>}
          {!!eggToast && <div role="status" style={{ position: 'absolute', zIndex: 40, bottom: 12, left: '50%', transform: 'translateX(-50%)', width: 'max-content', maxWidth: 'calc(100% - 24px)', padding: '12px 18px', borderRadius: 12, background: '#442639f5', border: '1px solid #ff8caf', color: '#fff3f6', textAlign: 'center', fontSize: 'clamp(12px, 1.5vw, 18px)', boxShadow: '0 4px 24px #0008' }}>{EGG_TOAST}</div>}
          </div>
        </>}
        {inspectedAgent && <div ref={tooltipRef} role="tooltip" onPointerEnter={retainTooltip} onPointerLeave={() => inspection && inspectRef.current(inspection.id, 'leave')} className="absolute z-20 max-h-[90%] overflow-auto rounded border border-[#a58258] bg-[#171916]/95 p-3 text-xs text-[#f4eadb] shadow-lg" style={{ width: 300, maxWidth: 'calc(100% - 16px)', left: 8, top: 8 }}>
          <div className="flex items-start justify-between gap-3">
            <strong>{heroHoliday(inspectedAgent.name, holiday) ? <>{inspectedAgent.name} · {holidayLabel(heroHoliday(inspectedAgent.name, holiday)!)}</> : normalizeHeroName(inspectedAgent.name) === 'whoami' ? WHOAMI_TOOLTIP : <>{inspectedAgent.name} · {({ working: 'Работает', thinking: 'Думает', busy: 'Занят', idle: 'Отдыхает', offline: 'Не в сети' })[inspectedAgent.currentStatus || 'idle']}</>}</strong>
            <button type="button" aria-label="Закрыть статус героя" onClick={() => setInspection(null)} className="px-1">×</button>
          </div>
          <p className="mt-1 text-[#c4b79f]">{inspectedAgent.role}</p>
          {normalizeHeroName(inspectedAgent.name) === 'whoami' && whoamiBubble && <p role="status" aria-label="Пасхалка whoami" className="mt-2 rounded-lg border border-[#799986] bg-[#25372c] p-2 font-mono">{whoamiBubble}</p>}
          <p className="mt-2 whitespace-pre-wrap break-words">{inspectedAgent.statusText || inspectedAgent.description || 'Нет активного задания'}</p>
          {inspectedNode && 'cat' in inspectedNode && inspectedNode.cat && <p className="mt-2">{inspectedNode.cat.desk ? `Проверяет клавиатуру · ${inspectedNode.cat.desk}` : catHome(inspectedNode.cat).label}</p>}
        </div>}
      </div>
    );
  },
);

// ---------- agent node factory ----------

function createNameAnnotation(name: string, annotation: Container) {
  const namePlate = new Container();
  namePlate.label = 'name-plate';
  const nameBackground = new Graphics();
  const statusDot = new Graphics(); statusDot.label = 'status-dot';
  const label = new Text({ text: name, style: new TextStyle({
    fontFamily: '"Courier New", monospace', fontSize: 11, fontWeight: 'bold', fill: 0xfffaf0,
  }) });
  label.label = 'hero-name'; label.anchor.set(0.5, 0); label.y = 3;
  namePlate.addChild(nameBackground, statusDot, label);
  const nameLink = new Graphics(); nameLink.label = 'name-link'; nameLink.eventMode = 'none';
  annotation.addChild(nameLink, namePlate);
  const statusBubble = new Container();
  statusBubble.label = 'status-bubble'; statusBubble.visible = false;
  annotation.addChild(statusBubble);

  return { namePlate, nameBackground, statusDot, label, statusBubble };
}

function createFixtureNode(
  agent: Pick<Agent, 'id' | 'name'>,
  fixture: FixtureNode['fixture'],
  onClick?: (id: string) => void,
  onInspect?: (id: string, action: 'enter' | 'leave' | 'tap') => void,
): FixtureNode {
  const container = new Container();
  container.label = `fixture-node-${agent.id}`;
  const [x, y, width, height] = fixture.rect;
  container.position.set(x, y);
  container.hitArea = new Rectangle(0, 0, width, height);
  container.eventMode = 'static';
  container.cursor = 'pointer';
  container.on('pointerover', () => onInspect?.(agent.id, 'enter'));
  container.on('pointerout', () => onInspect?.(agent.id, 'leave'));
  container.on('pointertap', () => { onInspect?.(agent.id, 'tap'); onClick?.(agent.id); });
  const annotation = new Container();
  annotation.label = `annotation-${agent.id}`;
  const plate = createNameAnnotation(agent.name, annotation);
  // The plate is also a target, including on small touch screens.
  plate.namePlate.eventMode = 'static';
  plate.namePlate.cursor = 'pointer';
  plate.namePlate.on('pointerover', () => onInspect?.(agent.id, 'enter'));
  plate.namePlate.on('pointerout', () => onInspect?.(agent.id, 'leave'));
  plate.namePlate.on('pointertap', () => { onInspect?.(agent.id, 'tap'); onClick?.(agent.id); });
  return { container, annotation, fixture, ...plate };
}

function createAgentNode(
  agent: Pick<Agent, "id" | "name">,
  x: number,
  y: number,
  theme: OfficeTheme,
  renderer: HeroRenderer,
  onClick?: (id: string) => void,
  onInspect?: (id: string, action: 'enter' | 'leave' | 'tap') => void,
): AgentNode {
  const agentId = agent.id;
  const cat = isOfficeCat(agent.name) ? createCat(agent.name, { x, y }) : undefined;
  const container = new Container();
  container.label = `agent-node-${agentId}`;
  container.x = x;
  container.y = y;
  const heroScale = OFFICE_LAYOUT.hero_anchor.container_scale * (theme === 'art' ? 1.7 : 1);
  container.scale.set(heroScale);

  if (theme === 'art' && !cat) {
    const shadow = new Graphics().ellipse(0,0,13,2.2).fill({color:0x211d1a,alpha:.18});
    shadow.label='foot-contact-shadow'; shadow.eventMode='none'; container.addChild(shadow);
  }
  // Glow overlay (behind sprite)
  const glowOverlay = new Graphics();
  glowOverlay.circle(0, 0, 20);
  glowOverlay.fill({ color: 0xffffff, alpha: 0 });
  glowOverlay.y = -20;
  container.addChild(glowOverlay);

  // Agent sprite (sitting — default)
  const atlasSprite = renderer !== "graphics" ? createAtlasPose(agent.name, "work", renderer) : null;
  const sprite = atlasSprite || createAgentSprite(agent);
  const annotation = new Container();
  annotation.label = `annotation-${agentId}`;
  annotation.eventMode = "none";
  // The loft supplies Taya's own llama layer beside the architect monitor.
  const legacyLlama = sprite.getChildByLabel("llama");
  if (theme !== "cyber" && legacyLlama) legacyLlama.visible = false;
  sprite.y = theme === "art" ? 0 : -20;
  container.addChild(sprite);

  // Walking frames
  const walk0 = atlasSprite ? createAtlasPose(agent.name, "walk", renderer)! : createWalkingSprite(agent, 0);
  walk0.y = -20;
  walk0.visible = false;
  container.addChild(walk0);

  const walk1 = atlasSprite ? createAtlasPose(agent.name, "walk", renderer)! : createWalkingSprite(agent, 1);
  walk1.y = -20;
  walk1.visible = false;
  container.addChild(walk1);

  // Stretch sprite
  const stretchSprite = atlasSprite ? createAtlasPose(agent.name, "stretch", renderer)! : createStretchSprite(agent);
  stretchSprite.y = -20;
  stretchSprite.visible = false;
  container.addChild(stretchSprite);

  // Cooler sprite (holding cup)
  const coolerSprite = atlasSprite ? createAtlasPose(agent.name, "cooler", renderer)! : createCoolerSprite(agent);
  coolerSprite.y = -20;
  coolerSprite.visible = false;
  container.addChild(coolerSprite);

  const { namePlate, nameBackground, statusDot, label, statusBubble } = createNameAnnotation(agent.name, annotation);
  if (cat) {
    annotation.eventMode = 'passive';
    namePlate.eventMode = 'static'; namePlate.cursor = 'pointer';
    namePlate.on('pointerover', () => onInspect?.(agentId, 'enter'));
    namePlate.on('pointerout', () => onInspect?.(agentId, 'leave'));
    namePlate.on('pointertap', event => { event.stopPropagation(); onInspect?.(agentId, 'tap'); onClick?.(agentId); });
  }

  // Particle container
  const particles = new Container();
  particles.label = "particles";
  container.addChild(particles);

  // Interactivity
  container.eventMode = "static";
  container.cursor = "pointer";
  container.hitArea = {
    contains: (px: number, py: number) =>
      Math.abs(px) <= (isOfficeCat(agent.name) ? 22 : atlasSprite ? 28 : 20)
      && py >= (atlasSprite ? Math.min(...container.children.filter(c => c.visible && c.label.startsWith('hero-')).map(c => atlasHeadY(c as Container) ?? -93)) : -80)
      && py <= 5,
  };

  container.on("pointerover", () => {
    if (!cat) onInspect?.(agentId, 'enter');
    glowOverlay.clear();
    glowOverlay.circle(0, 0, 22);
    glowOverlay.fill({ color: 0x6c5ce7, alpha: 0.2 });
    glowOverlay.circle(0, 0, 18);
    glowOverlay.fill({ color: 0x6c5ce7, alpha: 0.15 });
  });

  container.on("pointerout", () => {
    downAt = null;
    if (!cat) onInspect?.(agentId, 'leave');
    glowOverlay.clear();
    glowOverlay.circle(0, 0, 20);
    glowOverlay.fill({ color: 0xffffff, alpha: 0 });
  });

  let downAt: number | null = null, held = false;
  if (cat) {
    container.on('pointerdown', () => { downAt = performance.now(); held = false; });
    container.on('pointerup', () => {
      held = downAt !== null && performance.now()-downAt >= 550;
      downAt = null;
      if (held) { onInspect?.(agentId, 'tap'); onClick?.(agentId); }
    });
    container.on('pointerupoutside', () => { downAt = null; held = false; });
    container.on('pointercancel', () => { downAt = null; held = false; });
  }
  container.on("pointertap", event => {
    if (cat) { event.stopPropagation(); if (!held) tapCat(cat, node.eggClock); held = false; }
    else { onInspect?.(agentId, 'tap'); onClick?.(agentId); }
  });

  const node: AgentNode = {
    cat,
    container,
    annotation,
    atlas: !!atlasSprite,
    renderer: atlasSprite ? renderer : "graphics",
    theme,
    route: [],
    routePlanned: false,
    walkOrder: 0,
    motion: { facing: 1, distance: 0 },
    routeRetry: 0,
    appearanceName: agent.name,
    liveText: "",
    eggClock: 0,
    rareGesture: createRareGesture(),
    deskLife: createDeskLife(),
    seating: createDeskSeating(),
    responseUntil: 0,
    bugUntil: 0,
    victoryUntil: 0,
    sprite,
    walkFrames: [walk0, walk1],
    stretchSprite,
    coolerSprite,
    label,
    namePlate,
    nameBackground,
    statusDot,
    statusBubble,
    bubbleBaseY: -120,
    particles,
    glowOverlay,
    agentId,
    apiStatus: "idle",
    moveState: "SITTING",
    animTime: Math.random() * 10, // stagger initial phase
    particleTimer: 0,
    homeX: x,
    homeY: y,
    targetX: x,
    targetY: y,
    walkFrame: 0,
    walkFrameTimer: 0,
    idleTimer: 0,
    idleInterval: theme === "art" ? nextOfficeWalk() : agentId === "proshka" ? randomRange(15, 30) : randomRange(45, 90),
    stateTimer: 0,
    stateDuration: 0,
    interactTarget: null,
    lookDir: 0,
    lookTimer: 0,
  };
  return node;
}

function sendToKitchen(node: AgentNode, allNodes: Map<string, AgentNode>, meeting = false) {
  if (node.cat || isStationary(node) || node.apiStatus !== "idle") return;
  if (node.theme === 'art' && [...allNodes.values()].filter(n => !n.cat && !n.away &&
    ['WALKING_TO','WALKING_BACK','AT_COOLER','AT_MEETING'].includes(n.moveState)).length >= 2) return;
  // Coffee is approached from its walkable left apron; the painted counter
  // and window sill remain furniture, never new floor.
  const choices = node.theme === 'art' && !meeting
    ? [{x:875,y:468},{x:872,y:484}]
    : node.theme === 'art' ? ART_KITCHEN_PLACES : KITCHEN_PLACES;
  const start = Math.floor(Math.random()*choices.length);
  const place = [...choices.slice(start),...choices.slice(0,start)].find(p => !Array.from(allNodes.values()).some(n => n !== node && (
    Math.hypot(n.container.x - p.x, n.container.y - p.y) < 32 ||
    ((n.moveState === "WALKING_TO" || n.moveState === "AT_COOLER" || n.moveState === "AT_MEETING") && Math.hypot(n.targetX - p.x, n.targetY - p.y) < 32)
  )));
  if (!place) return;
  node.targetX = place.x; node.targetY = place.y;
  node.interactTarget = meeting ? "__meeting__" : null;
  transitionTo(node, "WALKING_TO");
}

function isStationary(node: AgentNode) {
  return node.quiet || node.theme === 'art' && normalizeHeroName(node.appearanceName)==='иваныч'
    || node.theme !== 'art' && ['евгений', 'марина'].includes(normalizeHeroName(node.appearanceName));
}

// ---------- state machine ----------

function transitionTo(node: AgentNode, newState: MovementState) {
  node.moveState = newState;
  node.stateTimer = 0;
  node.route = [];
  node.routePlanned = false;
  node.routeRetry = 0;

  switch (newState) {
    case "SITTING":
      node.container.x = node.homeX;
      node.container.y = node.homeY;
      showSpriteVariant(node, "sit");
      node.sprite.rotation = 0;
      node.interactTarget = null;
      // Reset idle timer for next wander
      node.idleTimer = 0;
      node.idleInterval = node.theme === "art" ? nextOfficeWalk() : node.agentId === "proshka" ? randomRange(15, 30) : randomRange(45, 90);
      // Hide chat/gaming bubble if showing
      hideChatBubble(node);
      hideGamingBubble(node);
      hideMeetingBubble(node);
      break;

    case "WALKING_TO":
    case "WALKING_BACK":
      node.walkOrder = ++walkSequence;
      showSpriteVariant(node, "walk");
      node.walkFrameTimer = 0;
      break;

    case "AT_COOLER":
      showSpriteVariant(node, "cooler");
      node.stateDuration = node.agentId === "lenochka" ? randomRange(5, 8) : randomRange(3, 5);
      break;

    case "AT_GAMING":
      showSpriteVariant(node, "sit");
      node.stateDuration = randomRange(8, 15);
      break;

    case "INTERACTING":
      showSpriteVariant(node, "sit");
      node.stateDuration = node.agentId === "lenochka" ? randomRange(5, 10) : randomRange(3, 5);
      break;

    case "STRETCHING":
      showSpriteVariant(node, "stretch");
      node.stateDuration = randomRange(2, 3.5);
      break;

    case "LOOKING_AROUND":
      showSpriteVariant(node, "sit");
      node.stateDuration = randomRange(2, 4);
      node.lookDir = Math.random() < 0.5 ? -1 : 1;
      node.lookTimer = 0;
      break;

    case "AT_MEETING":
      showSpriteVariant(node, "sit");
      node.stateDuration = randomRange(8, 10);
      break;
  }
}

function updateMovement(
  node: AgentNode,
  dt: number,
  allNodes: Map<string, AgentNode>,
) {
  if (node.cat || isStationary(node)) return;
  // Finish standing up before the first floor step; the chair cannot slide.
  if (node.theme==='art' && node.seating.progress>0 && node.moveState!=='SITTING') return;
  // Ded never leaves his desk — always sitting, but flips book pages periodically
  if (node.agentId === "ded") {
    if (node.moveState !== "SITTING") {
      node.container.x = node.homeX;
      node.container.y = node.homeY;
      transitionTo(node, "SITTING");
    }
    // Book page flip animation
    node.idleTimer += dt;
    if (node.idleTimer >= node.idleInterval) {
      node.idleTimer = 0;
      node.idleInterval = randomRange(8, 20); // flip every 8-20 seconds
      // Find or create book page particle
      const pageFlip = new Graphics();
      // Small white page flipping
      pageFlip.rect(-3, -2, 6, 4);
      pageFlip.fill(0xfff9c4);
      pageFlip.rect(-2, -1, 4, 2);
      pageFlip.fill(0xffffff);
      pageFlip.x = node.homeX + 8;
      pageFlip.y = node.homeY - 5;
      pageFlip.alpha = 1;
      pageFlip.position.set(8, -25);
      Object.assign(pageFlip, { vy: -15, life: 0.8 });
      node.particles.addChild(pageFlip);
    }
    return;
  }

  // Lenochka NPC — custom idle behavior (no API status dependency)
  if (node.agentId === "lenochka") {
    if (node.moveState === "SITTING") {
      node.idleTimer += dt;
      if (node.idleTimer >= node.idleInterval) {
        node.idleTimer = 0;
        node.idleInterval = randomRange(15, 30);
        const roll = Math.random();
        if (roll < 0.3) {
          // Go to Ded
          const dedPos = DESK_POSITIONS["ded"];
          if (dedPos) {
            node.interactTarget = "ded";
            node.targetX = dedPos.x;
            node.targetY = dedPos.y + 15;
            transitionTo(node, "WALKING_TO");
          }
        } else if (roll < 0.6) {
          // Go to water cooler
          node.interactTarget = null;
          node.targetX = WATER_COOLER_POS.x + randomRange(-10, 10);
          node.targetY = WATER_COOLER_POS.y + randomRange(-5, 5);
          transitionTo(node, "WALKING_TO");
        } else {
          // Go to random agent desk (not ded)
          const deskKeys = Object.keys(DESK_POSITIONS).filter(k => k !== "ded");
          const pick = deskKeys[Math.floor(Math.random() * deskKeys.length)];
          const deskPos = DESK_POSITIONS[pick];
          if (deskPos) {
            node.interactTarget = pick;
            node.targetX = deskPos.x + randomRange(-10, 10);
            node.targetY = deskPos.y + 15;
            transitionTo(node, "WALKING_TO");
          }
        }
      }
      return;
    }
    // For walking/at_cooler/interacting states, use the normal switch below
    // but override durations for lenochka
    if (node.moveState === "AT_COOLER") {
      node.stateTimer += dt;
      if (node.stateTimer >= node.stateDuration) {
        transitionTo(node, "WALKING_BACK");
      }
      return;
    }
    if (node.moveState === "INTERACTING") {
      node.stateTimer += dt;
      if (node.stateTimer >= node.stateDuration) {
        if (node.interactTarget) {
          const targetNode = allNodes.get(node.interactTarget);
          if (targetNode) hideChatBubble(targetNode);
        }
        transitionTo(node, "WALKING_BACK");
      }
      return;
    }
    // WALKING_TO / WALKING_BACK — fall through to normal handling below
    if (node.moveState !== "WALKING_TO" && node.moveState !== "WALKING_BACK") {
      return;
    }
  }

  // Working/thinking/busy agents stay at desk, no wandering
  if (
    node.apiStatus === "working" ||
    node.apiStatus === "thinking" ||
    node.apiStatus === "busy"
  ) {
    if (node.theme !== "art" || node.moveState === "SITTING") {
      if (node.moveState !== "SITTING") transitionTo(node, "SITTING");
      return;
    }
    if (node.moveState !== "WALKING_BACK") transitionTo(node, "WALKING_BACK");
  }

  switch (node.moveState) {
    case "SITTING": {
      if (node.theme === 'art') {
        if (node.apiStatus !== 'idle') return;
        node.idleTimer += dt;
        if (node.idleTimer >= node.idleInterval) {
          sendToKitchen(node,allNodes);
          node.idleTimer=0; node.idleInterval=nextOfficeWalk();
        }
        break;
      }
      // Only idle agents wander
      if (node.apiStatus !== "idle") return;

      node.idleTimer += dt;
      if (node.idleTimer >= node.idleInterval) {
        node.idleTimer = 0;
        // Pick a random idle behavior
        const roll = Math.random();
        if (node.theme !== "cyber" && roll < 0.6) {
          sendToKitchen(node, allNodes);
        } else if (roll < 0.3) {
          // Go to water cooler
          node.interactTarget = null;
          node.targetX = WATER_COOLER_POS.x + randomRange(-15, 15);
          node.targetY = WATER_COOLER_POS.y + randomRange(-5, 10);
          transitionTo(node, "WALKING_TO");
        } else if (roll < 0.6) {
          // Go to gaming couch
          node.interactTarget = "__gaming__";
          node.targetX = GAMING_AREA_POS.x + randomRange(-20, 20);
          node.targetY = GAMING_AREA_POS.y + 26; // sit on the couch
          transitionTo(node, "WALKING_TO");
        } else if (roll < 0.8) {
          // Stretch at desk
          transitionTo(node, "STRETCHING");
        } else {
          // Look around
          transitionTo(node, "LOOKING_AROUND");
        }
      }
      break;
    }

    case "WALKING_TO":
    case "WALKING_BACK": {
      let tx = node.moveState === "WALKING_BACK" ? node.homeX : node.targetX;
      let ty = node.moveState === "WALKING_BACK" ? node.homeY : node.targetY;
      if (node.theme !== "cyber") {
        // A single walking reservation avoids head-on deadlocks in narrow gaps.
        const walkers = Array.from(allNodes.values()).filter(n => !n.cat && !n.away && (n.moveState === "WALKING_TO" || n.moveState === "WALKING_BACK"));
        if (walkers.some(n => n.walkOrder < node.walkOrder)) {
          showSpriteVariant(node, node.moveState === "WALKING_BACK" ? "cooler" : "sit");
          return;
        }
        node.routeRetry -= dt;
        if (!node.routePlanned) {
          if (node.routeRetry > 0) return;
          node.route = (node.theme === "art" ? artRoute : loftRoute)(node.container, { x: tx, y: ty }, Array.from(allNodes.values()).filter(n => n !== node && !n.cat && !n.away).map(n => n.container));
          if (!node.route.length) {
            node.routeRetry = 1;
            node.walkOrder = ++walkSequence;
            return;
          }
          node.routePlanned = true;
        }
        while (node.route.length && Math.hypot(node.route[0].x - node.container.x, node.route[0].y - node.container.y) < 1) {
          node.container.position.set(node.route[0].x, node.route[0].y);
          node.route.shift();
        }
        if (node.route.length) { tx = node.route[0].x; ty = node.route[0].y; }
      }

      const dx = tx - node.container.x;
      const dy = ty - node.container.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2 && (node.theme === "cyber" || node.route.length === 0)) {
        // Arrived
        node.container.x = tx;
        node.container.y = ty;

        if (node.moveState === "WALKING_BACK") {
          transitionTo(node, "SITTING");
        } else if (node.interactTarget === "__meeting__") {
          transitionTo(node, "AT_MEETING");
          showMeetingBubble(node);
        } else if (node.interactTarget === "__gaming__") {
          transitionTo(node, "AT_GAMING");
          showGamingBubble(node);
        } else if (node.interactTarget) {
          transitionTo(node, "INTERACTING");
          // Show chat bubbles on both agents
          showChatBubble(node);
          const targetNode = allNodes.get(node.interactTarget);
          if (targetNode) {
            showChatBubble(targetNode);
          }
        } else {
          transitionTo(node, "AT_COOLER");
        }
      } else {
        // Move towards target
        const step = WALK_SPEED * dt;
        const ratio = Math.min(step / dist, 1);
        if (node.theme !== "cyber" && Array.from(allNodes.values()).some(other => other !== node && !other.cat && !other.away &&
          (node.theme === "art" ? artFootprintsOverlap(other.container, { x: node.container.x + dx * ratio, y: node.container.y + dy * ratio }) : Math.hypot(other.container.x - (node.container.x + dx * ratio), other.container.y - (node.container.y + dy * ratio)) < 30))) {
          // A roster/status update may put a new footprint on a planned path.
          node.routePlanned = false;
          node.routeRetry = 0.5;
          return;
        }
        node.container.x += dx * ratio;
        node.container.y += dy * ratio;

        // Animate walk frames
        node.walkFrameTimer += dt;
        if (node.walkFrameTimer >= WALK_FRAME_INTERVAL) {
          node.walkFrameTimer = 0;
          node.walkFrame = node.walkFrame === 0 ? 1 : 0;
        }
        showSpriteVariant(node, "walk");

        // Bounce (1-2px vertical oscillation)
        const bounce = Math.sin(node.animTime * 10) * 1.5;
        node.walkFrames[0].y = -20 + bounce;
        node.walkFrames[1].y = -20 + bounce;

        // Art poses latch direction from actual travel once, inside the atlas sprite.
        if (node.renderer !== 'art') {
          if (Math.abs(dx) > .15 && Math.abs(dx) > dist * .18) node.motion.facing = dx < 0 ? -1 : 1;
          node.walkFrames[0].scale.x = node.motion.facing;
          node.walkFrames[1].scale.x = node.motion.facing;
        }
      }
      break;
    }

    case "AT_COOLER": {
      node.stateTimer += dt;
      if (node.stateTimer >= node.stateDuration) {
        transitionTo(node, "WALKING_BACK");
      }
      break;
    }

    case "AT_GAMING": {
      node.stateTimer += dt;
      if (node.stateTimer >= node.stateDuration) {
        hideGamingBubble(node);
        transitionTo(node, "WALKING_BACK");
      }
      break;
    }

    case "INTERACTING": {
      node.stateTimer += dt;
      if (node.stateTimer >= node.stateDuration) {
        // Hide chat bubble on interaction target
        if (node.interactTarget) {
          const targetNode = allNodes.get(node.interactTarget);
          if (targetNode) {
            hideChatBubble(targetNode);
          }
        }
        transitionTo(node, "WALKING_BACK");
      }
      break;
    }

    case "STRETCHING": {
      node.stateTimer += dt;
      // Slight up/down oscillation during stretch
      node.stretchSprite.y = -20 + Math.sin(node.stateTimer * 2) * 1.5;
      if (node.stateTimer >= node.stateDuration) {
        transitionTo(node, "SITTING");
      }
      break;
    }

    case "LOOKING_AROUND": {
      node.stateTimer += dt;
      node.lookTimer += dt;
      // Switch look direction every ~1s
      if (node.lookTimer > 1) {
        node.lookTimer = 0;
        node.lookDir = node.lookDir === -1 ? 1 : -1;
      }
      // Shift the sitting sprite slightly left/right
      node.sprite.x = node.lookDir * 1.5;

      if (node.stateTimer >= node.stateDuration) {
        node.sprite.x = 0;
        transitionTo(node, "SITTING");
      }
      break;
    }

    case "AT_MEETING": {
      node.stateTimer += dt;
      if (node.stateTimer >= node.stateDuration) {
        hideMeetingBubble(node);
        transitionTo(node, "WALKING_BACK");
      }
      break;
    }
  }
}

// ---------- chat bubble ----------

function showChatBubble(node: AgentNode) {
  let chatBubble = node.annotation.children.find(
    (c) => c.label === "chat-bubble",
  ) as Container | undefined;

  if (chatBubble) {
    chatBubble.visible = true;
    return;
  }

  chatBubble = new Container();
  chatBubble.label = "chat-bubble";
  chatBubble.y = -110;
  chatBubble.scale.set(0.9);

  const bg = new Graphics();
  bg.roundRect(-14, -10, 28, 20, 4);
  bg.fill(0x6c5ce7);
  bg.moveTo(-3, 10);
  bg.lineTo(0, 14);
  bg.lineTo(3, 10);
  bg.closePath();
  bg.fill(0x6c5ce7);
  chatBubble.addChild(bg);

  const emoji = new Text({ text: "\uD83D\uDCAC", style: CHAT_BUBBLE_STYLE });
  emoji.anchor.set(0.5, 0.5);
  chatBubble.addChild(emoji);

  node.annotation.addChild(chatBubble);
}

function hideChatBubble(node: AgentNode) {
  const chatBubble = node.annotation.children.find(
    (c) => c.label === "chat-bubble",
  );
  if (chatBubble) {
    node.annotation.removeChild(chatBubble);
    chatBubble.destroy();
  }
}

// ---------- meeting bubble ----------

function showMeetingBubble(node: AgentNode) {
  let bubble = node.annotation.children.find(
    (c) => c.label === "meeting-bubble",
  ) as Container | undefined;

  if (bubble) {
    bubble.visible = true;
    return;
  }

  bubble = new Container();
  bubble.label = "meeting-bubble";
  bubble.y = -120;
  bubble.scale.set(0.9);

  const bg = new Graphics();
  bg.roundRect(-30, -10, 60, 20, 4);
  bg.fill(0x5d4037);
  bg.moveTo(-3, 10);
  bg.lineTo(0, 14);
  bg.lineTo(3, 10);
  bg.closePath();
  bg.fill(0x5d4037);
  bubble.addChild(bg);

  const emoji = new Text({ text: "\uD83D\uDCCB Meeting...", style: new TextStyle({
    fontFamily: '"Courier New", monospace',
    fontSize: 10,
    fill: 0xffffff,
  }) });
  emoji.anchor.set(0.5, 0.5);
  bubble.addChild(emoji);

  node.annotation.addChild(bubble);
}

function hideMeetingBubble(node: AgentNode) {
  const bubble = node.annotation.children.find(
    (c) => c.label === "meeting-bubble",
  );
  if (bubble) {
    node.annotation.removeChild(bubble);
    bubble.destroy();
  }
}

// ---------- gaming bubble ----------

function showGamingBubble(node: AgentNode) {
  let bubble = node.annotation.children.find(
    (c) => c.label === "gaming-bubble",
  ) as Container | undefined;

  if (bubble) {
    bubble.visible = true;
    return;
  }

  bubble = new Container();
  bubble.label = "gaming-bubble";
  bubble.y = -120;
  bubble.scale.set(0.9);

  const bg = new Graphics();
  bg.roundRect(-14, -10, 28, 20, 4);
  bg.fill(0x6c5ce7);
  bg.moveTo(-3, 10);
  bg.lineTo(0, 14);
  bg.lineTo(3, 10);
  bg.closePath();
  bg.fill(0x6c5ce7);
  bubble.addChild(bg);

  const emoji = new Text({ text: "\uD83C\uDFAE", style: CHAT_BUBBLE_STYLE });
  emoji.anchor.set(0.5, 0.5);
  bubble.addChild(emoji);

  node.annotation.addChild(bubble);
}

function hideGamingBubble(node: AgentNode) {
  const bubble = node.annotation.children.find(
    (c) => c.label === "gaming-bubble",
  );
  if (bubble) {
    node.annotation.removeChild(bubble);
    bubble.destroy();
  }
}

// ---------- status bubble ----------

function updateStatusBubble(
  node: SceneNode,
  status: AgentStatus,
  agent: Agent,
) {
  const bubble = node.statusBubble;
  bubble.removeChildren().forEach(child => child.destroy({ children: true }));
  const width = node.label.width + 23;
  node.label.x = 5;
  node.nameBackground.clear().roundRect(-width / 2, 0, width, 18, 3)
    .fill({ color: 0x171d21, alpha: 0.98 }).stroke({ color: 0xbba882, width: 0.7 });
  node.statusDot.clear().circle(-width / 2 + 7, 9, 2.5).fill(heroStatusColor(status, agent.statusText || ''));
  const statusText = getStatusText(status, agent);
  bubble.visible = false;
  if (!statusText) return;
  const truncated = statusText.length > 42 ? statusText.slice(0, 41) + '…' : statusText;
  const text = new Text({ text: truncated, style: new TextStyle({
    fontFamily: '"Courier New", monospace', fontSize: 10, fill: 0xfff4e3, wordWrap: true, wordWrapWidth: 116,
  }) });
  const w = text.width + 12, h = text.height + 8;
  const bg = new Graphics().roundRect(-w / 2, 0, w, h, 3).fill({ color: 0x231c19, alpha: 0.94 });
  text.x = -text.width / 2; text.y = 4;
  bubble.addChild(bg, text);
}

function getStatusText(status: AgentStatus, agent: Agent): string | null {
  const liveText = agent.statusText?.trim();
  switch (status) {
    case "working":
      return liveText || agent.description || "Working...";
    case "thinking":
      return liveText || "Thinking...";
    case "busy":
      return liveText || agent.description || "Busy";
    case "offline":
      return null;
    case "idle":
      return liveText || null;
    default:
      return null;
  }
}

// ---------- animation loop (desk animations for API statuses) ----------

function animateAgent(node: AgentNode, dt: number) {
  const t = node.animTime;

  // If the agent is moving/doing idle behaviors, skip desk animations
  if (node.moveState !== "SITTING") {
    // Still update particles and bubble bob
    updateParticles(node.particles, dt);
    if (node.statusBubble.visible) {
      node.statusBubble.y = node.bubbleBaseY + Math.sin(t * 2) * 1.5;
    }
    // Bob the chat bubble too
    const chatBubble = node.container.children.find(
      (c) => c.label === "chat-bubble",
    );
    if (chatBubble?.visible) {
      chatBubble.y = -90 + Math.sin(t * 2.5) * 1.5;
    }
    // Bob the meeting bubble too
    const meetingBubble = node.container.children.find(
      (c) => c.label === "meeting-bubble",
    );
    if (meetingBubble?.visible) {
      meetingBubble.y = -90 + Math.sin(t * 2.5) * 1.5;
    }
    // Bob the gaming bubble too
    const gamingBubble = node.container.children.find(
      (c) => c.label === "gaming-bubble",
    );
    if (gamingBubble?.visible) {
      gamingBubble.y = -80 + Math.sin(t * 2.5) * 1.5;
    }
    return;
  }

  // Desk animations (original behavior) — only when SITTING
  switch (node.apiStatus) {
    case "idle":
      // Subtle breathing: slight Y oscillation
      node.sprite.y = -20 + Math.sin(t * 1.5) * 0.8;
      break;

    case "working":
      // Faster breathing + hand typing motion
      node.sprite.y = -20 + Math.sin(t * 3) * 0.5;
      // Sparkle particles
      node.particleTimer += dt;
      if (node.particleTimer > 0.3) {
        node.particleTimer = 0;
        spawnParticle(node.particles, 0xffd700, node.sprite.x, -20);
      }
      break;

    case "thinking":
      // Thought bubble dots cycling
      node.sprite.y = -20 + Math.sin(t * 1.2) * 1;
      animateThoughtDots(node, t);
      break;

    case "busy":
      // Intense work — faster movement, red particles
      node.sprite.y = -20 + Math.sin(t * 4) * 0.6;
      node.particleTimer += dt;
      if (node.particleTimer > 0.2) {
        node.particleTimer = 0;
        spawnParticle(node.particles, 0xe17055, node.sprite.x, -20);
      }
      break;

    case "offline":
      // Slumped forward, zzZ animation
      node.sprite.y = -8;
      node.sprite.rotation = 0.05;
      animateZzz(node, t);
      break;

    default:
      node.sprite.y = -10 + Math.sin(t * 1.5) * 0.8;
  }

  // Animate and clean up particles
  updateParticles(node.particles, dt);

  // Bubble bob
  if (node.statusBubble.visible) {
    // Match the moving pose: the status stays above the name, never on the face.
    node.statusBubble.y = node.bubbleBaseY + Math.sin(t * 2) * 1.5;
  }
}

// ---------- particle effects ----------

function spawnParticle(
  container: Container,
  color: number,
  baseX: number,
  baseY: number,
) {
  if (container.children.length > 8) return; // pool limit

  const p = new Graphics();
  p.rect(-1, -1, 2, 2);
  p.fill(color);
  p.x = baseX + (Math.random() - 0.5) * 20;
  p.y = baseY;
  p.alpha = 1;
  (p as Graphics & { vy: number; life: number }).vy =
    -15 - Math.random() * 10;
  (p as Graphics & { vy: number; life: number }).life =
    0.8 + Math.random() * 0.4;
  container.addChild(p);
}

function updateParticles(container: Container, dt: number) {
  for (let i = container.children.length - 1; i >= 0; i--) {
    const p = container.children[i] as Graphics & {
      vy: number;
      life: number;
    };
    if (p.vy === undefined) continue;
    p.y += p.vy * dt;
    p.life -= dt;
    p.alpha = Math.max(0, p.life);
    if (p.life <= 0) {
      container.removeChild(p);
      p.destroy();
    }
  }
}

// ---------- thought bubble animation ----------

function animateThoughtDots(node: AgentNode, t: number) {
  if (!node.statusBubble.visible) {
    const bubble = node.statusBubble;
    bubble.removeChildren().forEach(child => child.destroy({ children: true }));

    const bg = new Graphics();
    bg.roundRect(-16, -8, 32, 16, 4);
    bg.fill(0xfdcb6e);
    bg.circle(-4, 12, 3);
    bg.fill(0xfdcb6e);
    bg.circle(-2, 16, 2);
    bg.fill(0xfdcb6e);
    bubble.addChild(bg);

    // Three dots
    for (let i = 0; i < 3; i++) {
      const dot = new Graphics();
      dot.circle(0, 0, 2);
      dot.fill(0x2d3436);
      dot.x = -8 + i * 8;
      dot.y = 0;
      dot.label = `dot-${i}`;
      bubble.addChild(dot);
    }

    bubble.visible = true;
  }

  // Animate the dots bouncing
  for (let i = 1; i <= 3; i++) {
    const dot = node.statusBubble.children[i];
    if (dot) {
      dot.y = Math.sin(t * 3 + i * 0.8) * 2;
    }
  }
}

// ---------- zzZ animation ----------

function animateZzz(node: AgentNode, t: number) {
  const particles = node.particles;

  const phase = Math.floor(t * 0.8);
  const existingZs = particles.children.filter((c) => c.label === "zzz");

  if (existingZs.length < 3 && phase % 2 === 0) {
    const needsNew = existingZs.every(
      (z) => (z as Graphics & { life: number }).life < 1.5,
    );
    if (needsNew || existingZs.length === 0) {
      const z = new Text({
        text: "z",
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 8 + existingZs.length * 2,
          fill: 0x9ba1b5,
        }),
      });
      z.label = "zzz";
      z.x = 8;
      z.y = -30;
      z.alpha = 1;
      (z as Text & { vy: number; vx: number; life: number }).vy = -8;
      (z as Text & { vy: number; vx: number; life: number }).vx = 3;
      (z as Text & { vy: number; vx: number; life: number }).life = 2;
      particles.addChild(z);
    }
  }

  // Update Z particles
  for (let i = particles.children.length - 1; i >= 0; i--) {
    const z = particles.children[i] as Text & {
      vy: number;
      vx: number;
      life: number;
    };
    if (z.label !== "zzz") continue;
    z.y += z.vy * 0.016;
    z.x += z.vx * 0.016;
    z.life -= 0.016;
    z.alpha = Math.max(0, z.life / 2);
    if (z.life <= 0) {
      particles.removeChild(z);
      z.destroy();
    }
  }
}


/** Keep names attached to heads; only optional detail cards use the solver. */
function positionAnnotations(nodes: (AgentNode | FixtureNode)[], details: boolean) {
  const obstacles: Rect[] = nodes.filter((n): n is FixtureNode=>'fixture' in n).map(n=>{
    const [x,y,width,height]=n.fixture.rect;return {x,y,width,height};
  });
  for (const node of nodes) {
    let position: Point;
    if ('fixture' in node) {
      position = node.fixture.name_anchor;
      const [x, y, width, height] = node.fixture.rect;
      obstacles.push({ x, y, width, height });
      if (node.label.text === 'Мотя') {
        const link=node.annotation.getChildByLabel('name-link') as Graphics;
        link.clear().moveTo(0,18).lineTo(0,y-position.y-2).stroke({color:0xe6d6b9,alpha:.85,width:.9});
      }
    } else {
      const pose = [node.sprite, ...node.walkFrames, node.stretchSprite, node.coolerSprite].find(p => p.visible) || node.sprite;
      const head = atlasHeadY(pose) ?? pose.y - 60;
      const scale = node.container.scale.y;
      const plateHeight=(node.visualSeated ?? node.seating.progress>0) ? 15.3 : 18;
      node.namePlate.scale.set((node.visualSeated ?? node.seating.progress>0) ? .85 : 1);
      position = heroNamePosition(node.container, head, scale, plateHeight);
      if (node.theme === 'art' && !node.cat) {
        const plateWidth = node.namePlate.width;
        const rect = avoidNameMonitors({ x: position.x - plateWidth / 2, y: position.y, width: plateWidth, height: 18 }, ART_MONITORS);
        const headPoint = {x:node.container.x,y:node.container.y+head*scale};
        const sideNames = ['ярик','ася','whoami'];
        const candidates = sideNames.includes(normalizeHeroName(node.appearanceName)) ? [30,48,-30-plateWidth,-48-plateWidth].flatMap(dx =>
          [-8,9].map(dy=>({x:headPoint.x+dx,y:headPoint.y+dy,width:plateWidth,height:18})))
          .filter(c=>c.x>=4 && c.x+c.width<=956 && ART_MONITORS.every(m=>!overlaps(c,m))) : [];
        const nearby = (node.visualSeated ?? node.seating.progress>0)
          ? seatedNamePosition({x:position.x-plateWidth/2,y:position.y,width:plateWidth,height:plateHeight},ART_MONITORS,obstacles)
          : candidates.sort((a,b)=>Math.hypot(a.x+plateWidth/2-headPoint.x,a.y-headPoint.y)-Math.hypot(b.x+plateWidth/2-headPoint.x,b.y-headPoint.y))[0] || rect;
        position = { x: nearby.x + plateWidth / 2, y: nearby.y };
      }
      const link = node.annotation.getChildByLabel('name-link') as Graphics;
      link.clear();
      const headX = node.container.x - position.x, headTop = node.container.y + head * scale - position.y;
      if (!node.cat && (Math.abs(headX) > 3 || headTop > 29)) {
        const edgeX = Math.abs(headX)>node.namePlate.width/2 ? Math.sign(headX)*(node.namePlate.width/2-2) : 0;
        link.moveTo(edgeX, Math.abs(headX)>node.namePlate.width/2 ? 10 : 19).lineTo(headX,headTop-2)
          .stroke({color:0xe6d6b9,alpha:.85,width:.9});
      }
      obstacles.push({ x: node.container.x - 23 * scale, y: node.container.y + head * scale,
        width: 46 * scale, height: -head * scale + 4 });
    }
    node.annotation.position.set(position.x, position.y);
    const width = node.namePlate.width;
    obstacles.push({ x: position.x - width / 2, y: position.y, width, height: 18 });
    for (const child of node.annotation.children) {
      if (child !== node.namePlate && child !== node.statusBubble && child.label !== 'name-link') child.visible = false;
    }
    node.statusBubble.visible = false;
  }
  if (!details) return;
  for (const node of nodes) {
    const bubble = node.statusBubble;
    if (!bubble.children.length) continue;
    const bounds = bubble.getLocalBounds();
    const preferred = { x: node.annotation.x - bounds.width / 2, y: node.annotation.y + 22, width: bounds.width, height: bounds.height };
    const card = placeAnnotation(preferred, obstacles, CANVAS_W, CANVAS_H);
    // A crowded frame may have no free slot. Hide its short card until space opens.
    if (obstacles.some(other => overlaps(card, other))) continue;
    bubble.position.set(card.x - node.annotation.x - bounds.x, card.y - node.annotation.y - bounds.y);
    bubble.visible = true;
    obstacles.push(card);
  }
}

/** Position immediately on inspection, then follow the moving hero each frame. */
function positionHeroTooltip(el: HTMLDivElement, tooltip: HTMLDivElement, node: SceneNode) {
  const sx = el.clientWidth / CANVAS_W, sy = el.clientHeight / CANVAS_H;
  const head = node.annotation.y * sy;
  const left = Math.max(8, Math.min(el.clientWidth - tooltip.offsetWidth - 8, node.container.x * sx - tooltip.offsetWidth / 2));
  const top = Math.max(8, Math.min(el.clientHeight - tooltip.offsetHeight - 8,
    head > tooltip.offsetHeight + 16 ? head - tooltip.offsetHeight - 8 : node.container.y * sy + 10));
  tooltip.style.left = `${left}px`; tooltip.style.top = `${top}px`;
}
