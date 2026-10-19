const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const os=require("node:os");
const {spawnSync}=require("node:child_process");
const path=require("node:path");
const test=require("node:test");

test("Gmail conversation paging fetches message bodies only for the requested batch",async t=>{
    const tokenDirectory=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-gmail-page-"));
    t.after(()=>fs.rm(tokenDirectory,{recursive:true,force:true}));
    const script=String.raw`
    (async()=>{
      const assert=require("node:assert/strict");
      const tokens=require("./services/emailTokenStore");
      const gmail=require("./services/gmailService");
      const user="pagination-user";const block="pagination-gmail";
      tokens.saveConnection("gmail",user,{accessToken:"synthetic-token",refreshToken:"synthetic-refresh",expiresAt:Date.now()+3600000},block);
      const requests=[];
      const references=Array.from({length:25},(_,index)=>({id:"message-"+index,threadId:"thread-fixture",internalDate:String(1000+index)}));
      global.fetch=async(url)=>{
        const value=String(url);requests.push(value);
        if(value.includes("/threads/thread-fixture?format=metadata"))return {ok:true,status:200,json:async()=>({id:"thread-fixture",messages:references})};
        const id=decodeURIComponent(value.match(/\/messages\/([^?]+)/)?.[1]||"");
        const index=Number(id.replace("message-",""));
        const header=(name,value)=>({name,value});
        return {ok:true,status:200,json:async()=>({id,threadId:"thread-fixture",internalDate:String(1000+index),payload:{mimeType:"text/plain",headers:[header("From","person"+index+"@example.test"),header("To","owner@example.test"),header("Subject","Message "+index),header("Message-ID","<"+index+"@example.test>")],body:{data:Buffer.from("fixture body "+index).toString("base64url")}}})};
      };
      const latest=await gmail.getThreadPage("thread-fixture",user,block,{maxResults:10});
      assert.equal(latest.messages.length,10);
      assert.equal(latest.messages[0].id,"message-15");
      assert.equal(latest.messages.at(-1).id,"message-24");
      assert.equal(latest.hasMore,true);
      assert.equal(latest.nextBefore,15);
      assert.equal(requests.filter(url=>url.includes("/messages/")).length,10,"only current-page message bodies are fetched");
      assert.ok(requests[0].includes("format=metadata"));
      const earlier=await gmail.getThreadPage("thread-fixture",user,block,{before:latest.nextBefore,maxResults:10});
      assert.equal(earlier.messages[0].id,"message-5");
      assert.equal(earlier.messages.at(-1).id,"message-14");
      assert.equal(earlier.hasMore,true);
      assert.equal(requests.filter(url=>url.includes("/messages/")).length,20);
    })().catch(error=>{console.error(error);process.exitCode=1;});
    `;
    const result=spawnSync(process.execPath,["-e",script],{cwd:path.join(__dirname,".."),encoding:"utf8",env:{...process.env,FOLDERROCKET_TOKEN_DIR:tokenDirectory}});
    assert.equal(result.status,0,result.stdout+"\n"+result.stderr);
});

