"use client"

import { useState } from "react"
import JSZip from "jszip"

type Check = [string, boolean, string]
type Report = { archive: string; name: string; version: string; next: string; root: string; paths: string[]; scripts: Record<string,string>; checks: Check[]; warnings: string[]; size: number }
const MAX_ZIP = 220 * 1024 * 1024
const SKIP = new Set(["node_modules",".next",".git",".vercel",".netlify",".edgeone",".turbo","coverage",".cache"])
const PRIVATE = new Set([".npmrc","id_rsa","id_ed25519","credentials.json","service-account.json"])
const docker = ["FROM node:22-bookworm-slim AS build","WORKDIR /app","RUN corepack enable","# Devon postinstall copies public/vendor assets, so copy source before install.","COPY . .","RUN pnpm install --frozen-lockfile","ENV NEXT_TELEMETRY_DISABLED=1","RUN pnpm build && pnpm prune --prod","FROM node:22-bookworm-slim AS runtime","WORKDIR /app","RUN corepack enable","ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0","RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs","COPY --from=build --chown=nextjs:nodejs /app ./","USER nextjs","EXPOSE 3000","CMD [\"pnpm\",\"start\"]",""].join("\n")
const compose = ["services:","  devon:","    build: .","    restart: unless-stopped","    env_file: .env","    environment:","      NODE_ENV: production","      PORT: \"3000\"","      HOSTNAME: 0.0.0.0","      NEXT_TELEMETRY_DISABLED: \"1\"","    ports:","      - \"3000:3000\"","    healthcheck:","      test: [\"CMD\",\"node\",\"-e\",\"fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"]","      interval: 30s","      timeout: 8s","      retries: 3","      start_period: 45s",""].join("\n")
const env = ["NODE_ENV=production","# Configure only optional services enabled by your Devon build.","# UPSTASH_REDIS_REST_URL=","# UPSTASH_REDIS_REST_TOKEN=","# ANTHROPIC_API_KEY=","# E2B_API_KEY=","# AUTH0_ISSUER_BASE_URL=","# AUTH0_CLIENT_ID=","# AUTH0_CLIENT_SECRET=","# AUTH0_SECRET=","# AUTH0_BASE_URL=https://preview.example.com",""].join("\n")
function safePath(input: string) {
  const p=input.replace(/\\/g,"/")
  if(!p||p.startsWith("/")||/^[a-z]:/i.test(p)||/[\0-\x1f\x7f]/.test(p)||p.split("/").some(x=>x==="."||x==="..")) throw new Error("Unsafe ZIP path: "+input)
  return p.split("/").filter(Boolean).join("/")
}
function ignored(path: string) {
  const parts=path.split("/"),base=parts.at(-1)||""
  return parts.some(x=>SKIP.has(x))||PRIVATE.has(base)||/^\.env(?!\.example$|\.preview\.example$|\.sample$)/i.test(base)||/\.(pem|key|p12|pfx|keystore)$/i.test(base)||base===".DS_Store"||base.startsWith("._")
}
function obj(v: unknown): Record<string,any> { return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,any>:{} }
function bytes(n:number) { return n<1024?n+" B":n<1048576?(n/1024).toFixed(1)+" KB":(n/1048576).toFixed(1)+" MB" }

