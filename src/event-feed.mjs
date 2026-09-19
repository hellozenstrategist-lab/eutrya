export class EventFeed {
  constructor({limit=2000,pageSize=20}={}) {
    if(!Number.isInteger(limit)||limit<50) throw new Error('Event feed limit must be an integer >= 50');
    if(!Number.isInteger(pageSize)||pageSize<5||pageSize>200) throw new Error('Event feed pageSize must be 5..200');
    this.limit=limit;
    this.pageSize=pageSize;
    this.lines=[];
    this.end=null;
  }

  get live() { return this.end===null; }
  get total() { return this.lines.length; }

  push(text) {
    const incoming=String(text??'').split('\n');
    if(!incoming.length)return;
    this.lines.push(...incoming);
    if(this.lines.length>this.limit) {
      const removed=this.lines.length-this.limit;
      this.lines.splice(0,removed);
      if(this.end!==null)this.end=Math.max(0,this.end-removed);
    }
  }

  scrollUp() {
    if(!this.lines.length)return this.snapshot();
    const currentEnd=this.end??this.lines.length;
    this.end=Math.max(Math.min(this.pageSize,this.lines.length),currentEnd-this.pageSize);
    return this.snapshot();
  }

  scrollDown() {
    if(!this.lines.length)return this.snapshot();
    const currentEnd=this.end??this.lines.length;
    const next=Math.min(this.lines.length,currentEnd+this.pageSize);
    this.end=next>=this.lines.length?null:next;
    return this.snapshot();
  }

  top() {
    this.end=this.lines.length?Math.min(this.pageSize,this.lines.length):null;
    return this.snapshot();
  }

  bottom() {
    this.end=null;
    return this.snapshot();
  }

  snapshot() {
    const end=this.end??this.lines.length;
    const start=Math.max(0,end-this.pageSize);
    return {
      lines:this.lines.slice(start,end),
      start,
      end,
      total:this.lines.length,
      live:this.live,
      pageSize:this.pageSize
    };
  }

  render() {
    const s=this.snapshot();
    if(!s.total)return 'EUTRYA EVENT FEED\n(no events yet)';
    const range=`${s.start+1}-${s.end} / ${s.total}`;
    const mode=s.live?'LIVE':'SCROLLBACK';
    return [
      `EUTRYA EVENT FEED  ${range}  [${mode}]`,
      ...s.lines,
      s.live
        ? 'PageUp or /feed up to browse older events.'
        : 'PageUp/PageDown or /feed up|down · /feed bottom returns to live.'
    ].join('\n');
  }
}