test("Gmail conversation text prefers plain text, converts HTML safely, and separates inline image metadata from attachments",async t=>{
    const tokenDirectory=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-gmail-mime-"));t.after(()=>fs.rm(tokenDirectory,{recursive:true,force:true}));
    const script=String.raw`
    (async()=>{
      const assert=require("node:assert/strict");
      const tokens=require("./services/emailTokenStore");
      const gmail=require("./services/gmailService");
      const user="mime-user";const block="mime-gmail";
      tokens.saveConnection("gmail",user,{accessToken:"synthetic-token",refreshToken:"synthetic-refresh",expiresAt:Date.now()+3600000},block);
      const requests=[];const b64=text=>Buffer.from(text,"utf8").toString("base64url");
      const refs=[{id:"plain-message",internalDate:"1000"},{id:"html-message",internalDate:"2000"}];
      const header=(name,value)=>({name,value});
      const plainPayload={mimeType:"multipart/related",headers:[header("From","owner@example.test")],parts:[
        {partId:"0.1",mimeType:"text/plain",body:{data:b64("Plain message body")}},
        {partId:"0.2",mimeType:"text/html",body:{data:b64("<p>HTML alternative</p>")}},
        {partId:"0.3",filename:"logo.png",mimeType:"image/png",headers:[header("Content-ID","<logo-1>"),header("Content-Disposition","inline; filename=logo.png")],body:{attachmentId:"inline-image-1",size:4,data:b64("IMAGE-BYTES-MUST-NOT-APPEAR-AS-BODY")}},
        {partId:"0.4",filename:"report.pdf",mimeType:"application/pdf",headers:[header("Content-Disposition","attachment; filename=report.pdf")],body:{attachmentId:"file-attachment-1",size:42}},
        {partId:"0.5",filename:"photo.jpg",mimeType:"image/jpeg",headers:[header("Content-ID","<photo-1>"),header("Content-Disposition","attachment; filename=photo.jpg")],body:{attachmentId:"image-attachment-1",size:18}}
      ]};
      const htmlPayload={mimeType:"multipart/alternative",parts:[{mimeType:"text/html",body:{data:b64("<html><style>.hidden { color:red }</style><p>Hello &amp; welcome</p><script>secretShouldNotAppear()</script><p>Second line &#x1F680;</p></html>")}}]};
      global.fetch=async url=>{
        const value=String(url);requests.push(value);
        if(value.includes("/threads/thread-mime?")&&value.includes("format=metadata"))return {ok:true,status:200,json:async()=>({id:"thread-mime",messages:refs})};
        const id=decodeURIComponent(value.match(/\/messages\/([^?]+)/)?.[1]||"");
        return {ok:true,status:200,json:async()=>({id,threadId:"thread-mime",internalDate:id==="plain-message"?"1000":"2000",payload:{...id==="plain-message"?plainPayload:htmlPayload,headers:[header("From","person@example.test"),header("Subject","Fixture") ]}})};
      };
      const page=await gmail.getThreadPage("thread-mime",user,block,{maxResults:10});
      const plain=page.messages.find(item=>item.id==="plain-message");
      const html=page.messages.find(item=>item.id==="html-message");
      assert.equal(plain.text,"Plain message body","text/plain wins over the HTML alternative");
      assert.deepEqual(plain.inlineImages,[{id:"inline-image-1",partId:"0.3",downloadable:true,name:"logo.png",mimeType:"image/png",size:4,contentId:"logo-1",disposition:"inline"}]);
      assert.deepEqual(plain.attachments,[{id:"file-attachment-1",name:"report.pdf",mimeType:"application/pdf",size:42},{id:"image-attachment-1",name:"photo.jpg",mimeType:"image/jpeg",size:18}],"downloadable attachments stay separate from inline images, including attached images with Content-ID headers");
      assert.equal(html.text,"Hello & welcome\nSecond line 🚀");
      assert.doesNotMatch(JSON.stringify(page),/IMAGE-BYTES-MUST-NOT-APPEAR-AS-BODY|secretShouldNotAppear|<script/);
      const metadata=await gmail.getThreadMetadata("thread-mime",user,block);
      assert.equal(metadata.messageCount,2);
      assert.ok(requests.at(-1).includes("format=metadata"));
      assert.ok(!requests.at(-1).includes("format=full"),"graph metadata lookup must not fetch message bodies");
    })().catch(error=>{console.error(error);process.exitCode=1;});
    `;
    const result=spawnSync(process.execPath,["-e",script],{cwd:path.join(__dirname,".."),encoding:"utf8",env:{...process.env,FOLDERROCKET_TOKEN_DIR:tokenDirectory}});
    assert.equal(result.status,0,result.stdout+"\n"+result.stderr);
});
