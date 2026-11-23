const http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const root=__dirname,pub=path.join(root,"public"),port=Number(process.env.PORT||3000),host=process.env.HOST||"0.0.0.0";
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8"};
const send=(res,n,s,t="text/plain; charset=utf-8")=>{res.writeHead(n,{"Content-Type":t,"X-Content-Type-Options":"nosniff"});res.end(s)};
http.createServer((req,res)=>{
 if(req.method!=="GET"&&req.method!=="HEAD")return send(res,405,"Method not allowed");
 const url=new URL(req.url||"/","http://localhost");
 if(url.pathname==="/health"||url.pathname==="/healthz")return send(res,200,JSON.stringify({ok:true,node:process.version}),"application/json");
 let file;
 if(url.pathname==="/vendor/jszip.min.js")file=path.join(root,"node_modules/jszip/dist/jszip.min.js");
 else {let name;try{name=decodeURIComponent(url.pathname)}catch{return send(res,400,"Bad path")}
 file=path.resolve(pub,name==="/"?"index.html":name.replace(/^\/+/, ""));
 if(!file.startsWith(pub+path.sep)&&file!==path.join(pub,"index.html"))return send(res,403,"Forbidden");}
 fs.stat(file,(err,st)=>{if(err||!st.isFile())return send(res,404,"Not found");
 res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream","Content-Length":st.size,"X-Content-Type-Options":"nosniff","Cache-Control":"no-cache"});
 if(req.method==="HEAD")return res.end();fs.createReadStream(file).pipe(res);});
}).listen(port,host,()=>console.log("Devon ZIP Loader: http://"+host+":"+port));