export function ZipLoader() {
  const [report,setReport]=useState<Report|null>(null),[source,setSource]=useState<File|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[drag,setDrag]=useState(false),[open,setOpen]=useState(false),[filename,setFilename]=useState("devon-preview-deployment.zip"),[progress,setProgress]=useState(0)
  async function inspect(file?:File) {
    if(!file)return
    setError("");setReport(null);setSource(file)
    if(!/\.zip$/i.test(file.name))throw new Error("Choose a Devon source .zip archive.")
    if(file.size>MAX_ZIP)throw new Error("ZIP exceeds the 220 MB upload limit.")
    const zip=await JSZip.loadAsync(file,{checkCRC32:false,createFolders:false})
    const entries=Object.values(zip.files).filter(x=>!x.dir).map(entry=>({entry,path:safePath((entry as any).unsafeOriginalName||entry.name)}))
    if(!entries.length)throw new Error("The ZIP archive is empty.")
    if(entries.length>22000)throw new Error("Archive exceeds 22,000 files.")
    let manifest:{path:string;data:Record<string,any>}|undefined
    for(const item of entries.filter(x=>x.path.endsWith("package.json")&&!ignored(x.path)))try{
      const data=obj(JSON.parse(await item.entry.async("string")))
      if(typeof({...obj(data.dependencies),...obj(data.devDependencies)}).next==="string"&&(!manifest||item.path.length<manifest.path.length))manifest={path:item.path,data}
    }catch{}
    if(!manifest)throw new Error("No Next.js package.json found. Upload the dlcasto2/db-v2 source ZIP, not a static build ZIP.")
    const root=manifest.path.slice(0,manifest.path.lastIndexOf("/")+1)
    const files=entries.filter(x=>(!root||x.path.startsWith(root))&&!ignored(root?x.path.slice(root.length):x.path))
    const paths=files.map(x=>root?x.path.slice(root.length):x.path).filter(Boolean).sort()
    const expanded=files.reduce((n,x)=>n+((x.entry as any)._data?.uncompressedSize||0),0)
    if(expanded>900*1024*1024)throw new Error("Expanded source exceeds 900 MB. Remove generated output and large build folders.")
    const deps={...obj(manifest.data.dependencies),...obj(manifest.data.devDependencies)},scripts=Object.fromEntries(Object.entries(obj(manifest.data.scripts)).filter((x):x is [string,string]=>typeof x[1]==="string"))
    const cfg=files.find(x=>/(^|\/)next\.config\.(js|mjs|ts|cjs)$/.test(root?x.path.slice(root.length):x.path))
    const staticExport=cfg?/output\s*:\s*["']export["']/.test(await cfg.entry.async("string")):false
    const app=paths.some(p=>["app/page.tsx","app/page.jsx","src/app/page.tsx","src/app/page.jsx"].includes(p))
    const proxy=paths.some(p=>p.includes("app/api/proxy/"))
    const devon=String(manifest.data.name||"").toLowerCase().includes("devon")||(proxy&&paths.some(p=>p.includes("components/proxy-browser")))
    const warnings:string[]=[]
    if(!devon)warnings.push("Devon browser/proxy signature was not detected.")
    if(!app)warnings.push("Next.js App Router page was not detected.")
    if(!proxy)warnings.push("Devon app/api/proxy server route was not detected.")
    if(!paths.includes("pnpm-lock.yaml"))warnings.push("pnpm-lock.yaml is missing; Docker uses frozen pnpm install.")
    if(staticExport)warnings.push("Static export is configured. Remove output: 'export'; Devon requires server routes.")
    if(!scripts.build||!scripts.start)warnings.push("package.json needs build and start scripts.")
    const checks:Check[]=[["Devon source",devon,"Project signature"],["Next.js App Router",app,"Application route"],["Devon proxy API",proxy,"Server proxy route"],["pnpm lockfile",paths.includes("pnpm-lock.yaml"),"Frozen dependencies"]]
    setReport({archive:file.name,name:String(manifest.data.name||"Devon"),version:String(manifest.data.version||"Unspecified"),next:String(deps.next),root,paths,scripts,checks,warnings,size:file.size})
    setFilename("devon-preview-deployment.zip")
  }
  async function load(file?:File){try{await inspect(file)}catch(e){setReport(null);setSource(null);setError(e instanceof Error?e.message:"Could not inspect ZIP archive.")}}
  const canExport=!!report&&report.checks.every(c=>c[1])&&!!report.scripts.build&&!!report.scripts.start&&!report.warnings.some(w=>w.startsWith("Static export"))
  async function exportZip(){
    if(!source||!report||!canExport)return
    setBusy(true);setError("");setProgress(0)
    try{
      const zip=await JSZip.loadAsync(source,{checkCRC32:false,createFolders:false}),out=new JSZip(),all=Object.values(zip.files).filter(x=>!x.dir)
      for(let i=0;i<all.length;i++){
        const entry=all[i],name=safePath((entry as any).unsafeOriginalName||entry.name)
        if(report.root&&!name.startsWith(report.root))continue
        const path=report.root?name.slice(report.root.length):name
        if(!path||ignored(path))continue
        out.file(path,await entry.async("uint8array"),{binary:true,createFolders:true})
        if(i%40===0)setProgress(Math.round(i/all.length*75))
      }
      out.file("Dockerfile",docker);out.file("docker-compose.preview.yml",compose);out.file(".dockerignore","node_modules\n.next\n.git\n.env\n.env.*\n!.env.preview.example\n*.log\n");out.file(".env.preview.example",env)
      out.file("DEVON-PREVIEW-DEPLOYMENT.md",[
        "# Devon custom preview deployment","","This is a server-backed Next.js deployment, not a static export.","","## Deploy",
        "1. Extract on a host with Docker Engine and Docker Compose.","2. Copy the environment template: cp .env.preview.example .env.","3. Add only the secrets and services required by your Devon deployment. Never commit .env.","4. Run: docker compose -f docker-compose.preview.yml up -d --build.","5. Route your HTTPS preview hostname to port 3000.","6. Inspect logs: docker compose -f docker-compose.preview.yml logs -f devon.","","## Runtime requirements",
        "Devon is not a static website. The host must run a persistent Node/Docker service. Static-only hosts and GitHub Pages cannot run its proxy or API routes. Configure HTTPS at your host or reverse proxy.",
        "Devon AI, account sync, and authentication may require Redis, model-provider keys, Auth0 settings, and provider-specific deployment configuration. Follow the source repository README. This loader does not provision hosting, DNS, TLS, Redis, or secrets.","",
        "## Inspected source","- Archive: "+report.archive,"- Project: "+report.name+" "+report.version,"- Next.js: "+report.next,"- Source root: "+(report.root||"/"),"- Files included: "+report.paths.length,""
      ].join("\n"))
      const blob=await out.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:5}},m=>setProgress(75+Math.round(m.percent*.25)))
      const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=(filename.trim().replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/\.zip$/i,"")||"devon-preview-deployment")+".zip";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);setProgress(100)
    }catch(e){setError(e instanceof Error?e.message:"Could not create deployment ZIP.")}finally{setBusy(false)}
  }
  return <main className="shell">
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark">DZ</span><span>DEVON <i>/ ZIP LOADER</i></span></a><div className="top-meta"><span className="live-dot"/> CUSTOM PREVIEW TOOL <b>v1.0</b></div></header>
    <section className="hero" id="top"><div className="eyebrow">CUSTOM DEPLOYMENT WORKSPACE</div><h1>Ship a Devon<br/><em>preview deployment.</em></h1><p>Load the Devon source ZIP, validate the Next.js project, and export a server-ready package for your custom preview host.</p><div className="tags"><span>Next.js 16</span><span>Turbopack</span><span>Node.js 22</span><span>Docker Compose</span><span>Server runtime</span></div></section>
    <section className="section"><div className="heading"><div><small>01 / SOURCE PACKAGE</small><h2>Load Devon source</h2></div>{report&&<button className="quiet" onClick={()=>{setReport(null);setSource(null);setError("")}}>Clear project ×</button>}</div>
      {!report?<div className={"dropzone "+(drag?"active":"")} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);void load(e.dataTransfer.files[0])}} onClick={()=>document.getElementById("source-zip")?.click()} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")document.getElementById("source-zip")?.click()}}>
        <input id="source-zip" type="file" accept=".zip,application/zip" hidden onClick={e=>e.stopPropagation()} onChange={e=>void load(e.target.files?.[0])}/><div className="upload-icon">↑</div><strong>Drop the Devon source ZIP here</strong><p>or <u>browse files</u> from your device</p><small>ZIP · max 220 MB · browser-side processing · no server upload</small><div className="source-link">Need the source? <a href="https://github.com/dlcasto2/db-v2/archive/refs/heads/main.zip" target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>Download db-v2 ZIP ↗</a></div>
      </div>:<div className="project-card"><div className="project-top"><div className="project-icon">ZIP</div><div className="project-title"><strong>{report.name}</strong><span>{report.archive} · {report.root||"archive root"}</span></div><b className="loaded">✓ LOADED</b></div><div className="stats"><div><small>FILES</small><b>{report.paths.length.toLocaleString()}</b></div><div><small>ARCHIVE</small><b>{bytes(report.size)}</b></div><div><small>NEXT.JS</small><b>{report.next}</b></div><div><small>LOCKFILE</small><b>{report.checks[3][1]?"pnpm":"Missing"}</b></div></div><button className="file-toggle" onClick={()=>setOpen(!open)}>{open?"Hide":"View"} project files ({report.paths.length}) <span>{open?"−":"+"}</span></button>{open&&<div className="file-list">{report.paths.slice(0,28).map(p=><code key={p}>{p}</code>)}{report.paths.length>28&&<small>and {report.paths.length-28} more files</small>}</div>}</div>}
      {error&&<div className="error">⚠ {error}</div>}
    </section>
    {report&&<><section className="section"><div className="heading"><div><small>02 / COMPATIBILITY</small><h2>Deployment checks</h2></div><b className="summary">{report.checks.filter(c=>c[1]).length}/{report.checks.length} PASSED</b></div><div className="checks">{report.checks.map(([label,ok,detail])=><div className="check" key={label}><span className={ok?"ok":"warn"}>{ok?"✓":"!"}</span><div><b>{label}</b><small>{detail}</small></div></div>)}</div>{report.warnings.length>0&&<div className="warnings"><b>Review before deployment</b>{report.warnings.map(w=><p key={w}>{w}</p>)}</div>}</section>
    <section className="section"><div className="heading"><div><small>03 / DEPLOYMENT PACKAGE</small><h2>Prepare custom preview</h2></div><small className="local">LOCAL PROCESSING</small></div><div className="export"><div className="export-top"><span className="package-icon">▣</span><div><b>Container-ready Devon source</b><p>Adds Docker, Compose, Node 22 runtime, and preview instructions. Files are processed in this browser.</p></div></div><label htmlFor="out-name">OUTPUT FILE</label><input id="out-name" value={filename} onChange={e=>setFilename(e.target.value)}/><button className="primary" onClick={()=>void exportZip()} disabled={busy||!canExport}>{busy?"Building deployment ZIP · "+progress+"%":"↓  Download deployment ZIP  →"}</button>{busy&&<div className="progress"><span style={{width:progress+"%"}}/></div>}{!canExport&&<small className="disabled">Resolve the checks and required package scripts before exporting.</small>}</div></section></>}
    <section className="workflow"><div className="heading"><div><small>04 / PREVIEW HOST</small><h2>From ZIP to live Devon</h2></div></div><div className="steps"><article><small>01</small><b>Export source</b><p>Get the ZIP from <code>dlcasto2/db-v2</code> and load it above.</p></article><article><small>02</small><b>Prepare package</b><p>Export the deployment ZIP with runtime files.</p></article><article><small>03</small><b>Build on host</b><p>Run Docker Compose on a persistent Node host.</p></article><article><small>04</small><b>Open preview</b><p>Route your HTTPS hostname to port <code>3000</code>.</p></article></div><div className="note"><b>ⓘ Devon needs a server runtime.</b><p>Its proxy and API routes execute on the server. This prepares deployment files; it does not provision hosting, DNS, TLS, Redis, or API credentials.</p></div></section>
    <footer><span>DEVON ZIP LOADER · INDEPENDENT CUSTOM DEPLOYMENT</span><a href="https://github.com/dlcasto2/db-v2" target="_blank" rel="noreferrer">SOURCE: dlcasto2/db-v2 ↗</a></footer>
  </main>
}
