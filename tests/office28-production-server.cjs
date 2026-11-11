// Isolated reverse proxy plus the real office WS engine, using only a copied DB.
const http=require('node:http');
const path=require('node:path');
const Database=require('better-sqlite3');
const {createOfficeServer}=require('../worker/ws-server');
const directory=process.env.OFFICE28_BUILD;
if(!/^\/tmp\/office28-(build|before)-/.test(directory || ''))throw Error('OFFICE28_BUILD must be an isolated build');
const databasePath=path.join(directory,'data/database.sqlite');
const db=new Database(databasePath);
let now=Date.parse('2026-11-02T09:00:00Z');
const history=[];
// Discard historical occurrences in the copied DB; preserve all live files.
db.exec("DELETE FROM office_scene_state");
const ws=createOfficeServer({port:0,host:'127.0.0.1',databasePath,quiet:true,legacy:false,officeIntervalMs:1000,office:{clock:()=>now,schedule:false,configPath:path.join(directory,'config/office-projects.json')}});
const broadcast=()=>{ws.office.tick();for(const client of ws.wss.clients)if(client.readyState===1)client.send(JSON.stringify(ws.office.snapshot(client.officeStream)));};
const server=http.createServer(async(req,res)=>{
 if(req.url.startsWith('/qa/')){
  let body='';for await(const c of req)body+=c;const input=body?JSON.parse(body):{};
  if(req.url==='/qa/control'){
   if(Object.keys(input).length)history.push({receivedAt:new Date().toISOString(),input});
   if(input.now)now=input.now;
   if(input.status)db.prepare('UPDATE agents SET current_status=? WHERE archived=0').run(input.status);
   if(input.quota){const value={codex:{windows:[],error:input.quota==='on'?{blocked:true,resetsAt:Date.now()/1000+3600}:null},claude:{windows:[],error:input.quota==='on'?{blocked:true,resetsAt:Date.now()/1000+3600}:null}};db.prepare("INSERT INTO office_bridge_state(key,value) VALUES('office13:public',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(value));}
   broadcast();if(input.scene){ws.office.startScene(input.scene);broadcast();}
   if(input.disconnect)for(const client of ws.wss.clients)client.close();
   if(input.refresh)for(const client of ws.wss.clients)if(client.readyState===1)client.send(JSON.stringify({type:'agents:refresh'}));
  }
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({now,history,snapshot:ws.office.snapshot(),agents:db.prepare('SELECT name,current_status FROM agents WHERE archived=0').all()}));return;
 }
 const upstream=http.request({hostname:'127.0.0.1',port:Number(process.env.OFFICE28_UPSTREAM || 3150),path:req.url,method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});upstream.on('error',()=>res.writeHead(502).end());req.pipe(upstream);
});
server.on('upgrade',(req,socket,head)=>ws.wss.handleUpgrade(req,socket,head,client=>ws.wss.emit('connection',client,req)));
server.listen(Number(process.env.OFFICE28_PORT || 3151),'127.0.0.1',()=>console.log('OFFICE28 isolated proxy, DB '+databasePath));
