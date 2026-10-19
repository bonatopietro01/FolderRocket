const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const os=require("node:os");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const test=require("node:test");

test("Gmail exposes and downloads inline MIME parts with direct body data",async t=>{
    const tokenDirectory=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-gmail-inline-"));
    t.after(()=>fs.rm(tokenDirectory,{recursive:true,force:true}));
    const script=String.raw`
    (async()=>{
      const assert=require("node:assert/strict");
      const tokens=require("./services/emailTokenStore");
      const gmail=require("./services/gmailService");
      const user="inline-fixture-user",block="inline-fixture-account";
      tokens.saveConnection("gmail",user,{accessToken:"synthetic-access",refreshToken:"synthetic-refresh",expiresAt:Date.now()+3600000},block);
      const bytes=Buffer.from("synthetic-inline-image");
      const encoded=bytes.toString("base64url");
      const requests=[];
      const payload={mimeType:"multipart/related",parts:[
        {partId:"0.1",filename:"logo.png",mimeType:"image/png",headers:[{name:"Content-ID",value:"<logo@example.test>"},{name:"Content-Disposition",value:"inline; filename=logo.png"}],body:{size:bytes.length,data:encoded}},
        {partId:"0.2",filename:"attachment.png",mimeType:"image/png",headers:[{name:"Content-Disposition",value:"attachment"}],body:{attachmentId:"attachment-id",size:bytes.length}}
      ]};
      global.fetch=async url=>{
        const value=String(url);requests.push(value);
        if(value.includes("/messages/inline-message?format=full"))return {ok:true,status:200,json:async()=>({id:"inline-message",threadId:"inline-thread",internalDate:"1000",payload})};
        if(value.includes("/threads/inline-thread?format=metadata"))return {ok:true,status:200,json:async()=>({id:"inline-thread",messages:[{id:"inline-message",internalDate:"1000"}]})};
        throw new Error("Unexpected synthetic Gmail request");
      };
      const page=await gmail.getThreadPage("inline-thread",user,block,{maxResults:10});
      assert.deepEqual(page.messages[0].inlineImages,[{id:"",name:"logo.png",mimeType:"image/png",size:bytes.length,partId:"0.1",downloadable:true,contentId:"logo@example.test",disposition:"inline"}]);
      assert.deepEqual(page.messages[0].attachments,[{id:"attachment-id",name:"attachment.png",mimeType:"image/png",size:bytes.length}]);
      const downloaded=await gmail.downloadInlinePart("inline-message","0.1",user,block);
      assert.deepEqual(downloaded.content,bytes);
      assert.equal(downloaded.mimeType,"image/png");
      assert.ok(requests.includes("https://gmail.googleapis.com/gmail/v1/users/me/messages/inline-message?format=full"),"manual download reads the selected message MIME payload from its authenticated account");
      await assert.rejects(()=>gmail.downloadInlinePart("inline-message","0.2",user,block),/no longer downloadable/i,"non-inline MIME parts cannot be fetched through the inline route");
      await assert.rejects(()=>gmail.downloadInlinePart("inline-message","0.1",user,"another-account"),/collegato/i,"part lookup remains scoped to the selected Gmail account");
    })().catch(error=>{console.error(error);process.exitCode=1;});
    `;
    const result=spawnSync(process.execPath,["-e",script],{cwd:path.join(__dirname,".."),encoding:"utf8",env:{...process.env,FOLDERROCKET_TOKEN_DIR:tokenDirectory}});
    assert.equal(result.status,0,result.stdout+"\n"+result.stderr);
});
