import { insist,clip } from './util.mjs';
import { safeServiceUrl } from './http.mjs';

// External tool servers are trusted operator configuration, never supplied by a model or message.
// No server-side sampling/elicitation handlers: a server cannot start a bypass model loop.
export class McpTools {
  constructor(servers,{env=process.env,modules=null}={}){this.servers=servers;this.env=env;this.modules=modules;this.clients=new Map();this.tools=[];}
  async connect(){
    let modules=this.modules;
    if(!modules){const [{Client},{StdioClientTransport},{StreamableHTTPClientTransport},{default:Ajv}]=await Promise.all([
      import('@modelcontextprotocol/sdk/client/index.js'),import('@modelcontextprotocol/sdk/client/stdio.js'),import('@modelcontextprotocol/sdk/client/streamableHttp.js'),import('ajv')
    ]);modules={Client,StdioClientTransport,StreamableHTTPClientTransport,Ajv};}
    const validator=new modules.Ajv({strict:false,allErrors:true,validateFormats:false});
    for(const [name,s] of Object.entries(this.servers)){
      if(!s.enabled)continue;insist(s.trusted===true,`MCP server ${name} requires trusted:true in local config`);
      insist(/^[a-zA-Z0-9_-]{1,60}$/.test(name),'Invalid MCP server name');
      insist(Array.isArray(s.allowedTools)&&s.allowedTools.length>0&&!s.allowedTools.includes('*'),'MCP requires explicit allowedTools');
      const client=new modules.Client({name:'eutrya-native',version:'0.4.1'},{capabilities:{}});let transport;
      if(s.transport==='stdio'){
        insist(typeof s.command==='string'&&Array.isArray(s.args)&&s.args.every(x=>typeof x==='string'),'Invalid stdio command');
        const env=Object.fromEntries(['PATH','HOME','LANG'].filter(k=>this.env[k]).map(k=>[k,this.env[k]]));
        for(const k of s.passEnv??[]){insist(/^[A-Z][A-Z0-9_]*$/.test(k),'Invalid environment name');if(this.env[k])env[k]=this.env[k];}
        transport=new modules.StdioClientTransport({command:s.command,args:s.args,env,stderr:'ignore'});
      }else{
        insist(s.transport==='http','MCP transport must be stdio or http');const url=new URL(safeServiceUrl(s.url,{local:true}));
        const headers=s.tokenEnv?{Authorization:`Bearer ${this.env[s.tokenEnv]??''}`}:{ };
        if(s.tokenEnv)insist(this.env[s.tokenEnv],`Missing ${s.tokenEnv}`);
        transport=new modules.StreamableHTTPClientTransport(url,{requestInit:{headers}});
      }
      this.clients.set(name,client);await client.connect(transport,{timeout:15000});
      let cursor;
      for(let page=0;page<5;page++){
        const result=await client.listTools(cursor?{cursor}:{});
        for(const t of result.tools)if(s.allowedTools.includes(t.name)){
          insist(JSON.stringify(t.inputSchema).length<20000,'MCP schema too large');
          this.tools.push({server:name,name:t.name,description:clip(t.description??'',200),inputSchema:t.inputSchema,validate:validator.compile(t.inputSchema)});
        }
        cursor=result.nextCursor;if(!cursor)break;
      }
      insist(!cursor,'MCP catalog exceeded page limit; narrow the server catalog');
    }
    return this;
  }
  catalog(){return this.tools.slice(0,20).map(({validate,...t})=>t);}
  inspect(action){const t=this.tools.find(t=>t.server===action.server&&t.name===action.tool);insist(t,'MCP tool is not explicitly enabled');insist(t.validate(action.arguments),'MCP arguments do not match the advertised JSON Schema');return t;}
  async call(action,signal){this.inspect(action);const result=await this.clients.get(action.server).callTool({name:action.tool,arguments:action.arguments},undefined,{signal,timeout:30000});return {server:action.server,tool:action.tool,result:clip(JSON.stringify(result),16000),trust:'External tool output; untrusted data'};}
  async close(){await Promise.allSettled([...this.clients.values()].map(c=>c.close()));this.clients.clear();}
}
